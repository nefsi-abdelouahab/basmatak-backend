import { KnowledgeChunk, KnowledgeLocale } from './knowledge.types';
import { KnowledgeNormalizer, SynonymGroups } from './normalizer';

/**
 * Deterministic, framework-free BM25 index for knowledge chunks.
 *
 * Scoring uses standard BM25 (k1 = 1.2, b = 0.75) over weighted term
 * frequencies:
 *   body tf + 3 * title tf + 2 * heading tf + 2 * tag tf.
 * A matching query locale multiplies a chunk's score by 1.15, and document
 * priority multiplies it by 1.20 for priority 1 down to 1.00 for priority 5.
 * Synonym-only query expansions are scored at 0.5 so the caller's own term is
 * always preferred.
 *
 * Ties are resolved without locale-sensitive comparison: score desc, priority
 * asc, source asc, ordinal asc, id asc. This keeps ranking reproducible across
 * processes and machines.
 */

export const DEFAULT_BM25_K1 = 1.2;
export const DEFAULT_BM25_B = 0.75;

export const BODY_FIELD_WEIGHT = 1;
export const TITLE_FIELD_WEIGHT = 3;
export const HEADING_FIELD_WEIGHT = 2;
export const TAG_FIELD_WEIGHT = 2;

export const LOCALE_MATCH_MULTIPLIER = 1.15;
export const PRIORITY_TOP_MULTIPLIER = 1.2;
export const PRIORITY_STEP = 0.05;

/** Weight for a synonym expansion that is not itself a query term. */
export const SYNONYM_TERM_WEIGHT = 0.5;
const ORIGINAL_TERM_WEIGHT = 1;

export interface BM25IndexOptions {
  /** BM25 term-frequency saturation. Defaults to 1.2. */
  k1?: number;
  /** BM25 length-normalization strength. Defaults to 0.75. */
  b?: number;
  /** Reuse an existing normalizer (including its loaded synonyms). */
  normalizer?: KnowledgeNormalizer;
  /** Synonym groups used when `normalizer` is omitted. */
  synonyms?: SynonymGroups;
}

export interface BM25SearchOptions {
  /** Optional locale boost. Omitted means no locale boost. */
  locale?: KnowledgeLocale;
  /** Maximum results returned after deterministic sorting. */
  limit?: number;
}

export interface BM25SearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

interface IndexedDocument {
  chunk: KnowledgeChunk;
  termFrequencies: Map<string, number>;
  /** Weighted term count used for BM25 length normalization. */
  documentLength: number;
  /** Term frequencies including stopwords, used only for fallback queries. */
  rawTermFrequencies: Map<string, number>;
  /** Weighted raw term count, used only for fallback queries. */
  rawDocumentLength: number;
}

interface QueryTerm {
  term: string;
  weight: number;
}

interface BuiltQuery {
  terms: QueryTerm[];
  /** True when the query contained only stopwords. */
  useRawIndex: boolean;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeB(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_BM25_B;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Priority multiplier. Priority 1 (core) receives 1.20, priority 5 receives
 * 1.00, and each step between them equals 0.05.
 */
export function priorityMultiplier(priority: number): number {
  const normalized = Number.isFinite(priority)
    ? Math.min(5, Math.max(1, Math.trunc(priority)))
    : 3;
  return (
    Math.round(
      (PRIORITY_TOP_MULTIPLIER - (normalized - 1) * PRIORITY_STEP) * 100,
    ) / 100
  );
}

function addWeightedTokens(
  frequencies: Map<string, number>,
  tokens: readonly string[],
  weight: number,
): void {
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + weight);
  }
}

