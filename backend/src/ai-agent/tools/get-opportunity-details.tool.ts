import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Model } from 'mongoose';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../organizations/schemas/organization.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../../skills/schemas/skill.schema';
import {
  PublicOpportunityCard,
  PublicOpportunitySource,
  mapPublicOpportunity,
} from './mappers/public-opportunity.mapper';
import { mapPublicOrganizationRef } from './mappers/public-organization.mapper';
import { mapPublicSkillRef } from './mappers/public-reference.mapper';
import { OPPORTUNITY_TOOL_SELECT } from './search-opportunities.tool';
import { normalizeText } from '../knowledge/normalizer';
import { assertAllowedKeys, escapeRegex, readOptionalText } from './tool-input';
import {
  ReadOnlyTool,
  ToolDefinition,
  ToolInputError,
  defineReadOnlyTool,
} from './tool.types';

export const GET_OPPORTUNITY_DETAILS_TOOL_NAME = 'get_opportunity_details';

const ALLOWED_ARGUMENTS = ['slug', 'name'] as const;
const SLUG_MAX_CHARS = 200;
const NAME_MAX_CHARS = 200;
const NAME_MATCH_LIMIT = 5;

interface ParsedInput {
  slug?: string;
  name?: string;
}

export interface GetOpportunityDetailsPayload {
  item: PublicOpportunityCard | null;
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

function uniqueObjectIds(values: readonly unknown[]): Types.ObjectId[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
      unique.add(value);
    } else if (value instanceof Types.ObjectId) {
      unique.add(value.toHexString());
    }
  }
  return [...unique].map((value) => new Types.ObjectId(value));
}

/**
 * Read-only detail lookup for one published opportunity. The caller must pass
 * the exact slug returned by an earlier tool result; the user sentence is never
 * used as a filter. Only the public card projection is returned, so contact,
 * registry, account, and geolocation fields cannot cross the tool boundary.
 */
@Injectable()
export class GetOpportunityDetailsTool implements ReadOnlyTool {
  readonly definition: ToolDefinition;

  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
  ) {
    this.definition = defineReadOnlyTool({
      name: GET_OPPORTUNITY_DETAILS_TOOL_NAME,
      description: 'Return one opportunity by slug or title.',
      allowedIntents: ['opportunity_details'],
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
            description: 'Title.',
          },
        },
      },
      handler: (input) => this.execute(input),
    });
  }

  private async execute(input: unknown): Promise<GetOpportunityDetailsPayload> {
    const parsed = parseInput(input);
    let row: PublicOpportunitySource | null = null;

    if (parsed.slug !== undefined) {
      row = (await this.opportunityModel
        .findOne({ slug: parsed.slug, status: { $ne: 'draft' } })
        .select(OPPORTUNITY_TOOL_SELECT)
        .lean()
        .exec()) as unknown as PublicOpportunitySource | null;
    } else {
      const name = parsed.name ?? '';
      const rows = (await this.opportunityModel
        .find({
          title: { $regex: escapeRegex(name), $options: 'i' },
          status: { $ne: 'draft' },
        })
        .select(OPPORTUNITY_TOOL_SELECT)
        .limit(NAME_MATCH_LIMIT)
        .lean()
        .exec()) as unknown as PublicOpportunitySource[];
      const wanted = normalizeText(name);
      row =
        rows.find(
          (candidate) =>
            normalizeText(String(candidate.title ?? '')) === wanted,
        ) ?? null;
    }

    if (row === null) return { item: null };

    const skillIds = Array.isArray(row.positions)
      ? row.positions.flatMap((position) =>
          Array.isArray(position.requiredSkills) ? position.requiredSkills : [],
        )
      : [];
    const [organizations, skills] = await Promise.all([
      row.organizationId !== undefined
        ? this.organizationModel
            .find({
              _id: {
                $in: uniqueObjectIds([row.organizationId]),
              },
            })
            .select('_id slug nameAr nameFr')
            .lean()
            .exec()
        : Promise.resolve([]),
      skillIds.length > 0
        ? this.skillModel
            .find({ _id: { $in: uniqueObjectIds(skillIds) } })
            .select('_id nameAr nameFr')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const organization = mapPublicOrganizationRef(organizations[0]);
    const skillById = new Map(
      skills.flatMap((skill) => {
        const ref = mapPublicSkillRef(skill);
        return ref ? [[ref.id, ref] as const] : [];
      }),
    );

    return { item: mapPublicOpportunity(row, organization, skillById) };
  }
}
