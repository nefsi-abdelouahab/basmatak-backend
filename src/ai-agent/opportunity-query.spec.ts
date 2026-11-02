import {
  buildOpportunitySearchText,
  isGenericOpportunityBrowse,
} from './opportunity-query';

describe('opportunity query helper', () => {
  it.each([
    'ما هي الفرص المتوفرة',
    'ما الفرص المتاحة',
    'اعرض لي الفرص',
    'أريد فرصة تطوعية',
    'هل توجد فرص',
    'فرص تطوع',
    'What opportunities are available',
    'show me opportunities',
    'any volunteering opportunities?',
  ])('strips generic browse wording from %s', (message) => {
    expect(buildOpportunitySearchText(message)).toBe('');
    expect(isGenericOpportunityBrowse(message, true)).toBe(true);
  });

  it.each([
    ['فرص في وهران', 'وهران'],
    ['opportunities in Oran', 'oran'],
    ['أعطني فرصة تطوعية في البرمجة', 'البرمجه'],
    ['Show me the latest remote opportunities', 'remote'],
    ['فرص تطوعية في البرمجة بوهران', 'البرمجه بوهران'],
  ])('keeps the meaningful topic from %s', (message, expected) => {
    expect(buildOpportunitySearchText(message)).toBe(expected);
    expect(isGenericOpportunityBrowse(message, true)).toBe(false);
  });

  it('treats punctuation and empty input as no text filter', () => {
    expect(buildOpportunitySearchText('')).toBe('');
    expect(buildOpportunitySearchText('؟!')).toBe('');
    expect(buildOpportunitySearchText('   ')).toBe('');
    expect(isGenericOpportunityBrowse('', true)).toBe(false);
    expect(isGenericOpportunityBrowse('show me opportunities', false)).toBe(
      false,
    );
  });

  it('deduplicates repeated topic tokens and caps the query length', () => {
    expect(buildOpportunitySearchText('فرص تطوعية في البرمجة البرمجة')).toBe(
      'البرمجه',
    );
    expect(
      buildOpportunitySearchText('a'.repeat(200)).length,
    ).toBeLessThanOrEqual(120);
  });
});
