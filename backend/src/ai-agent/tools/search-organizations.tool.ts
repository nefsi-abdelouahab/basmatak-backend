import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../organizations/schemas/organization.schema';
import {
  PublicOrganizationCard,
  PublicOrganizationSource,
  mapPublicOrganization,
} from './mappers/public-organization.mapper';
import {
  assertAllowedKeys,
  escapeRegex,
  readLimit,
  readOptionalCode,
  readOptionalText,
} from './tool-input';
import {
  ReadOnlyTool,
  TOOL_DEFAULT_ROWS,
  TOOL_MAX_ROWS,
  ToolDefinition,
  defineReadOnlyTool,
} from './tool.types';

export const SEARCH_ORGANIZATIONS_TOOL_NAME = 'search_organizations';

const ALLOWED_ARGUMENTS = ['name', 'text', 'wilaya', 'type', 'limit'] as const;

/**
 * `.select()` allowlist: public identity/facts only. `userId`, `registryId`,
 * `contact`, `registrationNumber`, `address`, media ids, and reliability are
 * never loaded from Mongo.
 */
export const ORGANIZATION_TOOL_SELECT = [
  '_id',
  'slug',
  'nameAr',
  'nameFr',
  'description',
  'type',
  'location.wilayaId',
  'location.municipalityId',
  'website',
  'foundedYear',
].join(' ');

interface ParsedSearchOrganizationsInput {
  name?: string;
  text?: string;
  wilaya?: string;
  type?: string;
  limit: number;
}

export interface SearchOrganizationsPayload {
  items: PublicOrganizationCard[];
}

function parseInput(input: unknown): ParsedSearchOrganizationsInput {
  const record = assertAllowedKeys(input, ALLOWED_ARGUMENTS);
  return {
    name: readOptionalText(record, 'name'),
    text: readOptionalText(record, 'text'),
    wilaya: readOptionalCode(record, 'wilaya'),
    type: readOptionalText(record, 'type', 80),
    limit: readLimit(record, TOOL_DEFAULT_ROWS, TOOL_MAX_ROWS),
  };
}

function textFilter(value: string): Record<string, unknown> {
  const regex = { $regex: escapeRegex(value), $options: 'i' };
  return {
    $or: [{ nameAr: regex }, { nameFr: regex }, { slug: regex }],
  };
}

@Injectable()
export class SearchOrganizationsTool implements ReadOnlyTool {
  readonly definition: ToolDefinition;

  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
  ) {
    this.definition = defineReadOnlyTool({
      name: SEARCH_ORGANIZATIONS_TOOL_NAME,
      description: 'Search verified organizations.',
      allowedIntents: ['organization_search'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'Name or slug.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: TOOL_MAX_ROWS,
            default: TOOL_DEFAULT_ROWS,
            description: 'Rows.',
          },
        },
      },
      handler: (input) => this.execute(input),
    });
  }

  private async execute(input: unknown): Promise<SearchOrganizationsPayload> {
    const parsed = parseInput(input);
    const filter: FilterQuery<OrganizationModel> = {
      verificationStatus: 'verified',
      status: 'active',
    };

    if (parsed.name) {
      filter.$and = [
        ...(filter.$and ?? []),
        textFilter(parsed.name) as FilterQuery<OrganizationModel>,
      ];
    }
    if (parsed.text) {
      filter.$and = [
        ...(filter.$and ?? []),
        textFilter(parsed.text) as FilterQuery<OrganizationModel>,
      ];
    }
    if (parsed.wilaya) {
      filter['location.wilayaId'] = parsed.wilaya;
    }
    if (parsed.type) {
      filter.type = {
        $regex: `^${escapeRegex(parsed.type)}$`,
        $options: 'i',
      };
    }

    const rows = (await this.organizationModel
      .find(filter)
      .select(ORGANIZATION_TOOL_SELECT)
      .sort({ _id: -1 })
      .limit(parsed.limit)
      .lean()
      .exec()) as unknown as PublicOrganizationSource[];

    return { items: rows.map((row) => mapPublicOrganization(row)) };
  }
}
