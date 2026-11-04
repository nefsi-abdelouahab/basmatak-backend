import * as fs from 'fs';
import * as path from 'path';
import {
  KnowledgeNormalizer,
  expandTokens,
  isStopword,
  loadSynonymGroups,
  normalizeText,
  stripArabicClitic,
  tokenize,
} from './normalizer';

const FIXTURES = path.join(__dirname, '__fixtures__');
const SYNONYMS = path.join(FIXTURES, 'synonyms.json');
const MALFORMED_SYNONYMS = path.join(FIXTURES, 'malformed-synonyms.json');

describe('KnowledgeNormalizer', () => {
  describe('normalizeText', () => {
    it('removes Arabic diacritics and tatweel and unifies letter variants', () => {
      expect(normalizeText('أَهْلاً وَسَهْلاً')).toBe('اهلا وسهلا');
      expect(normalizeText('مُصْطَفَى')).toBe('مصطفي');
      expect(normalizeText('مدرسة')).toBe('مدرسه');
      expect(normalizeText('مـــن')).toBe('من');
      expect(normalizeText('إِنَّ')).toBe('ان');
      expect(normalizeText('ٱلْعَرَبِيَّة')).toBe('العربيه');
    });

    it('folds hamza carriers before NFD so tokens are not split', () => {
      expect(normalizeText('مسؤول')).toBe('مسوول');
      expect(normalizeText('مسئول')).toBe('مسيول');
      expect(normalizeText('هيئة')).toBe('هييه');
      expect(normalizeText('الجزائر')).toBe('الجزاير');
      expect(normalizeText('الجزاير')).toBe('الجزاير');
      expect(normalizeText('الأسئلة')).toBe('الاسيله');
      // Standalone hamza is preserved and ta marbuta/alef maqsura still fold.
      expect(normalizeText('شيء')).toBe('شيء');
      expect(normalizeText('مدرسة')).toBe('مدرسه');
      expect(normalizeText('مصطفى')).toBe('مصطفي');
    });

    it('maps Arabic-Indic and extended Arabic-Indic digits to ASCII', () => {
      expect(normalizeText('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
      expect(normalizeText('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
      expect(normalizeText('عام ٢٠٢٦')).toBe('عام 2026');
    });

    it('strips French accents and ligatures and normalizes separators', () => {
      expect(normalizeText('ÉLÈVE')).toBe('eleve');
      expect(normalizeText('Café, crème!')).toBe('cafe creme');
      expect(normalizeText('œuvre')).toBe('oeuvre');
      expect(normalizeText('l’opportunité')).toBe('l opportunite');
      expect(normalizeText('  Hello,\tWORLD!\n\nAgain  ')).toBe(
        'hello world again',
      );
      expect(normalizeText('C# and C++')).toBe('c and c');
    });

    it('is idempotent', () => {
      const once = normalizeText('أَهْلاً ÉLÈVE');
      expect(normalizeText(once)).toBe(once);

      const arabic = normalizeText('مسؤول هيئة الجزائر ٢٠٢٦');
      expect(normalizeText(arabic)).toBe(arabic);
    });
  });

  describe('tokenize and stopwords', () => {
    it('removes English, Arabic, and French stopwords', () => {
      expect(tokenize('The volunteer and the volunteer')).toEqual([
        'volunteer',
      ]);
      expect(tokenize('فرصة في فرصة')).toEqual(['فرصه']);
      expect(tokenize('le bénévolat et le bénévolat')).toEqual(['benevolat']);
      expect(tokenize('ما هي فرصة التطوع؟')).toEqual(['فرصه', 'التطوع']);
    });

    it('deduplicates in stable order by default', () => {
      expect(tokenize('opportunity opportunity')).toEqual(['opportunity']);
      expect(
        tokenize('the volunteer and the volunteer', {
          removeStopwords: false,
        }),
      ).toEqual(['the', 'volunteer', 'and']);
    });

    it('can retain duplicates and stopwords for term-frequency callers', () => {
      expect(
        tokenize('the volunteer and the volunteer', {
          removeStopwords: false,
          unique: false,
        }),
      ).toEqual(['the', 'volunteer', 'and', 'the', 'volunteer']);
    });

    it('strips only known Arabic clitics when three letters remain', () => {
      expect(stripArabicClitic('بالفرص')).toBe('فرص');
      expect(stripArabicClitic('والتسجيل')).toBe('تسجيل');
      expect(stripArabicClitic('للمتطوعين')).toBe('متطوعين');
      expect(stripArabicClitic('الفرص')).toBe('فرص');
      expect(stripArabicClitic('وفرص')).toBe('فرص');
      expect(stripArabicClitic('فرص')).toBeNull();
      expect(stripArabicClitic('الله')).toBeNull();
      expect(stripArabicClitic('opportunity')).toBeNull();
    });

    it('recognizes normalized stopwords', () => {
      expect(isStopword('The')).toBe(true);
      expect(isStopword('في')).toBe(true);
      expect(isStopword('le')).toBe(true);
      expect(isStopword('إلى')).toBe(true);
      expect(isStopword('الى')).toBe(true);
      expect(isStopword('où')).toBe(true);
      expect(isStopword('être')).toBe(true);
      expect(isStopword('volunteer')).toBe(false);
      expect(isStopword('فرصة')).toBe(false);
      expect(isStopword('')).toBe(false);
    });
  });

  describe('synonyms', () => {
    it('loads and normalizes synonym entries with the same normalizer', () => {
      const groups = loadSynonymGroups(SYNONYMS);

      expect(groups).toHaveLength(3);
      expect(groups[0]).toContain('فرصه');
      expect(groups[0]).toContain('opportunite');
      expect(groups[2]).toEqual(['etudier', 'etude']);
    });

    it('expands tokens deterministically and removes duplicates', () => {
      const groups = [['opportunity', 'فرصة', 'opportunité']];

      expect(expandTokens(['فرصه'], groups)).toEqual([
        'فرصه',
        'opportunity',
        'opportunite',
      ]);
      expect(expandTokens(['opportunity', 'opportunity'], groups)).toEqual([
        'opportunity',
        'فرصه',
        'opportunite',
      ]);
      expect(expandTokens(['unknown'], groups)).toEqual(['unknown']);
      expect(expandTokens([], groups)).toEqual([]);
    });

    it('normalizes synonym entries before matching', () => {
      const groups = [['Étudier', 'étude']];

      expect(expandTokens(['etudier'], groups)).toEqual(['etudier', 'etude']);
    });

    it('provides a reusable normalizer with lazy synonym loading', () => {
      const normalizer = new KnowledgeNormalizer({
        synonymsPath: SYNONYMS,
      });

      expect(normalizer.normalizeText('ÉLÈVE')).toBe('eleve');
      expect(normalizer.tokenize('The volunteer')).toEqual(['volunteer']);
      expect(normalizer.isStopword('the')).toBe(true);

      const expanded = normalizer.expandTokens(['فرصه']);
      expect(expanded[0]).toBe('فرصه');
      expect(expanded).toEqual(
        expect.arrayContaining([
          'opportunity',
          'opportunities',
          'opportunite',
          'opportunites',
        ]),
      );
      expect(new Set(expanded).size).toBe(expanded.length);
    });

    it('falls back to no expansion for missing or malformed files', () => {
      const missing = new KnowledgeNormalizer({
        synonymsPath: path.join(FIXTURES, 'missing-synonyms.json'),
      });
      expect(missing.expandTokens(['opportunity'])).toEqual(['opportunity']);

      const malformed = new KnowledgeNormalizer({
        synonymsPath: MALFORMED_SYNONYMS,
      });
      expect(malformed.expandTokens(['valid'])).toEqual(['valid']);

      expect(loadSynonymGroups(MALFORMED_SYNONYMS)).toEqual([]);
      expect(
        loadSynonymGroups(path.join(FIXTURES, 'missing-synonyms.json')),
      ).toEqual([]);
    });

    it('loads the committed synonym configuration', () => {
      const synonyms = path.resolve(
        __dirname,
        '../../../ai-agent/_config/synonyms.json',
      );
      if (!fs.existsSync(synonyms)) return;

      const groups = loadSynonymGroups(synonyms);
      expect(groups).toHaveLength(14);
      expect(groups.flat()).toContain('فرصه');
      expect(groups.flat()).toContain('برمجه');
      expect(groups.flat()).toContain('تقنيه');
    });
  });
});
