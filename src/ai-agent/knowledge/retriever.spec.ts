import { BM25Index, BM25SearchResult } from './bm25';
import { KnowledgeChunk } from './knowledge.types';
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_MAX_CHUNKS,
  DEFAULT_MAX_ESTIMATED_TOKENS,
  DEFAULT_MAX_KNOWLEDGE_CHARS,
  HARD_MAX_CHUNKS,
  HARD_MAX_ESTIMATED_TOKENS,
  HARD_MAX_KNOWLEDGE_CHARS,
  KnowledgeRetriever,
  buildRetrievalCacheKey,
} from './retriever';

function makeChunk(
  overrides: Partial<KnowledgeChunk> & { text: string },
): KnowledgeChunk {
  const source = overrides.source ?? 'faq/en.md';
  const ordinal = overrides.ordinal ?? 1;
  return {
    id: `${source}#${ordinal}`,
    source,
    ordinal,
    headingTrail: [],
    title: '',
    locale: 'en',
    tags: [],
    priority: 3,
    ...overrides,
    text: overrides.text,
    charCount: overrides.charCount ?? overrides.text.length,
  };
}

function scored(chunk: KnowledgeChunk, score: number): BM25SearchResult {
  return { chunk, score };
}

function fakeIndex(
  results: BM25SearchResult[],
  size = results.length,
): { index: BM25Index; search: jest.Mock } {
  const search = jest.fn(() => results);
  const index = { size, search } as unknown as BM25Index;
  return { index, search };
}

function repeatedText(targetChars: number): string {
  const unit = 'alpha ';
  return unit
    .repeat(Math.ceil(targetChars / unit.length))
    .slice(0, targetChars);
}

