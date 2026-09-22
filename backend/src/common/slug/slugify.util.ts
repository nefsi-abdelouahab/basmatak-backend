import slugify from 'slugify';
import { BusinessException } from '../exceptions/business.exception';

/** Transliterates/normalizes a name to an ASCII URL-safe slug (ROADMAP A12). */
export function slugifyText(text: string): string {
  return slugify(text, {
    lower: true,
    strict: true,
    trim: true,
  });
}

/**
 * Duplicate-key detection shared by the slug retry loop and the CRUD services.
 * Matches MongoDB's E11000 unique-index error code.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

export interface UniqueSlugResult<T> {
  doc: T;
  slug: string;
}

/**
 * Canonical slug pipeline (A12): inserts a document whose unique `slug` is the
 * given base. On an E11000 duplicate-key error it retries with a numeric suffix
 * (`<base>-1`, `<base>-2`, ...). Bounded attempts, then a 409.
 */
export async function createWithUniqueSlug<T>(
  create: (slug: string) => Promise<T>,
  baseSlug: string,
  maxAttempts = 10,
): Promise<UniqueSlugResult<T>> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
    try {
      const doc = await create(slug);
      return { doc, slug };
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
  throw new BusinessException(
    'SLUG_COLLISION',
    `Could not allocate a unique slug for "${baseSlug}"`,
    409,
  );
}
