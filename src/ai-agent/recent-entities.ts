import type { AiAgentChatMessage } from './ai-agent.types';
import { focusedOpportunityIndex } from './conversation-focus';
import { normalizeText } from './knowledge/normalizer';

/**
 * Server-side recent-entity state for model-first turns.
 *
 * The widget already sends prior turns. Assistant answers contain the public
 * links returned by tools, so the last links are the most reliable record of
 * what "it", "the first one", "نعم", or a raw slug refers to. Plain-text titles
 * are also accepted when the same title was linked earlier in the conversation.
 *
 * The parser is intentionally conservative: locale-agnostic public entity
 * links only, bounded lengths, deduplicated from newest to oldest. Everything
 * derived here is untrusted data and is escaped by the prompt builder.
 */

export type RecentEntityKind = 'opportunity' | 'organization';

export interface RecentEntity {
  kind: RecentEntityKind;
  slug: string;
  title: string;
}

export interface PendingConfirmation {
  kind: RecentEntityKind;
  slug: string;
  title: string;
}

export type RecentReferenceKind = 'ordinal' | 'yes_no' | 'pronoun' | 'slug';

export interface RecentReference {
  kind: RecentReferenceKind;
  /** Selected entities in display order. */
  entities: RecentEntity[];
}

export interface RecentEntities {
  opportunities: RecentEntity[];
  organizations: RecentEntity[];
  lastUserQuestion?: string;
  lastAnswerOffer?: string;
  pendingConfirmation?: PendingConfirmation;
  resolvedReference?: RecentReference;
}

export const MAX_RECENT_ENTITIES = 3;
const MAX_TITLE_CHARS = 160;
const MAX_SLUG_CHARS = 200;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_OFFER_CHARS = 400;
const MIN_PLAIN_TITLE_CHARS = 4;

const LINK_PATTERN = /\[([^\]\n]{1,300})\]\(\s*([^()\s]{1,600})\s*\)/gu;
const LINK_TITLE_PATTERN = /\[([^\]\n]{1,300})\]\([^()\s]{1,600}\)/gu;
const ARABIC_CONFIRMATION =
  /هل\s+تقصد\s*\[([^\]\n]{1,300})\]\(\s*([^()\s]{1,600})\s*\)/u;
const ENGLISH_CONFIRMATION =
  /(?:did|do)\s+you\s+mean\s*\[([^\]\n]{1,300})\]\(\s*([^()\s]{1,600})\s*\)/iu;

const YES_NO_PATTERN =
  /^(?:نعم|أجل|اجل|أيوه|ايوه|بلى|صحيح|بالضبط|yes|yeah|yep|sure|correct|exactly|right)$/u;
const ORDINAL_LAST_AR = /^(?:و)?(?:بال|ال)?(?:اخيره|اخير|الاخيره|الاخير)$/u;
const ORDINAL_LAST_EN = /^(?:the\s+)?(?:last|final)(?:\s+one)?$/u;
const ORDINAL_EMBEDDED_AR =
  /(?:^|\s)(?:بال|ال)?(اولي|اول|ثانيه|ثاني|ثالثه|ثالث)(?=\s|$|[؟?.,!])/u;
const ORDINAL_EMBEDDED_EN =
  /\b(?:the\s+)?(first|second|third)(?:\s+one)?(?=\s*(?:[؟?.,!]|$))/u;

function embeddedOrdinalIndex(normalized: string): number | undefined {
  const arabic = ORDINAL_EMBEDDED_AR.exec(normalized);
  if (arabic !== null) {
    const ordinal = (arabic[1] ?? '').replace(/^ال/u, '');
    if (ordinal.startsWith('اول')) return 0;
    if (ordinal.startsWith('ثاني')) return 1;
    if (ordinal.startsWith('ثالث')) return 2;
  }
  const english = ORDINAL_EMBEDDED_EN.exec(normalized);
  if (english !== null) {
    if (english[1] === 'first') return 0;
    if (english[1] === 'second') return 1;
    if (english[1] === 'third') return 2;
  }
  return undefined;
}
const PRONOUN_PATTERN =
  /(?:^|\s)(?:هي|هو|هما|هم|هن|هذه|هذا|هؤلاء|عنها|عنهم|عنها|منها|منهم|فيه|فيها|عليها|عليهم|its|it|they|them|this|that|these|those|he|she)(?:\s|$|[؟?.,!])/iu;

