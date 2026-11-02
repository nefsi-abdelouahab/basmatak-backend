import type {
  AiAgentDataSource,
  AiAgentKnowledgeSource,
} from '../ai-agent.types';
import type { PromptCitation } from '../prompt/prompt.types';
import type { ToolExecutionResult } from '../tools/tool.types';
import type { PolicyLanguage } from './answer-policy';

/**
 * Citation handling for the existing `K#` / `T#` scheme.
 *
 * The proposal uses `D#` for database rows. Session 9 deliberately keeps `T#`
 * because the prompt builder, system prompt, and prompt tests already assign
 * one `T#` per tool result. The deviation is documented here and in the final
 * Session 9 report; migrating to `D#` would require changing all three layers
 * together.
 *
 * A single `T#` may cover several returned rows. Each row gets a unique source
 * `id` (`T1-1`, `T1-2`, ...) plus the original `citationId` (`T1`) so clients
 * can render one chip per public item without exposing internal ids.
 */

const MARKER_PATTERN =
  /\[((?:[KTDktd]\d{1,3})(?:\s*[,;]\s*[KTDktd]\d{1,3})*)\]/g;
const MARKER_ID_PATTERN = /^([KTD])(\d{1,3})$/;

const MAX_TITLE_CHARS = 300;
const MAX_HEADING_CHARS = 200;
const MAX_SOURCE_CHARS = 300;
const MAX_SLUG_CHARS = 200;

const FALLBACK_TITLES: Readonly<
  Record<
    | 'knowledge'
    | 'opportunity'
    | 'organization'
    | 'reference'
    | 'stats'
    | 'data',
    Readonly<Record<PolicyLanguage, string>>
  >
> = Object.freeze({
  knowledge: Object.freeze({
    en: 'Basmatak knowledge',
    ar: 'معلومات بصمتك',
  }),
  opportunity: Object.freeze({
    en: 'Opportunity',
    ar: 'فرصة',
  }),
  organization: Object.freeze({
    en: 'Organization',
    ar: 'منظمة',
  }),
  reference: Object.freeze({
    en: 'Reference data',
    ar: 'بيانات مرجعية',
  }),
  stats: Object.freeze({
    en: 'Platform statistics',
    ar: 'إحصاءات المنصة',
  }),
  data: Object.freeze({
    en: 'Public data',
    ar: 'بيانات عامة',
  }),
});

export interface CitableToolResult {
  citationId: string;
  result: ToolExecutionResult;
}

export interface CitationSourceMaps {
  knowledge: Readonly<Record<string, AiAgentKnowledgeSource>>;
  data: Readonly<Record<string, readonly AiAgentDataSource[]>>;
}

export interface ResolvedCitations {
  /** Answer text with valid markers normalized and invalid markers removed. */
  text: string;
  knowledge: AiAgentKnowledgeSource[];
  data: AiAgentDataSource[];
  validIds: string[];
  invalidIds: string[];
  hasValidCitations: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function safeRelativePath(value: unknown): string {
  const raw = safeText(value, MAX_SOURCE_CHARS).replace(/\\/g, '/');
  return raw
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/')
    .slice(0, MAX_SOURCE_CHARS);
}

function localizedTitle(
  kind: keyof typeof FALLBACK_TITLES,
  language: PolicyLanguage,
): string {
  return FALLBACK_TITLES[kind][language] ?? FALLBACK_TITLES[kind].en;
}

function rowTitle(
  row: Record<string, unknown>,
  fields: readonly string[],
  fallback: string,
): string {
  for (const field of fields) {
    const value = safeText(row[field], MAX_TITLE_CHARS);
    if (value !== '') return value;
  }
  return fallback;
}

function encodeSlug(value: unknown): string | undefined {
  const slug = safeText(value, MAX_SLUG_CHARS);
  if (slug === '') return undefined;
  return encodeURIComponent(slug);
}

function sourceId(citationId: string, index: number): string {
  return `${citationId}-${index + 1}`;
}

function pushSource(
  sources: AiAgentDataSource[],
  source: AiAgentDataSource,
): void {
  if (source.title === '') return;
  const duplicate = sources.some(
    (existing) =>
      existing.type === source.type &&
      existing.path === source.path &&
      existing.title === source.title,
  );
  if (!duplicate) sources.push(source);
}

function itemRows(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data) || !Array.isArray(data.items)) return [];
  return data.items.filter(isRecord);
}

