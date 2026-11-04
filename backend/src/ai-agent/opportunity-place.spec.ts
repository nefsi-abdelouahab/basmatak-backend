import {
  LocationSource,
  normalizePlaceName,
  resolvePlaceMention,
} from './opportunity-place';

const LOCATIONS: LocationSource[] = [
  { code: '16', type: 'wilaya', nameAr: 'الجزائر', nameFr: 'Alger' },
  {
    code: '1601',
    type: 'municipality',
    parentCode: '16',
    nameAr: 'الجزائر الوسطى',
    nameFr: 'Alger Centre',
  },
  {
    code: '1605',
    type: 'municipality',
    parentCode: '16',
    nameAr: 'باب الوادي',
    nameFr: 'Bab El Oued',
  },
  {
    code: '22',
    type: 'wilaya',
    nameAr: 'سيدي بلعباس',
    nameFr: 'Sidi Bel Abbès',
  },
  { code: '23', type: 'wilaya', nameAr: 'عنابة', nameFr: 'Annaba' },
  { code: '25', type: 'wilaya', nameAr: 'قسنطينة', nameFr: 'Constantine' },
  { code: '31', type: 'wilaya', nameAr: 'وهران', nameFr: 'Oran' },
  {
    code: '3101',
    type: 'municipality',
    parentCode: '31',
    nameAr: 'وهران',
    nameFr: 'Oran',
  },
  {
    code: '3105',
    type: 'municipality',
    parentCode: '31',
    nameAr: 'بئر الجير',
    nameFr: 'Bir El Djir',
  },
  { code: '49', type: 'wilaya', nameAr: 'تيميمون', nameFr: 'Timimoun' },
];

describe('opportunity place normalization', () => {
  it('normalizes Arabic diacritics, alef variants, ta marbuta, and the article', () => {
    expect(normalizePlaceName('وِهْرَان')).toBe('وهران');
    expect(normalizePlaceName('قسنطينَة')).toBe('قسنطينه');
    expect(normalizePlaceName('الوهران')).toBe('وهران');
    expect(normalizePlaceName('الجزائر')).toBe('جزاير');
    expect(normalizePlaceName('الجزائر العاصمة')).toBe('جزاير عاصمه');
  });

  it('normalizes Latin case, accents, punctuation, and spacing', () => {
    expect(normalizePlaceName('Sidi Bel Abbès')).toBe('sidi bel abbes');
    expect(normalizePlaceName('Sidi Bel-Abbes')).toBe('sidi bel abbes');
    expect(normalizePlaceName('  ORAN  ')).toBe('oran');
  });
});

describe('opportunity place resolution', () => {
  it.each([
    ['فرص في وهران', '31', 'wilaya', 'فرص'],
    ['opportunities in Oran', '31', 'wilaya', 'opportunities'],
    ['فرص في ولاية وهران', '31', 'wilaya', 'فرص'],
    ['فرص برمجة في وهران', '31', 'wilaya', 'فرص برمجه'],
    ['فرص برمجة بوهران', '31', 'wilaya', 'فرص برمجه'],
    ['فرص في الوهران', '31', 'wilaya', 'فرص'],
    ['فرص في الجزائر العاصمة', '16', 'wilaya', 'فرص'],
    ['Algiers', '16', 'wilaya', ''],
    ['الجزائر العاصمة', '16', 'wilaya', ''],
    ['فرص في باب الوادي', '1605', 'municipality', 'فرص'],
    ['فرص في بئر الجير', '3105', 'municipality', 'فرص'],
    ['فرص في سيدي بلعباس', '22', 'wilaya', 'فرص'],
    ['Sidi Bel Abbes', '22', 'wilaya', ''],
    ['فرص في تيميمون', '49', 'wilaya', 'فرص'],
    ['Timimoun', '49', 'wilaya', ''],
    ['فرص في قسنطينة', '25', 'wilaya', 'فرص'],
    ['Constantine', '25', 'wilaya', ''],
    ['فرص في عنابة', '23', 'wilaya', 'فرص'],
    ['Annaba', '23', 'wilaya', ''],
    ['فرص في سيدي بلعباس برمجة', '22', 'wilaya', 'فرص برمجه'],
  ] as const)(
    'resolves %s to %s (%s) and leaves %s',
    (text, code, type, remainingText) => {
      const match = resolvePlaceMention(text, LOCATIONS);

      expect(match).not.toBeNull();
      expect(match?.place.code).toBe(code);
      expect(match?.place.type).toBe(type);
      expect(match?.remainingText).toBe(remainingText);
    },
  );

  it('prefers the wilaya when a wilaya and municipality share a name', () => {
    const match = resolvePlaceMention('وهران', LOCATIONS);
    expect(match?.place).toMatchObject({ code: '31', type: 'wilaya' });
  });

  it('returns null for an unrecognized place so text search can continue', () => {
    expect(resolvePlaceMention('فرص في أطلانتس', LOCATIONS)).toBeNull();
    expect(
      resolvePlaceMention('opportunities in Atlantis', LOCATIONS),
    ).toBeNull();
  });

  it('returns null when no locations are available', () => {
    expect(resolvePlaceMention('فرص في وهران', [])).toBeNull();
  });
});
