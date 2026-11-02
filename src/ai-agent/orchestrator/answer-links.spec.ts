import type { ToolExecutionResult } from '../tools/tool.types';
import {
  allowsBrowseLinks,
  buildAnswerLinks,
  buildBrowseLinks,
} from './answer-links';
import type { CitableToolResult } from './citations';

function result(tool: string, data: unknown, ok = true): ToolExecutionResult {
  if (ok) {
    return {
      ok: true,
      tool,
      data,
      meta: { charCount: 0, truncated: false },
    };
  }
  return {
    ok: false,
    tool,
    error: { code: 'UNAVAILABLE', message: 'No.' },
    meta: { charCount: 0, truncated: false },
  };
}

function citable(tool: string, data: unknown, ok = true): CitableToolResult {
  return { citationId: 'T1', result: result(tool, data, ok) };
}

describe('answer-links', () => {
  it('builds locale-prefixed opportunity and organization links', () => {
    expect(
      buildAnswerLinks(
        [
          citable('search_opportunities', {
            items: [{ slug: 'beach-cleanup', title: 'Beach cleanup' }],
          }),
          citable('search_organizations', {
            items: [
              {
                slug: 'green-earth',
                nameAr: 'الأرض الخضراء',
                nameFr: 'Green Earth',
              },
            ],
          }),
        ],
        'ar',
      ),
    ).toEqual([
      {
        kind: 'opportunity',
        href: '/ar/opportunities/beach-cleanup',
        title: 'Beach cleanup',
      },
      {
        kind: 'organization',
        href: '/ar/orgs/green-earth',
        title: 'Green Earth',
      },
    ]);
  });

  it('builds a public volunteer link only from a returned username', () => {
    expect(
      buildAnswerLinks(
        [
          citable('search_volunteers', {
            items: [{ username: 'sara', name: 'Sara' }],
          }),
        ],
        'en',
      ),
    ).toEqual([
      {
        kind: 'volunteer',
        href: '/en/volunteers/sara',
        title: 'Sara',
      },
    ]);
  });

  it('ignores failed results, missing slugs, and private volunteer paths', () => {
    expect(
      buildAnswerLinks(
        [
          citable(
            'search_opportunities',
            { items: [{ slug: 'beach', title: 'Beach' }] },
            false,
          ),
          citable('search_opportunities', {
            items: [{ title: 'No slug' }],
          }),
          citable('search_volunteers', {
            items: [{ username: 'me', name: 'Me' }],
          }),
          citable('search_volunteers', {
            items: [{ username: '../admin', name: 'Bad' }],
          }),
        ],
        'en',
      ),
    ).toEqual([]);
  });

  it('offers only the two real general browse pages', () => {
    expect(buildBrowseLinks('en')).toEqual([
      {
        kind: 'browse',
        href: '/en/opportunities',
        title: 'Browse opportunities',
      },
      {
        kind: 'browse',
        href: '/en/talents',
        title: 'Browse talents',
      },
    ]);
  });

  it('detects real browse questions in English and Arabic', () => {
    for (const message of [
      'Where can I browse opportunities?',
      'How do I find volunteering opportunities?',
      'أين أجد الفرص؟',
      'وين نلقى المواهب؟',
    ]) {
      expect(allowsBrowseLinks(message)).toBe(true);
    }
    for (const message of [
      'Show me current opportunities',
      'What is Basmatak?',
      'كيف أقدم على فرصة؟',
      '',
    ]) {
      expect(allowsBrowseLinks(message)).toBe(false);
    }
  });
});