function opportunitySources(
  result: ToolExecutionResult,
  citationId: string,
  language: PolicyLanguage,
): AiAgentDataSource[] {
  if (!result.ok) return [];
  const sources: AiAgentDataSource[] = [];
  const fallback = localizedTitle('opportunity', language);

  for (const [index, row] of itemRows(result.data).entries()) {
    const slug = encodeSlug(row.slug);
    pushSource(sources, {
      id: sourceId(citationId, index),
      citationId,
      type: 'opportunity',
      title: rowTitle(row, ['title', 'slug'], fallback),
      ...(slug !== undefined ? { path: `/opportunities/${slug}` } : {}),
    });
  }
  return sources;
}

function organizationSources(
  result: ToolExecutionResult,
  citationId: string,
  language: PolicyLanguage,
): AiAgentDataSource[] {
  if (!result.ok) return [];
  const sources: AiAgentDataSource[] = [];
  const fallback = localizedTitle('organization', language);

  for (const [index, row] of itemRows(result.data).entries()) {
    const slug = encodeSlug(row.slug);
    pushSource(sources, {
      id: sourceId(citationId, index),
      citationId,
      type: 'organization',
      title: rowTitle(row, ['nameFr', 'nameAr', 'slug'], fallback),
      ...(slug !== undefined ? { path: `/orgs/${slug}` } : {}),
    });
  }
  return sources;
}

function referenceSources(
  result: ToolExecutionResult,
  citationId: string,
  language: PolicyLanguage,
): AiAgentDataSource[] {
  if (!result.ok || !isRecord(result.data)) return [];
  const sources: AiAgentDataSource[] = [];
  const fallback = localizedTitle('reference', language);
  let index = 0;

  const append = (rows: unknown, fields: readonly string[]): void => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      pushSource(sources, {
        id: sourceId(citationId, index),
        citationId,
        type: 'reference',
        title: rowTitle(row, fields, fallback),
      });
      index += 1;
    }
  };

  append(result.data.skills, ['nameFr', 'nameAr', 'slug']);
  append(result.data.locations, ['nameFr', 'nameAr', 'code']);
  return sources;
}

function statsSources(
  result: ToolExecutionResult,
  citationId: string,
  language: PolicyLanguage,
): AiAgentDataSource[] {
  if (!result.ok) return [];
  const fallback = localizedTitle('stats', language);
  return [
    {
      id: sourceId(citationId, 0),
      citationId,
      type: 'stats',
      title: fallback,
    },
  ];
}

function genericSources(
  result: ToolExecutionResult,
  citationId: string,
  language: PolicyLanguage,
): AiAgentDataSource[] {
  if (!result.ok || result.data === null || result.data === undefined) {
    return [];
  }
  return [
    {
      id: sourceId(citationId, 0),
      citationId,
      type: 'reference',
      title: localizedTitle('data', language),
    },
  ];
}

/**
 * Convert one cited tool result into safe public source rows. Only known public
 * shapes are projected; unknown payloads become a generic label so no private
 * field can leak through the source event.
 */
export function dataSourcesForToolResult(
  result: ToolExecutionResult,
  citationId: string,
  language: PolicyLanguage,
): AiAgentDataSource[] {
  switch (result.tool) {
    case 'search_opportunities':
      return opportunitySources(result, citationId, language);
    case 'search_organizations':
      return organizationSources(result, citationId, language);
    case 'search_reference_data':
      return referenceSources(result, citationId, language);
    case 'platform_stats':
      return statsSources(result, citationId, language);
    default:
      return genericSources(result, citationId, language);
  }
}

export function buildDataCitationMap(
  results: readonly CitableToolResult[],
  language: PolicyLanguage,
): Record<string, AiAgentDataSource[]> {
  const map: Record<string, AiAgentDataSource[]> = {};
  for (const item of results) {
    if (!/^T\d{1,3}$/.test(item.citationId)) continue;
    const sources = dataSourcesForToolResult(
      item.result,
      item.citationId,
      language,
    );
    if (sources.length > 0) map[item.citationId] = sources;
  }
  return map;
}

/**
 * Project knowledge citation metadata into the public source shape. Absolute
 * paths are impossible: only a sanitized corpus-relative path is returned.
 */
