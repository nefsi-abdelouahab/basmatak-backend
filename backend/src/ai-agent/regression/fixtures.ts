import { normalizeText } from '../knowledge/normalizer';
import type { RecordedToolCall, RegressionToolCallScript } from './types';
import type {
  ToolBatchExecutionResult,
  ToolErrorCode,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '../tools/tool.types';

/**
 * Public, deterministic tool fixtures.
 *
 * The harness keeps the real tool descriptors (and therefore the real router
 * declarations), but replaces the database-backed executor with these rows so
 * every run is offline and repeatable. Nothing here contains a private field.
 */

export const OPPORTUNITY_BEACH_CLEANUP = Object.freeze({
  slug: 'beach-cleanup',
  title: 'Beach cleanup',
  status: 'published',
  applicationDeadline: '2026-12-31T00:00:00.000Z',
  openPositions: 5,
  locationNames: {
    wilaya: { ar: 'وهران', fr: 'Oran' },
    municipality: { ar: 'وهران', fr: 'Oran' },
  },
});

export const OPPORTUNITY_TREE_PLANTING = Object.freeze({
  slug: 'tree-planting',
  title: 'Tree planting',
  status: 'published',
  applicationDeadline: '2026-11-30T00:00:00.000Z',
  openPositions: 8,
  locationNames: {
    wilaya: { ar: 'الجزائر', fr: 'Algiers' },
    municipality: { ar: 'باب الوادي', fr: 'Bab El Oued' },
  },
});

export const OPPORTUNITY_REMOTE_TUTORING = Object.freeze({
  slug: 'remote-tutoring',
  title: 'Remote tutoring',
  status: 'published',
  applicationDeadline: '2026-10-15T00:00:00.000Z',
  openPositions: 3,
  locationNames: {
    wilaya: { ar: 'قسنطينة', fr: 'Constantine' },
    municipality: { ar: 'قسنطينة', fr: 'Constantine' },
  },
});

export const OPPORTUNITY_FIXTURES = Object.freeze([
  OPPORTUNITY_BEACH_CLEANUP,
  OPPORTUNITY_TREE_PLANTING,
  OPPORTUNITY_REMOTE_TUTORING,
]);

export const ORGANIZATION_NOUR = Object.freeze({
  slug: 'nour-association',
  nameAr: 'نور',
  nameFr: 'Nour',
  type: 'association',
});

export const ORGANIZATION_NOUR_DETAIL = Object.freeze({
  id: 'org-nour',
  slug: 'nour-association',
  nameAr: 'نور',
  nameFr: 'Nour',
  type: 'association',
  description:
    'Nour is a verified association that organizes community volunteering.',
  location: null,
  website: null,
  foundedYear: 2018,
});

export const KNOWLEDGE_FIXTURE = Object.freeze({
  chunks: [
    {
      id: 'faq/en.md#1',
      source: 'faq/en.md',
      title: 'Basmatak FAQ',
      locale: 'en',
      headingTrail: ['Verification'],
      text: 'Organizations submit evidence and the platform reviews it.',
      charCount: 59,
      score: 8,
    },
  ],
  totalChars: 59,
  estimatedTokens: 15,
  truncated: false,
});

export const REFERENCE_FIXTURE = Object.freeze({
  skills: [
    {
      id: 'skill-teaching',
      slug: 'teaching',
      nameEn: 'Teaching',
      nameAr: 'التعليم',
    },
  ],
  locations: [
    {
      code: '16',
      type: 'wilaya',
      nameFr: 'Oran',
      nameAr: 'وهران',
    },
  ],
});

export const STATS_FIXTURE = Object.freeze({
  publishedOpportunities: 42,
  verifiedOrganizations: 17,
  activeSkills: 63,
  wilayas: 58,
  municipalities: 1541,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function success(tool: string, data: unknown): ToolExecutionResult {
  return {
    ok: true,
    tool,
    data,
    meta: { charCount: JSON.stringify(data).length, truncated: false },
  };
}

function failure(
  tool: string,
  code: ToolErrorCode,
  message: string,
): ToolExecutionResult {
  return {
    ok: false,
    tool,
    error: { code, message },
    meta: { charCount: 0, truncated: false },
  };
}

function normalized(value: unknown): string {
  return typeof value === 'string' ? normalizeText(value) : '';
}

function opportunityRows(args: Record<string, unknown>): readonly unknown[] {
  const slugs = Array.isArray(args.slugs)
    ? args.slugs.filter((slug): slug is string => typeof slug === 'string')
    : [];
  if (slugs.length > 0) {
    return OPPORTUNITY_FIXTURES.filter((row) => slugs.includes(row.slug));
  }

  const text = normalized(args.text);
  if (text === '') return OPPORTUNITY_FIXTURES;
  if (text.includes(normalizeText('Tamanrasset')) || text.includes('تمنراست')) {
    return [];
  }
  if (text.includes('oran') || text.includes(normalizeText('وهران'))) {
    return [OPPORTUNITY_BEACH_CLEANUP];
  }
  if (text.includes('apply') || text.includes(normalizeText('التقدم'))) {
    return [OPPORTUNITY_BEACH_CLEANUP];
  }
  if (text.includes('volunteer') || text.includes(normalizeText('تطوع'))) {
    return [OPPORTUNITY_BEACH_CLEANUP, OPPORTUNITY_TREE_PLANTING];
  }
  return OPPORTUNITY_FIXTURES;
}

function organizationRows(args: Record<string, unknown>): readonly unknown[] {
  const name = normalized(args.name) || normalized(args.text);
  if (name === '') return [ORGANIZATION_NOUR];
  if (name.includes('nour') || name.includes(normalizeText('نور'))) {
    return [ORGANIZATION_NOUR];
  }
  return [];
}

function opportunityDetail(args: Record<string, unknown>): unknown {
  const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
  const item = OPPORTUNITY_FIXTURES.find((row) => row.slug === slug) ?? null;
  return { item };
}

function organizationDetail(args: Record<string, unknown>): unknown {
  const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
  if (slug !== '') {
    return {
      item: slug === ORGANIZATION_NOUR.slug ? ORGANIZATION_NOUR_DETAIL : null,
    };
  }
  const name = normalized(args.name);
  const matches =
    name !== '' &&
    (name === normalizeText(ORGANIZATION_NOUR.nameAr) ||
      name === normalizeText(ORGANIZATION_NOUR.nameFr) ||
      name === normalizeText(ORGANIZATION_NOUR.slug));
  return { item: matches ? ORGANIZATION_NOUR_DETAIL : null };
}

function resultFor(call: RecordedToolCall): ToolExecutionResult {
  switch (call.name) {
    case 'search_opportunities':
      return success(call.name, { items: opportunityRows(call.arguments) });
    case 'search_organizations':
      return success(call.name, { items: organizationRows(call.arguments) });
    case 'search_reference_data':
      return success(call.name, REFERENCE_FIXTURE);
    case 'platform_stats':
      return success(call.name, STATS_FIXTURE);
    case 'search_knowledge':
      return success(call.name, KNOWLEDGE_FIXTURE);
    case 'get_opportunity_details':
      return success(call.name, opportunityDetail(call.arguments));
    case 'get_organization_details':
      return success(call.name, organizationDetail(call.arguments));
    default:
      return failure(
        call.name,
        'TOOL_NOT_FOUND',
        'Unknown or unavailable tool.',
      );
  }
}

function normalizeArguments(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

/**
 * Recording tool executor double. It records every call the orchestrator makes,
 * including deterministic paths that never go through the provider.
 */
export class FixtureToolExecutor {
  readonly calls: RecordedToolCall[] = [];

  reset(): void {
    this.calls.length = 0;
  }

  async executeMany(
    requests: ToolExecutionRequest[],
  ): Promise<ToolBatchExecutionResult> {
    const results: ToolExecutionResult[] = [];
    for (const request of Array.isArray(requests) ? requests : []) {
      const call: RecordedToolCall = {
        name: typeof request?.name === 'string' ? request.name : '',
        arguments: normalizeArguments(request?.arguments),
      };
      this.calls.push(call);
      results.push(resultFor(call));
    }

    return {
      results,
      totalChars: results.reduce(
        (total, result) => total + result.meta.charCount,
        0,
      ),
      truncated: results.some((result) => result.meta.truncated),
    };
  }
}

/** Convert a dialogue script into the provider-neutral call shape. */
export function toRecordedToolCall(
  script: RegressionToolCallScript,
): RecordedToolCall {
  return { name: script.name, arguments: { ...script.arguments } };
}
