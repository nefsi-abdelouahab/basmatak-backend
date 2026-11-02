/**
 * Conservative, dependency-free token estimator used by the quota guard.
 *
 * The provider reports real usage once it is connected (Session 8). Until then
 * (and whenever the provider omits usage) these estimates are the accounting
 * source. Arabic characters are charged at the higher rate because Arabic
 * tokenizes less densely than Latin text. Mixed text is charged per script, so
 * every Arabic character keeps the conservative rate.
 */

/** Fixed overhead charged once per message (role markers, separators, etc.). */
export const DEFAULT_MESSAGE_OVERHEAD_TOKENS = 4;

const ARABIC_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

export interface TokenEstimate {
  /** Total estimate, including the per-message overhead. */
  tokens: number;
  /** Text-only estimate, excluding overhead. */
  textTokens: number;
  /** Overhead included in `tokens`. */
  overheadTokens: number;
  totalChars: number;
  arabicChars: number;
  /** Non-Arabic code points (Latin, digits, spaces, punctuation, etc.). */
  latinChars: number;
  /** Marks the value as an estimate, never provider-reported usage. */
  estimated: boolean;
}

export interface TokenEstimateOptions {
  /** Overrides the fixed per-message overhead. Defaults to 4. */
  overheadTokens?: number;
}

export function isArabicCharacter(char: string): boolean {
  if (char.length === 0) return false;
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  return ARABIC_CODE_POINT_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end,
  );
}

function normalizeOverhead(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MESSAGE_OVERHEAD_TOKENS;
  }
  return Math.max(0, Math.trunc(value));
}

/**
 * Estimate a single message. Latin text costs `ceil(chars / 4)`, Arabic costs
 * `ceil(chars / 2)`, and mixed text is charged per script. The overhead is
 * added once, so `estimateTokens('')` returns the overhead by default.
 */
export function estimateTokens(
  text: string,
  options: TokenEstimateOptions = {},
): TokenEstimate {
  let arabicChars = 0;
  let latinChars = 0;

  for (const char of text) {
    if (isArabicCharacter(char)) {
      arabicChars += 1;
    } else {
      latinChars += 1;
    }
  }

  const textTokens = Math.ceil(arabicChars / 2 + latinChars / 4);
  const overheadTokens = normalizeOverhead(options.overheadTokens);

  return {
    tokens: textTokens + overheadTokens,
    textTokens,
    overheadTokens,
    totalChars: arabicChars + latinChars,
    arabicChars,
    latinChars,
    estimated: true,
  };
}

/** Convenience wrapper for callers that only need the total count. */
export function estimateMessageTokens(
  text: string,
  options: TokenEstimateOptions = {},
): number {
  return estimateTokens(text, options).tokens;
}

/**
 * Estimate a sequence of messages (history + current message). Each message
 * keeps its own overhead, mirroring how chat providers charge chat turns.
 */
export function estimateMessagesTokens(
  messages: ReadonlyArray<string>,
  options: TokenEstimateOptions = {},
): TokenEstimate {
  let tokens = 0;
  let textTokens = 0;
  let overheadTokens = 0;
  let totalChars = 0;
  let arabicChars = 0;
  let latinChars = 0;

  for (const message of messages) {
    const estimate = estimateTokens(message, options);
    tokens += estimate.tokens;
    textTokens += estimate.textTokens;
    overheadTokens += estimate.overheadTokens;
    totalChars += estimate.totalChars;
    arabicChars += estimate.arabicChars;
    latinChars += estimate.latinChars;
  }

  return {
    tokens,
    textTokens,
    overheadTokens,
    totalChars,
    arabicChars,
    latinChars,
    estimated: true,
  };
}