export function buildKnowledgeCitationMap(
  citations: Readonly<Record<string, PromptCitation>>,
  language: PolicyLanguage,
): Record<string, AiAgentKnowledgeSource> {
  const map: Record<string, AiAgentKnowledgeSource> = {};
  for (const citation of Object.values(citations)) {
    if (citation.kind !== 'knowledge') continue;
    if (!/^K\d{1,3}$/.test(citation.id)) continue;
    const source = safeRelativePath(citation.source);
    map[citation.id] = {
      id: citation.id,
      title:
        safeText(citation.title, MAX_TITLE_CHARS) ||
        localizedTitle('knowledge', language),
      source,
      ...(safeText(citation.heading, MAX_HEADING_CHARS) !== ''
        ? { heading: safeText(citation.heading, MAX_HEADING_CHARS) }
        : {}),
    };
  }
  return map;
}

/** Build citation sources for extractive retrieval-only answers. */
export function buildRetrievalCitationMap(
  chunks: ReadonlyArray<{
    source: string;
    title: string;
    headingTrail?: readonly string[];
  }>,
  language: PolicyLanguage,
): Record<string, AiAgentKnowledgeSource> {
  const map: Record<string, AiAgentKnowledgeSource> = {};
  chunks.forEach((chunk, index) => {
    const id = `K${index + 1}`;
    const heading = Array.isArray(chunk.headingTrail)
      ? chunk.headingTrail.join(' > ')
      : '';
    map[id] = {
      id,
      title:
        safeText(chunk.title, MAX_TITLE_CHARS) ||
        localizedTitle('knowledge', language),
      source: safeRelativePath(chunk.source),
      ...(safeText(heading, MAX_HEADING_CHARS) !== ''
        ? { heading: safeText(heading, MAX_HEADING_CHARS) }
        : {}),
    };
  });
  return map;
}

function referencedIds(group: string): string[] {
  return group
    .split(/[,;]/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => MARKER_ID_PATTERN.test(value));
}

/**
 * Resolve every citation marker against the source maps. Valid markers are
 * normalized to uppercase; invalid markers (including `D#`, which this build
 * does not use) are removed. Source arrays follow first-appearance order.
 */
export function resolveCitations(
  answer: string,
  sources: CitationSourceMaps,
): ResolvedCitations {
  const text = typeof answer === 'string' ? answer : '';
  const knowledge: AiAgentKnowledgeSource[] = [];
  const data: AiAgentDataSource[] = [];
  const validIds: string[] = [];
  const invalidIds: string[] = [];
  const seenKnowledge = new Set<string>();
  const seenData = new Set<string>();
  let sawInvalid = false;

  const rewritten = text.replace(MARKER_PATTERN, (match, group: string) => {
    const ids = referencedIds(group);
    if (ids.length === 0) {
      sawInvalid = true;
      return '';
    }

    const kept: string[] = [];
    for (const id of ids) {
      const kind = id[0];
      if (kind === 'K' && sources.knowledge[id] !== undefined) {
        if (!validIds.includes(id)) validIds.push(id);
        if (!seenKnowledge.has(id)) {
          seenKnowledge.add(id);
          knowledge.push(sources.knowledge[id]);
        }
        kept.push(`[${id}]`);
      } else if (
        kind === 'T' &&
        sources.data[id] !== undefined &&
        sources.data[id].length > 0
      ) {
        if (!validIds.includes(id)) validIds.push(id);
        for (const source of sources.data[id]) {
          if (!seenData.has(source.id)) {
            seenData.add(source.id);
            data.push(source);
          }
        }
        kept.push(`[${id}]`);
      } else {
        if (!invalidIds.includes(id)) invalidIds.push(id);
        sawInvalid = true;
      }
    }

    return kept.join('');
  });

  const normalized = sawInvalid
    ? rewritten
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .trimEnd()
    : rewritten;

  return {
    text: normalized,
    knowledge,
    data,
    validIds,
    invalidIds,
    hasValidCitations: validIds.length > 0,
  };
}

/** Extract normalized citation IDs without resolving them (diagnostics/tests). */
export function extractCitationIds(text: string): string[] {
  const ids: string[] = [];
  const source = typeof text === 'string' ? text : '';
  for (const match of source.matchAll(MARKER_PATTERN)) {
    for (const id of referencedIds(match[1])) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
