import {
  DEFAULT_MESSAGE_OVERHEAD_TOKENS,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateTokens,
  isArabicCharacter,
} from './token-estimator';

describe('token estimator', () => {
  it('estimates Latin text at ceil(chars / 4) plus per-message overhead', () => {
    const estimate = estimateTokens('hello world');

    expect(estimate.totalChars).toBe(11);
    expect(estimate.arabicChars).toBe(0);
    expect(estimate.textTokens).toBe(3);
    expect(estimate.overheadTokens).toBe(DEFAULT_MESSAGE_OVERHEAD_TOKENS);
    expect(estimate.tokens).toBe(7);
    expect(estimate.estimated).toBe(true);
  });

  it('estimates Arabic text at ceil(chars / 2) plus per-message overhead', () => {
    const estimate = estimateTokens('مرحبا');

    expect(estimate.totalChars).toBe(5);
    expect(estimate.arabicChars).toBe(5);
    expect(estimate.textTokens).toBe(3);
    expect(estimate.tokens).toBe(7);
  });

  it('charges mixed text per script and remains conservative', () => {
    const estimate = estimateTokens('Hello مرحبا');

    expect(estimate.totalChars).toBe(11);
    expect(estimate.arabicChars).toBe(5);
    expect(estimate.latinChars).toBe(6);
    expect(estimate.textTokens).toBe(4);
    expect(estimate.tokens).toBe(8);
    expect(estimate.textTokens).toBeGreaterThanOrEqual(
      Math.ceil(estimate.totalChars / 4),
    );
  });

  it('counts Arabic whitespace and punctuation conservatively', () => {
    const estimate = estimateTokens('مرحبا بالعالم');

    expect(estimate.totalChars).toBe(13);
    expect(estimate.arabicChars).toBe(12);
    expect(estimate.textTokens).toBe(7);
    expect(estimate.tokens).toBe(11);
  });

  it('returns only the fixed overhead for empty text', () => {
    expect(estimateTokens('').tokens).toBe(DEFAULT_MESSAGE_OVERHEAD_TOKENS);
    expect(estimateTokens('', { overheadTokens: 0 }).tokens).toBe(0);
    expect(estimateTokens('', { overheadTokens: 0 }).textTokens).toBe(0);
  });

  it('supports a custom overhead and always flags the result as estimated', () => {
    const estimate = estimateTokens('abcd', { overheadTokens: 9 });

    expect(estimate.textTokens).toBe(1);
    expect(estimate.overheadTokens).toBe(9);
    expect(estimate.tokens).toBe(10);
    expect(estimate.estimated).toBe(true);
    expect(estimateMessageTokens('abcd')).toBe(
      estimateMessageTokens('abcd', { overheadTokens: 4 }),
    );
  });

  it('adds one overhead per message across a conversation', () => {
    const estimate = estimateMessagesTokens(['Hello', 'مرحبا']);

    expect(estimate.textTokens).toBe(5);
    expect(estimate.overheadTokens).toBe(DEFAULT_MESSAGE_OVERHEAD_TOKENS * 2);
    expect(estimate.tokens).toBe(13);
    expect(estimate.totalChars).toBe(10);
    expect(estimate.estimated).toBe(true);
  });

  it('recognizes Arabic code points, including presentation forms', () => {
    expect(isArabicCharacter('م')).toBe(true);
    expect(isArabicCharacter('٣')).toBe(true);
    expect(isArabicCharacter('\uFE70')).toBe(true);
    expect(isArabicCharacter('A')).toBe(false);
    expect(isArabicCharacter('')).toBe(false);
  });
});
