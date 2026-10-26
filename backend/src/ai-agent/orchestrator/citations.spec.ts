import type { ToolExecutionResult } from '../tools/tool.types';
import {
  buildDataCitationMap,
  buildKnowledgeCitationMap,
  buildRetrievalCitationMap,
  dataSourcesForToolResult,
  extractCitationIds,
  resolveCitations,
} from './citations';

function success(tool: string, data: unknown): ToolExecutionResult {
  return {
    ok: true,
    tool,
    data,
    meta: { charCount: 0, truncated: false },
  };
}

function failure(tool: string): ToolExecutionResult {
  return {
    ok: false,
    tool,
    error: { code: 'UNAVAILABLE', message: 'Tool is temporarily unavailable.' },
    meta: { charCount: 0, truncated: false },
  };
}

describe('buildKnowledgeCitationMap', () => {
  it('projects knowledge citations and ignores tool or malformed ids', () => {
    const map = buildKnowledgeCitationMap(
      {
        K1: {
          id: 'K1',
          kind: 'knowledge',
          title: 'Basmatak FAQ',
          source: 'faq/en.md',
          heading: 'What is Basmatak?',
        },
        T1: {
          id: 'T1',
          kind: 'tool',
          tool: 'search_opportunities',
        },
        KX: {
          id: 'KX',
          kind: 'knowledge',
          title: 'Ignored',
          source: 'faq/en.md',
        },
      },
      'en',
    );

    expect(map).toEqual({
      K1: {
        id: 'K1',
        title: 'Basmatak FAQ',
        source: 'faq/en.md',
        heading: 'What is Basmatak?',
      },
    });
  });

  it('sanitizes paths, caps text, and supplies a localized fallback title', () => {
    const map = buildKnowledgeCitationMap(
      {
        K1: {
          id: 'K1',
          kind: 'knowledge',
          source: '..\\private\\faq/en.md',
        },
      },
      'ar',
    );

    expect(map.K1.title).toBe('معلومات بصمتك');
    expect(map.K1.source).toBe('private/faq/en.md');
    expect(map.K1.heading).toBeUndefined();
  });
});

describe('data citation projection', () => {
  it('maps opportunity rows to public frontend paths and stable row ids', () => {
    const result = success('search_opportunities', {
      items: [
        { slug: 'beach cleanup', title: 'Beach cleanup' },
        { slug: 'tree-planting' },
      ],
      total: 2,
    });

    expect(dataSourcesForToolResult(result, 'T1', 'en')).toEqual([
      {
        id: 'T1-1',
        citationId: 'T1',
        type: 'opportunity',
        title: 'Beach cleanup',
        path: '/opportunities/beach%20cleanup',
      },
      {
        id: 'T1-2',
        citationId: 'T1',
        type: 'opportunity',
        title: 'tree-planting',
        path: '/opportunities/tree-planting',
      },
    ]);
  });

  it('maps organization rows with a localized fallback title', () => {
    const result = success('search_organizations', {
      items: [{ slug: 'green' }, { slug: 'blue', nameAr: 'الأزرق' }],
    });

    expect(dataSourcesForToolResult(result, 'T2', 'en')).toEqual([
      {
        id: 'T2-1',
        citationId: 'T2',
        type: 'organization',
        title: 'green',
        path: '/orgs/green',
      },
      {
        id: 'T2-2',
        citationId: 'T2',
        type: 'organization',
        title: 'الأزرق',
        path: '/orgs/blue',
      },
    ]);
  });

  it('maps reference data and stats without internal identifiers', () => {
    const reference = success('search_reference_data', {
      skills: [{ nameFr: 'First aid', slug: 'first-aid' }],
      locations: [{ nameAr: 'الجزائر', code: '16' }],
    });
    expect(dataSourcesForToolResult(reference, 'T1', 'fr')).toEqual([
      {
        id: 'T1-1',
        citationId: 'T1',
        type: 'reference',
        title: 'First aid',
      },
      {
        id: 'T1-2',
        citationId: 'T1',
        type: 'reference',
        title: 'الجزائر',
      },
    ]);

    const stats = success('platform_stats', {
      publishedOpportunities: 3,
    });
    expect(dataSourcesForToolResult(stats, 'T3', 'fr')).toEqual([
      {
        id: 'T3-1',
        citationId: 'T3',
        type: 'stats',
        title: 'Statistiques de la plateforme',
      },
    ]);
  });

  it('returns no sources for failures and a generic safe source otherwise', () => {
    expect(
      dataSourcesForToolResult(failure('search_opportunities'), 'T1', 'en'),
    ).toEqual([]);
    expect(
      dataSourcesForToolResult(
        success('future_tool', { value: 1 }),
        'T4',
        'en',
      ),
    ).toEqual([
      {
        id: 'T4-1',
        citationId: 'T4',
        type: 'reference',
        title: 'Public data',
      },
    ]);
  });

  it('builds a map only for well-formed T ids', () => {
    const map = buildDataCitationMap(
      [
        {
          citationId: 'T1',
          result: success('search_opportunities', {
            items: [{ slug: 'beach', title: 'Beach cleanup' }],
          }),
        },
        {
          citationId: 'K1',
          result: success('search_opportunities', {
            items: [{ slug: 'ignored', title: 'Ignored' }],
          }),
        },
        {
          citationId: 'T2',
          result: failure('search_organizations'),
        },
      ],
      'en',
    );

    expect(Object.keys(map)).toEqual(['T1']);
    expect(map.T1[0].path).toBe('/opportunities/beach');
  });
});