function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[*_~`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxChars);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeSlug(value: string): string | undefined {
  const slug = safeDecode(value).trim();
  if (slug === '' || slug === '.' || slug === '..') return undefined;
  if (slug.length > MAX_SLUG_CHARS) return undefined;
  if (/[/\\?#\u0000-\u001f]/u.test(slug)) return undefined;
  return slug;
}

/** Return a locale-agnostic public pathname for a relative or absolute href. */
function hrefPath(href: string): string {
  const value = href.trim();
  if (/^https?:\/\//iu.test(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return '';
    }
  }
  return value.split(/[?#]/u)[0] ?? '';
}

function parseEntityHref(
  href: string,
): { kind: RecentEntityKind; slug: string } | undefined {
  const path = hrefPath(href).replace(/^\/+/u, '');
  const withoutLocale = path.replace(/^(?:en|ar)\//iu, '');
  const match = /^(opportunities|orgs|organizations)\/([^/]+)\/?$/iu.exec(
    withoutLocale,
  );
  if (match === null) return undefined;
  const slug = safeSlug(match[2] ?? '');
  if (slug === undefined) return undefined;
  return {
    kind:
      (match[1] ?? '').toLowerCase() === 'opportunities'
        ? 'opportunity'
        : 'organization',
    slug,
  };
}

function parseLinkEntities(content: string): RecentEntity[] {
  const entities: RecentEntity[] = [];
  for (const match of String(content ?? '').matchAll(LINK_PATTERN)) {
    const href = match[2] ?? '';
    const entity = parseEntityHref(href);
    if (entity === undefined) continue;
    const title = cleanText(match[1], MAX_TITLE_CHARS) || entity.slug;
    entities.push({ ...entity, title });
  }
  return entities;
}

function latestAssistant(
  history: readonly AiAgentChatMessage[],
): AiAgentChatMessage | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'assistant') return history[index];
  }
  return undefined;
}

function latestUser(
  history: readonly AiAgentChatMessage[],
): AiAgentChatMessage | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') return history[index];
  }
  return undefined;
}

function stripLinks(content: string): string {
  return String(content ?? '')
    .replace(LINK_TITLE_PATTERN, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function collectEntities(
  history: readonly AiAgentChatMessage[],
): RecentEntity[] {
  const seen = new Set<string>();
  const entities: RecentEntity[] = [];
  const byTitle = new Map<string, RecentEntity>();

  // First pass: links are authoritative. Newest assistant message wins.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== 'assistant') continue;
    for (const entity of parseLinkEntities(message.content)) {
      const key = `${entity.kind}:${entity.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push(entity);
      const title = normalizeText(entity.title);
      if (title !== '' && entity.title.length >= MIN_PLAIN_TITLE_CHARS) {
        byTitle.set(title, entity);
      }
    }
  }

  // Second pass: a plain-text title linked earlier is still a usable focus
  // when the sanitizer reduced the current answer link to plain text.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== 'assistant') continue;
    const text = normalizeText(stripLinks(message.content));
    if (text === '') continue;
    for (const [title, entity] of byTitle) {
      if (text === title || text.includes(` ${title} `)) {
        const key = `${entity.kind}:${entity.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entities.push(entity);
      }
    }
  }

  return entities;
}

function newest(
  entities: readonly RecentEntity[],
  kind: RecentEntityKind,
): RecentEntity[] {
  return entities
    .filter((entity) => entity.kind === kind)
    .slice(0, MAX_RECENT_ENTITIES);
}

function confirmationFrom(
  content: string,
  known: readonly RecentEntity[],
): PendingConfirmation | undefined {
  const text = String(content ?? '');
  for (const pattern of [ARABIC_CONFIRMATION, ENGLISH_CONFIRMATION]) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const entity = parseEntityHref(match[2] ?? '');
    if (entity === undefined) continue;
    const title = cleanText(match[1], MAX_TITLE_CHARS) || entity.slug;
    return { ...entity, title };
  }

  // A plain-text confirmation is usable only when its title matches an entity
  // linked earlier in the same conversation.
  const plain =
    /(?:هل\s+تقصد|(?:did|do)\s+you\s+mean)\s+([^؟?\n]{1,160})/iu.exec(text);
  if (plain === null) return undefined;
  const wanted = normalizeText(plain[1] ?? '');
  const entity = known.find(
    (candidate) => normalizeText(candidate.title) === wanted,
  );
  return entity === undefined
    ? undefined
    : { kind: entity.kind, slug: entity.slug, title: entity.title };
}

function matchSlug(
  message: string,
  entities: readonly RecentEntity[],
): RecentEntity | undefined {
  const raw = String(message ?? '');
  const normalized = normalizeText(raw);
  for (const entity of entities) {
    const slug = normalizeText(entity.slug);
    if (
      slug !== '' &&
      (raw.includes(entity.slug) || normalized.includes(slug))
    ) {
      return entity;
    }
  }
  return undefined;
}

/**
 * Resolve an ordinal, yes/no reply, pronoun, or raw slug against the recent
 * entities. Returns `undefined` when the message does not clearly refer to a
 * previously shown entity.
 */
export function resolveRecentReference(
  message: string,
  recent: RecentEntities,
): RecentReference | undefined {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text === '') return undefined;

  const all = [...recent.opportunities, ...recent.organizations];
  if (all.length === 0) return undefined;

  const slug = matchSlug(text, all);
  if (slug !== undefined) {
    return { kind: 'slug', entities: [slug] };
  }

  const normalized = normalizeText(text);
  const index =
    focusedOpportunityIndex(text) ?? embeddedOrdinalIndex(normalized);
  const opportunities =
    recent.opportunities.length > 0 ? recent.opportunities : all;
  if (index !== undefined) {
    const entity = opportunities[index];
    return entity === undefined
      ? undefined
      : { kind: 'ordinal', entities: [entity] };
  }
  if (ORDINAL_LAST_AR.test(normalized) || ORDINAL_LAST_EN.test(normalized)) {
    const entity = opportunities[opportunities.length - 1];
    return entity === undefined
      ? undefined
      : { kind: 'ordinal', entities: [entity] };
  }

  if (YES_NO_PATTERN.test(normalized)) {
    if (recent.pendingConfirmation !== undefined) {
      return {
        kind: 'yes_no',
        entities: [
          {
            kind: recent.pendingConfirmation.kind,
            slug: recent.pendingConfirmation.slug,
            title: recent.pendingConfirmation.title,
          },
        ],
      };
    }
    const first = recent.opportunities[0] ?? recent.organizations[0];
    return first === undefined
      ? undefined
      : { kind: 'yes_no', entities: [first] };
  }

  if (PRONOUN_PATTERN.test(text)) {
    if (recent.pendingConfirmation !== undefined) {
      return {
        kind: 'pronoun',
        entities: [
          {
            kind: recent.pendingConfirmation.kind,
            slug: recent.pendingConfirmation.slug,
            title: recent.pendingConfirmation.title,
          },
        ],
      };
    }
    return {
      kind: 'pronoun',
      entities:
        recent.opportunities.length > 0
          ? [recent.opportunities[0] as RecentEntity]
          : recent.organizations.length > 0
            ? [recent.organizations[0] as RecentEntity]
            : [],
    };
  }

  return undefined;
}

/**
 * Build the model-first recent-entity state from client-supplied history.
 * Returns `undefined` when neither entities nor a meaningful prior question
 * exists, matching the no-history behavior.
 */
export function deriveRecentEntities(
  history: readonly AiAgentChatMessage[] | undefined,
  message = '',
): RecentEntities | undefined {
  const messages = Array.isArray(history) ? history : [];
  if (messages.length === 0) return undefined;

  const entities = collectEntities(messages);
  const opportunities = newest(entities, 'opportunity');
  const organizations = newest(entities, 'organization');
  const lastUser = latestUser(messages);
  const lastAssistant = latestAssistant(messages);
  const lastUserQuestion =
    lastUser === undefined
      ? undefined
      : cleanText(stripLinks(lastUser.content), MAX_QUESTION_CHARS) ||
        undefined;
  const lastAnswerOffer =
    lastAssistant === undefined
      ? undefined
      : cleanText(stripLinks(lastAssistant.content), MAX_ANSWER_OFFER_CHARS) ||
        undefined;
  const pendingConfirmation =
    lastAssistant === undefined
      ? undefined
      : confirmationFrom(lastAssistant.content, entities);

  if (
    opportunities.length === 0 &&
    organizations.length === 0 &&
    lastUserQuestion === undefined
  ) {
    return undefined;
  }

  const recent: RecentEntities = {
    opportunities,
    organizations,
    ...(lastUserQuestion !== undefined ? { lastUserQuestion } : {}),
    ...(lastAnswerOffer !== undefined ? { lastAnswerOffer } : {}),
    ...(pendingConfirmation !== undefined ? { pendingConfirmation } : {}),
  };
  const resolvedReference = resolveRecentReference(message, recent);
  return resolvedReference === undefined
    ? recent
    : { ...recent, resolvedReference };
}

/**
 * Hidden prompt block. It carries only titles, slugs, and the resolved
 * reference; the rules for using them live once in the system prompt. Values
 * are bounded and returned as plain text; the builder escapes them so no title
 * or slug can close a delimiter section.
 */
export function formatRecentEntities(recent: RecentEntities): string {
  const lines: string[] = [];
  const list = (entities: readonly RecentEntity[]): string =>
    entities.length === 0
      ? 'none'
      : entities
          .map((entity) => `"${entity.title}" (${entity.slug})`)
          .join('; ');
  const one = (entity: {
    kind: RecentEntityKind;
    title: string;
    slug: string;
  }): string => `${entity.kind} "${entity.title}" (${entity.slug})`;

  if (recent.pendingConfirmation !== undefined) {
    lines.push(`pending: ${one(recent.pendingConfirmation)}`);
  }
  if (recent.resolvedReference !== undefined) {
    lines.push(
      `resolved (${recent.resolvedReference.kind}): ${recent.resolvedReference.entities
        .map(one)
        .join('; ')}`,
    );
  }
  lines.push(`opportunities: ${list(recent.opportunities)}`);
  lines.push(`organizations: ${list(recent.organizations)}`);
  return lines.join('\n');
}
