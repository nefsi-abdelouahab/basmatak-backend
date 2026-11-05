/**
 * Detects assistant text that promises future work ("I'll check", "سأتحقق")
 * even though the turn produced no tool result to support it.
 *
 * This is a pure text check. The orchestrator only calls it when
 * `citableResults` is empty and replaces the answer with a deterministic
 * lookup or a fixed not-found message, so a model can never leave the user
 * waiting for an action that will not happen.
 */

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/gu;

const PROMISE_PATTERNS: readonly RegExp[] = [
  // Arabic first-person future: سأتحقق، سأبحث، سأراجع، سأتحرى...
  /(?:^|[\s،,.;:!؟?])[وف]?(?:سأ|سوف\s+أ?)(?:تحقق|بحث|راجع|تحرى|حاول|ابحث|اتحقق|اراجع|اتحرى|احاول)(?:\s|$|[،,.;:!؟?])/u,
  // Arabic present continuous promise: سأقوم بالتحقق، سأعمل على البحث.
  /(?:^|[\s،,.;:!؟?])(?:سأ|سوف\s+أ?)(?:قوم|عمل)\s+(?:ب|على)\s*(?:ال)?(?:تحقق|بحث|مراجعة|تحري)/u,
  // "دعني أتحقق" / "لحظة أبحث" / "انتظر حتى أتحقق".
  /(?:^|[\s،,.;:!؟?])(?:دعني|اسمح\s+لي|لحظة|انتظر|امهلني)\s+(?:حتى\s+)?(?:بال|ب|ال)?(?:أ?تحقق|أ?بحث|أ?راجع|أ?تحرى)/u,
  // English first-person future: I'll check / I will verify / let me look it up.
  /\b(?:i(?:'ll| will| am going to|'m going to)|let me|allow me to)\s+(?:just\s+)?(?:check|verify|look|search|find|review|see|investigate)\b/iu,
  // English progressive promise: checking that now, searching for it.
  /\b(?:i(?:'m| am)\s+)?(?:checking|searching|looking|verifying)\s+(?:that|this|it|into|for)\b/iu,
  // Explicit stalling phrases.
  /\b(?:one moment|just a moment|give me a moment|hold on)\b/iu,
  /(?:^|[\s،,.;:!؟?])(?:لحظة|لحظات|ثوان|دقائق)\s+(?:من\s+فضلك|رجاء)?(?:\s|$|[،,.;:!؟?])/u,
];

function normalizePromiseText(text: string): string {
  return text.replace(ARABIC_DIACRITICS, '').toLowerCase();
}

export function containsUnbackedPromise(text: string): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false;
  const normalized = normalizePromiseText(text);
  return PROMISE_PATTERNS.some((pattern) => pattern.test(normalized));
}
