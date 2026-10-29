import type { AnswerLink } from './answer-links';
import {
  asksForList,
  normalizeAnswerHref,
  sanitizeAnswer,
} from './answer-sanitizer';

const OPPORTUNITY: AnswerLink = {
  kind: 'opportunity',
  href: '/en/opportunities/beach-cleanup',
  title: 'Beach cleanup',
};

describe('answer-sanitizer', () => {
  it('strips citation markers from the final answer', () => {
    expect(
      sanitizeAnswer('Basmatak is a platform [K1] and [T2].', {
        locale: 'en',
      }),
    ).toBe('Basmatak is a platform and.');
    expect(
      sanitizeAnswer('Basmatak is a platform [D1].', { locale: 'en' }),
    ).toBe('Basmatak is a platform.');
  });

  it('removes attribution phrases without removing the answer', () => {
    expect(
      sanitizeAnswer('According to the knowledge, Basmatak is a platform.', {
        locale: 'en',
      }),
    ).toBe('Basmatak is a platform.');
    expect(
      sanitizeAnswer('Basmatak is a platform. This is based on the guide.', {
        locale: 'en',
      }),
    ).toBe('Basmatak is a platform.');
  });

  it('removes trailing source and reference sections', () => {
    const answer = [
      'Basmatak is a platform.',
      '',
      'Sources:',
      '- Basmatak FAQ [K1]',
      '- Public opportunities [T1]',
    ].join('\n');
    expect(sanitizeAnswer(answer, { locale: 'en' })).toBe(
      'Basmatak is a platform.',
    );

    const arabic = [
      'بصمتك منصة تطوع.',
      '',
      'المصادر:',
      '- ملف المنصة [K1]',
    ].join('\n');
    expect(sanitizeAnswer(arabic, { locale: 'ar' })).toBe('بصمتك منصة تطوع.');
  });

  it('removes source and internal-implementation wording', () => {
    for (const answer of [
      'The source is the platform.',
      'I found this in the knowledge base.',
      'The tool returned this result.',
      'The database stores this.',
      'The server sends this.',
      'The platform uses Next.js.',
    ]) {
      expect(sanitizeAnswer(answer, { locale: 'en' })).toBe('');
    }
  });

  it('keeps only an allowed locale-prefixed entity link', () => {
    expect(
      sanitizeAnswer('See [Beach cleanup](/opportunities/beach-cleanup).', {
        locale: 'en',
        allowedLinks: [OPPORTUNITY],
      }),
    ).toBe('See [Beach cleanup](/en/opportunities/beach-cleanup).');

    expect(
      sanitizeAnswer('See [Beach cleanup](/ar/opportunities/beach-cleanup).', {
        locale: 'en',
        allowedLinks: [OPPORTUNITY],
      }),
    ).toBe('See [Beach cleanup](/en/opportunities/beach-cleanup).');
  });

  it('turns an invented slug into plain text', () => {
    expect(
      sanitizeAnswer('See [Fake](/opportunities/fake-opportunity).', {
        locale: 'en',
        allowedLinks: [OPPORTUNITY],
      }),
    ).toBe('See Fake.');
  });

  it('turns external and unsafe links into plain text', () => {
    expect(
      sanitizeAnswer('See [example](https://evil.example/path).', {
        locale: 'en',
      }),
    ).toBe('See example.');
    expect(
      sanitizeAnswer('See [this](javascript:alert(1)).', { locale: 'en' }),
    ).toBe('See this.');
  });

  it('allows a general browse link only when the user asked to browse', () => {
    const answer = 'You can start from [Browse opportunities](/opportunities).';
    expect(
      sanitizeAnswer(answer, { locale: 'en', allowBrowseLinks: false }),
    ).toBe('You can start from Browse opportunities.');
    expect(
      sanitizeAnswer(answer, { locale: 'en', allowBrowseLinks: true }),
    ).toBe('You can start from [Browse opportunities](/en/opportunities).');
  });

  it('keeps at most three links and one general browse link', () => {
    const links: AnswerLink[] = [
      OPPORTUNITY,
      {
        kind: 'opportunity',
        href: '/en/opportunities/tree-planting',
        title: 'Tree planting',
      },
      {
        kind: 'organization',
        href: '/en/orgs/green-earth',
        title: 'Green Earth',
      },
      {
        kind: 'organization',
        href: '/en/orgs/blue-sky',
        title: 'Blue sky',
      },
    ];
    const answer = [
      '[Beach cleanup](/opportunities/beach-cleanup)',
      '[Tree planting](/opportunities/tree-planting)',
      '[Green Earth](/orgs/green-earth)',
      '[Blue sky](/orgs/blue-sky)',
      '[Browse opportunities](/opportunities)',
      '[Browse talents](/talents)',
    ].join(' ');
    const sanitized = sanitizeAnswer(answer, {
      locale: 'en',
      allowedLinks: links,
      allowBrowseLinks: true,
    });
    expect((sanitized.match(/\]\(/g) ?? []).length).toBe(3);
    expect(sanitized).not.toContain('/talents');
  });

  it('strips headings, bold, and raw external URLs', () => {
    expect(
      sanitizeAnswer(
        '# Basmatak\n**Basmatak** is a platform. Visit https://evil.example now.',
        {
          locale: 'en',
        },
      ),
    ).toBe('Basmatak\nBasmatak is a platform. Visit now.');
  });

  it('removes list bullets unless the user asked for a list', () => {
    const answer = '- One\n- Two\n- Three';
    expect(sanitizeAnswer(answer, { locale: 'en' })).toBe('One\nTwo\nThree');
    expect(sanitizeAnswer(answer, { locale: 'en', allowLists: true })).toBe(
      '- One\n- Two\n- Three',
    );
  });

  it('normalizes and rejects unsafe internal paths', () => {
    expect(normalizeAnswerHref('/opportunities/beach', 'ar')).toBe(
      '/ar/opportunities/beach',
    );
    expect(normalizeAnswerHref('/en/orgs/green', 'ar')).toBe('/ar/orgs/green');
    for (const value of [
      '/orgs',
      '/volunteers/me',
      '/admin',
      'https://evil.example',
      '//evil.example',
      '/opportunities/../admin',
      '/opportunities/%2e%2e/admin',
      'javascript:alert(1)',
    ]) {
      expect(normalizeAnswerHref(value, 'en')).toBeNull();
    }
  });

  it('detects list or step requests', () => {
    expect(asksForList('How do I apply?')).toBe(true);
    expect(asksForList('List the steps')).toBe(true);
    expect(asksForList('كيف أقدم؟')).toBe(true);
    expect(asksForList('What is Basmatak?')).toBe(false);
  });
});
