import { createHash } from 'crypto';
import { estimateTokens } from '../budget/token-estimator';
import { BM25Index, BM25SearchResult } from './bm25';
import { KnowledgeChunk, KnowledgeLocale } from './knowledge.types';
import { KnowledgeNormalizer } from './normalizer';

/**
 * Budget-bounded wrapper around the BM25 index.
 *
 * Retrieval defaults match the approved roadmap: at most four chunks/six on an
 * explicit request, two chunks per source file, 6,000 characters (8,000 hard),
 * and 1,500 estimated text tokens (2,000 hard, never above the configured input
 * budget). Chunks scoring at or below zero, or below 20% of the top score, are
 * dropped before selection.
 *
 * Results are cached per normalized query and locale for ten minutes. The cache
 * stores retrieval results only, never generated answers. When it reaches 100
 * entries the oldest inserted entry is evicted (FIFO); cache hits do not refresh
 * insertion order. Expired entries are removed before eviction.
 */

export const DEFAULT_MAX_CHUNKS = 4;
export const HARD_MAX_CHUNKS = 6;
export const MAX_CHUNKS_PER_SOURCE = 2;

export const DEFAULT_RELATIVE_SCORE_THRESHOLD = 0.2;

export const DEFAULT_MAX_KNOWLEDGE_CHARS = 6000;
export const HARD_MAX_KNOWLEDGE_CHARS = 8000;

export const DEFAULT_MAX_ESTIMATED_TOKENS = 1500;
export const HARD_MAX_ESTIMATED_TOKENS = 2000;

export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_CACHE_ENTRIES = 100;

export type RetrievalReason = 'EMPTY_CORPUS' | 'NO_MATCH' | 'BUDGET_EXCEEDED';

export interface KnowledgeRetrieverOptions {
  /** Default number of chunks. Defaults to 4, hard-capped at 6. */
  maxChunks?: number;
  /** Default character budget. Defaults to 6,000, hard-capped at 8,000. */
  maxChars?: number;
  /**
   * Default estimated text-token budget. Defaults to 1,500, hard-capped at
   * 2,000 and never above `maxInputTokens`.
   */
  maxEstimatedTokens?: number;
  /** Configured input-token ceiling. Defaults to an unbounded value. */
  maxInputTokens?: number;
  /** Result-cache lifetime. Defaults to ten minutes. */
  cacheTtlMs?: number;
  /** Maximum cached queries. Defaults to 100. */
  maxCacheEntries?: number;
  /** Normalizer used only for cache-key normalization. */
  normalizer?: KnowledgeNormalizer;
  /** Clock seam for deterministic cache tests. */
  now?: () => number;
}

export interface RetrievalOptions {
  /** Requested result count. Clamped to 1..6. */
  topK?: number;
  /** Optional locale boost. Omitted means no locale boost. */
  locale?: KnowledgeLocale;
}

export interface RetrievedChunk {
  id: string;
  source: string;
  title: string;
  locale: KnowledgeLocale;
  headingTrail: string[];
  text: string;
  charCount: number;
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  totalChars: number;
  estimatedTokens: number;
  /** True when a candidate was omitted by any cap. */
  truncated: boolean;
  reason?: RetrievalReason;
}

interface CacheEntry {
  createdAt: number;
  result: RetrievalResult;
}

function resolveInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function cloneChunk(chunk: RetrievedChunk): RetrievedChunk {
  return { ...chunk, headingTrail: [...chunk.headingTrail] };
}

function emptyResult(reason: RetrievalReason): RetrievalResult {
  return {
    chunks: [],
    totalChars: 0,
    estimatedTokens: 0,
    truncated: false,
    reason,
  };
}

/**
 * SHA-256 cache key over the normalized query and locale. The newline keeps
 * `"a\nb"`-style ambiguity out of the hash input.
 */
export function buildRetrievalCacheKey(
  normalizedQuery: string,
  locale?: KnowledgeLocale,
): string {
  return createHash('sha256')
    .update(`${normalizedQuery}\n${locale ?? ''}`, 'utf8')
    .digest('hex');
}

export class KnowledgeRetriever {
  readonly maxChunks: number;
  readonly maxChars: number;
  readonly maxEstimatedTokens: number;

  private readonly index: BM25Index;
  private readonly normalizer: KnowledgeNormalizer;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(index: BM25Index, options: KnowledgeRetrieverOptions = {}) {
    this.index = index;
    this.normalizer = options.normalizer ?? new KnowledgeNormalizer();
    this.maxChunks = resolveInteger(
      options.maxChunks,
      DEFAULT_MAX_CHUNKS,
      1,
      HARD_MAX_CHUNKS,
    );
    this.maxChars = resolveInteger(
      options.maxChars,
      DEFAULT_MAX_KNOWLEDGE_CHARS,
      1,
      HARD_MAX_KNOWLEDGE_CHARS,
    );

    const requestedTokens = resolveInteger(
      options.maxEstimatedTokens,
      DEFAULT_MAX_ESTIMATED_TOKENS,
      1,
      HARD_MAX_ESTIMATED_TOKENS,
    );
    const configuredInputTokens =
      options.maxInputTokens === undefined
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, Math.trunc(options.maxInputTokens));
    this.maxEstimatedTokens = Math.min(requestedTokens, configuredInputTokens);

