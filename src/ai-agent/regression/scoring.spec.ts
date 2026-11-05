import {
  scoreLanguage,
  scoreLinks,
  scorePromise,
  scoreSafety,
  scoreToolArgs,
  scoreToolChoice,
} from './scoring';
import type { RegressionTurnExpectation } from './types';

const EMPTY_EXPECTATION: RegressionTurnExpectation = {};

describe('conversation regression scoring', () => {
  it('accepts the expected focused slug', () => {
    const check = scoreToolArgs(
      [
        {
          name: 'search_opportunities',
          arguments: { slugs: ['beach-cleanup'], limit: 1 },
        },
      ],
      { kind: 'slugs', slugs: ['beach-cleanup'] },
      'Tell me about the first one',
    );

    expect(check.pass).toBe(true);
  });

  it('rejects an exact slug argument that is the whole user sentence', () => {
    const message = 'Tell me about the first one';
    const check = scoreToolArgs(
      [
        {
          name: 'search_opportunities',
          arguments: { slugs: [message] },
        },
      ],
      { kind: 'slugs', slugs: ['beach-cleanup'] },
      message,
    );

    expect(check.pass).toBe(false);
    expect(check.reason).toContain('whole user sentence');
  });

  it('fails a forbidden tool call', () => {
    const check = scoreToolChoice(['platform_stats'], {
      mustNotCall: ['platform_stats'],
    });

    expect(check.pass).toBe(false);
    expect(check.reason).toContain('forbidden tool ran');
  });

  it('flags citation markers and a sources event', () => {
    const citation = scoreSafety(
      'The answer is here [K1].',
      [],
      EMPTY_EXPECTATION,
      false,
      1,
    );
    expect(citation.pass).toBe(false);

    const sources = scoreSafety(
      'The answer is here.',
      ['token', 'sources'],
      EMPTY_EXPECTATION,
      false,
      1,
    );
    expect(sources.pass).toBe(false);
  });

  it('does not treat the Arabic word for review as source wording', () => {
    const check = scoreSafety(
      'تنتقل الطلبات إلى قيد المراجعة ثم تصبح مقبولة أو مرفوضة.',
      ['token'],
      EMPTY_EXPECTATION,
      false,
      1,
    );

    expect(check.pass).toBe(true);
  });

  it('rejects a promise-only answer', () => {
    expect(scorePromise('Let me check that for you.').pass).toBe(false);
    expect(scorePromise('سأتحقق من ذلك.').pass).toBe(false);
    expect(scorePromise('The policy explains deletion.').pass).toBe(true);
  });

  it('requires locale-prefixed links and expected entities', () => {
    expect(
      scoreLinks(
        'See [Beach cleanup](/en/opportunities/beach-cleanup).',
        'en',
        { expectedLinks: ['/en/opportunities/beach-cleanup'] },
      ).pass,
    ).toBe(true);

    const wrongLocale = scoreLinks(
      'See [Beach cleanup](/ar/opportunities/beach-cleanup).',
      'en',
      {},
    );
    expect(wrongLocale.pass).toBe(false);

    const missing = scoreLinks('No links here.', 'en', {
      expectedLinks: ['/en/orgs/nour-association'],
    });
    expect(missing.pass).toBe(false);
  });

  it('rejects an empty or wrong-language answer', () => {
    expect(scoreLanguage('', 'ar').pass).toBe(false);
    expect(scoreLanguage('English only.', 'ar').pass).toBe(false);
    expect(scoreLanguage('إجابة عربية.', 'en').pass).toBe(false);
    expect(scoreLanguage('إجابة عربية.', 'ar').pass).toBe(true);
    expect(scoreLanguage('English answer.', 'en').pass).toBe(true);
  });
});
