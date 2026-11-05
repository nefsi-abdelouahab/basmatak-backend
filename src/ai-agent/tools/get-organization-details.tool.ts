import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../organizations/schemas/organization.schema';
import { normalizeText } from '../knowledge/normalizer';
import { ORGANIZATION_TOOL_SELECT } from './search-organizations.tool';
import {
  PublicOrganizationCard,
  PublicOrganizationSource,
  mapPublicOrganization,
} from './mappers/public-organization.mapper';
import { assertAllowedKeys, escapeRegex, readOptionalText } from './tool-input';
import {
  ReadOnlyTool,
  ToolDefinition,
  ToolInputError,
  defineReadOnlyTool,
} from './tool.types';

export const GET_ORGANIZATION_DETAILS_TOOL_NAME = 'get_organization_details';

const ALLOWED_ARGUMENTS = ['slug', 'name'] as const;
const NAME_MAX_CHARS = 120;
const SLUG_MAX_CHARS = 200;
const NAME_MATCH_LIMIT = 5;

interface ParsedInput {
  slug?: string;
  name?: string;
}

export interface GetOrganizationDetailsPayload {
  item: PublicOrganizationCard | null;
}

function parseInput(input: unknown): ParsedInput {
  const record = assertAllowedKeys(input, ALLOWED_ARGUMENTS);
  const slug = readOptionalText(record, 'slug', SLUG_MAX_CHARS);
  const name = readOptionalText(record, 'name', NAME_MAX_CHARS);
  if (slug !== undefined && name !== undefined) {
    throw new ToolInputError('Provide either slug or name, not both.');
  }
  if (slug === undefined && name === undefined) {
    throw new ToolInputError('slug or name is required.');
  }
  if (slug !== undefined && /[/\\?#\u0000-\u001f]/u.test(slug)) {
    throw new ToolInputError('slug is invalid.');
  }
  return {
    ...(slug !== undefined ? { slug } : {}),
    ...(name !== undefined ? { name } : {}),
  };
}

const NAME_PREFIXES = [
  'جمعية',
  'جمعيه',
  'منظمة',
  'منظمه',
  'مؤسسة',
  'مؤسسه',
  'هيئة',
  'هيئه',
  'association',
  'organisation',
  'organization',
  'org',
  'foundation',
  'charity',
] as const;

/**
 * Remove one leading organization-type word ("جمعية", "association", ...)
 * while preserving the original script for the database regex.
 */
function stripEntityNamePrefix(value: string): string {
  const parts = value.trim().split(/\s+/u).filter(Boolean);
  if (parts.length < 2) return value.trim();
  const first = normalizeText(parts[0] ?? '');
  const hasPrefix = NAME_PREFIXES.some(
    (prefix) => normalizeText(prefix) === first && first !== '',
  );
  return hasPrefix ? parts.slice(1).join(' ') : value.trim();
}

/** Compare names as whole normalized values, not substrings. */
function normalizeEntityName(value: string): string {
  return normalizeText(stripEntityNamePrefix(value));
}

/**
 * Read-only detail lookup for one verified, active organization. It accepts
 * either the exact public slug or the exact organization name; partial names
 * are rejected by the exact normalized comparison. Contact details, registry
 * ids, account ids, and addresses are never selected or returned.
 */
@Injectable()
export class GetOrganizationDetailsTool implements ReadOnlyTool {
  readonly definition: ToolDefinition;

  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
  ) {
    this.definition = defineReadOnlyTool({
      name: GET_ORGANIZATION_DETAILS_TOOL_NAME,
      description: 'Return one organization by slug or name.',
      allowedIntents: ['organization_details'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slug: {
            type: 'string',
            minLength: 1,
            maxLength: SLUG_MAX_CHARS,
            description: 'Slug.',
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: NAME_MAX_CHARS,
            description: 'Name.',
          },
        },
      },
      handler: (input) => this.execute(input),
    });
  }

  private async execute(
    input: unknown,
  ): Promise<GetOrganizationDetailsPayload> {
    const parsed = parseInput(input);

    if (parsed.slug !== undefined) {
      const row = (await this.organizationModel
        .findOne({
          slug: parsed.slug,
          verificationStatus: 'verified',
          status: 'active',
        })
        .select(ORGANIZATION_TOOL_SELECT)
        .lean()
        .exec()) as unknown as PublicOrganizationSource | null;
      return { item: row === null ? null : mapPublicOrganization(row) };
    }

    const name = parsed.name ?? '';
    const queryNames = [
      ...new Set([name.trim(), stripEntityNamePrefix(name)].filter(Boolean)),
    ];
    const patterns = queryNames.map((value) => ({
      $regex: escapeRegex(value),
      $options: 'i',
    }));
    const rows = (await this.organizationModel
      .find({
        verificationStatus: 'verified',
        status: 'active',
        $or: patterns.flatMap((pattern) => [
          { nameAr: pattern },
          { nameFr: pattern },
        ]),
      })
      .select(ORGANIZATION_TOOL_SELECT)
      .limit(NAME_MATCH_LIMIT)
      .lean()
      .exec()) as unknown as PublicOrganizationSource[];

    const wanted = normalizeEntityName(name);
    const row = rows.find((candidate) => {
      const names = [candidate.nameAr, candidate.nameFr].filter(
        (value): value is string => typeof value === 'string',
      );
      return names.some((value) => normalizeEntityName(value) === wanted);
    });

    return { item: row === undefined ? null : mapPublicOrganization(row) };
  }
}
