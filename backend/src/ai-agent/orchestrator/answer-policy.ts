import type { AiAgentDataSource, AiAgentMode } from '../ai-agent.types';
import type { AiAgentLimits } from '../config/ai-agent.config';
import type { PromptLanguage } from '../prompt/prompt.types';

/**
 * Deterministic answer policy for Session 9.
 *
 * Everything in this module is pure and content-free with respect to logs:
 * messages here are fixed localized strings, never user text, retrieved text,
 * tool payloads, or provider output.
 */

export type PolicyLanguage = PromptLanguage;

export type PolicyMessageKey =
  | 'privateData'
  | 'quotaExhausted'
  | 'retrievalOnlyLive'
  | 'knowledgeOnlyLive'
  | 'retrievalIntro'
  | 'notFound'
  | 'toolUnavailable'
  | 'ungrounded'
  | 'timeout'
  | 'providerUnavailable'
  | 'internalError'
  | 'messageTooLong';

const MESSAGES: Readonly<
  Record<PolicyMessageKey, Readonly<Record<PolicyLanguage, string>>>
> = Object.freeze({
  privateData: Object.freeze({
    en: "I can't access private accounts, contact details, application data, or personal information. I can help with public Basmatak information.",
    ar: 'لا أستطيع الوصول إلى الحسابات الخاصة أو بيانات الاتصال أو بيانات الطلبات أو المعلومات الشخصية. يمكنني المساعدة بمعلومات بصمتك العامة.',
    fr: "Je n'accède pas aux comptes privés, aux coordonnées, aux données de candidature ni aux informations personnelles. Je peux aider avec les informations publiques de Basmatak.",
  }),
  quotaExhausted: Object.freeze({
    en: 'The assistant has reached its free usage limit. You can still browse opportunities and organizations.',
    ar: 'وصل المساعد إلى حد الاستخدام المجاني. لا يزال بإمكانك تصفح الفرص والمنظمات.',
    fr: "L'assistant a atteint sa limite d'utilisation gratuite. Vous pouvez toujours parcourir les opportunités et les organisations.",
  }),
  retrievalOnlyLive: Object.freeze({
    en: 'Live results are temporarily limited to conserve usage. You can browse opportunities and organizations.',
    ar: 'النتائج المباشرة محدودة مؤقتًا للحفاظ على حصة الاستخدام. يمكنك تصفح الفرص والمنظمات.',
    fr: 'Les résultats en direct sont temporairement limités pour préserver le quota. Vous pouvez parcourir les opportunités et les organisations.',
  }),
  knowledgeOnlyLive: Object.freeze({
    en: 'Live results are temporarily limited. You can browse opportunities and organizations.',
    ar: 'النتائج المباشرة محدودة مؤقتًا. يمكنك تصفح الفرص والمنظمات.',
    fr: 'Les résultats en direct sont temporairement limités. Vous pouvez parcourir les opportunités et les organisations.',
  }),
  retrievalIntro: Object.freeze({
    en: "Here is what I found in Basmatak's public information:",
    ar: 'إليك ما وجدته في معلومات بصمتك العامة:',
    fr: 'Voici ce que j’ai trouvé dans les informations publiques de Basmatak :',
  }),
  notFound: Object.freeze({
    en: "I couldn't find that in Basmatak's public information. You can browse opportunities and organizations.",
    ar: 'لم أجد ذلك في معلومات بصمتك العامة. يمكنك تصفح الفرص والمنظمات.',
    fr: "Je n'ai pas trouvé cela dans les informations publiques de Basmatak. Vous pouvez parcourir les opportunités et les organisations.",
  }),
  toolUnavailable: Object.freeze({
    en: "I couldn't retrieve that information right now. You can browse opportunities and organizations.",
    ar: 'تعذر عليّ جلب هذه المعلومات الآن. يمكنك تصفح الفرص والمنظمات.',
    fr: "Je n'ai pas pu récupérer ces informations pour le moment. Vous pouvez parcourir les opportunités et les organisations.",
  }),
  ungrounded: Object.freeze({
    en: "I can only answer from Basmatak's public information, and I couldn't verify that answer against a source. Please try rephrasing your question.",
    ar: 'يمكنني الإجابة فقط من معلومات بصمتك العامة، ولم أتمكن من التحقق من الإجابة مقابل مصدر. يرجى إعادة صياغة سؤالك.',
    fr: "Je réponds uniquement à partir des informations publiques de Basmatak et je n'ai pas pu vérifier cette réponse auprès d'une source. Essayez de reformuler votre question.",
  }),
  timeout: Object.freeze({
    en: 'The assistant took too long to answer. Please try again.',
    ar: 'استغرق المساعد وقتًا طويلًا للإجابة. يرجى المحاولة مرة أخرى.',
    fr: "L'assistant a mis trop de temps à répondre. Veuillez réessayer.",
  }),
  providerUnavailable: Object.freeze({
    en: 'The assistant is temporarily unavailable. Please try again shortly.',
    ar: 'المساعد غير متاح مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.',
    fr: "L'assistant est temporairement indisponible. Veuillez réessayer bientôt.",
  }),
  internalError: Object.freeze({
    en: 'The assistant could not complete the response. Please try again.',
    ar: 'لم يتمكن المساعد من إكمال الرد. يرجى المحاولة مرة أخرى.',
    fr: "L'assistant n'a pas pu terminer la réponse. Veuillez réessayer.",
  }),
  messageTooLong: Object.freeze({
    en: 'That request is too large to process. Please shorten your message or start a new conversation.',
    ar: 'هذا الطلب كبير جدًا لمعالجته. يرجى تقصير رسالتك أو بدء محادثة جديدة.',
    fr: 'Cette demande est trop volumineuse. Raccourcissez votre message ou démarrez une nouvelle conversation.',
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
  const configuredHistory = clamp(limits.maxHistoryMessages, 4, 0, 8);

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

const BROWSE_TITLES: Readonly<
  Record<
    'opportunities' | 'organizations',
    Readonly<Record<PolicyLanguage, string>>
  >
> = Object.freeze({
  opportunities: Object.freeze({
    en: 'Browse opportunities',
    ar: 'تصفّح الفرص',
    fr: 'Parcourir les opportunités',
  }),
  organizations: Object.freeze({
    en: 'Browse organizations',
    ar: 'تصفّح المنظمات',
    fr: 'Parcourir les organisations',
  }),
});

/** Stable, public browse links for degraded/not-found answers. */
export function browseSources(language: PolicyLanguage): AiAgentDataSource[] {
  const opportunities = BROWSE_TITLES.opportunities[language];
  const organizations = BROWSE_TITLES.organizations[language];
  return [
    {
      id: 'browse-opportunities',
      citationId: 'browse',
      type: 'opportunity',
      title: opportunities,
      path: '/opportunities',
    },
    {
      id: 'browse-organizations',
      citationId: 'browse',
      type: 'organization',
      title: organizations,
      path: '/orgs',
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