function buildTermFrequencies(
  chunk: KnowledgeChunk,
  normalizer: KnowledgeNormalizer,
  removeStopwords: boolean,
): Map<string, number> {
  const frequencies = new Map<string, number>();

  addWeightedTokens(
    frequencies,
    normalizer.tokenize(chunk.text ?? '', {
      removeStopwords,
      unique: false,
    }),
    BODY_FIELD_WEIGHT,
  );
  addWeightedTokens(
    frequencies,
    normalizer.tokenize(chunk.title ?? '', {
      removeStopwords,
      unique: false,
    }),
    TITLE_FIELD_WEIGHT,
  );
  addWeightedTokens(
    frequencies,
    normalizer.tokenize((chunk.headingTrail ?? []).join(' '), {
      removeStopwords,
      unique: false,
    }),
    HEADING_FIELD_WEIGHT,
  );
  addWeightedTokens(
    frequencies,
    normalizer.tokenize((chunk.tags ?? []).join(' '), {
      removeStopwords,
      unique: false,
    }),
    TAG_FIELD_WEIGHT,
  );

  return frequencies;
}

function sumFrequencies(frequencies: Map<string, number>): number {
  let total = 0;
  for (const value of frequencies.values()) total += value;
  return total;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Compare ranked results using the documented stable tie-break. Never use
 * localeCompare here: its ordering can differ by runtime locale.
 */
function compareResults(
  left: BM25SearchResult,
  right: BM25SearchResult,
): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.chunk.priority !== right.chunk.priority) {
    return left.chunk.priority - right.chunk.priority;
  }
  const source = compareStrings(left.chunk.source, right.chunk.source);
  if (source !== 0) return source;
  if (left.chunk.ordinal !== right.chunk.ordinal) {
    return left.chunk.ordinal - right.chunk.ordinal;
  }
  return compareStrings(left.chunk.id, right.chunk.id);
}

export class BM25Index {
  private readonly documents: IndexedDocument[] = [];
  private readonly postings = new Map<string, number[]>();
  private readonly rawPostings = new Map<string, number[]>();
  private readonly documentFrequencies = new Map<string, number>();
  private readonly averageDocumentLength: number;
  private readonly averageRawDocumentLength: number;
  private readonly k1: number;
  private readonly b: number;
  private readonly normalizer: KnowledgeNormalizer;

  constructor(
    chunks: readonly KnowledgeChunk[] = [],
    options: BM25IndexOptions = {},
  ) {
    this.k1 = positiveNumber(options.k1, DEFAULT_BM25_K1);
    this.b = normalizeB(options.b);
    this.normalizer =
      options.normalizer ??
      new KnowledgeNormalizer({ synonyms: options.synonyms ?? [] });

    for (const chunk of chunks) {
      const termFrequencies = buildTermFrequencies(
        chunk,
        this.normalizer,
        true,
      );
      const rawTermFrequencies = buildTermFrequencies(
        chunk,
        this.normalizer,
        false,
      );
      const documentLength = sumFrequencies(termFrequencies);
      const rawDocumentLength = sumFrequencies(rawTermFrequencies);
      const documentIndex = this.documents.length;

      this.documents.push({
        chunk,
        termFrequencies,
        documentLength,
        rawTermFrequencies,
        rawDocumentLength,
      });

      for (const term of termFrequencies.keys()) {
        const existing = this.postings.get(term);
        if (existing) {
          existing.push(documentIndex);
        } else {
          this.postings.set(term, [documentIndex]);
        }
        this.documentFrequencies.set(
          term,
          (this.documentFrequencies.get(term) ?? 0) + 1,
        );
      }

      for (const term of rawTermFrequencies.keys()) {
        const existing = this.rawPostings.get(term);
        if (existing) {
          existing.push(documentIndex);
        } else {
          this.rawPostings.set(term, [documentIndex]);
        }
      }
    }

    const totalLength = this.documents.reduce(
      (total, document) => total + document.documentLength,
      0,
    );
    this.averageDocumentLength =
      this.documents.length === 0 ? 0 : totalLength / this.documents.length;

    const totalRawLength = this.documents.reduce(
      (total, document) => total + document.rawDocumentLength,
      0,
    );
    this.averageRawDocumentLength =
      this.documents.length === 0 ? 0 : totalRawLength / this.documents.length;
  }

  /** Number of indexed chunks. */
  get size(): number {
    return this.documents.length;
  }

