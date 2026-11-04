import type { AiAgentChatMessage } from './ai-agent.types';
import { normalizeText } from './knowledge/normalizer';
import { extractOrganizationName } from './organization-query';

/**
 * Server-side conversation focus.
 *
 * The widget already sends the previous turns, so no new client protocol is
 * needed. The assistant's previous answers contain Markdown links to the real
 * public entities it listed. Those links are the most reliable description of
 * what "it", "they", "the first one", or "هل تحققت" refer to on the next turn.
 *
 * The parser is intentionally conservative: only locale-prefixed opportunity
 * and organization links produced by the answer-link sanitizer are accepted,
 * values are length-bounded, and duplicates are removed.
 */

export type ConversationFocusTopic =
  'opportunity_search' | 'organization_lookup' | 'knowledge';

export type ConversationFocusEntityKind = 'opportunity' | 'organization';

export interface ConversationFocusEntity {
  kind: ConversationFocusEntityKind;
  slug: string;
  title: string;
}

export interface ConversationFocus {
  /** Last topic the user asked about, derived from the latest user turn. */
  topic: ConversationFocusTopic;
  /** Most recently shown opportunities, newest answer first, max three. */
  opportunities: ConversationFocusEntity[];
  /** Most recently shown organizations, newest answer first, max three. */
  organizations: ConversationFocusEntity[];
  /**
   * Best available organization name for a deterministic lookup. It comes from
   * the latest user question when it names one, otherwise from the focused
   * organization link.
   */
  organizationName?: string;
}

export const MAX_FOCUS_ENTITIES = 3;

