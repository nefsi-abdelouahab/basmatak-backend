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

/**
 * Official public contacts (the Roeya Association and platform technical
 * support) are the only contact details the assistant may display. Every other
 * email or phone number in a final answer is redacted deterministically.
 */
export const OFFICIAL_CONTACT_EMAILS: ReadonlySet<string> = new Set([
  'roeyatimimoun@gmail.com',
  'a.nefsi@esi-sba.dz',
]);
export const OFFICIAL_CONTACT_PHONE_DIGITS: ReadonlySet<string> = new Set([
  '213663847105',
  '213696946808',
]);

const EMAIL_CONTACT_PATTERN =
  /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}/gi;
const ALGERIAN_PHONE_PATTERN = /\b0[2-7](?:[\s.-]?\d{2}){3,4}\b/g;
const INTERNATIONAL_PHONE_CANDIDATE =
  /(?:^|[^\w])((?:\+|00)\d[\d\s().-]{6,}\d)(?!\w)/g;

function contactRedaction(locale: AiAgentLocale): string {
  return locale === 'ar'
    ? 'الملف العام للمنظمة'
    : "the organization's public profile";
}

function phoneDigits(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function isOfficialPhone(value: string): boolean {
  let digits = phoneDigits(value);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('213')) {
    const national = digits.slice(3);
    // Accept the optional national trunk prefix: +213 (0) 663 84 71 05.
    const withoutTrunk = national.startsWith('0')
      ? national.slice(1)
      : national;
    return OFFICIAL_CONTACT_PHONE_DIGITS.has(`213${withoutTrunk}`);
  }
  const national = digits.startsWith('0') ? digits.slice(1) : digits;
  return OFFICIAL_CONTACT_PHONE_DIGITS.has(`213${national}`);
}

/**
 * Replace non-official email addresses and phone numbers with a neutral,
 * locale-specific pointer to the organization's public profile. Pure and
 * deterministic so it can run after every model turn, including injected
 * answers that ignored the prompt rules.
 */
export function redactNonOfficialContacts(
  text: string,
  locale: AiAgentLocale,
): string {
  const replacement = contactRedaction(locale);
  let result = text.replace(EMAIL_CONTACT_PATTERN, (email) =>
    OFFICIAL_CONTACT_EMAILS.has(email.toLowerCase()) ? email : replacement,
  );
  result = result.replace(ALGERIAN_PHONE_PATTERN, (phone) =>
    isOfficialPhone(phone) ? phone : replacement,
  );
  result = result.replace(
    INTERNATIONAL_PHONE_CANDIDATE,
    (match, candidate: string) =>
      isOfficialPhone(candidate)
        ? match
        : match.replace(candidate, replacement),
  );
  return result;
}

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

/**
 * Scripts that must never appear in an Arabic or English answer. Latin is kept
 * for brand names and URLs in Arabic prose; Arabic is kept for UI names in
 * English prose. CJK, Cyrillic, Greek, Hebrew, Devanagari, Thai, and Hangul are
 * always treated as an accidental language switch.
 */
const FOREIGN_SCRIPT_CHARACTER =
  /[\u0370-\u03FF\u0400-\u052F\u0530-\u058F\u0590-\u05FF\u0900-\u097F\u0E00-\u0E7F\u1100-\u11FF\u2E80-\u2EFF\u3040-\u30FF\u31C0-\u31EF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u;
const FOREIGN_SCRIPT_CHARACTERS =
  /[\u0370-\u03FF\u0400-\u052F\u0530-\u058F\u0590-\u05FF\u0900-\u097F\u0E00-\u0E7F\u1100-\u11FF\u2E80-\u2EFF\u3040-\u30FF\u31C0-\u31EF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]+/gu;

/** True when an answer contains characters from an unrelated writing system. */
export function containsForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT_CHARACTER.test(typeof text === 'string' ? text : '');
}

function stripForeignScript(text: string): string {
  return text.replace(FOREIGN_SCRIPT_CHARACTERS, '');
}

/**
 * Real platform pages the assistant may name. Anything else inside a "page",
 * "topic", or "section" reference is an internal document heading and must be
 * replaced with a generic reference.
 */
