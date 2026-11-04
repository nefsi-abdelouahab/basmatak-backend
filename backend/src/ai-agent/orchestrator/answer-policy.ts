import type { AiAgentDataSource, AiAgentMode } from '../ai-agent.types';
import type { AiAgentLimits } from '../config/ai-agent.config';
import type { PromptLanguage } from '../prompt/prompt.types';
import { AI_AGENT_SYSTEM_PROMPT } from '../prompt/system-prompt';

/**
 * Deterministic answer policy for Session 9.
 *
 * Everything in this module is pure and content-free with respect to logs:
 * messages here are fixed localized strings, never user text, retrieved text,
 * tool payloads, or provider output.
 */

export type PolicyLanguage = PromptLanguage;

export const POLICY_MESSAGE_KEYS = [
  'privateData',
  'rateLimited',
  'busy',
  'quotaExhausted',
  'retrievalOnlyLive',
  'knowledgeOnlyLive',
  'noOpportunities',
  'noOpportunitiesInArea',
  'notFound',
  'toolUnavailable',
  'ungrounded',
  'timeout',
  'providerUnavailable',
  'internalError',
  'messageTooLong',
] as const;

export type PolicyMessageKey = (typeof POLICY_MESSAGE_KEYS)[number];

const MESSAGES: Readonly<
  Record<PolicyMessageKey, Readonly<Record<PolicyLanguage, string>>>
> = Object.freeze({
  privateData: Object.freeze({
    en: "I can't share any user's private details.",
    ar: 'لا أستطيع مشاركة بيانات خاصة بأي مستخدم.',
  }),
  rateLimited: Object.freeze({
    en: 'Too many requests to Basma. Please try again later.',
    ar: 'طلبات كثيرة جداً إلى بصمة، حاول مرة أخرى بعد قليل.',
  }),
  busy: Object.freeze({
    en: 'Basma is busy. Please retry shortly.',
    ar: 'بصمة مشغولة الآن، حاول بعد لحظات.',
  }),
  quotaExhausted: Object.freeze({
    en: 'Basma has reached the free usage limit, but you can still browse opportunities and organizations.',
    ar: 'بلغت بصمة حد الاستخدام المجاني، لكن يمكنك تصفح الفرص والمنظمات.',
  }),
  retrievalOnlyLive: Object.freeze({
    en: 'Live results are temporarily limited, but you can browse opportunities and organizations.',
    ar: 'النتائج المباشرة محدودة مؤقتًا، لكن يمكنك تصفح الفرص والمنظمات.',
  }),
  knowledgeOnlyLive: Object.freeze({
    en: "Live results aren't available right now, but you can browse opportunities and organizations.",
    ar: 'النتائج المباشرة غير متاحة الآن، لكن يمكنك تصفح الفرص والمنظمات.',
  }),
  noOpportunities: Object.freeze({
    en: 'There are no published opportunities right now. You can check the Opportunities page later.',
    ar: 'لا توجد فرص منشورة حالياً. يمكنك تصفح صفحة الفرص لاحقاً.',
  }),
  noOpportunitiesInArea: Object.freeze({
    en: 'There are no published opportunities in that area right now. You can browse the Opportunities page for other areas.',
    ar: 'لا توجد فرص منشورة في هذه الولاية حالياً. يمكنك تصفح صفحة الفرص لرؤية بقية المناطق.',
  }),
  notFound: Object.freeze({
    en: "I don't have confirmed information on that. You can browse opportunities and organizations on the platform.",
    ar: 'لا أملك معلومات مؤكدة عن هذا. يمكنك تصفح الفرص والمنظمات في المنصة.',
  }),
  toolUnavailable: Object.freeze({
    en: "I couldn't retrieve that right now, but you can browse opportunities and organizations.",
    ar: 'تعذر عليّ جلب ذلك الآن، لكن يمكنك تصفح الفرص والمنظمات.',
  }),
  ungrounded: Object.freeze({
    en: "I couldn't confirm that answer. Could you rephrase your question?",
    ar: 'لم أتمكن من تأكيد هذه الإجابة، ممكن تعيد صياغة سؤالك؟',
  }),
  timeout: Object.freeze({
    en: 'Basma took too long to answer, so please try again.',
    ar: 'استغرقت بصمة وقتًا طويلًا، يرجى المحاولة مرة أخرى.',
  }),
  providerUnavailable: Object.freeze({
    en: 'Basma is temporarily unavailable, so please try again shortly.',
    ar: 'بصمة غير متاحة مؤقتًا، يرجى المحاولة مرة أخرى بعد قليل.',
  }),
  internalError: Object.freeze({
    en: 'Basma could not complete the response, so please try again.',
    ar: 'لم تستطع بصمة إكمال الرد، يرجى المحاولة مرة أخرى.',
  }),
  messageTooLong: Object.freeze({
    en: 'That request is too large, so please shorten your message or start a new conversation.',
    ar: 'هذا الطلب كبير جدًا، يرجى تقصير رسالتك أو بدء محادثة جديدة.',
  }),
});

