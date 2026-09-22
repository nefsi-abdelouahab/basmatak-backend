import { BusinessException } from '../exceptions/business.exception';
import {
  createWithUniqueSlug,
  isDuplicateKeyError,
  slugifyText,
} from './slugify.util';

function duplicateKeyError(): Error & { code: number } {
  const error = new Error('E11000 duplicate key error');
  (error as Error & { code: number }).code = 11000;
  return error as Error & { code: number };
}

describe('slugify util (ROADMAP A12)', () => {
  describe('slugifyText', () => {
    it('lowercases and kebab-cases a French name', () => {
      expect(slugifyText('Secourisme & Santé')).toBe('secourisme-and-sante');
    });

    it('transliterates non-ASCII characters to the ASCII form', () => {
      expect(slugifyText('Éducation & Soutien Scolaire')).toBe(
        'education-and-soutien-scolaire',
      );
      expect(slugifyText("Gestion d'Événements & Logistique")).toBe(
        'gestion-devenements-and-logistique',
      );
    });

    it('strips punctuation and non-alphanumeric characters', () => {
      expect(slugifyText('First Aid & Health')).toBe('first-aid-and-health');
      expect(slugifyText('  Traduction & Langues  ')).toBe(
        'traduction-and-langues',
      );
    });
  });

  describe('isDuplicateKeyError', () => {
    it('recognizes MongoDB E11000 errors', () => {
      expect(isDuplicateKeyError(duplicateKeyError())).toBe(true);
      expect(isDuplicateKeyError(new Error('boom'))).toBe(false);
      expect(isDuplicateKeyError(null)).toBe(false);
    });
  });

  describe('createWithUniqueSlug', () => {
    it('inserts with the base slug on the first try', async () => {
      const create = jest.fn(async (slug: string) => ({ slug }));
      const result = await createWithUniqueSlug(create, 'securente-rattrape');
      expect(result.slug).toBe('securente-rattrape');
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('retries with a numeric suffix on E11000 and returns the winning slug', async () => {
      let attempts = 0;
      const create = jest.fn(async (slug: string) => {
        attempts += 1;
        if (attempts <= 2) {
          throw duplicateKeyError();
        }
        return { slug };
      });
      const result = await createWithUniqueSlug(create, 'premiers-secours');
      expect(result.slug).toBe('premiers-secours-2');
      expect(create).toHaveBeenCalledTimes(3);
      expect(create.mock.calls.map(([slug]) => slug)).toEqual([
        'premiers-secours',
        'premiers-secours-1',
        'premiers-secours-2',
      ]);
    });

    it('bounded retries then raises SLUG_COLLISION', async () => {
      const create = jest.fn(async () => {
        throw duplicateKeyError();
      });
      const promise = createWithUniqueSlug(create, 'toujours-occupe');
      await expect(promise).rejects.toMatchObject({
        code: 'SLUG_COLLISION',
        status: 409,
      });
      expect(create).toHaveBeenCalledTimes(10);
    });

    it('rethrows non-duplicate errors immediately', async () => {
      const create = jest.fn(async () => {
        throw new BusinessException('SOMETHING_ELSE', 'nope', 400);
      });
      await expect(createWithUniqueSlug(create, 'base')).rejects.toMatchObject({
        code: 'SOMETHING_ELSE',
      });
      expect(create).toHaveBeenCalledTimes(1);
    });
  });
});