    this.cacheTtlMs = resolveInteger(
      options.cacheTtlMs,
      DEFAULT_CACHE_TTL_MS,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    this.maxCacheEntries = resolveInteger(
      options.maxCacheEntries,
      DEFAULT_MAX_CACHE_ENTRIES,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    this.now = options.now ?? (() => Date.now());
  }

  /** Number of indexed chunks (diagnostics only). */
  get indexSize(): number {
    return this.index.size;
  }

  /** Number of cached query/locale pairs (diagnostics only). */
  get cacheSize(): number {
    return this.cache.size;
  }

  search(query: string, options: RetrievalOptions = {}): RetrievalResult {
    const normalizedQuery = this.normalizer.normalizeText(
      typeof query === 'string' ? query : '',
    );
    if (normalizedQuery === '') return emptyResult('NO_MATCH');
    if (this.index.size === 0) return emptyResult('EMPTY_CORPUS');

    const key = buildRetrievalCacheKey(normalizedQuery, options.locale);
    const cached = this.readCache(key);
    const fullResult =
      cached ?? this.computeResult(normalizedQuery, options.locale);
    if (cached === null) this.writeCache(key, fullResult);

    return this.limitResult(fullResult, this.resolveTopK(options.topK));
  }

  /** Clears cached retrieval results (test/diagnostic seam). */
  clearCache(): void {
    this.cache.clear();
  }

  private resolveTopK(requested: number | undefined): number {
    return resolveInteger(requested, this.maxChunks, 1, HARD_MAX_CHUNKS);
  }

  /**
   * Compute at the maximum permitted top-K so the query/locale cache does not
   * need to include caller budgets. A lower per-call top-K is a prefix of this
   * selection because selection always walks candidates in rank order.
   */
  private computeResult(
    normalizedQuery: string,
    locale: KnowledgeLocale | undefined,
  ): RetrievalResult {
    const ranked = this.index.search(normalizedQuery, { locale });
    if (ranked.length === 0) return emptyResult('NO_MATCH');

    const topScore = ranked[0].score;
    if (!(topScore > 0)) return emptyResult('NO_MATCH');

    const threshold = topScore * DEFAULT_RELATIVE_SCORE_THRESHOLD;
    const eligible = ranked.filter(
      (result) => result.score > 0 && result.score >= threshold,
    );
    if (eligible.length === 0) return emptyResult('NO_MATCH');

    const selected: RetrievedChunk[] = [];
    const perSource = new Map<string, number>();
    let selectedChars = 0;
    let selectedTokens = 0;
    let truncated = false;

    for (const result of eligible) {
      if (selected.length >= HARD_MAX_CHUNKS) {
        truncated = true;
        break;
      }

      const sourceCount = perSource.get(result.chunk.source) ?? 0;
      if (sourceCount >= MAX_CHUNKS_PER_SOURCE) {
        truncated = true;
        continue;
      }

      const text = result.chunk.text ?? '';
      const charCount = text.length;

      if (selectedChars + charCount > this.maxChars) {
        truncated = true;
        continue;
      }

      const tokenCount = estimateTokens(text, { overheadTokens: 0 }).textTokens;
      if (selectedTokens + tokenCount > this.maxEstimatedTokens) {
        truncated = true;
        continue;
      }

      selected.push(this.toRetrievedChunk(result));
      perSource.set(result.chunk.source, sourceCount + 1);
      selectedChars += charCount;
      selectedTokens += tokenCount;
    }

    if (selected.length === 0) return emptyResult('BUDGET_EXCEEDED');

    return {
      chunks: selected,
      totalChars: selectedChars,
      estimatedTokens: selectedTokens,
      truncated,
    };
  }

  private toRetrievedChunk(result: BM25SearchResult): RetrievedChunk {
    const chunk: KnowledgeChunk = result.chunk;
    return {
      id: chunk.id,
      source: chunk.source,
      title: chunk.title,
      locale: chunk.locale,
      headingTrail: [...(chunk.headingTrail ?? [])],
      text: chunk.text,
      charCount: chunk.text.length,
      score: result.score,
    };
  }

  private limitResult(result: RetrievalResult, topK: number): RetrievalResult {
    const selected = result.chunks.slice(0, topK);
    if (selected.length === 0) {
      return {
        chunks: [],
        totalChars: 0,
        estimatedTokens: 0,
        truncated: result.truncated,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    }

    const chunks = selected.map(cloneChunk);
    return {
      chunks,
      totalChars: chunks.reduce((total, chunk) => total + chunk.charCount, 0),
      estimatedTokens: chunks.reduce(
        (total, chunk) =>
          total + estimateTokens(chunk.text, { overheadTokens: 0 }).textTokens,
        0,
      ),
      truncated: result.truncated || result.chunks.length > selected.length,
    };
  }

  private readCache(key: string): RetrievalResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (this.now() - entry.createdAt >= this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  private writeCache(key: string, result: RetrievalResult): void {
    this.pruneExpired();

    if (!this.cache.has(key) && this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { createdAt: this.now(), result });
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt >= this.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
  }
}
