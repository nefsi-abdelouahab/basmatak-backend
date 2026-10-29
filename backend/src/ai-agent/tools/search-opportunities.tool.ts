import { Injectable, Optional } from '@nestjs/common';
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
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../../skills/schemas/skill-category.schema';
import {
  KnowledgeNormalizer,
  isStopword,
  normalizeText,
  tokenize,
} from '../knowledge/normalizer';
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
  'categoryId',
].join(' ');

const SORT_MAP: Record<OpportunitySort, Record<string, 1 | -1>> = {
  newest: { _id: -1 },
  oldest: { _id: 1 },
  deadline_asc: { applicationDeadline: 1, _id: 1 },
  startDate_asc: { startDate: 1, _id: 1 },
};

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const ARABIC_NAME_PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال'] as const;
const MIN_MATCH_TERM_CHARS = 2;
const TEXT_FETCH_MULTIPLIER = 4;
const TEXT_FETCH_MAX_ROWS = 32;

interface ReferenceSource {
  _id?: unknown;
  slug?: unknown;
  nameAr?: unknown;
  nameFr?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toObjectId(value: unknown): Types.ObjectId | null {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }
  return null;
}

/**
 * Build normalized search variants from a free-text term. Synonyms and Arabic
 * article prefixes let "البرمجة", "programming", and "programmation" all reach
 * the same skill name. The original whole phrase is kept so a multi-word title
 * still matches exactly.
 */
function buildTextVariants(
  text: string,
  normalizer: KnowledgeNormalizer,
): string[] {
  const tokens = tokenize(text, { removeStopwords: true, unique: true });
  if (tokens.length === 0) return [];

  const expanded = normalizer.expandTokens(tokens);
  const variants = new Set<string>();

  const add = (value: string): void => {
    const normalized = normalizeText(value);
    if (normalized.length < MIN_MATCH_TERM_CHARS) return;
    variants.add(normalized);
    if (!ARABIC_SCRIPT.test(normalized)) return;
    for (const prefix of ARABIC_NAME_PREFIXES) {
      if (
        normalized.length > prefix.length + 1 &&
        normalized.startsWith(prefix)
      ) {
        const stripped = normalized.slice(prefix.length);
        if (stripped.length >= MIN_MATCH_TERM_CHARS) variants.add(stripped);
      }
    }
  };

  add(text);
  for (const token of tokens) add(token);
  for (const token of expanded) add(token);

  return [...variants];
}

function rawSearchTokens(text: string): string[] {
  const tokens = text
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(
      (token) => token.length >= MIN_MATCH_TERM_CHARS && !isStopword(token),
    );
  return [...new Set(tokens)];
}

function fieldsMatchTerms(
  fields: readonly unknown[],
  variants: ReadonlySet<string>,
): boolean {
  for (const field of fields) {
    if (typeof field !== 'string') continue;
    const normalized = normalizeText(field);
    if (normalized === '') continue;
    if (variants.has(normalized)) return true;
    if (normalized.split(' ').some((token) => variants.has(token))) {
      return true;
    }
  }
  return false;
}

function collectReferenceIds(
  rows: readonly ReferenceSource[],
  variants: ReadonlySet<string>,
): Types.ObjectId[] {
  const ids: Types.ObjectId[] = [];
  for (const row of rows) {
    if (!fieldsMatchTerms([row.slug, row.nameAr, row.nameFr], variants)) {
      continue;
    }
    const id = toObjectId(row._id);
    if (id !== null) ids.push(id);
  }
  return ids;
}

function rowSkillIds(row: PublicOpportunitySource): string[] {
  if (!Array.isArray(row.positions)) return [];
  return row.positions.flatMap((position) => {
    if (!isRecord(position) || !Array.isArray(position.requiredSkills)) {
      return [];
    }
    return position.requiredSkills.flatMap((skill) => {
      const id = toObjectId(skill);
      return id === null ? [] : [id.toHexString()];
    });
  });
}

function rowCategoryId(row: PublicOpportunitySource): string | null {
  const id = toObjectId(row.categoryId);
  return id === null ? null : id.toHexString();
}

