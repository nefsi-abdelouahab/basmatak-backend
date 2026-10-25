import { Inject, Injectable, Optional } from '@nestjs/common';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import type { AiAgentLocale } from '../ai-agent.types';
import {
  DEFAULT_ROUTER_MIN_SCORE,
  MAX_ROUTER_MIN_SCORE,
  MIN_ROUTER_MIN_SCORE,
  type AiAgentConfig,
} from '../config/ai-agent.config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { KnowledgeLocale } from '../knowledge/knowledge.types';
import {
  KnowledgeNormalizer,
  normalizeText,
  tokenize,
} from '../knowledge/normalizer';
import type {
  RetrievalOptions,
  RetrievalResult,
  RetrievedChunk,
} from '../knowledge/retriever';
import type { PromptLanguage } from '../prompt/prompt.types';
import { ToolRegistry } from '../tools/tool-registry';
import {
  TOOL_INTENTS,
  type ToolDescriptor,
  type ToolIntent,
} from '../tools/tool.types';

/**
 * Deterministic intent router.
 *
 * No model, provider, network, database, clock, or randomness is used. The
 * router first applies cheap greeting/thanks/capability/off-topic rules, then
 * runs at most one bounded BM25 retrieval (top 2) through the narrow
 * `RouterKnowledgeSearch` interface. The absolute `routerMinScore` prevents a
 * weak match from being treated as grounding.
 *
 * Intent matrix (documented in code so tests and Session 9 can rely on it):
 *
 * | knowledge | live-data signal | result                          | tools |
 * |-----------|------------------|---------------------------------|-------|
 * | yes       | no               | knowledge_only                  | none  |
 * | no/weak   | yes              | live_data                       | topic tools or broad 3 |
 * | yes       | yes              | mixed                           | topic tools |
 * | n/a       | greeting/thanks/capability | greeting              | none  |
 * | n/a       | obvious off-topic | off_topic                      | none  |
 * | no/weak   | no               | clarify                         | none  |
 *
 * Tool selection uses `ToolRegistry.list()` metadata and `allowedIntents`.
 * A single-topic query declares only that tool. A count/stats question selects
 * `platform_stats` only unless it also asks for a list. A broad live-data query
 * declares opportunities, organizations, and platform stats (three tools, never
 * all four). Knowledge-only, greeting, off-topic, and clarify decisions declare
 * no tools.
 */

export type RouterIntent =
  | 'knowledge_only'
  | 'live_data'
  | 'mixed'
  | 'greeting'
  | 'off_topic'
  | 'clarify';

export type RouterAction = 'answer' | 'direct_reply';

export interface RouterKnowledgeSearch {
  search(
    query: string,
    locale?: KnowledgeLocale,
    options?: RetrievalOptions,
  ): RetrievalResult;
}

export interface RouterDecision {
  intent: RouterIntent;
  language: PromptLanguage;
  action: RouterAction;
  /** Localized greeting/capability/clarify/refusal for direct replies. */
  directReply?: string;
  /** Metadata only. Never contains a handler. */
  tools: ToolDescriptor[];
  toolIntents: ToolIntent[];
  knowledgeQuery: string;
  topScore: number;
  /** Stable diagnostic code. Never contains user text. */
  reason: string;
}

export const ROUTER_TOP_K = 2;

type DirectReplyKind =
  'greeting' | 'thanks' | 'capability' | 'clarify' | 'off_topic';

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const FRENCH_DIACRITICS = /[àâäçéèêëîïôöùûüÿœæ]/i;

function normalizeKeywords(values: readonly string[]): ReadonlySet<string> {
  return new Set(values.map((value) => normalizeText(value)).filter(Boolean));
}

