import { randomInt } from 'crypto';
import { BusinessException } from '../common/exceptions/business.exception';
import { isDuplicateKeyError } from '../common/slug/slugify.util';

/**
 * A12 proof-code alphabet: uppercase base32 with the visually ambiguous
 * characters `0`, `O`, `1` and `I` excluded (24 letters + 8 digits = 32).
 */
export const VERIFICATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const VERIFICATION_CODE_LENGTH = 8;

/** A12: 8 fully random uppercase base32 characters via built-in `crypto`. */
export function generateVerificationCode(): string {
  let code = '';
  for (let i = 0; i < VERIFICATION_CODE_LENGTH; i += 1) {
    code +=
      VERIFICATION_CODE_ALPHABET[randomInt(VERIFICATION_CODE_ALPHABET.length)];
  }
  return code;
}

export interface UniqueVerificationCodeResult<T> {
  doc: T;
  code: string;
}

/**
 * Inserts a document whose unique `verificationCode` is freshly drawn per
 * attempt. On an E11000 duplicate-key error (collision with an existing row)
 * it retries with a brand new random code — never a numeric suffix, because
 * the code must stay uniformly random and unguessable for possession (A6).
 * Bounded attempts, then a 409 that rolls back the verify transaction.
 */
export async function createWithUniqueVerificationCode<T>(
  create: (code: string) => Promise<T>,
  maxAttempts = 10,
): Promise<UniqueVerificationCodeResult<T>> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateVerificationCode();
    try {
      const doc = await create(code);
      return { doc, code };
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
  throw new BusinessException(
    'VERIFICATION_CODE_COLLISION',
    'Could not allocate a unique verification code',
    409,
  );
}