const MAX_TITLE_CHARS = 160;
const MAX_SLUG_CHARS = 200;
const LINK_PATTERN = /\[([^\]\n]{1,300})\]\(\s*([^()\s]{1,500})\s*\)/gu;
const ENTITY_HREF_PATTERN =
  /^\/(?:en|ar)\/(opportunities|orgs)\/([^/?#]+)\/?$/u;
const OPPORTUNITY_TOPIC_PATTERN =
  /(?:فرص|فرصه|فرصة|تطوع|تطوعي|تطوعيه|منصب|مناصب|وظيف|مهم|تدريب|opportunit|volunteer|job|position|opening|placement|mission|internship)/iu;
const ORGANIZATION_TOPIC_PATTERN =
  /(?:جمعي|منظم|مؤسس|هيئ|تعاون|organization|organisation|association|ngo|charity|foundation|organisme)/iu;

function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[*_~`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxChars);
}

function safeDecodeSlug(value: string): string | undefined {
  let slug = value;
  try {
    slug = decodeURIComponent(value);
  } catch {
    slug = value;
  }
  slug = slug.trim();
  if (slug === '' || slug === '.' || slug === '..') return undefined;
  if (slug.length > MAX_SLUG_CHARS) return undefined;
  if (/[/\\?#\u0000-\u001f]/u.test(slug)) return undefined;
  return slug;
}

function parseEntityLinks(
  content: string,
): Array<{ kind: ConversationFocusEntityKind; slug: string; title: string }> {
  const links: Array<{
    kind: ConversationFocusEntityKind;
    slug: string;
    title: string;
  }> = [];

  for (const match of String(content ?? '').matchAll(LINK_PATTERN)) {
    const title = cleanText(match[1], MAX_TITLE_CHARS);
    const href = match[2] ?? '';
    const entity = ENTITY_HREF_PATTERN.exec(href);
    if (entity === null) continue;
    const slug = safeDecodeSlug(entity[2] ?? '');
    if (slug === undefined) continue;
    links.push({
      kind: entity[1] === 'opportunities' ? 'opportunity' : 'organization',
      slug,
      title: title === '' ? slug : title,
    });
  }

  return links;
}

function lastUserMessage(
  history: readonly AiAgentChatMessage[],
): AiAgentChatMessage | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'user') return message;
  }
  return undefined;
}

function collectEntities(
  history: readonly AiAgentChatMessage[],
  kind: ConversationFocusEntityKind,
): ConversationFocusEntity[] {
  const seen = new Set<string>();
  const entities: ConversationFocusEntity[] = [];

  // Walk backwards so the newest answer wins. Older answers only fill gaps
  // (for example after a follow-up that linked a single item), and the total is
  // bounded so stale turns can never dominate.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== 'assistant') continue;
    for (const link of parseEntityLinks(message.content)) {
      if (link.kind !== kind || seen.has(link.slug)) continue;
      seen.add(link.slug);
      entities.push(link);
      if (entities.length >= MAX_FOCUS_ENTITIES) return entities;
    }
  }

  return entities;
}

function deriveTopic(
  userMessage: AiAgentChatMessage | undefined,
  opportunities: readonly ConversationFocusEntity[],
  organizations: readonly ConversationFocusEntity[],
): ConversationFocusTopic {
  const text = userMessage?.content ?? '';
  if (extractOrganizationName(text) !== undefined) {
    return 'organization_lookup';
  }
  if (OPPORTUNITY_TOPIC_PATTERN.test(text)) {
    return 'opportunity_search';
  }
  if (ORGANIZATION_TOPIC_PATTERN.test(text)) {
    return 'organization_lookup';
  }
  if (opportunities.length > 0) return 'opportunity_search';
  if (organizations.length > 0) return 'organization_lookup';
  return 'knowledge';
}

/**
 * Derive the focus from the client-supplied history. Returns `undefined` when
 * the history contains neither entities nor a recognizable topic, so callers
 * can keep their no-focus behavior.
 */
export function deriveConversationFocus(
  history: readonly AiAgentChatMessage[] | undefined,
): ConversationFocus | undefined {
  const messages = Array.isArray(history) ? history : [];
  if (messages.length === 0) return undefined;

  const opportunities = collectEntities(messages, 'opportunity');
  const organizations = collectEntities(messages, 'organization');
  const latestUser = lastUserMessage(messages);
  const topic = deriveTopic(latestUser, opportunities, organizations);

  if (
    opportunities.length === 0 &&
    organizations.length === 0 &&
    topic === 'knowledge'
  ) {
    return undefined;
  }

  const typedName =
    latestUser !== undefined
      ? extractOrganizationName(latestUser.content)
      : undefined;
  // Keep the raw title here: matching normalizes both sides later, and the raw
  // title is what the user and the org card actually display.
  const focusedName =
    typedName ??
    (organizations.length > 0 ? (organizations[0]?.title ?? '') : '');
  const organizationName = focusedName === '' ? undefined : focusedName;

  return {
    topic,
    opportunities,
    organizations,
    ...(organizationName !== undefined ? { organizationName } : {}),
  };
}

/** True when the message contains an explicit first/second/third reference. */
export function focusedOpportunityIndex(message: string): number | undefined {
  const normalized = normalizeText(message);

  // Arabic ordinals normally stand alone or follow "الفرصة". Avoid matching a
  // phrase such as "first step", which is not an anaphor.
  const arabic = /^(?:و)?(?:بال|ال)?(اولي|اول|ثانيه|ثاني|ثالثه|ثالث)$/u.exec(
    normalized,
  );
  const arabicOf =
    /(?:الفرصه|الفرص|فرصه)\s+(الاولي|الاول|الثانيه|الثاني|الثالثه|الثالث)$/u.exec(
      normalized,
    );
  const ordinal = (arabic?.[1] ?? arabicOf?.[1])?.replace(/^ال/u, '');
  if (ordinal !== undefined) {
    if (ordinal.startsWith('اول')) return 0;
    if (ordinal.startsWith('ثاني')) return 1;
    if (ordinal.startsWith('ثالث')) return 2;
  }

  const english = /(?:^|\s)(?:the\s+)?(first|second|third)(?:\s+one)?$/u.exec(
    normalized,
  );
  if (english?.[1] === 'first') return 0;
  if (english?.[1] === 'second') return 1;
  if (english?.[1] === 'third') return 2;
  return undefined;
}

/**
 * Resolve which focused slugs a follow-up refers to. An ordinal selects one
 * item; every other anaphora covers the whole focused list.
 */
export function selectFocusedOpportunitySlugs(
  message: string,
  focus: ConversationFocus | undefined,
): string[] | undefined {
  if (focus === undefined || focus.opportunities.length === 0) {
    return undefined;
  }

  const index = focusedOpportunityIndex(message);
  if (index !== undefined) {
    const entity = focus.opportunities[index];
    return entity === undefined ? undefined : [entity.slug];
  }

  return focus.opportunities.map((entity) => entity.slug);
}

/**
 * Short hidden prompt line. Bounded to three entities per kind and rendered as
 * untrusted data by the builder, never as system rules.
 */
export function formatConversationFocus(focus: ConversationFocus): string {
  const parts: string[] = [];

  if (focus.opportunities.length > 0) {
    const items = focus.opportunities.map(
      (entity) =>
        `${cleanText(entity.title, 120)} (${cleanText(entity.slug, 120)})`,
    );
    parts.push(`Previously shown opportunities: ${items.join('; ')}`);
  }
  if (focus.organizations.length > 0) {
    const items = focus.organizations.map(
      (entity) =>
        `${cleanText(entity.title, 120)} (${cleanText(entity.slug, 120)})`,
    );
    parts.push(`Previously shown organizations: ${items.join('; ')}`);
  }

  parts.push(`Previous topic: ${focus.topic}`);
  return `${parts.join('. ')}.`;
}
