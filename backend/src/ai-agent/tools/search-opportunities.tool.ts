import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
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
import {
  assertAllowedKeys,
  escapeRegex,
  readLimit,
  readOptionalCode,
  readOptionalEnum,
  readOptionalObjectId,
  readOptionalText,
} from './tool-input';
import {
  ReadOnlyTool,
  TOOL_DEFAULT_ROWS,
  TOOL_MAX_ROWS,
  ToolDefinition,
  defineReadOnlyTool,
} from './tool.types';

export const SEARCH_OPPORTUNITIES_TOOL_NAME = 'search_opportunities';

export const OPPORTUNITY_SORTS = [
  'newest',
  'oldest',
  'deadline_asc',
  'startDate_asc',
] as const;

export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

const OPPORTUNITY_MODES = ['onsite', 'remote', 'hybrid'] as const;
const ALLOWED_ARGUMENTS = [
  'text',
  'wilaya',
  'municipality',
  'mode',
  'skill',
  'category',
  'sort',
  'limit',
] as const;

/**
 * `.select()` allowlist: only fields the public card needs. Private fields
 * (registryId, coverMediaId, prerequisites, coordinates) are never loaded.
 */
export const OPPORTUNITY_TOOL_SELECT = [
  '_id',
  'organizationId',
  'slug',
  'title',
  'description',
  'mode',
  'startDate',
  'endDate',
  'applicationDeadline',
  'location.wilayaId',
  'location.municipalityId',
  'positions.requiredSkills',
  'positions.requiredCount',
  'positions.filledCount',
].join(' ');

const SORT_MAP: Record<OpportunitySort, Record<string, 1 | -1>> = {
  newest: { _id: -1 },
  oldest: { _id: 1 },
  deadline_asc: { applicationDeadline: 1, _id: 1 },
  startDate_asc: { startDate: 1, _id: 1 },
};

interface ParsedSearchOpportunitiesInput {
  text?: string;
  wilaya?: string;
  municipality?: string;
  mode?: (typeof OPPORTUNITY_MODES)[number];
  skill?: string;
  category?: string;
  sort: OpportunitySort;
  limit: number;
}

export interface SearchOpportunitiesPayload {
  items: PublicOpportunityCard[];
}

function parseInput(input: unknown): ParsedSearchOpportunitiesInput {
  const record = assertAllowedKeys(input, ALLOWED_ARGUMENTS);
  return {
    text: readOptionalText(record, 'text'),
    wilaya: readOptionalCode(record, 'wilaya'),
    municipality: readOptionalCode(record, 'municipality'),
    mode: readOptionalEnum(record, 'mode', OPPORTUNITY_MODES),
    skill: readOptionalObjectId(record, 'skill'),
    category: readOptionalObjectId(record, 'category'),
    sort: readOptionalEnum(record, 'sort', OPPORTUNITY_SORTS) ?? 'newest',
    limit: readLimit(record, TOOL_DEFAULT_ROWS, TOOL_MAX_ROWS),
  };
}

function uniqueObjectIds(values: Array<string | null>): Types.ObjectId[] {
  const unique = new Set(values.filter((value): value is string => !!value));
  return [...unique]
    .filter((value) => Types.ObjectId.isValid(value))
    .map((value) => new Types.ObjectId(value));
}

