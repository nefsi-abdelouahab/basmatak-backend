import {
  EVAL_QUERIES,
  EVAL_TARGET_TOP4_RECALL,
  EvalQuery,
  buildEvalReport,
} from './ai-eval';

function query(id: string, expectedSource: string, coreFaq = false): EvalQuery {
  return {
    id,
    query: `query ${id}`,
    locale: 'en',
    expectedSource,
    coreFaq,
  };
}

function observations(
  entries: Record<string, readonly string[]>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(Object.entries(entries));
}

describe('ai-eval recall logic', () => {
  const queries = [
    query('q1', 'faq/en.md', true),
    query('q2', 'policies/en.md', true),
    query('q3', 'guides/en.md'),
    query('q4', 'data/glossary.csv'),
    query('q5', 'data/topics.json'),
  ];

  it('calculates top-4 and top-6 recall and empty results', () => {
    const report = buildEvalReport(
      queries,
      observations({
        q1: ['faq/en.md', 'policies/en.md'],
        q2: ['policies/en.md'],
        q3: ['guides/en.md'],
        q4: ['data/glossary.csv'],
        q5: [
          'policies/en.md',
          'faq/en.md',
          'guides/en.md',
          'data/glossary.csv',
          'data/topics.json',
        ],
      }),
    );

    expect(report.queryCount).toBe(5);
    expect(report.top4Hits).toBe(4);
    expect(report.top6Hits).toBe(5);
    expect(report.top4Recall).toBeCloseTo(0.8);
    expect(report.top6Recall).toBe(1);
    expect(report.emptyResults).toBe(0);
    expect(report.coreFaqTotal).toBe(2);
    expect(report.coreFaqTop4Hits).toBe(2);
    expect(report.coreFaqMisses).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('requires every core FAQ query to pass even when overall recall is high', () => {
    const report = buildEvalReport(
      queries,
      observations({
        q1: ['policies/en.md'],
        q2: ['policies/en.md'],
        q3: ['guides/en.md'],
        q4: ['data/glossary.csv'],
        q5: ['data/topics.json'],
      }),
    );

    expect(report.top4Hits).toBe(4);
    expect(report.top4Recall).toBeCloseTo(0.8);
    expect(report.coreFaqTop4Hits).toBe(1);
    expect(report.coreFaqMisses).toHaveLength(1);
    expect(report.coreFaqMisses[0]).toMatchObject({
      id: 'q1',
      expectedSource: 'faq/en.md',
      coreFaq: true,
    });
    expect(report.passed).toBe(false);
  });

  it('fails when top-4 recall is below the target even without core queries', () => {
    const report = buildEvalReport(
      queries,
      observations({
        q1: ['faq/en.md'],
        q2: ['policies/en.md'],
        q3: ['guides/en.md'],
        q4: ['faq/en.md', 'policies/en.md', 'guides/en.md', 'data/topics.json'],
        q5: [],
      }),
    );

    expect(report.top4Hits).toBe(3);
    expect(report.top4Recall).toBeCloseTo(0.6);
    expect(report.top4Recall).toBeLessThan(EVAL_TARGET_TOP4_RECALL);
    expect(report.passed).toBe(false);
  });

  it('counts empty results and reports empty top files on a miss', () => {
    const report = buildEvalReport(
      queries,
      observations({
        q1: [],
        q2: ['policies/en.md'],
        q3: ['guides/en.md'],
        q4: ['data/glossary.csv'],
        q5: ['data/topics.json'],
      }),
    );

    expect(report.emptyResults).toBe(1);
    expect(report.misses).toHaveLength(1);
    expect(report.misses[0]).toMatchObject({
      id: 'q1',
      expectedSource: 'faq/en.md',
      topSources: [],
      coreFaq: true,
    });
    expect(report.passed).toBe(false);
  });

  it('treats positions four and five as top-6-only hits', () => {
    const report = buildEvalReport(
      [query('q1', 'faq/en.md')],
      observations({
        q1: ['a.md', 'b.md', 'c.md', 'd.md', 'faq/en.md'],
      }),
    );

    expect(report.results[0]).toMatchObject({
      foundAt: 4,
      top4Hit: false,
      top6Hit: true,
    });
    expect(report.top4Hits).toBe(0);
    expect(report.top6Hits).toBe(1);
  });

  it('exposes a committed evaluation set with must-pass FAQ queries', () => {
    expect(EVAL_QUERIES.length).toBeGreaterThanOrEqual(25);
    expect(EVAL_QUERIES.some((entry) => entry.coreFaq === true)).toBe(true);
    expect(
      EVAL_QUERIES.filter((entry) => entry.coreFaq === true).every((entry) =>
        /^0[1-9]-[a-z-]+\/.+\/(en|ar)\.md$/.test(entry.expectedSource),
      ),
    ).toBe(true);
    expect(EVAL_QUERIES.some((entry) => entry.locale === 'ar')).toBe(true);
    expect(
      EVAL_QUERIES.some((entry) => entry.expectedSource.endsWith('.csv')),
    ).toBe(true);
    expect(
      EVAL_QUERIES.some((entry) => entry.expectedSource.endsWith('.json')),
    ).toBe(true);
  });
});
