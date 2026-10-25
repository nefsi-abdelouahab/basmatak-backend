import { readFileSync } from 'fs';
import { TextDecoder } from 'util';

/**
 * Arabic/Latin/French text normalization for future BM25 use.
 *
 * The module is pure except for the optional synonym-file loader. Missing or
 * malformed synonym configuration safely degrades to no expansion.
 */

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;
const ARABIC_TATWEEL = /\u0640/g;
const ALEF_VARIANTS = /[\u0623\u0625\u0622\u0671]/g;
const YA_VARIANTS = /\u0649/g;
const TA_MARBUTA = /\u0629/g;
const LATIN_COMBINING_MARKS = /[\u0300-\u036F]/g;
const NON_TOKEN_CHARACTERS = /[^\p{L}\p{N}]+/gu;

const ENGLISH_STOPWORDS = [
  'a',
  'about',
  'after',
  'all',
  'also',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'before',
  'being',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'during',
  'each',
  'few',
  'for',
  'from',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'many',
  'me',
  'more',
  'most',
  'much',
  'my',
  'no',
  'nor',
  'not',
  'of',
  'on',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'within',
  'without',
  'would',
  'you',
  'your',
  'yours',
] as const;

const ARABIC_STOPWORDS = [
  'من',
  'إلى',
  'الى',
  'على',
  'عن',
  'في',
  'مع',
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'التي',
  'الذي',
  'الذين',
  'كان',
  'كانت',
  'يكون',
  'تكون',
  'أن',
  'إن',
  'لا',
  'لم',
  'لن',
  'ما',
  'هو',
  'هي',
  'هم',
  'هن',
  'نحن',
  'أنا',
  'أنت',
  'أنتم',
  'و',
  'أو',
  'ثم',
  'قد',
  'كل',
  'بعض',
  'عند',
  'حتى',
  'إذا',
  'كما',
  'بين',
  'بعد',
  'قبل',
  'خلال',
  'دون',
  'غير',
  'لكن',
  'هل',
  'أي',
  'أين',
  'كيف',
  'متى',
  'لماذا',
  'هناك',
  'هنا',
  'عليه',
  'عليها',
  'منه',
  'منها',
  'فيه',
  'فيها',
  'به',
  'بها',
  'له',
  'لها',
  'كانوا',
  'ليس',
  'ليست',
  'ولا',
  'وما',
  'ومن',
  'وفي',
] as const;

const FRENCH_STOPWORDS = [
  'a',
  'ai',
  'as',
  'au',
  'aujourd',
  'aux',
  'avec',
  'avoir',
  'c',
  'ce',
  'ces',
  'cet',
  'cette',
  'comme',
  'comment',
  'd',
  'dans',
  'de',
  'des',
  'dont',
  'du',
  'elle',
  'elles',
  'en',
  'est',
  'et',
  'etre',
  'il',
  'ils',
  'j',
  'je',
  'l',
  'la',
  'le',
  'les',
  'leur',
  'leurs',
  'm',
  'ma',
  'mais',
  'mes',
  'mon',
  'n',
  'ne',
  'nos',
  'notre',
  'nous',
  'on',
  'ont',
  'ou',
  'par',
  'pas',
  'plus',
  'pour',
  'pourquoi',
  'qu',
  'quand',
  'que',
  'qui',
  'quoi',
  's',
  'sa',
  'sans',
  'se',
  'ses',
  'si',
  'son',
  'sont',
  'sous',
  'sur',
  't',
  'ta',
  'tes',
  'ton',
  'tous',
  'tout',
  'toute',
  'toutes',
  'tu',
  'un',
  'une',
  'vos',
  'votre',
  'vous',
  'y',
] as const;

export type SynonymGroups = ReadonlyArray<ReadonlyArray<string>>;

export interface TokenizeOptions {
  /** Remove built-in English, Arabic, and French stopwords. Defaults to true. */
  removeStopwords?: boolean;
  /** Remove duplicate tokens in stable order. Defaults to true. */
  unique?: boolean;
}

export interface KnowledgeNormalizerOptions {
  /** Pre-loaded synonym groups. Takes precedence over `synonymsPath`. */
  synonyms?: SynonymGroups;
  /** Path to a `_config/synonyms.json`-shaped file. */
  synonymsPath?: string;
}

function dedupeStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/**
 * Normalize text for matching. This intentionally preserves token order and
 * whitespace boundaries; tokenization is a separate step.
 */
export function normalizeText(text: string): string {
  let value = String(text ?? '').toLowerCase();

  value = value.replace(ARABIC_DIACRITICS, '');
  value = value.replace(ARABIC_TATWEEL, '');
  value = value.replace(ALEF_VARIANTS, '\u0627');
  value = value.replace(YA_VARIANTS, '\u064A');
  value = value.replace(TA_MARBUTA, '\u0647');

  value = value.normalize('NFD').replace(LATIN_COMBINING_MARKS, '');
  value = value.replace(/\u0153/g, 'oe').replace(/\u00E6/g, 'ae');
  value = value.replace(NON_TOKEN_CHARACTERS, ' ');

  return value.trim().replace(/\s+/g, ' ');
}