@Injectable()
export class SearchOpportunitiesTool implements ReadOnlyTool {
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
      name: SEARCH_OPPORTUNITIES_TOOL_NAME,
      description:
        'Search published Basmatak volunteering opportunities by text, wilaya, municipality, mode, skill, category, and sort. Read-only; returns at most 8 public cards (default 5).',
      allowedIntents: ['opportunity_search'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'Keyword on the opportunity title or description.',
          },
          wilaya: {
            type: 'string',
            minLength: 1,
            maxLength: 40,
            description: 'Wilaya code, for example "16".',
          },
          municipality: {
            type: 'string',
            minLength: 1,
            maxLength: 40,
            description: 'Municipality code, for example "1601".',
          },
          mode: {
            type: 'string',
            enum: [...OPPORTUNITY_MODES],
            description: 'Participation mode.',
          },
          skill: {
            type: 'string',
            minLength: 24,
            maxLength: 24,
            description: 'Required skill id from search_reference_data.',
          },
          category: {
            type: 'string',
            minLength: 24,
            maxLength: 24,
            description: 'Skill category id.',
          },
          sort: {
            type: 'string',
            enum: [...OPPORTUNITY_SORTS],
            default: 'newest',
            description: 'Server-defined sort order.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: TOOL_MAX_ROWS,
            default: TOOL_DEFAULT_ROWS,
            description: 'Rows to return (1 to 8). Defaults to 5.',
          },
        },
      },
      handler: (input) => this.execute(input),
    });
  }

  private async execute(input: unknown): Promise<SearchOpportunitiesPayload> {
    const parsed = parseInput(input);
    const filter: FilterQuery<OpportunityModel> = { status: 'published' };

    if (parsed.text) {
      const pattern = escapeRegex(parsed.text);
      const regex = { $regex: pattern, $options: 'i' };
      filter.$or = [{ title: regex }, { description: regex }];
    }
    if (parsed.wilaya) {
      filter['location.wilayaId'] = parsed.wilaya;
    }
    if (parsed.municipality) {
      filter['location.municipalityId'] = parsed.municipality;
    }
    if (parsed.mode) {
      filter.mode = parsed.mode;
    }
    if (parsed.skill) {
      filter['positions.requiredSkills'] = new Types.ObjectId(parsed.skill);
    }
    if (parsed.category) {
      filter.categoryId = new Types.ObjectId(parsed.category);
    }

    const rows = (await this.opportunityModel
      .find(filter)
      .select(OPPORTUNITY_TOOL_SELECT)
      .sort(SORT_MAP[parsed.sort])
      .limit(parsed.limit)
      .lean()
      .exec()) as unknown as PublicOpportunitySource[];

    const organizationIds = uniqueObjectIds(
      rows.map((row) => {
        const value = row.organizationId;
        return typeof value === 'string'
          ? value
          : value instanceof Types.ObjectId
            ? value.toHexString()
            : null;
      }),
    );
    const skillIds = uniqueObjectIds(
      rows.flatMap((row) =>
        Array.isArray(row.positions)
          ? row.positions.flatMap((position) =>
              Array.isArray(position.requiredSkills)
                ? position.requiredSkills.map((skill: unknown) =>
                    skill instanceof Types.ObjectId
                      ? skill.toHexString()
                      : typeof skill === 'string'
                        ? skill
                        : null,
                  )
                : [],
            )
          : [],
      ),
    );

    const [organizations, skills] = await Promise.all([
      organizationIds.length > 0
        ? this.organizationModel
            .find({ _id: { $in: organizationIds } })
            .select('_id slug nameAr nameFr')
            .lean()
            .exec()
        : Promise.resolve([]),
      skillIds.length > 0
        ? this.skillModel
            .find({ _id: { $in: skillIds } })
            .select('_id nameAr nameFr')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const organizationById = new Map(
      organizations.flatMap((organization) => {
        const ref = mapPublicOrganizationRef(organization);
        return ref ? [[ref.id, ref] as const] : [];
      }),
    );
    const skillById = new Map(
      skills.flatMap((skill) => {
        const ref = mapPublicSkillRef(skill);
        return ref ? [[ref.id, ref] as const] : [];
      }),
    );

    return {
      items: rows.map((row) => {
        const organizationId =
          typeof row.organizationId === 'string'
            ? row.organizationId
            : row.organizationId instanceof Types.ObjectId
              ? row.organizationId.toHexString()
              : null;
        return mapPublicOpportunity(
          row,
          organizationId ? organizationById.get(organizationId) : undefined,
          skillById,
        );
      }),
    };
  }
}