function scoreRow(
  row: PublicOpportunitySource,
  matchedSkillIds: ReadonlySet<string>,
  matchedCategoryIds: ReadonlySet<string>,
  variants: ReadonlySet<string>,
): number {
  let score = 0;
  if (rowSkillIds(row).some((id) => matchedSkillIds.has(id))) score += 4;
  const categoryId = rowCategoryId(row);
  if (categoryId !== null && matchedCategoryIds.has(categoryId)) score += 3;
  if (fieldsMatchTerms([row.title], variants)) score += 2;
  if (fieldsMatchTerms([row.description], variants)) score += 1;
  return score;
}

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
  private readonly normalizer: KnowledgeNormalizer;

  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    @InjectModel(SkillCategoriesCollection)
    private readonly skillCategoryModel: Model<SkillCategoryModel>,
    @Optional() normalizer?: KnowledgeNormalizer,
  ) {
    this.normalizer = normalizer ?? new KnowledgeNormalizer();
    this.definition = defineReadOnlyTool({
      name: SEARCH_OPPORTUNITIES_TOOL_NAME,
      description:
        'Search published Basmatak volunteering opportunities by text, wilaya, municipality, mode, skill, category, and sort. Text accepts Arabic, French, or English terms and matches titles, descriptions, skill names, and category names. Read-only; returns at most 8 public cards (default 5).',
      allowedIntents: ['opportunity_search'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description:
              'Keyword or skill/category name in Arabic, French, or English. Matches the opportunity title, description, skill names, and category names.',
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

    let textVariants = new Set<string>();
    const matchedSkillIds = new Set<string>();
    const matchedCategoryIds = new Set<string>();

    if (parsed.text) {
      const variants = buildTextVariants(parsed.text, this.normalizer);
      textVariants = new Set(variants);

      const [skills, categories] = await Promise.all([
        this.skillModel
          .find({ active: true })
          .select('_id slug nameAr nameFr')
          .lean()
          .exec(),
        this.skillCategoryModel
          .find({ active: true })
          .select('_id slug nameAr nameFr')
          .lean()
          .exec(),
      ]);

      const skillIds = collectReferenceIds(
        skills as unknown as ReferenceSource[],
        textVariants,
      );
      const categoryIds = collectReferenceIds(
        categories as unknown as ReferenceSource[],
        textVariants,
      );
      skillIds.forEach((id) => matchedSkillIds.add(id.toHexString()));
      categoryIds.forEach((id) => matchedCategoryIds.add(id.toHexString()));

      const textConditions = [
        parsed.text,
        ...rawSearchTokens(parsed.text),
      ].flatMap((term) => {
        const regex = { $regex: escapeRegex(term), $options: 'i' };
        return [{ title: regex }, { description: regex }];
      });

      const or: FilterQuery<OpportunityModel>[] = [];
      if (textConditions.length > 0) {
        or.push({ $or: textConditions });
      }
      if (skillIds.length > 0) {
        or.push({ 'positions.requiredSkills': { $in: skillIds } });
      }
      if (categoryIds.length > 0) {
        or.push({ categoryId: { $in: categoryIds } });
      }
      if (or.length > 0) {
        filter.$or = or;
      }
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

    const fetchLimit = parsed.text
      ? Math.min(TOOL_MAX_ROWS * TEXT_FETCH_MULTIPLIER, TEXT_FETCH_MAX_ROWS)
      : parsed.limit;

    const rows = (await this.opportunityModel
      .find(filter)
      .select(OPPORTUNITY_TOOL_SELECT)
      .sort(SORT_MAP[parsed.sort])
      .limit(fetchLimit)
      .lean()
      .exec()) as unknown as PublicOpportunitySource[];

    // Relevance first (skill/category/title/description), then the requested
    // server sort as the stable tie-breaker.
    const selectedRows =
      parsed.text && textVariants.size > 0
        ? [...rows]
            .sort(
              (left, right) =>
                scoreRow(
                  right,
                  matchedSkillIds,
                  matchedCategoryIds,
                  textVariants,
                ) -
                scoreRow(
                  left,
                  matchedSkillIds,
                  matchedCategoryIds,
                  textVariants,
                ),
            )
            .slice(0, parsed.limit)
        : rows;

    const organizationIds = uniqueObjectIds(
      selectedRows.map((row) => {
        const value = row.organizationId;
        return typeof value === 'string'
          ? value
          : value instanceof Types.ObjectId
            ? value.toHexString()
            : null;
      }),
    );
    const skillIds = uniqueObjectIds(
      selectedRows.flatMap((row) =>
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
      items: selectedRows.map((row) => {
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
