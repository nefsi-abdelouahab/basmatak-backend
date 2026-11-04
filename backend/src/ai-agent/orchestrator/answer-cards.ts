import type {
  AiAgentCard,
  AiAgentCardName,
  AiAgentLocale,
  AiAgentOpportunityCard,
  AiAgentOrganizationCard,
  AiAgentStatsCard,
} from '../ai-agent.types';
import type { ToolExecutionResult } from '../tools/tool.types';
import type { CitableToolResult } from './citations';
import { normalizeAnswerHref } from './answer-sanitizer';
import { safeSegment } from './answer-links';

/**
 * Deterministic generative-UI cards.
 *
 * Cards never introduce content of their own: they are projections of public
 * tool rows, and an entity card is kept only when its exact allowlisted href is
 * present in the already-sanitized answer. This preserves the grounding rule
 * that the text must have linked an entity before a card can show it.
 *
 * Only explicitly named public fields are copied. Tool rows are never spread,
 * so forbidden keys (`_id`, contact data, registry identifiers, coordinates)
 * cannot leak through.
 */

const MAX_CARDS = 6;
const MAX_TITLE_CHARS = 160;
const MAX_TEXT_CHARS = 120;

const MARKDOWN_LINK_PATTERN =
  /\[([^\]\n]{1,200})\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
  return text === '' ? undefined : text;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function cardName(value: unknown): AiAgentCardName | undefined {
  if (!isRecord(value)) return undefined;
  const ar = safeText(value.ar, MAX_TEXT_CHARS);
  const fr = safeText(value.fr, MAX_TEXT_CHARS);
  if (ar === undefined && fr === undefined) return undefined;
  return {
    ...(ar !== undefined ? { ar } : {}),
    ...(fr !== undefined ? { fr } : {}),
  };
}

function itemRows(result: ToolExecutionResult): Record<string, unknown>[] {
  if (!result.ok || !isRecord(result.data)) return [];
  const items = result.data.items;
  if (Array.isArray(items)) return items.filter(isRecord);
  const item = result.data.item;
  return isRecord(item) ? [item] : [];
}

/** Exact hrefs that survived sanitization in this answer. */
function answerHrefs(answer: string, locale: AiAgentLocale): Set<string> {
  const hrefs = new Set<string>();
  const source = typeof answer === 'string' ? answer : '';
  for (const match of source.matchAll(MARKDOWN_LINK_PATTERN)) {
    const raw = match[2];
    if (raw === undefined) continue;
    const href = normalizeAnswerHref(raw, locale);
    if (href !== null) hrefs.add(href);
  }
  return hrefs;
}

function organizationName(
  row: Record<string, unknown>,
): AiAgentCardName | undefined {
  const organization = row.organization;
  if (!isRecord(organization)) return undefined;
  return cardName({ ar: organization.nameAr, fr: organization.nameFr });
}

function wilayaName(row: Record<string, unknown>): AiAgentCardName | undefined {
  const names = row.locationNames;
  if (!isRecord(names)) return undefined;
  return cardName(names.wilaya);
}

