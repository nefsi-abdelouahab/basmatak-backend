import {
  VERIFICATION_CODE_ALPHABET,
  VERIFICATION_CODE_LENGTH,
  createWithUniqueVerificationCode,
  generateVerificationCode,
} from './verification-code.util';

const CODE_PATTERN = new RegExp('^[A-HJ-NP-Z2-9]{8}$');

describe('VerificationCodeUtil (12.1)', () => {
  it('generates exactly 8 uppercase base32 chars excluding 0/O/1/I', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateVerificationCode();
      expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
      expect(code).toMatch(CODE_PATTERN);
    }
  });

  it('draws codes only from the declared alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateVerificationCode();
      for (const char of code) {
        expect(VERIFICATION_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('retries an E11000 collision with a fresh code inside bounded attempts', async () => {
    let calls = 0;
    const result = await createWithUniqueVerificationCode(async (code) => {
      calls += 1;
      if (calls < 3) {
        throw { code: 11000, message: 'E11000 duplicate key' };
      }
      return { code };
    }, 5);
    expect(calls).toBe(3);
    expect(result.doc).toEqual({ code: result.code });
    expect(result.code).toMatch(CODE_PATTERN);
  });

  it('exhausts bounded attempts and throws a 409 collision error', async () => {
    await expect(
      createWithUniqueVerificationCode(async () => {
        throw { code: 11000, message: 'E11000 duplicate key' };
      }, 4),
    ).rejects.toMatchObject({
      status: 409,
      code: 'VERIFICATION_CODE_COLLISION',
    });
  });

  it('rethrows non-duplicate-key errors immediately', async () => {
    await expect(
      createWithUniqueVerificationCode(async (_code) => {
        throw new Error('boom');
      }, 4),
    ).rejects.toThrow('boom');
  });
});
