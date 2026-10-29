import type { AiAgentLocale } from '../ai-agent.types';
import { buildBrowseLinks, type AnswerLink } from './answer-links';

/**
 * Final-answer sanitizer.
 *
 * The model is instructed not to cite, not to mention sources, and not to
 * invent links. This module is the deterministic safety net: it removes any
 * citation markers or source wording that still slips through, keeps only
 * locale-prefixed links to public entities returned by tools in this turn, and
 * turns every other Markdown link into plain text.
 */

export const CITATION_MARKER_PATTERN =
  /\[[KTD]\d{1,3}(?:\s*[,;]\s*[KTD]\d{1,3})*\]/gi;

const MARKDOWN_LINK_PATTERN =
  /\[([^\]\n]{1,200})\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/g;

const SOURCE_HEADING_PATTERN =
  /^\s*(?:sources?|references?|citations?|المصادر|المراجع|الاقتباسات)\s*:?\s*$/iu;
const SOURCE_INLINE_PATTERN =
  /^\s*(?:sources?|references?|citations?|المصادر|المراجع|الاقتباسات)\s*:.*$/gimu;

const SOURCE_PHRASES: readonly RegExp[] = [
  /\b(?:this|that|it)\s+(?:is|was)\s+based on\s+(?:the\s+)?(?:knowledge base|knowledge|guide|guides|document|documents|platform information|public information|provided information|context)\b[.!?]?\s*/giu,
  /\b(?:this|that|it)\s+(?:comes?|is taken)\s+from\s+(?:the\s+)?(?:knowledge base|knowledge|guide|guides|document|documents|provided information|context)\b[.!?]?\s*/giu,
  /\baccording to\s+(?:the\s+)?(?:knowledge base|knowledge|guide|guides|document|documents|platform information|public information|provided information|context)\b[,:]?\s*/giu,
  /\baccording to\b[,:]?\s*/giu,
  /\bbased on\s+(?:the\s+)?(?:knowledge base|knowledge|guide|guides|document|documents|platform information|public information|provided information|context)\b[,:]?\s*/giu,
  /\bfrom\s+(?:the\s+)?(?:knowledge base|knowledge|guide|guides|document|documents|provided information|context)\b[,:]?\s*/giu,
  /\bas (?:stated|mentioned|described|shown)\s+in\s+(?:the\s+)?(?:knowledge base|knowledge|guide|guides|document|documents|provided information|context)\b[,:]?\s*/giu,
  /\b(?:the\s+)?(?:knowledge base|knowledge|guide|documents?|context)\s+(?:says|states|shows|indicates|mentions)\s+(?:that\s+)?/giu,
  /(?:وفقاً|وفقا|بناءً|بناء)\s+(?:على|ل)\s*(?:المعرفة|قاعدة المعرفة|الدليل|الأدلة|المستندات|المعلومات العامة|السياق)\s*[،,:]?\s*/gu,
  /(?:كما\s+)?(?:تذكر|يذكر|توضح|يوضح|تشير|يشير)\s+(?:المعرفة|قاعدة المعرفة|الدليل|المستندات)\s+(?:أن\s+)?/gu,
];

/**
 * Internal implementation words that must never reach a user-facing answer.
 * They are checked per sentence so a single bad clause does not erase the
 * useful part of the answer.
 */
const INTERNAL_TERM_PATTERN =
  /\b(?:knowledge base|knowledge|retrieval|chunks?|database|server|tool|tools|sources?|technology|technologies|framework|frameworks|hosting|hosted|Next\.js|NestJS|MongoDB|Supabase|Mongoose|Atlas|Vercel|Render)\b|قاعدة المعرفة|المعرفة|استرجاع|مقتطف|قاعدة البيانات|الخادم|أداة|أدوات|المصادر|مصدر|تقنية|تقنيات|استضافة|إطار عمل/iu;

const KNOWN_LOCALES = new Set(['en', 'ar']);

const SAFE_LINK_BASE = 'https://basmatak.invalid';

export interface AnswerSanitizeOptions {
  locale: AiAgentLocale;
  /** Exact entity links allowed in this answer. */
  allowedLinks?: readonly AnswerLink[];
  /** Whether the user asked where to find/browse something. */
  allowBrowseLinks?: boolean;
  /** Whether the user asked for a list or steps. */
  allowLists?: boolean;
  /** Hard cap for Markdown links in the final answer. */
  maxLinks?: number;
}

function cleanLinkText(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Normalize a model-written internal path to the current locale and reject
 * schemes, protocol-relative URLs, traversal, and non-public routes.
 */
export function normalizeAnswerHref(
  href: string,
  locale: AiAgentLocale,
): string | null {
  const value = typeof href === 'string' ? href.trim() : '';
  if (value === '' || value.length > 2048) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, SAFE_LINK_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== SAFE_LINK_BASE) return null;

  const pathname = parsed.pathname;
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  if (/(?:^|\/)\.\.(?:\/|$)/u.test(pathname)) return null;
  if (/(?:^|\/)\.(?:\/|$)/u.test(pathname)) return null;
  if (/%(?:00|2e|2f|5c)/iu.test(pathname)) return null;

  const segments = pathname.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return null;

  if (segments[0] !== undefined && KNOWN_LOCALES.has(segments[0])) {
    segments.shift();
  }
  if (segments.length === 0) return null;

  const rest = segments.join('/');
  if (rest === 'opportunities' || rest === 'talents') {
    return `/${locale}/${rest}`;
  }
  if (/^opportunities\/[^/]+$/u.test(rest) || /^orgs\/[^/]+$/u.test(rest)) {
    return `/${locale}/${rest}`;
  }
  if (/^volunteers\/[^/]+$/u.test(rest)) {
    const username = rest.slice('volunteers/'.length);
    if (username === 'me' || username === 'settings') return null;
    return `/${locale}/${rest}`;
  }
  return null;
}