function opportunityCard(
  row: Record<string, unknown>,
  locale: AiAgentLocale,
): AiAgentOpportunityCard | undefined {
  const slug = safeSegment(row.slug);
  if (slug === undefined) return undefined;
  const title =
    safeText(row.title, MAX_TITLE_CHARS) ?? safeText(row.slug, MAX_TITLE_CHARS);
  if (title === undefined) return undefined;

  const names = organizationName(row);
  const wilaya = wilayaName(row);
  const startDate = safeText(row.startDate, MAX_TITLE_CHARS);
  const applicationDeadline = safeText(
    row.applicationDeadline,
    MAX_TITLE_CHARS,
  );
  const openPositions = safeCount(row.openPositions);
  const mode = safeText(row.mode, MAX_TEXT_CHARS);
  const status = safeText(row.status, MAX_TEXT_CHARS);

  return {
    kind: 'opportunity',
    slug,
    title,
    ...(names !== undefined ? { organizationName: names } : {}),
    ...(wilaya !== undefined ? { wilayaName: wilaya } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(applicationDeadline !== undefined ? { applicationDeadline } : {}),
    ...(openPositions !== undefined ? { openPositions } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(status !== undefined ? { status } : {}),
    href: `/${locale}/opportunities/${slug}`,
  };
}

function organizationCard(
  row: Record<string, unknown>,
  locale: AiAgentLocale,
): AiAgentOrganizationCard | undefined {
  const slug = safeSegment(row.slug);
  if (slug === undefined) return undefined;
  const nameAr = safeText(row.nameAr, MAX_TITLE_CHARS);
  const nameFr = safeText(row.nameFr, MAX_TITLE_CHARS);
  const type = safeText(row.type, MAX_TEXT_CHARS);
  const wilaya = wilayaName(row);
  const foundedYear = safeCount(row.foundedYear);

  return {
    kind: 'organization',
    slug,
    ...(nameAr !== undefined ? { nameAr } : {}),
    ...(nameFr !== undefined ? { nameFr } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(wilaya !== undefined ? { wilayaName: wilaya } : {}),
    ...(foundedYear !== undefined ? { foundedYear } : {}),
    href: `/${locale}/orgs/${slug}`,
  };
}

function statsCard(result: ToolExecutionResult): AiAgentStatsCard | undefined {
  if (!result.ok || !isRecord(result.data)) return undefined;
  const publishedOpportunities = safeCount(result.data.publishedOpportunities);
  const verifiedOrganizations = safeCount(result.data.verifiedOrganizations);
  const activeSkills = safeCount(result.data.activeSkills);
  const wilayas = safeCount(result.data.wilayas);
  const municipalities = safeCount(result.data.municipalities);
  if (
    publishedOpportunities === undefined ||
    verifiedOrganizations === undefined ||
    activeSkills === undefined ||
    wilayas === undefined ||
    municipalities === undefined
  ) {
    return undefined;
  }
  return {
    kind: 'stats',
    publishedOpportunities,
    verifiedOrganizations,
    activeSkills,
    wilayas,
    municipalities,
  };
}

function cardForRow(
  tool: string,
  row: Record<string, unknown>,
  locale: AiAgentLocale,
): AiAgentOpportunityCard | AiAgentOrganizationCard | undefined {
  switch (tool) {
    case 'search_opportunities':
    case 'get_opportunity_details':
      return opportunityCard(row, locale);
    case 'search_organizations':
    case 'get_organization_details':
      return organizationCard(row, locale);
    default:
      return undefined;
  }
}

export interface BuildAnswerCardsInput {
  results: readonly CitableToolResult[];
  /** The final, already-sanitized answer text. */
  answer: string;
  locale: AiAgentLocale;
}

/**
 * Build the compact card list for one turn. Entity cards are matched to the
 * sanitized answer by href; a stats card is added only alongside at least one
 * real entity card, so an answer with no links never emits cards.
 */
export function buildAnswerCards(input: BuildAnswerCardsInput): AiAgentCard[] {
  const linked = answerHrefs(input.answer, input.locale);
  if (linked.size === 0) return [];

  const locale = input.locale;
  const cards: AiAgentCard[] = [];
  const seen = new Set<string>();
  let stats: AiAgentStatsCard | undefined;

  for (const item of input.results) {
    if (!item.result.ok) continue;
    if (item.result.tool === 'platform_stats') {
      stats ??= statsCard(item.result);
      continue;
    }

    for (const row of itemRows(item.result)) {
      const card = cardForRow(item.result.tool, row, locale);
      if (card === undefined) continue;
      if (!linked.has(card.href) || seen.has(card.href)) continue;
      seen.add(card.href);
      cards.push(card);
      if (cards.length >= MAX_CARDS) break;
    }
    if (cards.length >= MAX_CARDS) break;
  }

  if (cards.length === 0) return [];
  if (stats !== undefined && cards.length < MAX_CARDS) cards.push(stats);
  return cards.slice(0, MAX_CARDS);
}