function buildStopwordSet(words: readonly string[]): Set<string> {
  return new Set(words.map((word) => normalizeText(word)).filter(Boolean));
}

const STOPWORDS = new Set<string>([
  ...buildStopwordSet(ENGLISH_STOPWORDS),
  ...buildStopwordSet(ARABIC_STOPWORDS),
  ...buildStopwordSet(FRENCH_STOPWORDS),
]);

/** True when the normalized token is a built-in en/ar/fr stopword. */
export function isStopword(token: string): boolean {
  const normalized = normalizeText(token);
  return normalized !== '' && STOPWORDS.has(normalized);
}

/**
 * Normalize, split on Unicode letters/numbers, optionally remove stopwords,
 * and optionally deduplicate in stable order.
 */
export function tokenize(
  text: string,
  options: TokenizeOptions = {},
): string[] {
  const removeStopwords = options.removeStopwords ?? true;
  const unique = options.unique ?? true;
  const normalized = normalizeText(text);
  if (normalized === '') return [];

  let tokens = normalized.split(' ').filter((token) => token !== '');
  if (removeStopwords) {
    tokens = tokens.filter((token) => !STOPWORDS.has(token));
  }
  return unique ? dedupeStable(tokens) : tokens;
}

/**
 * Read and normalize synonym groups. Any read, UTF-8, JSON-shape, or entry-type
 * failure returns an empty list so retrieval degrades safely.
 */
export function loadSynonymGroups(filePath: string): SynonymGroups {
  try {
    const buffer = readFileSync(filePath);
    let text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const parsed: unknown = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as { groups?: unknown }).groups)
    ) {
      return [];
    }

    const groups: string[][] = [];
    for (const rawGroup of (parsed as { groups: unknown[] }).groups) {
      if (!Array.isArray(rawGroup)) return [];
      const group: string[] = [];
      for (const entry of rawGroup) {
        if (typeof entry !== 'string') return [];
        const normalized = normalizeText(entry);
        if (normalized) group.push(normalized);
      }
      const deduped = dedupeStable(group);
      if (deduped.length > 0) groups.push(deduped);
    }

    return groups;
  } catch {
    return [];
  }
}

function buildSynonymMap(
  groups: SynonymGroups,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();

  for (const rawGroup of groups) {
    const group = dedupeStable(
      rawGroup.map((entry) => normalizeText(entry)).filter(Boolean),
    );
    for (const token of group) {
      const synonyms = map.get(token) ?? [];
      for (const synonym of group) {
        if (synonym !== token && !synonyms.includes(synonym)) {
          synonyms.push(synonym);
        }
      }
      map.set(token, synonyms);
    }
  }

  return map;
}

function expandTokensWithMap(
  tokens: readonly string[],
  synonyms: ReadonlyMap<string, readonly string[]>,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (token: string): void => {
    if (token === '' || seen.has(token)) return;
    seen.add(token);
    result.push(token);
  };

  for (const rawToken of tokens) {
    const token = normalizeText(rawToken);
    if (token === '') continue;
    add(token);
    for (const synonym of synonyms.get(token) ?? []) {
      add(synonym);
    }
  }

  return result;
}

/**
 * Expand tokens with synonyms, preserving first-seen order and removing
 * duplicates. Unknown tokens are returned unchanged.
 */
export function expandTokens(
  tokens: readonly string[],
  synonyms: SynonymGroups = [],
): string[] {
  return expandTokensWithMap(tokens, buildSynonymMap(synonyms));
}

/**
 * Reusable normalizer with lazily loaded synonyms. Construction performs no
 * filesystem reads, so Nest can register it without indexing at boot.
 */
export class KnowledgeNormalizer {
  private synonymMap: ReadonlyMap<string, readonly string[]> | null = null;

  constructor(private readonly options: KnowledgeNormalizerOptions = {}) {}

  normalizeText(text: string): string {
    return normalizeText(text);
  }

  tokenize(text: string, options?: TokenizeOptions): string[] {
    return tokenize(text, options);
  }

  isStopword(token: string): boolean {
    return isStopword(token);
  }

  expandTokens(tokens: readonly string[]): string[] {
    return expandTokensWithMap(tokens, this.getSynonymMap());
  }

  private getSynonymMap(): ReadonlyMap<string, readonly string[]> {
    if (this.synonymMap === null) {
      const groups =
        this.options.synonyms ??
        (this.options.synonymsPath
          ? loadSynonymGroups(this.options.synonymsPath)
          : []);
      this.synonymMap = buildSynonymMap(groups);
    }
    return this.synonymMap;
  }
}