const ALLOWED_PAGE_REFERENCES: ReadonlySet<string> = new Set(
  [
    'الفرص',
    'الفرصة',
    'فرص',
    'اكتشاف المواهب',
    'المواهب',
    'المهام',
    'مهامي',
    'صفحة المساهمة',
    'المساهمة',
    'إرسال المساهمة',
    'ارسال المساهمة',
    'الإعدادات',
    'الاعدادات',
    'التجارب الموثقة',
    'التجارب الموثقه',
    'opportunities',
    'opportunity',
    'discover talents',
    'talents',
    'my tasks',
    'submit contribution',
    'contribution',
    'settings',
    'verified experiences',
  ].map((value) => normalizePageReference(value)),
);

function normalizePageReference(value: string): string {
  return String(value ?? '')
    .replace(/[«»"“”'’]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripKnowledgeTitleReferences(text: string): string {
  let result = text.replace(
    /(?:في\s+)?(?:ال)?صفحة\s*[«"“]([^»"”\n]{1,120})[»"”]/gu,
    (match, title: string) => {
      if (ALLOWED_PAGE_REFERENCES.has(normalizePageReference(title))) {
        return match;
      }
      return /^في/u.test(match) ? 'في الصفحة المعنية' : 'الصفحة المعنية';
    },
  );

  result = result.replace(
    /\b(?:the\s+)?(?:page|topic|section)\s+(?:called|titled|named)\s*["“']([^"”'\n]{1,120})["”']/giu,
    (match, title: string) =>
      ALLOWED_PAGE_REFERENCES.has(normalizePageReference(title))
        ? match
        : 'the relevant page',
  );
  result = result.replace(
    /\b(?:the\s+)?(?:page|topic|section)\s+(?:called|titled|named)\s+([^.,;:!?\n]{1,80})/giu,
    (match, title: string) =>
      ALLOWED_PAGE_REFERENCES.has(normalizePageReference(title))
        ? match
        : 'the relevant page',
  );

  // "in the image" / "في المكان في الصورة" refers to a screenshot the model
  // can never see, not to a real platform location.
  result = result
    .replace(
      /(?:^|\s)(?:في\s+)?(?:المكان\s+)?في\s+الصورة(?=\s|[.,،؛!?]|$)/gu,
      ' ',
    )
    .replace(
      /\b(?:the\s+)?(?:place|area)\s+(?:shown\s+)?in\s+the\s+image\b/giu,
      '',
    )
    .replace(/\bin\s+the\s+image\b/giu, '');

  return result;
}

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
  if (value.includes('\\')) return null;

  let pathname: string;
  if (/^https?:\/\//i.test(value)) {
    // The model sometimes writes an absolute same-site URL. The origin is
    // always discarded: only an allowlisted public path can survive.
    let parsedAbsolute: URL;
    try {
      parsedAbsolute = new URL(value);
    } catch {
      return null;
    }
    if (
      parsedAbsolute.protocol !== 'http:' &&
      parsedAbsolute.protocol !== 'https:'
    ) {
      return null;
    }
    pathname = parsedAbsolute.pathname;
  } else {
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

    let parsed: URL;
    try {
      parsed = new URL(value, SAFE_LINK_BASE);
    } catch {
      return null;
    }
    if (parsed.origin !== SAFE_LINK_BASE) return null;
    pathname = parsed.pathname;
  }

  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  if (/(?:^|\/)\.\.(?:\/|$)/u.test(pathname)) return null;
  if (/(?:^|\/)\.(?:\/|$)/u.test(pathname)) return null;
  if (/%(?:00|2e|2f|5c)/iu.test(pathname)) return null;

  const segments = pathname.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return null;

  // Collapse any number of leading locale segments: `/en/en/...` and
  // `/ar/en/...` both become one prefix in the requested locale.
  while (segments.length > 0 && KNOWN_LOCALES.has(segments[0] ?? '')) {
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

  // Contact redaction runs before link handling so no model-written address or
  // phone can survive in a link label or in the surrounding prose.
  text = redactNonOfficialContacts(text, options.locale);

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
  text = stripKnowledgeTitleReferences(text);
  text = stripForeignScript(text);

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