function removeSourceSections(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (SOURCE_HEADING_PATTERN.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      const trimmed = line.trim();
      if (
        trimmed === '' ||
        /^(?:[-*•]|\d+[.)])\s+/u.test(trimmed) ||
        /^\[[^\]]+\]\(/u.test(trimmed) ||
        /^https?:\/\//iu.test(trimmed)
      ) {
        continue;
      }
      skipping = false;
    }
    kept.push(line);
  }

  return kept.join('\n');
}

function removeSourcePhrases(text: string): string {
  let result = text;
  for (const pattern of SOURCE_PHRASES) {
    result = result.replace(pattern, '');
  }
  return result;
}

function removeForbiddenSentences(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const sentences = line.split(/(?<=[.!?؟])\s+/u);
      return sentences
        .filter((sentence) => !INTERNAL_TERM_PATTERN.test(sentence))
        .join(' ');
    })
    .filter((line) => line.trim() !== '')
    .join('\n');
}

function stripFormatting(text: string, allowLists: boolean): string {
  let result = text
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replace(/__([^_\n]+)__/gu, '$1');

  if (!allowLists) {
    result = result.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gmu, '');
  } else {
    // Keep the requested list, but never more than three items per list.
    const lines = result.split('\n');
    const kept: string[] = [];
    let itemCount = 0;
    for (const line of lines) {
      if (/^\s*(?:[-*•]|\d+[.)])\s+/u.test(line)) {
        itemCount += 1;
        if (itemCount > 3) continue;
      } else if (line.trim() === '') {
        itemCount = 0;
      }
      kept.push(line);
    }
    result = kept.join('\n');
  }

  return result;
}

function replaceLinks(
  text: string,
  options: Required<
    Pick<AnswerSanitizeOptions, 'locale' | 'allowBrowseLinks' | 'maxLinks'>
  > & { allowedLinks: readonly AnswerLink[] },
): { text: string; links: string[] } {
  const allowed = new Map<string, AnswerLink>();
  for (const link of options.allowedLinks) {
    allowed.set(link.href, link);
  }
  if (options.allowBrowseLinks) {
    for (const link of buildBrowseLinks(options.locale)) {
      allowed.set(link.href, link);
    }
  }

  const placeholders: string[] = [];
  let linkCount = 0;
  let browseUsed = false;

  const replaced = text.replace(
    MARKDOWN_LINK_PATTERN,
    (_match, rawText: string, rawHref: string) => {
      const href = normalizeAnswerHref(rawHref, options.locale);
      const target = href === null ? undefined : allowed.get(href);
      const text = cleanLinkText(rawText);

      if (target === undefined) return text;
      if (target.kind === 'browse' && browseUsed) return text;
      if (linkCount >= options.maxLinks) return text;

      linkCount += 1;
      if (target.kind === 'browse') browseUsed = true;

      const token = `\u0000LINK${placeholders.length}\u0000`;
      placeholders.push(
        `[${text === '' ? target.title : text}](${target.href})`,
      );
      return token;
    },
  );

  let restored = replaced;
  placeholders.forEach((link, index) => {
    restored = restored.replace(`\u0000LINK${index}\u0000`, link);
  });

  return {
    text: restored,
    links: placeholders,
  };
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([.,!?؟،:;])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/**
 * Sanitize one complete answer. The function is pure and deterministic.
 */
export function sanitizeAnswer(
  answer: string,
  options: AnswerSanitizeOptions,
): string {
  const source = typeof answer === 'string' ? answer : '';
  if (source.trim() === '') return '';

  let text = source
    .replace(/\r\n?/g, '\n')
    .replace(CITATION_MARKER_PATTERN, '');

  const linked = replaceLinks(text, {
    locale: options.locale,
    allowedLinks: options.allowedLinks ?? [],
    allowBrowseLinks: options.allowBrowseLinks ?? false,
    maxLinks: Math.max(0, Math.trunc(options.maxLinks ?? 3)),
  });
  text = linked.text;

  text = removeSourceSections(text);
  text = text.replace(SOURCE_INLINE_PATTERN, '');
  text = removeSourcePhrases(text);
  text = removeForbiddenSentences(text);

  // Bare external URLs are never rendered as links and should not be shown as
  // raw text either. Internal paths are handled by the Markdown-link pass.
  text = text.replace(/\bhttps?:\/\/[^\s)\]]+/giu, '');

  text = stripFormatting(text, options.allowLists === true);
  return tidy(text);
}

/** A user asking for steps or an explicit list may receive a short list. */
export function asksForList(message: string): boolean {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text === '') return false;
  return /\b(?:list|steps?|how\s+(?:do|can|to)|ways|options)\b|خطوات|قائمة|اذكر|كيف\s+(?:أ|أس|أقوم)/iu.test(
    text,
  );
}
