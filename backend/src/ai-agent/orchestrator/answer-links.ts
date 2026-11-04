import type { AiAgentLocale } from '../ai-agent.types';
import type { PromptLanguage } from '../prompt/prompt.types';
import type { ToolExecutionResult } from '../tools/tool.types';
import type { CitableToolResult } from './citations';

/**
 * Links the model is allowed to write in a final answer.
 *
 * Only real public entities returned by a successful tool call in the same
 * turn may become links. The locale prefix is added here so the model never has
 * to guess it and can never produce a locale-less or cross-locale link.
 */
export type AnswerLinkKind =
  'opportunity' | 'organization' | 'volunteer' | 'browse';

export interface AnswerLink {
  kind: AnswerLinkKind;
  href: string;
  title: string;
}

const MAX_SLUG_CHARS = 200;
const MAX_TITLE_CHARS = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/**
 * Slugs and usernames are path segments, never paths. Reject anything that
 * could escape the segment or change the URL shape.
 */
function safeSegment(value: unknown): string | undefined {
  const segment = safeText(value, MAX_SLUG_CHARS);
  if (segment === '' || segment === '.' || segment === '..') return undefined;
  if (/[/\\?#\u0000-\u001f]/u.test(segment)) return undefined;
  return encodeURIComponent(segment);
}

function itemRows(result: ToolExecutionResult): Record<string, unknown>[] {
  if (!result.ok || !isRecord(result.data)) return [];
  const items = result.data.items;
  if (!Array.isArray(items)) return [];
  return items.filter(isRecord);
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

function pushLink(links: AnswerLink[], link: AnswerLink): void {
  if (link.title === '' || link.href === '') return;
  if (links.some((existing) => existing.href === link.href)) return;
  links.push(link);
}

function opportunityLinks(
  result: ToolExecutionResult,
  locale: AiAgentLocale,
  links: AnswerLink[],
): void {
  for (const row of itemRows(result)) {
    const slug = safeSegment(row.slug);
    if (slug === undefined) continue;
    pushLink(links, {
      kind: 'opportunity',
      href: `/${locale}/opportunities/${slug}`,
      title: rowTitle(row, ['title', 'slug'], slug),
    });
  }
}

function organizationLinks(
  result: ToolExecutionResult,
  locale: AiAgentLocale,
  language: PromptLanguage,
  links: AnswerLink[],
): void {
  const titleFields =
    language === 'ar'
      ? ['nameAr', 'nameFr', 'name', 'slug']
      : ['nameFr', 'nameAr', 'name', 'slug'];
  for (const row of itemRows(result)) {
    const slug = safeSegment(row.slug);
    if (slug === undefined) continue;
    pushLink(links, {
      kind: 'organization',
      href: `/${locale}/orgs/${slug}`,
      title: rowTitle(row, titleFields, slug),
    });
  }
}

function volunteerLinks(
  result: ToolExecutionResult,
  locale: AiAgentLocale,
  links: AnswerLink[],
): void {
  for (const row of itemRows(result)) {
    const username = safeSegment(row.username);
    if (username === undefined || username === 'me') continue;
    pushLink(links, {
      kind: 'volunteer',
      href: `/${locale}/volunteers/${username}`,
      title: rowTitle(row, ['nameFr', 'nameAr', 'name', 'username'], username),
    });
  }
}

/**
 * Build the exact, locale-prefixed link set for a turn from tool results.
 * Failed results, empty results, and rows without a usable slug are ignored.
 */
export function buildAnswerLinks(
  results: readonly CitableToolResult[],
  locale: AiAgentLocale,
  language: PromptLanguage = 'en',
): AnswerLink[] {
  const links: AnswerLink[] = [];
  for (const item of results) {
    switch (item.result.tool) {
      case 'search_opportunities':
        opportunityLinks(item.result, locale, links);
        break;
      case 'search_organizations':
        organizationLinks(item.result, locale, language, links);
        break;
      default:
        if (/(?:volunteer|talent)/i.test(item.result.tool) && item.result.ok) {
          volunteerLinks(item.result, locale, links);
        }
        break;
    }
  }
  return links;
}

/** The two general browse pages that have a real frontend route. */
export function buildBrowseLinks(locale: AiAgentLocale): AnswerLink[] {
  return [
    {
      kind: 'browse',
      href: `/${locale}/opportunities`,
      title: locale === 'ar' ? 'تصفّح الفرص' : 'Browse opportunities',
    },
    {
      kind: 'browse',
      href: `/${locale}/talents`,
      title: locale === 'ar' ? 'تصفّح المواهب' : 'Browse talents',
    },
  ];
}

/**
 * General listing links are allowed only for a real "where do I browse/find"
 * question, never as an automatic footer on every answer.
 */
export function allowsBrowseLinks(message: string): boolean {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text === '') return false;
  return /\b(?:where|how)\b[^?.!]{0,80}\b(?:find|browse|search|look|discover)\b|\bbrowse\b|\bwhere\s+can\s+i\s+(?:find|see|look)\b|أين\s+(?:أجد|ألقى|أتصفح|أبحث)|وين\s+(?:نلقى|ألقى|أتصفح|نبحث)|كيف\s+(?:أتصفح|أبحث|أجد)/iu.test(
    text,
  );
}
