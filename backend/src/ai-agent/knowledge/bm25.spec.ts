import {
  BODY_FIELD_WEIGHT,
  BM25Index,
  DEFAULT_BM25_B,
  DEFAULT_BM25_K1,
  HEADING_FIELD_WEIGHT,
  LOCALE_MATCH_MULTIPLIER,
  TAG_FIELD_WEIGHT,
  TITLE_FIELD_WEIGHT,
  priorityMultiplier,
} from './bm25';
import { KnowledgeChunk } from './knowledge.types';
import { KnowledgeNormalizer } from './normalizer';

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

describe('BM25Index', () => {
  it('pins the documented defaults and field weights', () => {
    expect(DEFAULT_BM25_K1).toBe(1.2);
    expect(DEFAULT_BM25_B).toBe(0.75);
    expect([
      BODY_FIELD_WEIGHT,
      TITLE_FIELD_WEIGHT,
      HEADING_FIELD_WEIGHT,
      TAG_FIELD_WEIGHT,
    ]).toEqual([1, 3, 2, 2]);
    expect(LOCALE_MATCH_MULTIPLIER).toBe(1.15);
    expect([1, 2, 3, 4, 5].map(priorityMultiplier)).toEqual([
      1.2, 1.15, 1.1, 1.05, 1,
    ]);
  });

  it('ranks chunks that match more query terms first', () => {
    const index = new BM25Index([
      makeChunk({ text: 'alpha beta', source: 'a.md' }),
      makeChunk({ text: 'alpha', source: 'b.md' }),
    ]);

    const results = index.search('alpha beta');

    expect(results).toHaveLength(2);
    expect(results[0].chunk.source).toBe('a.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('uses higher IDF for terms that appear in fewer chunks', () => {
    const index = new BM25Index([
      makeChunk({ text: 'rare filler', source: 'a.md' }),
      makeChunk({ text: 'common filler', source: 'b.md' }),
      makeChunk({ text: 'common filler', source: 'c.md' }),
    ]);

    expect(index.getDocumentFrequency('rare')).toBe(1);
    expect(index.getDocumentFrequency('common')).toBe(2);

    const results = index.search('rare common');
    expect(results[0].chunk.source).toBe('a.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('rewards higher term frequency', () => {
    const index = new BM25Index([
      makeChunk({ text: 'alpha alpha beta', source: 'a.md' }),
      makeChunk({ text: 'alpha beta beta', source: 'b.md' }),
    ]);

    const results = index.search('alpha');
    expect(results[0].chunk.source).toBe('a.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('applies the documented k1 formula', () => {
    const chunk = makeChunk({ text: 'alpha alpha beta beta', priority: 3 });
    const index = new BM25Index([chunk]);
    const result = index.search('alpha')[0];

    const idf = Math.log(4 / 3);
    const tfNorm = (2 * (DEFAULT_BM25_K1 + 1)) / (2 + DEFAULT_BM25_K1);
    expect(result.score).toBeCloseTo(idf * tfNorm * priorityMultiplier(3), 10);
  });

  it('makes k1=0 score independent of term frequency', () => {
    const idf = Math.log(4 / 3);
    const index = new BM25Index(
      [makeChunk({ text: 'alpha alpha beta beta', priority: 1 })],
      { k1: 0 },
    );

    const result = index.search('alpha')[0];
    expect(result.score).toBeCloseTo(idf * 1.2, 10);
  });

  it('disables length normalization at b=0 and penalizes long chunks at b=1', () => {
    const chunks = [
      makeChunk({ text: 'alpha', source: 'a.md' }),
      makeChunk({ text: 'alpha filler filler filler', source: 'b.md' }),
    ];

    const noNormalization = new BM25Index(chunks, { b: 0 });
    const equalScores = noNormalization.search('alpha');
    expect(equalScores[0].score).toBeCloseTo(equalScores[1].score, 10);

    const fullNormalization = new BM25Index(chunks, { b: 1 });
    const penalized = fullNormalization.search('alpha');
    expect(penalized[0].chunk.source).toBe('a.md');
    expect(penalized[0].score).toBeGreaterThan(penalized[1].score);
  });

  it('boosts title, heading, and tag terms over body terms', () => {
    const query = 'alpha';
    const bodyScore = new BM25Index([makeChunk({ text: 'alpha' })]).search(
      query,
    )[0].score;
    const titleScore = new BM25Index([
      makeChunk({ text: 'filler', title: 'alpha' }),
    ]).search(query)[0].score;
    const headingScore = new BM25Index([
      makeChunk({ text: 'filler', headingTrail: ['alpha'] }),
    ]).search(query)[0].score;
    const tagScore = new BM25Index([
      makeChunk({ text: 'filler', tags: ['alpha'] }),
    ]).search(query)[0].score;

    expect(titleScore).toBeGreaterThan(bodyScore);
    expect(headingScore).toBeGreaterThan(bodyScore);
    expect(tagScore).toBeGreaterThan(bodyScore);
    expect(headingScore).toBeCloseTo(tagScore, 10);
    expect(titleScore).toBeGreaterThan(headingScore);
  });

  it('applies the matching-locale multiplier only when a locale is requested', () => {
    const index = new BM25Index([
      makeChunk({ text: 'alpha', source: 'a.md', locale: 'en' }),
      makeChunk({ text: 'alpha', source: 'b.md', locale: 'ar' }),
    ]);

    const neutral = index.search('alpha');
    expect(neutral[0].score).toBeCloseTo(neutral[1].score, 10);

    const english = index.search('alpha', { locale: 'en' });
    expect(english[0].chunk.locale).toBe('en');
    expect(english[0].score / english[1].score).toBeCloseTo(
      LOCALE_MATCH_MULTIPLIER,
      10,
    );

    const arabic = index.search('alpha', { locale: 'ar' });
    expect(arabic[0].chunk.locale).toBe('ar');
    expect(arabic[0].score).toBeGreaterThan(arabic[1].score);
  });

  it('applies the priority multiplier from 1.20 down to 1.00', () => {
    const index = new BM25Index([
      makeChunk({ text: 'alpha', source: 'a.md', priority: 1 }),
      makeChunk({ text: 'alpha', source: 'b.md', priority: 5 }),
    ]);

    const results = index.search('alpha');
    expect(results[0].chunk.priority).toBe(1);
    expect(results[0].score / results[1].score).toBeCloseTo(1.2, 10);
  });

  it('expands synonyms with a lower weight than the original query term', () => {
    const normalizer = new KnowledgeNormalizer({
      synonyms: [['opportunity', 'فرصة', 'opportunité']],
    });
    const index = new BM25Index(
      [
        makeChunk({ text: 'opportunity', source: 'a.md', locale: 'en' }),
        makeChunk({ text: 'فرصة', source: 'b.md', locale: 'ar' }),
      ],
      { normalizer },
    );

    const results = index.search('opportunity');
    expect(results).toHaveLength(2);
    expect(results[0].chunk.source).toBe('a.md');
    expect(results[0].score / results[1].score).toBeCloseTo(2, 10);

    const noSynonyms = new BM25Index([
      makeChunk({ text: 'فرصة', source: 'b.md', locale: 'ar' }),
    ]);
    expect(noSynonyms.search('opportunity')).toEqual([]);
  });

  it('adds a secondary clitic variant so وال/بال/لل queries match bare terms', () => {
    const index = new BM25Index([
      makeChunk({
        text: 'التسجيل وتسجيل الدخول إلى المنصة.',
        source: 'account/ar.md',
        locale: 'ar',
      }),
      makeChunk({
        text: 'موضوع آخر لا علاقة له.',
        source: 'other/ar.md',
        locale: 'ar',
      }),
    ]);

    const results = index.search('والتسجيل');
    expect(results).toHaveLength(1);
    expect(results[0].chunk.source).toBe('account/ar.md');
  });

  it('keeps the original clitic token primary over the stripped variant', () => {
    const index = new BM25Index([
      makeChunk({ text: 'بالفرص', source: 'exact/ar.md', locale: 'ar' }),
      makeChunk({ text: 'فرص', source: 'stripped/ar.md', locale: 'ar' }),
    ]);

    const results = index.search('بالفرص');
    expect(results.map((result) => result.chunk.source)).toEqual([
      'exact/ar.md',
      'stripped/ar.md',
    ]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('does not match clitic variants across scripts', () => {
    const index = new BM25Index([
      makeChunk({ text: 'opportunity', source: 'en.md' }),
    ]);
    expect(index.search('بالفرص')).toEqual([]);
  });

  it('breaks ties deterministically by priority, source, ordinal, and id', () => {
    const sourceTie = new BM25Index([
      makeChunk({ text: 'alpha', source: 'b.md' }),
      makeChunk({ text: 'alpha', source: 'a.md' }),
    ]);
    expect(sourceTie.search('alpha').map((item) => item.chunk.source)).toEqual([
      'a.md',
      'b.md',
    ]);

    const ordinalTie = new BM25Index([
      makeChunk({ text: 'alpha', source: 'a.md', ordinal: 2 }),
      makeChunk({ text: 'alpha', source: 'a.md', ordinal: 1 }),
    ]);
    expect(
      ordinalTie.search('alpha').map((item) => item.chunk.ordinal),
    ).toEqual([1, 2]);

    const idTie = new BM25Index([
      makeChunk({ id: 'z#1', text: 'alpha', source: 'a.md', ordinal: 1 }),
      makeChunk({ id: 'a#1', text: 'alpha', source: 'a.md', ordinal: 1 }),
    ]);
    expect(idTie.search('alpha').map((item) => item.chunk.id)).toEqual([
      'a#1',
      'z#1',
    ]);
  });

  it('retries stopword-only identity queries without removing stopwords', () => {
    const index = new BM25Index([
      makeChunk({
        text: 'Who are you? I am Basma, the Basmatak Assistant.',
        source: 'about-basma/en.md',
        locale: 'en',
      }),
      makeChunk({
        text: 'من أنت؟ أنا بصمة، مساعدتك في منصة بصمتك.',
        source: 'about-basma/ar.md',
        locale: 'ar',
      }),
    ]);

    expect(index.search('who are you')[0].chunk.source).toBe(
      'about-basma/en.md',
    );
    expect(index.search('من أنت')[0].chunk.source).toBe('about-basma/ar.md');
  });

  it('returns no results for an empty index, blank query, or unknown terms', () => {
    const empty = new BM25Index([]);
    expect(empty.size).toBe(0);
    expect(empty.search('anything')).toEqual([]);

    const index = new BM25Index([makeChunk({ text: 'alpha' })]);
    expect(index.search('   ')).toEqual([]);
    expect(index.search('unknown')).toEqual([]);
    expect(index.search('the and of')).toEqual([]);
  });

  it('honors a result limit after deterministic sorting', () => {
    const index = new BM25Index([
      makeChunk({ text: 'alpha', source: 'a.md' }),
      makeChunk({ text: 'alpha', source: 'b.md' }),
      makeChunk({ text: 'alpha', source: 'c.md' }),
    ]);

    expect(index.search('alpha', { limit: 2 })).toHaveLength(2);
    expect(index.search('alpha', { limit: 0 })).toEqual([]);
  });
});