  /** Weighted average chunk length, exposed for diagnostics and tests. */
  get averageLength(): number {
    return this.averageDocumentLength;
  }

  /** Number of chunks containing a normalized term. */
  getDocumentFrequency(term: string): number {
    const normalized = this.normalizer.normalizeText(term);
    return this.documentFrequencies.get(normalized) ?? 0;
  }

  /**
   * Rank chunks for a query. An empty index, a blank query, or a query with no
   * known terms returns an empty array without throwing.
   */
  search(query: string, options: BM25SearchOptions = {}): BM25SearchResult[] {
    if (this.documents.length === 0) return [];

    const { terms, useRawIndex } = this.buildQueryTerms(query);
    if (terms.length === 0) return [];

    const scores = new Map<number, number>();

    for (const queryTerm of terms) {
      const postings = (useRawIndex ? this.rawPostings : this.postings).get(
        queryTerm.term,
      );
      if (!postings || postings.length === 0) continue;

      const documentFrequency = postings.length;
      const idf = Math.log(
        1 +
          (this.documents.length - documentFrequency + 0.5) /
            (documentFrequency + 0.5),
      );

      for (const documentIndex of postings) {
        const document = this.documents[documentIndex];
        const termFrequency =
          (useRawIndex
            ? document.rawTermFrequencies
            : document.termFrequencies
          ).get(queryTerm.term) ?? 0;
        if (termFrequency <= 0) continue;

        const averageDocumentLength = useRawIndex
          ? this.averageRawDocumentLength
          : this.averageDocumentLength;
        const documentLength = useRawIndex
          ? document.rawDocumentLength
          : document.documentLength;
        const lengthRatio =
          averageDocumentLength === 0
            ? 1
            : documentLength / averageDocumentLength;
        const denominator =
          termFrequency + this.k1 * (1 - this.b + this.b * lengthRatio);
        const termScore =
          idf *
          ((termFrequency * (this.k1 + 1)) / denominator) *
          queryTerm.weight;

        scores.set(documentIndex, (scores.get(documentIndex) ?? 0) + termScore);
      }
    }

    if (scores.size === 0) return [];

    const results: BM25SearchResult[] = [];
    for (const [documentIndex, baseScore] of scores) {
      const document = this.documents[documentIndex];
      let score = baseScore;

      if (
        options.locale !== undefined &&
        document.chunk.locale === options.locale
      ) {
        score *= LOCALE_MATCH_MULTIPLIER;
      }
      score *= priorityMultiplier(document.chunk.priority);

      results.push({ chunk: document.chunk, score });
    }

    results.sort(compareResults);

    if (options.limit === undefined) return results;
    const limit = Number.isFinite(options.limit)
      ? Math.max(0, Math.trunc(options.limit))
      : results.length;
    return results.slice(0, limit);
  }

  private buildQueryTerms(query: string): BuiltQuery {
    const filteredTokens = this.normalizer.tokenize(query, {
      removeStopwords: true,
      unique: true,
    });
    // Identity questions such as "who are you" and "من أنت" are made entirely
    // of stopwords. Retry against the raw index, which includes stopwords, so
    // they can still match identity content instead of producing no results.
    const useRawIndex = filteredTokens.length === 0;
    const baseTokens = useRawIndex
      ? this.normalizer.tokenize(query, {
          removeStopwords: false,
          unique: true,
        })
      : filteredTokens;

    if (baseTokens.length === 0) {
      return { terms: [], useRawIndex };
    }

    const expanded = this.normalizer.expandTokens(baseTokens);
    const original = new Set(baseTokens);
    const seen = new Set<string>();
    const terms: QueryTerm[] = [];

    for (const token of expanded) {
      if (token === '' || seen.has(token)) continue;
      seen.add(token);
      terms.push({
        term: token,
        weight: original.has(token)
          ? ORIGINAL_TERM_WEIGHT
          : SYNONYM_TERM_WEIGHT,
      });
    }

    return { terms, useRawIndex };
  }
}
