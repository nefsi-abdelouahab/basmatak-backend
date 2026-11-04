import {
  extractOrganizationName,
  normalizeOrganizationName,
  organizationMatchesName,
  organizationNameContainsName,
} from './organization-query';

describe('organization query helper', () => {
  it.each([
    ['هل هناك جمعية نور', 'نور'],
    ['هل هناك جمعية نور للتضامن', 'نور للتضامن'],
    ['هل تعرفون جمعية نور', 'نور'],
    ['هل تعلم عن جمعية نور', 'نور'],
    ['ما هي جمعية نور', 'نور'],
    ['أخبرني عن جمعية نور', 'نور'],
    ['حدثني عن جمعية نور', 'نور'],
    ['ابحث عن جمعية نور', 'نور'],
    ['هل هناك منظمة نور', 'نور'],
    ['هل توجد مؤسسة نور', 'نور'],
    ['Is there an association named Green Earth?', 'Green Earth'],
    ['Tell me about Association Nour', 'Nour'],
    ['Do you know Nour association', 'Nour'],
    ['Do you know the Nour association', 'Nour'],
    ['What is Nour association', 'Nour'],
    ['Search for Nour association', 'Nour'],
    ['Find the association Nour', 'Nour'],
    ['Look up Nour association', 'Nour'],
    ['Can you tell me about Nour association', 'Nour'],
  ])('extracts the typed name from %s', (message, expected) => {
    expect(extractOrganizationName(message)).toBe(expected);
  });

  it.each([
    'show me organizations',
    'What organizations are available?',
    'organizations in Oran',
    'Show me organizations that work on education',
    'Find organizations working on the environment',
    'هل توجد جمعيات',
    'اعرض لي الجمعيات',
    '',
  ])('does not treat a generic listing as a name: %s', (message) => {
    expect(extractOrganizationName(message)).toBeUndefined();
  });

  it('removes leading type words before exact comparison', () => {
    expect(normalizeOrganizationName('جمعية نور للتضامن')).toBe('نور للتضامن');
    expect(normalizeOrganizationName('Association Nour')).toBe('nour');
  });

  it('matches a full stored name but not a substring', () => {
    const row = {
      slug: 'dev-org-nour',
      nameAr: 'جمعية نور للتضامن',
      nameFr: 'Association Nour de Solidarité',
    };

    expect(organizationMatchesName('جمعية نور للتضامن', row)).toBe(true);
    expect(organizationMatchesName('نور', row)).toBe(false);
  });

  it('suggests a single stored name that contains the typed name as whole words', () => {
    const row = {
      slug: 'dev-org-nour',
      nameAr: 'جمعية نور للتضامن',
      nameFr: 'Association Nour de Solidarité',
    };

    expect(organizationNameContainsName('نور', row)).toBe(true);
    expect(organizationNameContainsName('جمعية نور', row)).toBe(true);
    expect(organizationNameContainsName('نور للتضامن', row)).toBe(true);
    expect(organizationNameContainsName('Nour', row)).toBe(true);
  });

  it('does not treat a substring inside a longer word as a close match', () => {
    const row = {
      slug: 'tanwir',
      nameAr: 'جمعية تنوير',
      nameFr: 'Association Tanwir',
    };

    expect(organizationNameContainsName('نور', row)).toBe(false);
    expect(organizationNameContainsName('nour', row)).toBe(false);
  });

  it('returns false for empty names and rows without string names', () => {
    const row = {
      slug: 'dev-org-nour',
      nameAr: 'جمعية نور للتضامن',
    };

    expect(organizationNameContainsName('', row)).toBe(false);
    expect(organizationNameContainsName('جمعية', row)).toBe(false);
    expect(organizationNameContainsName('نور', {})).toBe(false);
  });
});
