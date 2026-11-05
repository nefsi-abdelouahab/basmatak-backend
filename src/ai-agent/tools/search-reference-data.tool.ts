import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LocationModel,
  LocationsCollection,
} from '../../locations/schemas/location.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../../skills/schemas/skill.schema';
import {
  PublicLocation,
  PublicLocationSource,
  PublicSkill,
  PublicSkillSource,
  mapPublicLocation,
  mapPublicSkill,
} from './mappers/public-reference.mapper';
import {
  assertAllowedKeys,
  readLimit,
  readOptionalCode,
  readOptionalEnum,
  readOptionalObjectId,
  readOptionalText,
} from './tool-input';
import {
  ReadOnlyTool,
  SYSTEM_TOOL_CLOCK,
  TOOL_CLOCK,
  TOOL_DEFAULT_ROWS,
  TOOL_MAX_ROWS,
  ToolClock,
  ToolDefinition,
  ToolInputError,
  defineReadOnlyTool,
} from './tool.types';

export const SEARCH_REFERENCE_DATA_TOOL_NAME = 'search_reference_data';
export const REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;

const REFERENCE_KINDS = ['all', 'skills', 'locations'] as const;
type ReferenceKind = (typeof REFERENCE_KINDS)[number];
const ALLOWED_ARGUMENTS = [
  'kind',
  'text',
  'category',
  'parent',
  'limit',
] as const;

interface ParsedSearchReferenceDataInput {
  kind: ReferenceKind;
  text?: string;
  category?: string;
  parent?: string;
  limit: number;
}

interface ReferenceCacheEntry {
  loadedAt: number;
  skills: PublicSkill[];
  locations: PublicLocation[];
}

export interface SearchReferenceDataPayload {
  skills: PublicSkill[];
  locations: PublicLocation[];
}

function parseInput(input: unknown): ParsedSearchReferenceDataInput {
  const record = assertAllowedKeys(input, ALLOWED_ARGUMENTS);
  const kind = readOptionalEnum(record, 'kind', REFERENCE_KINDS) ?? 'all';
  const category = readOptionalObjectId(record, 'category');
  const parent = readOptionalCode(record, 'parent');

  if (kind === 'locations' && category !== undefined) {
    throw new ToolInputError('category is only valid for skills.');
  }
  if (kind === 'skills' && parent !== undefined) {
    throw new ToolInputError('parent is only valid for locations.');
  }

  return {
    kind,
    text: readOptionalText(record, 'text'),
    category,
    parent,
    limit: readLimit(record, TOOL_DEFAULT_ROWS, TOOL_MAX_ROWS),
  };
}

function matchesText(
  text: string | undefined,
  values: Array<string | null>,
): boolean {
  if (text === undefined) {
    return true;
  }
  const needle = text.toLowerCase();
  return values.some(
    (value) => value !== null && value.toLowerCase().includes(needle),
  );
}

/**
 * Read-only skills/locations lookup. The full active reference set is cached
 * for five minutes using an injectable clock so TTL behavior is deterministic
 * in tests. Locations have no `active` column in the existing schema; every
 * stored location is therefore treated as active (no schema change is made).
 */
@Injectable()
export class SearchReferenceDataTool implements ReadOnlyTool {
  readonly definition: ToolDefinition;

  private cache: ReferenceCacheEntry | null = null;
  private loading: Promise<ReferenceCacheEntry> | null = null;

  constructor(
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    @InjectModel(LocationsCollection)
    private readonly locationModel: Model<LocationModel>,
    @Inject(TOOL_CLOCK) private readonly clock: ToolClock = SYSTEM_TOOL_CLOCK,
  ) {
    this.definition = defineReadOnlyTool({
      name: SEARCH_REFERENCE_DATA_TOOL_NAME,
      description: 'Search skills and locations.',
      allowedIntents: ['reference_lookup'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            enum: [...REFERENCE_KINDS],
            default: 'all',
            description: 'Kind.',
          },
          text: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'Query.',
          },
        },
      },
      handler: (input) => this.execute(input),
    });
  }

  private async execute(input: unknown): Promise<SearchReferenceDataPayload> {
    const parsed = parseInput(input);
    const data = await this.getReferenceData();

    const skills =
      parsed.kind === 'locations'
        ? []
        : data.skills
            .filter(
              (skill) =>
                (parsed.category === undefined ||
                  skill.categoryId === parsed.category) &&
                matchesText(parsed.text, [
                  skill.nameAr,
                  skill.nameFr,
                  skill.slug,
                ]),
            )
            .slice(0, parsed.limit);

    const locations =
      parsed.kind === 'skills'
        ? []
        : data.locations
            .filter(
              (location) =>
                (parsed.parent === undefined ||
                  location.parentCode === parsed.parent) &&
                matchesText(parsed.text, [
                  location.nameAr,
                  location.nameFr,
                  location.code,
                ]),
            )
            .slice(0, parsed.limit);

    return { skills, locations };
  }

  private async getReferenceData(): Promise<ReferenceCacheEntry> {
    const now = this.clock.now();
    if (
      this.cache !== null &&
      now - this.cache.loadedAt < REFERENCE_CACHE_TTL_MS
    ) {
      return this.cache;
    }
    if (this.loading !== null) {
      return this.loading;
    }

    this.loading = this.loadReferenceData(now).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async loadReferenceData(
    loadedAt: number,
  ): Promise<ReferenceCacheEntry> {
    const [skills, locations] = await Promise.all([
      this.skillModel
        .find({ active: true })
        .select('_id slug nameAr nameFr categoryId')
        .sort({ order: 1, nameFr: 1 })
        .lean()
        .exec(),
      this.locationModel
        .find({ type: { $in: ['wilaya', 'municipality'] } })
        .select('code type parentCode nameAr nameFr')
        .sort({ code: 1 })
        .lean()
        .exec(),
    ]);

    const entry: ReferenceCacheEntry = {
      loadedAt,
      skills: (skills as unknown as PublicSkillSource[]).map(mapPublicSkill),
      locations: (locations as unknown as PublicLocationSource[]).map(
        mapPublicLocation,
      ),
    };
    this.cache = entry;
    return entry;
  }
}