describe('resolveCitations', () => {
  const sources = {
    knowledge: {
      K1: {
        id: 'K1',
        title: 'Basmatak FAQ',
        source: 'faq/en.md',
      },
      K2: {
        id: 'K2',
        title: 'Basmatak guide',
        source: 'guides/en.md',
      },
    },
    data: {
      T1: [
        {
          id: 'T1-1',
          citationId: 'T1',
          type: 'opportunity' as const,
          title: 'Beach cleanup',
          path: '/opportunities/beach',
        },
      ],
    },
  };

  it('keeps valid markers, normalizes case, and emits sources in first-use order', () => {
    const resolved = resolveCitations(
      'A [k2] fact, another [K1], and a row [t1].',
      sources,
    );

    expect(resolved.text).toBe('A [K2] fact, another [K1], and a row [T1].');
    expect(resolved.validIds).toEqual(['K2', 'K1', 'T1']);
    expect(resolved.invalidIds).toEqual([]);
    expect(resolved.hasValidCitations).toBe(true);
    expect(resolved.knowledge.map((source) => source.id)).toEqual(['K2', 'K1']);
    expect(resolved.data.map((source) => source.id)).toEqual(['T1-1']);
  });

  it('drops unresolvable ids, including the unused D scheme', () => {
    const resolved = resolveCitations(
      'Keep [K1], drop [K9], [T9], and [D1].',
      sources,
    );

    expect(resolved.text).toBe('Keep [K1], drop , , and .');
    expect(resolved.validIds).toEqual(['K1']);
    expect(resolved.invalidIds).toEqual(['K9', 'T9', 'D1']);
    expect(resolved.hasValidCitations).toBe(true);
  });

  it('keeps valid ids from a mixed marker group and de-duplicates sources', () => {
    const resolved = resolveCitations(
      'Mixed [K1, K9; T1] and repeated [K1] [T1].',
      sources,
    );

    expect(resolved.text).toBe('Mixed [K1][T1] and repeated [K1] [T1].');
    expect(resolved.validIds).toEqual(['K1', 'T1']);
    expect(resolved.invalidIds).toEqual(['K9']);
    expect(resolved.knowledge).toHaveLength(1);
    expect(resolved.data).toHaveLength(1);
  });

  it('reports no grounding when every marker is invalid or absent', () => {
    expect(resolveCitations('No citations here.', sources)).toMatchObject({
      hasValidCitations: false,
      validIds: [],
      knowledge: [],
      data: [],
    });
    expect(resolveCitations('Only [K9].', sources)).toMatchObject({
      text: 'Only .',
      hasValidCitations: false,
      invalidIds: ['K9'],
    });
  });
});

describe('retrieval citations and extraction', () => {
  it('builds K ids from retrieved chunks with a joined heading trail', () => {
    const map = buildRetrievalCitationMap(
      [
        {
          source: 'faq/en.md',
          title: 'Basmatak FAQ',
          headingTrail: ['What is Basmatak?', 'Overview'],
        },
        {
          source: 'guides/en.md',
          title: '',
          headingTrail: [],
        },
      ],
      'en',
    );

    expect(map).toEqual({
      K1: {
        id: 'K1',
        title: 'Basmatak FAQ',
        source: 'faq/en.md',
        heading: 'What is Basmatak? > Overview',
      },
      K2: {
        id: 'K2',
        title: 'Basmatak knowledge',
        source: 'guides/en.md',
      },
    });
  });

  it('extracts normalized unique citation ids without resolving them', () => {
    expect(
      extractCitationIds('A [k1] B [K1, T2] C [T2] D [K9] E [D1]'),
    ).toEqual(['K1', 'T2', 'K9', 'D1']);
  });
});
