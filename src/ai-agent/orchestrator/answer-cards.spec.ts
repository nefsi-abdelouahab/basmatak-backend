import type { ToolExecutionResult } from '../tools/tool.types';
import { buildAnswerCards } from './answer-cards';
import type { CitableToolResult } from './citations';

function result(tool: string, data: unknown): ToolExecutionResult {
  return {
    ok: true,
    tool,
    data,
    meta: { charCount: 0, truncated: false },
  };
}

function citable(tool: string, data: unknown): CitableToolResult {
  return { citationId: 'T1', result: result(tool, data) };
}

function opportunityRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `opportunity-${index + 1}`,
    title: `Opportunity ${index + 1}`,
  }));
}

describe('buildAnswerCards', () => {
  it('keeps only entity cards whose href survived sanitization', () => {
    const cards = buildAnswerCards({
      results: [
        citable('search_opportunities', {
          items: opportunityRows(3),
        }),
      ],
      answer:
        'Try [Opportunity 1](/en/opportunities/opportunity-1) and [Opportunity 3](/en/opportunities/opportunity-3).',
      locale: 'en',
    });

    expect(cards).toEqual([
      {
        kind: 'opportunity',
        slug: 'opportunity-1',
        title: 'Opportunity 1',
        href: '/en/opportunities/opportunity-1',
      },
      {
        kind: 'opportunity',
        slug: 'opportunity-3',
        title: 'Opportunity 3',
        href: '/en/opportunities/opportunity-3',
      },
    ]);
  });

  it('emits no cards when the answer has no allowlisted links', () => {
    expect(
      buildAnswerCards({
        results: [
          citable('search_opportunities', { items: opportunityRows(2) }),
        ],
        answer: 'I could not find a matching opportunity.',
        locale: 'en',
      }),
    ).toEqual([]);
  });

  it('caps cards at six and de-duplicates repeated hrefs', () => {
    const rows = opportunityRows(8);
    const answer = rows
      .map((row) => `[${row.title}](/en/opportunities/${row.slug})`)
      .concat('[Duplicate](/en/opportunities/opportunity-1)')
      .join(' ');

    const cards = buildAnswerCards({
      results: [
        citable('search_opportunities', { items: rows }),
        citable('search_opportunities', { items: rows }),
      ],
      answer,
      locale: 'en',
    });

    expect(cards).toHaveLength(6);
    expect(new Set(cards.map((card) => 'href' in card && card.href)).size).toBe(
      6,
    );
  });

  it('projects only public opportunity fields', () => {
    const cards = buildAnswerCards({
      results: [
        citable('search_opportunities', {
          items: [
            {
              _id: 'internal-id',
              slug: 'beach-cleanup',
              title: 'Beach cleanup',
              status: 'published',
              mode: 'onsite',
              startDate: '2026-11-01T00:00:00.000Z',
              applicationDeadline: '2026-11-30T00:00:00.000Z',
              openPositions: 4,
              organization: {
                id: 'org-id',
                slug: 'green-earth',
                nameAr: 'الأرض الخضراء',
                nameFr: 'Green Earth',
                contact: 'private@example.com',
                phone: '0555000000',
              },
              locationNames: {
                wilaya: { ar: 'الجزائر', fr: 'Alger' },
                municipality: { ar: 'باب الوادي', fr: 'Bab El Oued' },
              },
              contact: { email: 'private@example.com', phone: '0555000000' },
            },
          ],
        }),
      ],
      answer:
        'See [Beach cleanup](/ar/opportunities/beach-cleanup) for details.',
      locale: 'ar',
    });

    expect(cards).toEqual([
      {
        kind: 'opportunity',
        slug: 'beach-cleanup',
        title: 'Beach cleanup',
        organizationName: { ar: 'الأرض الخضراء', fr: 'Green Earth' },
        wilayaName: { ar: 'الجزائر', fr: 'Alger' },
        startDate: '2026-11-01T00:00:00.000Z',
        applicationDeadline: '2026-11-30T00:00:00.000Z',
        openPositions: 4,
        mode: 'onsite',
        status: 'published',
        href: '/ar/opportunities/beach-cleanup',
      },
    ]);

    const serialized = JSON.stringify(cards);
    expect(serialized).not.toContain('internal-id');
    expect(serialized).not.toContain('org-id');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('0555000000');
    expect(serialized).not.toContain('contact');
    expect(serialized).not.toContain('_id');
  });

  it('projects organizations with only public identity fields', () => {
    const cards = buildAnswerCards({
      results: [
        citable('search_organizations', {
          items: [
            {
              _id: 'internal-id',
              slug: 'green-earth',
              nameAr: 'الأرض الخضراء',
              nameFr: 'Green Earth',
              type: 'association',
              foundedYear: 2014,
              website: 'https://example.org',
              location: { wilaya: '16', municipality: '1601' },
            },
          ],
        }),
      ],
      answer: 'Visit [Green Earth](/en/orgs/green-earth).',
      locale: 'en',
    });

    expect(cards).toEqual([
      {
        kind: 'organization',
        slug: 'green-earth',
        nameAr: 'الأرض الخضراء',
        nameFr: 'Green Earth',
        type: 'association',
        foundedYear: 2014,
        href: '/en/orgs/green-earth',
      },
    ]);
    expect(JSON.stringify(cards)).not.toContain('internal-id');
    expect(JSON.stringify(cards)).not.toContain('example.org');
  });

  it('adds the public stats card only alongside a linked entity', () => {
    const stats = {
      publishedOpportunities: 11,
      verifiedOrganizations: 4,
      activeSkills: 9,
      wilayas: 58,
      municipalities: 1541,
    };

    const withEntity = buildAnswerCards({
      results: [
        citable('platform_stats', stats),
        citable('search_opportunities', { items: opportunityRows(1) }),
      ],
      answer: 'See [Opportunity 1](/en/opportunities/opportunity-1).',
      locale: 'en',
    });
    expect(withEntity).toHaveLength(2);
    expect(withEntity[1]).toEqual({ kind: 'stats', ...stats });

    const statsOnly = buildAnswerCards({
      results: [citable('platform_stats', stats)],
      answer: 'Browse [opportunities](/en/opportunities).',
      locale: 'en',
    });
    expect(statsOnly).toEqual([]);
  });
});