describe('KnowledgeRetriever', () => {
  it('pins the documented defaults and hard caps', () => {
    expect(DEFAULT_MAX_CHUNKS).toBe(4);
    expect(HARD_MAX_CHUNKS).toBe(6);
    expect(DEFAULT_MAX_KNOWLEDGE_CHARS).toBe(6000);
    expect(HARD_MAX_KNOWLEDGE_CHARS).toBe(8000);
    expect(DEFAULT_MAX_ESTIMATED_TOKENS).toBe(1500);
    expect(HARD_MAX_ESTIMATED_TOKENS).toBe(2000);
    expect(DEFAULT_CACHE_TTL_MS).toBe(10 * 60 * 1000);
  });

  it('returns the configured default number of chunks', () => {
    const chunks = ['a.md', 'b.md', 'c.md', 'd.md'].flatMap((source) => [
      makeChunk({ text: 'alpha', source, ordinal: 1 }),
      makeChunk({ text: 'alpha', source, ordinal: 2 }),
    ]);
    const retriever = new KnowledgeRetriever(new BM25Index(chunks));

    const result = retriever.search('alpha');

    expect(result.chunks).toHaveLength(4);
    expect(result.truncated).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('never returns more than the hard maximum when topK is larger', () => {
    const chunks = ['a.md', 'b.md', 'c.md', 'd.md'].flatMap((source) => [
      makeChunk({ text: 'alpha', source, ordinal: 1 }),
      makeChunk({ text: 'alpha', source, ordinal: 2 }),
    ]);
    const retriever = new KnowledgeRetriever(new BM25Index(chunks), {
      maxChunks: 20,
    });

    const result = retriever.search('alpha', { topK: 99 });

    expect(result.chunks).toHaveLength(HARD_MAX_CHUNKS);
  });

  it('returns at most two chunks from any source file', () => {
    const chunks = [
      ...Array.from({ length: 5 }, (_value, index) =>
        makeChunk({
          text: 'alpha',
          source: 'a.md',
          ordinal: index + 1,
        }),
      ),
      makeChunk({ text: 'alpha', source: 'b.md', ordinal: 1 }),
    ];
    const retriever = new KnowledgeRetriever(new BM25Index(chunks), {
      maxChunks: 6,
    });

    const result = retriever.search('alpha', { topK: 6 });
    const perSource = new Map<string, number>();
    for (const chunk of result.chunks) {
      perSource.set(chunk.source, (perSource.get(chunk.source) ?? 0) + 1);
    }

    expect(perSource.get('a.md')).toBe(2);
    expect(result.chunks.map((chunk) => chunk.source)).toEqual([
      'a.md',
      'a.md',
      'b.md',
    ]);
  });

  it('drops non-positive scores and scores below 20% of the top score', () => {
    const high = makeChunk({ text: 'high', source: 'a.md' });
    const threshold = makeChunk({ text: 'threshold', source: 'b.md' });
    const low = makeChunk({ text: 'low', source: 'c.md' });
    const zero = makeChunk({ text: 'zero', source: 'd.md' });
    const { index } = fakeIndex([
      scored(high, 10),
      scored(threshold, 2),
      scored(low, 1.99),
      scored(zero, 0),
    ]);
    const retriever = new KnowledgeRetriever(index);

    const result = retriever.search('alpha');

    expect(result.chunks.map((chunk) => chunk.source)).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('returns NO_MATCH when no chunk passes the relative threshold', () => {
    const { index } = fakeIndex([scored(makeChunk({ text: 'zero' }), 0)]);
    const retriever = new KnowledgeRetriever(index);

    expect(retriever.search('alpha')).toMatchObject({
      chunks: [],
      totalChars: 0,
      estimatedTokens: 0,
      truncated: false,
      reason: 'NO_MATCH',
    });
  });

  it('skips chunks that would exceed the 6,000-character default budget', () => {
    const chunks = ['a.md', 'b.md', 'c.md', 'd.md'].map((source) =>
      makeChunk({ text: repeatedText(2000), source }),
    );
    const retriever = new KnowledgeRetriever(new BM25Index(chunks));

    const result = retriever.search('alpha', { topK: 6 });

    expect(result.totalChars).toBe(6000);
    expect(result.chunks).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('clamps the character budget to the 8,000-character hard maximum', () => {
    const chunks = ['a.md', 'b.md', 'c.md'].map((source) =>
      makeChunk({ text: repeatedText(3000), source }),
    );
    const retriever = new KnowledgeRetriever(new BM25Index(chunks), {
      maxChars: 9000,
    });

    const result = retriever.search('alpha', { topK: 6 });

    expect(result.totalChars).toBe(6000);
    expect(result.chunks).toHaveLength(2);
    expect(result.totalChars).toBeLessThanOrEqual(HARD_MAX_KNOWLEDGE_CHARS);
  });

  it('enforces the 1,500 estimated-token default without exceeding it', () => {
    const chunks = ['a.md', 'b.md', 'c.md'].flatMap((source) => [
      makeChunk({ text: repeatedText(1200), source, ordinal: 1 }),
      makeChunk({ text: repeatedText(1200), source, ordinal: 2 }),
    ]);
    const retriever = new KnowledgeRetriever(new BM25Index(chunks));

    const result = retriever.search('alpha', { topK: 6 });

    expect(result.estimatedTokens).toBe(1500);
    expect(result.chunks).toHaveLength(5);
    expect(result.estimatedTokens).toBeLessThanOrEqual(
      DEFAULT_MAX_ESTIMATED_TOKENS,
    );
  });

  it('clamps the token budget to 2,000 and respects maxInputTokens', () => {
    const hardChunks = ['a.md', 'b.md', 'c.md'].flatMap((source) => [
      makeChunk({ text: repeatedText(1600), source, ordinal: 1 }),
      makeChunk({ text: repeatedText(1600), source, ordinal: 2 }),
    ]);
    const hardRetriever = new KnowledgeRetriever(new BM25Index(hardChunks), {
      maxEstimatedTokens: 5000,
      maxChars: 8000,
    });
    const hardResult = hardRetriever.search('alpha', { topK: 6 });
    expect(hardResult.chunks).toHaveLength(5);
    expect(hardResult.estimatedTokens).toBeLessThanOrEqual(
      HARD_MAX_ESTIMATED_TOKENS,
    );

    const inputChunks = ['a.md', 'b.md', 'c.md'].map((source) =>
      makeChunk({ text: repeatedText(400), source }),
    );
    const inputRetriever = new KnowledgeRetriever(new BM25Index(inputChunks), {
      maxInputTokens: 250,
    });
    const inputResult = inputRetriever.search('alpha', { topK: 6 });
    expect(inputResult.chunks).toHaveLength(2);
    expect(inputResult.estimatedTokens).toBeLessThanOrEqual(250);
  });

  it('returns an empty safe result for an empty corpus', () => {
    const retriever = new KnowledgeRetriever(new BM25Index([]));

    expect(() => retriever.search('alpha')).not.toThrow();
    expect(retriever.search('alpha')).toEqual({
      chunks: [],
      totalChars: 0,
      estimatedTokens: 0,
      truncated: false,
      reason: 'EMPTY_CORPUS',
    });
    expect(retriever.cacheSize).toBe(0);
  });

  it('returns only chunk excerpts, never a full document', () => {
    const chunks = [
      makeChunk({ text: 'first excerpt', source: 'faq/en.md', ordinal: 1 }),
      makeChunk({ text: 'second excerpt', source: 'faq/en.md', ordinal: 2 }),
    ];
    const retriever = new KnowledgeRetriever(new BM25Index(chunks));

    const result = retriever.search('excerpt', { topK: 2 });

    expect(result.chunks).toHaveLength(2);
    for (const chunk of result.chunks) {
      expect(chunk).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          source: 'faq/en.md',
          title: expect.any(String),
          locale: 'en',
          headingTrail: expect.any(Array),
          text: expect.any(String),
          charCount: expect.any(Number),
          score: expect.any(Number),
        }),
      );
      expect(chunk.text).not.toBe(chunks.map((item) => item.text).join('\n\n'));
      expect(chunk).not.toHaveProperty('document');
      expect(chunk).not.toHaveProperty('blocks');
    }
  });

  it('is deterministic for identical inputs', () => {
    const chunks = [
      makeChunk({ text: 'alpha beta', source: 'b.md', ordinal: 2 }),
      makeChunk({ text: 'alpha beta', source: 'a.md', ordinal: 1 }),
      makeChunk({ text: 'alpha', source: 'c.md', ordinal: 1 }),
    ];
    const index = new BM25Index(chunks);
    const first = new KnowledgeRetriever(index).search('alpha', {
      locale: 'en',
      topK: 3,
    });
    const second = new KnowledgeRetriever(index).search('alpha', {
      locale: 'en',
      topK: 3,
    });

    expect(first).toEqual(second);
  });

  describe('query cache', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('builds SHA-256 keys from the normalized query and locale', () => {
      const english = buildRetrievalCacheKey('alpha', 'en');
      const arabic = buildRetrievalCacheKey('alpha', 'ar');
      const none = buildRetrievalCacheKey('alpha');

      expect(english).toMatch(/^[0-9a-f]{64}$/);
      expect(english).toBe(buildRetrievalCacheKey('alpha', 'en'));
      expect(english).not.toBe(arabic);
      expect(arabic).not.toBe(none);
      expect(none).not.toBe(english);
    });

    it('serves duplicate normalized queries from cache and expires after ten minutes', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const { index, search } = fakeIndex([
        scored(makeChunk({ text: 'alpha' }), 10),
      ]);
      const retriever = new KnowledgeRetriever(index);

      retriever.search(' Alpha\t');
      retriever.search('alpha');
      expect(search).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(DEFAULT_CACHE_TTL_MS - 1);
      retriever.search('alpha');
      expect(search).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      retriever.search('alpha');
      expect(search).toHaveBeenCalledTimes(2);
    });

    it('isolates locales and reuses the full cached selection for smaller topK', () => {
      const chunks = [
        makeChunk({ text: 'alpha', source: 'a.md', ordinal: 1 }),
        makeChunk({ text: 'alpha', source: 'a.md', ordinal: 2 }),
        makeChunk({ text: 'alpha', source: 'b.md', ordinal: 1 }),
      ];
      const index = new BM25Index(chunks);
      const searchSpy = jest.spyOn(index, 'search');
      const retriever = new KnowledgeRetriever(index);

      const one = retriever.search('alpha', { locale: 'en', topK: 1 });
      const four = retriever.search('alpha', { locale: 'en', topK: 4 });
      retriever.search('alpha', { locale: 'ar', topK: 4 });
      retriever.search('alpha', { locale: 'en', topK: 2 });

      expect(one.chunks).toHaveLength(1);
      expect(four.chunks).toHaveLength(3);
      expect(searchSpy).toHaveBeenCalledTimes(2);
      expect(retriever.cacheSize).toBe(2);
    });

    it('evicts the oldest inserted entry when the cache cap is reached', () => {
      const { index, search } = fakeIndex([
        scored(makeChunk({ text: 'alpha' }), 10),
      ]);
      const retriever = new KnowledgeRetriever(index, {
        maxCacheEntries: 2,
      });

      retriever.search('one');
      retriever.search('two');
      retriever.search('three');
      expect(retriever.cacheSize).toBe(2);

      retriever.search('one');
      expect(search).toHaveBeenCalledTimes(4);
      expect(retriever.cacheSize).toBe(2);
    });
  });
});