function hasKeyword(
  normalizedText: string,
  keywords: ReadonlySet<string>,
): boolean {
  if (normalizedText === '') return false;
  for (const token of normalizedText.split(' ')) {
    if (token === '') continue;
    if (keywords.has(token)) return true;

    // Arabic words commonly carry conjunction/article/preposition prefixes.
    // Strip a known prefix and retry instead of matching arbitrary suffixes.
    if (ARABIC_SCRIPT.test(token)) {
      for (const prefix of ARABIC_PREFIXES) {
        if (
          token.length > prefix.length + 1 &&
          token.startsWith(prefix) &&
          keywords.has(token.slice(prefix.length))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

const ARABIC_PREFIXES = [
  'وال',
  'بال',
  'كال',
  'فال',
  'لل',
  'ال',
  'و',
  'ب',
  'ل',
  'ف',
] as const;

function hasPhrase(normalizedText: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  if (normalizedPhrase === '') return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function hasAnyPhrase(
  normalizedText: string,
  phrases: readonly string[],
): boolean {
  return phrases.some((phrase) => hasPhrase(normalizedText, phrase));
}

function matchesAny(
  normalizedText: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some((pattern) => pattern.test(normalizedText));
}

// --- Language detection ----------------------------------------------------

const FRENCH_MARKERS = normalizeKeywords([
  'bonjour',
  'salut',
  'bonsoir',
  'coucou',
  'merci',
  'comment',
  'combien',
  'quelle',
  'quel',
  'quelles',
  'quels',
  'pourquoi',
  'quand',
  'qui',
  'que',
  'quoi',
  'est',
  'sont',
  'avec',
  'pour',
  'dans',
  'sur',
  'je',
  'nous',
  'vous',
  'mon',
  'ma',
  'mes',
  'notre',
  'nos',
  'votre',
  'vos',
  'les',
  'des',
  'une',
  'un',
  'du',
  'de',
  'la',
  'le',
  'et',
  'ou',
  'au',
  'aux',
  'ce',
  'cette',
  'ces',
  'peux',
  'peut',
  'puis',
  'faire',
  'aider',
  'cherche',
  'chercher',
  'trouver',
  'afficher',
  'affichez',
  'liste',
  'nombre',
  'opportunite',
  'opportunites',
  'organisation',
  'organisations',
  'association',
  'associations',
  'competence',
  'competences',
  'wilaya',
  'wilayas',
  'commune',
  'communes',
  'statistiques',
  'statistique',
  'disponible',
  'disponibles',
  'actuel',
  'actuelle',
  'recent',
  'recente',
  'benevolat',
  'benevole',
  'compte',
  'comptes',
  'creer',
  'inscription',
  'inscrire',
  'verification',
  'verifie',
]);

const ENGLISH_MARKERS = normalizeKeywords([
  'hello',
  'hi',
  'hey',
  'thanks',
  'thank',
  'you',
  'what',
  'how',
  'where',
  'when',
  'why',
  'who',
  'which',
  'is',
  'are',
  'was',
  'were',
  'can',
  'could',
  'should',
  'would',
  'do',
  'does',
  'did',
  'i',
  'my',
  'me',
  'we',
  'our',
  'us',
  'please',
  'the',
  'and',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'about',
  'tell',
  'show',
  'list',
  'find',
  'search',
  'opportunity',
  'opportunities',
  'organization',
  'organizations',
  'skill',
  'skills',
  'verification',
  'account',
  'volunteer',
  'volunteering',
  'current',
  'available',
  'latest',
  'stats',
  'statistics',
  'many',
  'much',
  'need',
  'want',
  'apply',
  'application',
]);

/**
 * Detect the response language from the message while keeping the public DTO
 * locale (`en`/`ar`) unchanged. Arabic script wins; French diacritics or more
 * French than English markers select French; otherwise English is the safe
 * default (or Arabic when the transport locale is Arabic and there is no
 * signal).
 */
export function detectPromptLanguage(
  message: string,
  locale: AiAgentLocale,
): PromptLanguage {
  const text = typeof message === 'string' ? message : '';
  if (ARABIC_SCRIPT.test(text)) return 'ar';
  if (FRENCH_DIACRITICS.test(text)) return 'fr';

  const normalized = normalizeText(text);
  let french = 0;
  let english = 0;
  for (const token of normalized.split(' ')) {
    if (token === '') continue;
    if (FRENCH_MARKERS.has(token)) french += 1;
    if (ENGLISH_MARKERS.has(token)) english += 1;
  }

  if (french > english) return 'fr';
  if (english > french) return 'en';
  return locale === 'ar' ? 'ar' : 'en';
}

// --- Keyword rules ---------------------------------------------------------

const GREETING_PATTERNS: readonly RegExp[] = [
  /^(hi|hello|hey|good morning|good afternoon|good evening|salam|salaam|assalam alaikum|assalamu alaikum|peace be upon you)( there| everyone| all)?$/,
  /^(مرحبا|اهلا|اهلا وسهلا|السلام عليكم|سلام|صباح الخير|مساء الخير)( بالجميع| جميعا)?$/,
  /^(bonjour|salut|bonsoir|coucou|salam|assalam|hello)( tout le monde)?$/,
];

const THANKS_PATTERNS: readonly RegExp[] = [
  /^(thanks|thank you|thanks a lot|thank you so much|thx|many thanks)( so much| a lot)?$/,
  /^(merci|merci beaucoup|merci bien|grand merci)( beaucoup| bien)?$/,
  /^(شكرا|شكرا جزيلا|شكرا لك|مشكور|مشكوره|الف شكر)( جزيلا| لك)?$/,
];

const CAPABILITY_PATTERNS: readonly RegExp[] = [
  /^(what can you do|what do you do|what can you help with|how can you help|how do you help|who are you|what are you|help|can you help|can you help me)$/,
  /^(que peux tu faire|que fais tu|qu est ce que tu fais|qui es tu|comment peux tu aider|comment aider|aide|peux tu aider|peux tu m aider)$/,
  /^(ما الذي يمكنك فعله|ماذا يمكنك ان تفعل|ماذا تفعل|من انت|ما انت|كيف تساعدني|كيف يمكنك المساعده|مساعده|هل يمكنك المساعده)$/,
];

const OPPORTUNITY_KEYWORDS = normalizeKeywords([
  'opportunity',
  'opportunities',
  'volunteer',
  'volunteering',
  'job',
  'jobs',
  'position',
  'positions',
  'opening',
  'openings',
  'placement',
  'placements',
  'mission',
  'missions',
  'internship',
  'internships',
  'فرصة',
  'فرص',
  'تطوع',
  'تطوعي',
  'تطوعية',
  'منصب',
  'مناصب',
  'وظيفة',
  'وظائف',
  'مهمة',
  'مهام',
  'تدريب',
  'opportunite',
  'opportunites',
  'offre',
  'offres',
  'poste',
  'postes',
  'stage',
  'stages',
  'benevolat',
  'benevole',
]);

const ORGANIZATION_KEYWORDS = normalizeKeywords([
  'organization',
  'organizations',
  'organisation',
  'organisations',
  'association',
  'associations',
  'ngo',
  'ngos',
  'charity',
  'charities',
  'منظمة',
  'منظمات',
  'جمعية',
  'جمعيات',
  'هيئة',
  'هيئات',
  'ong',
  'organisme',
  'organismes',
]);

const REFERENCE_KEYWORDS = normalizeKeywords([
  'skill',
  'skills',
  'wilaya',
  'wilayas',
  'municipality',
  'municipalities',
  'location',
  'locations',
  'reference',
  'references',
  'category',
  'categories',
  'specialty',
  'specialties',
  'trade',
  'trades',
  'مهارة',
  'مهارات',
  'ولاية',
  'ولايات',
  'بلدية',
  'بلديات',
  'موقع',
  'مواقع',
  'تخصص',
  'تخصصات',
  'فئة',
  'فئات',
  'مرجع',
  'مراجع',
  'competence',
  'competences',
  'commune',
  'communes',
  'localite',
  'localites',
  'categorie',
  'categories',
  'specialite',
  'specialites',
]);

const STATS_KEYWORDS = normalizeKeywords([
  'statistics',
  'stats',
  'count',
  'counts',
  'total',
  'totals',
  'احصائيات',
  'احصاءات',
  'احصائية',
  'عدد',
  'اجمالي',
  'كم',
  'statistiques',
  'statistique',
  'nombre',
  'totaux',
  'combien',
]);

const STATS_PHRASES = [
  'how many',
  'number of',
  'nombre de',
  'combien de',
  'كم عدد',
] as const;

const LIST_REQUEST_KEYWORDS = normalizeKeywords([
  'show',
  'list',
  'find',
  'search',
  'display',
  'browse',
  'give',
  'afficher',
  'affiche',
  'affichez',
  'chercher',
  'cherche',
  'trouver',
  'trouve',
  'liste',
  'montre',
  'montrer',
  'اعرض',
  'ابحث',
  'اوجد',
  'قائمة',
  'اظهر',
]);

const LIST_REQUEST_PHRASES = [
  'show me',
  'find me',
  'give me',
  'search for',
  'list of',
  'affichez moi',
  'montre moi',
  'cherche moi',
  'اعرض لي',
  'ابحث عن',
  'اظهر لي',
] as const;

const STRONG_LIVE_KEYWORDS = normalizeKeywords([
  'current',
  'currently',
  'latest',
  'newest',
  'recent',
  'now',
  'today',
  'deadline',
  'deadlines',
  'upcoming',
  'actuel',
  'actuelle',
  'actuellement',
  'dernier',
  'derniere',
  'recent',
  'recente',
  'maintenant',
  'الان',
  'اليوم',
  'موعد',
  'مواعيد',
  'احدث',
  'اخير',
  'اخيرة',
]);

const TOPIC_LIVE_KEYWORDS = normalizeKeywords([
  'available',
  'open',
  'opened',
  'opening',
  'openings',
  'new',
  'disponible',
  'disponibles',
  'ouvert',
  'ouverte',
  'ouverts',
  'ouvertes',
  'nouveau',
  'nouvelle',
  'nouvelles',
  'متاح',
  'متاحة',
  'مفتوح',
  'مفتوحة',
  'جديد',
  'جديدة',
  'قريب',
  'قريبة',
]);

const LIVE_PHRASES = [
  'are there',
  'is there',
  'do you have',
  'does the platform have',
  'y a t il',
  'est ce qu il y a',
  'هل هناك',
  'هل توجد',
  'هل يوجد',
  'new opportunities',
  'nouvelles opportunites',
  'فرص جديدة',
] as const;

const OFF_TOPIC_KEYWORDS = normalizeKeywords([
  'weather',
  'forecast',
  'temperature',
  'rain',
  'snow',
  'football',
  'soccer',
  'basketball',
  'tennis',
  'olympics',
  'sport',
  'sports',
  'politics',
  'election',
  'elections',
  'president',
  'crypto',
  'bitcoin',
  'stock',
  'stocks',
  'invest',
  'investing',
  'recipe',
  'cooking',
  'cook',
  'movie',
  'movies',
  'film',
  'films',
  'music',
  'song',
  'songs',
  'game',
  'games',
  'joke',
  'jokes',
  'translate',
  'translation',
  'homework',
  'math',
  'mathematics',
  'programming',
  'code',
  'coding',
  'medical',
  'medicine',
  'doctor',
  'doctors',
  'طقس',
  'جو',
  'مباراة',
  'كرة',
  'قدم',
  'رياضة',
  'سياسة',
  'انتخابات',
  'رئيس',
  'بيتكوين',
  'اسهم',
  'استثمار',
  'وصفة',
  'طبخ',
  'فيلم',
  'موسيقى',
  'اغنية',
  'لعبة',
  'نكتة',
  'ترجمة',
  'رياضيات',
  'برمجة',
  'طب',
  'دواء',
  'طبيب',
  'meteo',
  'politique',
  'bourse',
  'investir',
  'recette',
  'cuisine',
  'musique',
  'chanson',
  'jeu',
  'jeux',
  'blague',
  'traduction',
  'mathematiques',
  'programmation',
  'medecine',
  'medicament',
  'docteur',
]);

const LOCATION_PREPOSITION_PATTERN =
  /(?:^|\s)(in|near|around|dans|à|en)\s+([\p{L}][\p{L}\p{M}'’-]*)/iu;
const ARABIC_LOCATION_PATTERN = /(?:^|\s)(في|قرب)\s+([\p{L}][\p{L}\p{M}]*)/u;
const LOCATION_IGNORED = normalizeKeywords([
  'the',
  'a',
  'an',
  'this',
  'that',
  'these',
  'those',
  'my',
  'your',
  'our',
  'their',
  'his',
  'her',
  'its',
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'ce',
  'cette',
  'ces',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'son',
  'sa',
  'ses',
  'notre',
  'nos',
  'votre',
  'vos',
  'leur',
  'leurs',
  'basmatak',
  'platform',
  'site',
  'website',
  'app',
  'application',
  'account',
  'profile',
  'المنصة',
  'الموقع',
  'بصمتك',
  'حساب',
  'حسابي',
  'ملف',
  'ملفي',
]);

interface TopicSignals {
  opportunity: boolean;
  organization: boolean;
  reference: boolean;
  listRequest: boolean;
}

function detectTopics(normalizedText: string): TopicSignals {
  return {
    opportunity: hasKeyword(normalizedText, OPPORTUNITY_KEYWORDS),
    organization: hasKeyword(normalizedText, ORGANIZATION_KEYWORDS),
    reference: hasKeyword(normalizedText, REFERENCE_KEYWORDS),
    listRequest:
      hasKeyword(normalizedText, LIST_REQUEST_KEYWORDS) ||
      hasAnyPhrase(normalizedText, LIST_REQUEST_PHRASES),
  };
}

function hasStatsSignal(normalizedText: string): boolean {
  return (
    hasKeyword(normalizedText, STATS_KEYWORDS) ||
    hasAnyPhrase(normalizedText, STATS_PHRASES)
  );
}

function hasLocationSignal(
  rawMessage: string,
  hasDomainTopic: boolean,
): boolean {
  if (!hasDomainTopic) return false;
  const lower = rawMessage.toLowerCase();
  const candidates: string[] = [];

  const latin = LOCATION_PREPOSITION_PATTERN.exec(lower);
  if (latin) candidates.push(latin[2]);
  const arabic = ARABIC_LOCATION_PATTERN.exec(rawMessage);
  if (arabic) candidates.push(arabic[2]);

  return candidates.some((candidate) => {
    const normalized = normalizeText(candidate);
    return normalized !== '' && !LOCATION_IGNORED.has(normalized);
  });
}

// --- Localized direct replies ---------------------------------------------

const DIRECT_REPLIES: Readonly<
  Record<PromptLanguage, Readonly<Record<DirectReplyKind, string>>>
> = Object.freeze({
  en: Object.freeze({
    greeting:
      'Hello! I can help with public Basmatak information about opportunities, organizations, skills, wilayas, and platform statistics. What would you like to know?',
    thanks:
      "You're welcome! Ask me anytime about public Basmatak opportunities, organizations, skills, or platform statistics.",
    capability:
      "I can answer from Basmatak's public information: opportunities, organizations, skills, wilayas, and platform statistics. I cannot access private accounts, contact details, or personal data.",
    clarify:
      'I can only help with public Basmatak information. Are you asking about opportunities, organizations, skills, wilayas, or platform statistics?',
    off_topic:
      "That question is outside Basmatak's public information. I can help with opportunities, organizations, skills, wilayas, or platform statistics.",
  }),
  ar: Object.freeze({
    greeting:
      'مرحبًا! يمكنني المساعدة بمعلومات بصمتك العامة عن الفرص والمنظمات والمهارات والولايات وإحصاءات المنصة. ما الذي تريد معرفته؟',
    thanks:
      'على الرحب والسعة! اسألني في أي وقت عن الفرص أو المنظمات أو المهارات أو إحصاءات المنصة العامة.',
    capability:
      'يمكنني الإجابة من معلومات بصمتك العامة عن الفرص والمنظمات والمهارات والولايات وإحصاءات المنصة. لا أستطيع الوصول إلى الحسابات الخاصة أو بيانات الاتصال أو البيانات الشخصية.',
    clarify:
      'يمكنني المساعدة فقط بمعلومات بصمتك العامة. هل يمكنك توضيح ما إذا كان سؤالك عن الفرص أو المنظمات أو المهارات أو الولايات أو إحصاءات المنصة؟',
    off_topic:
      'هذا السؤال خارج نطاق معلومات بصمتك العامة. يمكنني المساعدة في الفرص أو المنظمات أو المهارات أو الولايات أو إحصاءات المنصة.',
  }),
  fr: Object.freeze({
    greeting:
      'Bonjour ! Je peux vous aider avec les informations publiques de Basmatak : opportunités, organisations, compétences, wilayas et statistiques de la plateforme. Que souhaitez-vous savoir ?',
    thanks:
      'Avec plaisir ! Posez-moi vos questions sur les opportunités, organisations, compétences ou statistiques publiques de Basmatak.',
    capability:
      "Je peux répondre à partir des informations publiques de Basmatak : opportunités, organisations, compétences, wilayas et statistiques de la plateforme. Je n'accède pas aux comptes privés, coordonnées ou données personnelles.",
    clarify:
      'Je peux uniquement aider avec les informations publiques de Basmatak. Votre question porte-t-elle sur les opportunités, les organisations, les compétences, les wilayas ou les statistiques de la plateforme ?',
    off_topic:
      'Cette question sort du cadre des informations publiques de Basmatak. Je peux aider avec les opportunités, les organisations, les compétences, les wilayas ou les statistiques de la plateforme.',
  }),
});

function emptyRetrievalResult(): RetrievalResult {
  return {
    chunks: [],
    totalChars: 0,
    estimatedTokens: 0,
    truncated: false,
    reason: 'NO_MATCH',
  };
}

@Injectable()
export class IntentRouter {
  private readonly normalizer: KnowledgeNormalizer;

  constructor(
    @Inject(KnowledgeService) private readonly knowledge: RouterKnowledgeSearch,
    private readonly registry: ToolRegistry,
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    @Optional() normalizer?: KnowledgeNormalizer,
  ) {
    this.normalizer = normalizer ?? new KnowledgeNormalizer();
  }

  route(message: string, locale: AiAgentLocale): RouterDecision {
    const text = typeof message === 'string' ? message : '';
    const trimmed = text.trim();
    const language = detectPromptLanguage(trimmed, locale);
    const normalized = normalizeText(trimmed);

    if (normalized === '') {
      return this.directDecision('clarify', language, trimmed, 'EMPTY_MESSAGE');
    }

    if (matchesAny(normalized, GREETING_PATTERNS)) {
      return this.directDecision('greeting', language, trimmed, 'GREETING');
    }
    if (matchesAny(normalized, THANKS_PATTERNS)) {
      return this.directDecision('thanks', language, trimmed, 'THANKS');
    }
    if (matchesAny(normalized, CAPABILITY_PATTERNS)) {
      return this.directDecision('capability', language, trimmed, 'CAPABILITY');
    }

    const topics = detectTopics(normalized);
    const asksForStats = hasStatsSignal(normalized);
    const hasDomainTopic =
      topics.opportunity ||
      topics.organization ||
      topics.reference ||
      asksForStats;

    // Obvious off-topic questions are rejected before retrieval. A domain word
    // (for example "sports volunteering") keeps the question in scope.
    if (hasKeyword(normalized, OFF_TOPIC_KEYWORDS) && !hasDomainTopic) {
      return this.directDecision(
        'off_topic',
        language,
        trimmed,
        'OFF_TOPIC_KEYWORDS',
      );
    }

    const liveSignal =
      asksForStats ||
      topics.listRequest ||
      hasKeyword(normalized, STRONG_LIVE_KEYWORDS) ||
      hasAnyPhrase(normalized, LIVE_PHRASES) ||
      (hasDomainTopic && hasKeyword(normalized, TOPIC_LIVE_KEYWORDS)) ||
      hasLocationSignal(trimmed, hasDomainTopic);

    const result = this.search(trimmed, language);
    const topScore = result.chunks.length > 0 ? result.chunks[0].score : 0;
    const minScore = this.minScore();
    const hasKnowledge =
      result.chunks.length > 0 &&
      Number.isFinite(topScore) &&
      topScore >= minScore;

    if (liveSignal) {
      const selectedIntents = this.selectToolIntents(topics, asksForStats);
      const mixed =
        hasKnowledge && this.knowledgeCoverage(trimmed, result.chunks[0]) > 0.5;
      return this.answerDecision(
        mixed ? 'mixed' : 'live_data',
        language,
        trimmed,
        topScore,
        selectedIntents,
        mixed
          ? 'MIXED'
          : asksForStats
            ? 'LIVE_STATS'
            : selectedIntents.length > 1
              ? 'LIVE_BROAD'
              : 'LIVE_TOPIC',
      );
    }

    if (hasKnowledge) {
      return this.answerDecision(
        'knowledge_only',
        language,
        trimmed,
        topScore,
        [],
        'KNOWLEDGE_MATCH',
      );
    }

    return this.directDecision(
      'clarify',
      language,
      trimmed,
      result.reason === 'EMPTY_CORPUS'
        ? 'EMPTY_KNOWLEDGE'
        : 'LOW_KNOWLEDGE_SCORE',
      topScore,
    );
  }

  private search(query: string, language: PromptLanguage): RetrievalResult {
    try {
      return this.knowledge.search(query, language, { topK: ROUTER_TOP_K });
    } catch {
      // A retrieval failure must not crash routing. It simply means no
      // grounding is available; live-data signals can still select tools.
      return emptyRetrievalResult();
    }
  }

  private minScore(): number {
    const configured = this.config.limits.routerMinScore;
    if (configured === undefined || !Number.isFinite(configured)) {
      return DEFAULT_ROUTER_MIN_SCORE;
    }
    return Math.min(
      MAX_ROUTER_MIN_SCORE,
      Math.max(MIN_ROUTER_MIN_SCORE, configured),
    );
  }

  /**
   * Share of the query's content tokens that appear in the top chunk (with
   * synonym expansion when a normalizer is available). A glossary hit that
   * only matches one word of a live-data request is not "meaningful" knowledge;
   * it keeps the intent live-data instead of mixed.
   */
  private knowledgeCoverage(query: string, chunk: RetrievedChunk): number {
    const queryTokens = tokenize(query, {
      removeStopwords: true,
      unique: true,
    });
    if (queryTokens.length === 0) return 0;

    const chunkText = [
      String(chunk.title ?? ''),
      Array.isArray(chunk.headingTrail) ? chunk.headingTrail.join(' ') : '',
      String(chunk.text ?? ''),
    ].join(' ');
    const chunkTokens = new Set(
      tokenize(chunkText, { removeStopwords: true, unique: false }),
    );

    let matched = 0;
    for (const token of queryTokens) {
      const variants = new Set<string>([
        token,
        ...this.normalizer.expandTokens([token]),
      ]);
      if ([...variants].some((variant) => chunkTokens.has(variant))) {
        matched += 1;
      }
    }

    return matched / queryTokens.length;
  }

  private selectToolIntents(
    topics: TopicSignals,
    asksForStats: boolean,
  ): ToolIntent[] {
    // A pure count/statistics question uses the aggregate tool, not search
    // tools for every entity mentioned in the sentence.
    if (asksForStats && !topics.listRequest) {
      return ['platform_stats'];
    }

    const selected = new Set<ToolIntent>();
    if (topics.opportunity) selected.add('opportunity_search');
    if (topics.organization) selected.add('organization_search');
    if (topics.reference) selected.add('reference_lookup');
    if (asksForStats) selected.add('platform_stats');

    // A broad live-data request with no specific topic declares three relevant
    // tools, never all four.
    if (selected.size === 0) {
      selected.add('opportunity_search');
      selected.add('organization_search');
      selected.add('platform_stats');
    }

    return TOOL_INTENTS.filter((intent) => selected.has(intent));
  }

  private resolveTools(requested: readonly ToolIntent[]): {
    tools: ToolDescriptor[];
    toolIntents: ToolIntent[];
  } {
    if (requested.length === 0) {
      return { tools: [], toolIntents: [] };
    }

    const tools = this.registry
      .list()
      .filter((tool) =>
        tool.allowedIntents.some((intent) => requested.includes(intent)),
      );
    const toolIntents = requested.filter((intent) =>
      tools.some((tool) => tool.allowedIntents.includes(intent)),
    );

    return { tools, toolIntents };
  }

  private answerDecision(
    intent: RouterIntent,
    language: PromptLanguage,
    knowledgeQuery: string,
    topScore: number,
    requestedIntents: readonly ToolIntent[],
    reason: string,
  ): RouterDecision {
    const { tools, toolIntents } = this.resolveTools(requestedIntents);
    return {
      intent,
      language,
      action: 'answer',
      tools,
      toolIntents,
      knowledgeQuery,
      topScore,
      reason,
    };
  }

  private directDecision(
    kind: DirectReplyKind,
    language: PromptLanguage,
    knowledgeQuery: string,
    reason: string,
    topScore = 0,
  ): RouterDecision {
    const intent: RouterIntent =
      kind === 'greeting' || kind === 'thanks' || kind === 'capability'
        ? 'greeting'
        : kind;

    return {
      intent,
      language,
      action: 'direct_reply',
      directReply: DIRECT_REPLIES[language][kind],
      tools: [],
      toolIntents: [],
      knowledgeQuery,
      topScore,
      reason,
    };
  }
}