export function policyMessage(
  key: PolicyMessageKey,
  language: PolicyLanguage,
): string {
  return MESSAGES[key][language] ?? MESSAGES[key].en;
}

/**
 * `retrieval_only` is an application-level mode: the quota service exposes
 * `exhausted` at 100%, and the controller maps it according to the fallback
 * flag. Unknown values fail closed to `exhausted` so a caller can never turn a
 * typo into an accidental provider call.
 */
export function resolveEffectiveMode(
  mode: AiAgentMode,
  retrievalFallback: boolean,
): AiAgentMode {
  if (mode === 'exhausted') {
    return retrievalFallback ? 'retrieval_only' : 'exhausted';
  }
  if (mode === 'retrieval_only') return 'retrieval_only';
  return mode;
}

export interface AnswerCaps {
  knowledgeChunks: number;
  historyMessages: number;
  maxOutputTokens: number;
  toolRows: number;
  maxToolCalls: number;
  maxToolRounds: number;
  toolsEnabled: boolean;
  providerEnabled: boolean;
}

function clamp(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Per-mode caps from proposal section 4.1. Conservative lowers every source of
 * spend; retrieval-only/exhausted disable the provider entirely.
 */
export function resolveAnswerCaps(
  mode: AiAgentMode,
  limits: AiAgentLimits,
): AnswerCaps {
  const configuredRounds = clamp(limits.maxToolRounds, 1, 0, 2);
  const configuredChunks = clamp(limits.maxKnowledgeChunks, 4, 1, 6);
  const configuredRows = clamp(limits.maxToolRows, 5, 1, 8);
  const configuredOutput = clamp(limits.maxOutputTokens, 400, 1, 800);
  const configuredHistory = clamp(limits.maxHistoryMessages, 6, 0, 8);

  switch (mode) {
    case 'conservative':
      return {
        knowledgeChunks: Math.min(3, configuredChunks),
        historyMessages: Math.min(2, configuredHistory),
        maxOutputTokens: Math.min(300, configuredOutput),
        toolRows: Math.min(3, configuredRows),
        maxToolCalls: 1,
        maxToolRounds: Math.min(1, configuredRounds),
        toolsEnabled: true,
        providerEnabled: true,
      };
    case 'knowledge_only':
      return {
        knowledgeChunks: configuredChunks,
        historyMessages: configuredHistory,
        maxOutputTokens: configuredOutput,
        toolRows: 0,
        maxToolCalls: 0,
        maxToolRounds: 0,
        toolsEnabled: false,
        providerEnabled: true,
      };
    case 'retrieval_only':
      return {
        knowledgeChunks: Math.min(2, configuredChunks),
        historyMessages: 0,
        maxOutputTokens: 0,
        toolRows: 0,
        maxToolCalls: 0,
        maxToolRounds: 0,
        toolsEnabled: false,
        providerEnabled: false,
      };
    case 'exhausted':
      return {
        knowledgeChunks: 0,
        historyMessages: 0,
        maxOutputTokens: 0,
        toolRows: 0,
        maxToolCalls: 0,
        maxToolRounds: 0,
        toolsEnabled: false,
        providerEnabled: false,
      };
    case 'normal':
    default:
      return {
        knowledgeChunks: configuredChunks,
        historyMessages: configuredHistory,
        maxOutputTokens: configuredOutput,
        toolRows: configuredRows,
        maxToolCalls: 3,
        maxToolRounds: configuredRounds,
        toolsEnabled: true,
        providerEnabled: true,
      };
  }
}

/**
 * The guard intentionally targets *requests for private data*, not policy
 * questions about privacy. Generic phrases such as "personal information" or
 * "email address" are not enough on their own; the request must be possessive
 * ("my ..."), explicitly about a person ("... of Ahmed"), or an imperative
 * ("show me the phone ...").
 */
const PRIVATE_PATTERNS: readonly RegExp[] = [
  // Requests tied to the speaker's own account, applications, or identity.
  /\b(?:my|our)\s+(?:e-?mail(?:\s+address)?|phone(?:\s+number)?|mobile(?:\s+number)?|contact(?:\s+(?:details|information|info))?|account|personal\s+(?:data|information)|private\s+(?:data|information)|birth\s?date|birthday|registry\s+id|registration\s+number|home\s+address|exact\s+(?:location|coordinates)|coordinates|password|login\s+credentials|application|applications|documents|submissions?|talents?)\b/iu,
  // Explicit requests for someone else's contact or identity data.
  /\b(?:e-?mail(?:\s+address)?|phone(?:\s+number)?|mobile(?:\s+number)?|contact\s+(?:details|information|info)|home\s+address|birth\s?date|registry\s+id|registration\s+number|password|coordinates|exact\s+location)\s+(?:of|for|belonging\s+to)\b/iu,
  /\b(?:give|show|tell|share|reveal|send|provide)\s+(?:me\s+)?(?:the\s+)?(?:e-?mail(?:\s+address)?|phone(?:\s+number)?|mobile(?:\s+number)?|contact\s+(?:details|information|info)|home\s+address|birth\s?date|registry\s+id|registration\s+number|password|coordinates)\b/iu,
  /\b[\p{L}][\p{L}'-]*(?:'s|’s)\s+(?:e-?mail(?:\s+address)?|phone(?:\s+number)?|mobile|address|birth\s?date|contact|coordinates|password)\b/iu,
  // Arabic: first-person data/account requests.
  /(?:^|\s)(?:بياناتي|حسابي|بريدي(?:\s+الإلكتروني)?|رقم\s+هاتفي|رقم\s+جوالي|عنواني|تاريخ\s+ميلادي|رقم\s+سجلي|إحداثياتي|معلوماتي\s+الشخصية|بياناتي\s+الشخصية|طلباتي|مستنداتي)(?:\s|$|[؟?.!,;:])/u,
  // Arabic: explicit data-of/for requests.
  /(?:البريد\s+الإلكتروني|رقم\s+الهاتف|رقم\s+الجوال|بيانات\s+الاتصال|تاريخ\s+الميلاد|رقم\s+السجل|العنوان|الإحداثيات|الموقع\s+الدقيق)\s+(?:لـ|ل|of|for)/u,
  // Arabic: imperative requests for a named or role-based person's contact data.
  /(?:^|\s)(?:أعطني|اعطني|أعطوني|اعطوني|أرني|ارني|أرسل\s+لي|ارسل\s+لي|زودني|قدم\s+لي|أخبرني|اخبرني|أظهر|اظهر|شارك|شاركني)\s+(?:لي\s+)?(?:ال)?(?:بريد(?:\s+الإلكتروني)?|إيميل|ايميل|هاتف|رقم(?:\s+(?:الهاتف|الجوال))?|بيانات(?:\s+الاتصال)?|معلومات(?:\s+شخصية)?|عنوان)\s+(?:ال)?(?:متطوع|متطوعة|مستخدم|مستخدمة|شخص|عضو|مدير|مديرة|صاحب|صاحبة|أي|اي)/u,
  // Arabic: contact data explicitly tied to a volunteer/user/person.
  /(?:^|\s)(?:ال)?(?:بريد(?:\s+الإلكتروني)?|إيميل|ايميل|هاتف|رقم(?:\s+(?:الهاتف|الجوال))?|بيانات(?:\s+الاتصال)?|معلومات(?:\s+شخصية)?|عنوان)\s+(?:ال)?(?:متطوع|متطوعة|مستخدم|مستخدمة|شخص|عضو|مدير|مديرة|صاحب|صاحبة|أي|اي)(?:\s|$|[؟?.!,;:])/u,
  // Arabic: a role claim followed by a request for contact or personal data.
  /(?:^|\s)(?:أنا|انا)\s+(?:ال)?(?:مدير|مديرة|مسؤول|مسؤولة|مالك|صاحبة?)\s+(?:ال)?(?:جمعية|منظمة|مؤسسة)[\s\S]*?(?:بريد|إيميل|ايميل|هاتف|رقم|بيانات|معلومات|عنوان)/u,
  // English: a role claim followed by a request for contact or personal data.
  /\b(?:i(?:'m| am)|as)\s+(?:the\s+)?(?:association|organization|org)\s+(?:manager|owner|admin)\b[\s\S]*?\b(?:e-?mail|phone|contact|data|details)\b/iu,
  // French: first-person data/account requests.
  /\b(?:mon|notre)\s+(?:e-?mail|courriel|téléphone|numéro\s+de\s+téléphone|compte|adresse|mot\s+de\s+passe|date\s+de\s+naissance|numéro\s+d'enregistrement|coordonnées|données\s+(?:personnelles|privées)|candidatures|documents)\b/iu,
  // French: explicit data-of requests.
  /\b(?:e-?mail|courriel|téléphone|numéro\s+de\s+téléphone|coordonnées|adresse|date\s+de\s+naissance|mot\s+de\s+passe)\s+(?:de|du|des|d')\b/iu,
];

/**
 * A conservative offline guard for private-data questions. It runs before any
 * provider call so contact, account, application, and identity data can never
 * be requested from the model.
 */
export function isPrivateDataRequest(message: string): boolean {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text === '') return false;
  const normalized = text.replace(/\s+/g, ' ');
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Words per comparison window when checking for leaked system instructions. */
const LEAK_WINDOW_WORDS = 6;
/** Two distinct verbatim windows are treated as a leak, not a coincidence. */
const LEAK_MIN_WINDOWS = 2;

/**
 * Normalize text for leak comparison: lowercase, collapse punctuation and
 * whitespace. This makes case, punctuation, and Markdown formatting irrelevant
 * while preserving the word sequence.
 */
function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');
}

function buildWindowSet(words: readonly string[]): ReadonlySet<string> {
  const windows = new Set<string>();
  for (let index = 0; index + LEAK_WINDOW_WORDS <= words.length; index += 1) {
    windows.add(words.slice(index, index + LEAK_WINDOW_WORDS).join(' '));
  }
  return windows;
}

const SYSTEM_PROMPT_WINDOWS = buildWindowSet(
  normalizedWords(AI_AGENT_SYSTEM_PROMPT),
);

/**
 * Deterministic system-instruction extraction guard.
 *
 * Model output is buffered before any token is streamed, so this can run on the
 * complete answer. Two distinct verbatim six-word windows from the private
 * system rules mark the answer as a leak; the caller replaces it with the
 * regular ungrounded refusal. The system prompt is never user-visible, so an
 * answer that reproduces multiple windows of it cannot be a grounded answer.
 *
 * Note the system prompt contains literal citation markers (`[K1]`), which is
 * why a full prompt echo is caught by comparing multiple verbatim windows
 * rather than by looking for citation syntax.
 */
export function containsSystemInstructionLeak(text: string): boolean {
  const words = normalizedWords(typeof text === 'string' ? text : '');
  if (words.length < LEAK_WINDOW_WORDS) return false;

  const matched = new Set<string>();
  for (let index = 0; index + LEAK_WINDOW_WORDS <= words.length; index += 1) {
    const window = words.slice(index, index + LEAK_WINDOW_WORDS).join(' ');
    if (!SYSTEM_PROMPT_WINDOWS.has(window) || matched.has(window)) continue;
    matched.add(window);
    if (matched.size >= LEAK_MIN_WINDOWS) return true;
  }
  return false;
}

const BROWSE_TITLES: Readonly<
  Record<'opportunities' | 'talents', Readonly<Record<PolicyLanguage, string>>>
> = Object.freeze({
  opportunities: Object.freeze({
    en: 'Browse opportunities',
    ar: 'تصفّح الفرص',
  }),
  talents: Object.freeze({
    en: 'Browse talents',
    ar: 'تصفّح المواهب',
  }),
});

/** Stable, public browse links for degraded/not-found answers. */
export function browseSources(language: PolicyLanguage): AiAgentDataSource[] {
  const opportunities = BROWSE_TITLES.opportunities[language];
  const talents = BROWSE_TITLES.talents[language];
  return [
    {
      id: 'browse-opportunities',
      citationId: 'browse',
      type: 'opportunity',
      title: opportunities,
      path: '/opportunities',
    },
    {
      id: 'browse-talents',
      citationId: 'browse',
      type: 'reference',
      title: talents,
      path: '/talents',
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * True when an opportunity tool payload recorded that a place phrase in the
 * request resolved to a stored wilaya or municipality. This distinguishes
 * "nothing in this area" from the generic empty result.
 */
export function hasResolvedPlace(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.resolvedPlace)) return false;
  const place = data.resolvedPlace;
  return (
    (place.type === 'wilaya' || place.type === 'municipality') &&
    typeof place.code === 'string' &&
    place.code.trim() !== ''
  );
}

/**
 * A tool result is usable only when it contains public rows or a numeric stats
 * payload. An empty successful result is deliberately treated as "not found"
 * and never triggers another provider call.
 */
export function hasUsableToolData(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (!isRecord(data)) return false;

  if (Array.isArray(data.items)) return data.items.length > 0;

  const hasReferenceLists =
    Array.isArray(data.skills) || Array.isArray(data.locations);
  if (hasReferenceLists) {
    return nonEmptyArray(data.skills) || nonEmptyArray(data.locations);
  }

  const values = Object.values(data);
  return (
    values.length > 0 && values.every((value) => typeof value === 'number')
  );
}

/**
 * Split text into SSE token chunks without changing it: joining the result is
 * byte-for-byte identical to the input. Breaks prefer a newline or space near
 * the limit.
 */
export function splitAnswerIntoDeltas(text: string, maxChars = 160): string[] {
  const source = typeof text === 'string' ? text : '';
  if (source === '') return [];
  const limit = Math.max(1, Math.trunc(maxChars));
  if (source.length <= limit) return [source];

  const chunks: string[] = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + limit, source.length);
    if (end < source.length) {
      const newline = source.lastIndexOf('\n', end);
      const space = source.lastIndexOf(' ', end);
      const candidate = Math.max(newline, space);
      if (candidate > start + Math.floor(limit / 2)) {
        end = candidate + 1;
      }
    }
    chunks.push(source.slice(start, end));
    start = end;
  }
  return chunks;
}
