import { ProviderQuotaError } from '../budget/quota.types';

/**
 * Normalized provider failures.
 *
 * Provider messages, response bodies, prompts, completions, and API keys are
 * deliberately discarded. Only fixed, user-safe messages leave an adapter.
 */

export class LlmProviderUnavailableError extends Error {
  readonly code = 'AI_AGENT_PROVIDER_UNAVAILABLE' as const;

  constructor() {
    super('The model provider is temporarily unavailable.');
    this.name = 'LlmProviderUnavailableError';
  }
}

/**
 * A malformed or internally inconsistent provider response. It maps to the
 * same public code as an unavailable provider but stays a distinct type so
 * tests and Session 9 can log the failure class without leaking the payload.
 */
export class LlmInvalidResponseError extends LlmProviderUnavailableError {
  constructor() {
    super();
    this.name = 'LlmInvalidResponseError';
    this.message = 'The model provider returned an invalid response.';
  }
}

export class LlmTimeoutError extends Error {
  readonly code = 'AI_AGENT_TIMEOUT' as const;

  constructor() {
    super('The model provider did not respond in time.');
    this.name = 'LlmTimeoutError';
  }
}

/**
 * Caller cancellation is not a user-facing failure. Session 9 must treat it as
 * a normal "stopped" outcome and never emit an error event for it.
 */
export class LlmAbortError extends Error {
  constructor() {
    super('The model turn was aborted.');
    this.name = 'LlmAbortError';
  }
}

export function isLlmAbortError(error: unknown): error is LlmAbortError {
  return error instanceof LlmAbortError;
}

export function isLlmTimeoutError(error: unknown): error is LlmTimeoutError {
  return error instanceof LlmTimeoutError;
}

export function isLlmProviderUnavailableError(
  error: unknown,
): error is LlmProviderUnavailableError {
  return error instanceof LlmProviderUnavailableError;
}

export function isLlmInvalidResponseError(
  error: unknown,
): error is LlmInvalidResponseError {
  return error instanceof LlmInvalidResponseError;
}

export function isKnownProviderError(error: unknown): boolean {
  return (
    error instanceof ProviderQuotaError ||
    isLlmAbortError(error) ||
    isLlmTimeoutError(error) ||
    isLlmProviderUnavailableError(error)
  );
}

export interface ProviderDeadline {
  readonly signal: AbortSignal;
  isCallerAborted(): boolean;
  isTimedOut(): boolean;
  dispose(): void;
}

/**
 * Combine the caller signal with one turn deadline. Exactly one timer and one
 * abort listener are created; `dispose()` removes both. The request's optional
 * `timeoutMs` wins, otherwise the caller passes the documented 45-second
 * default.
 */
export function createProviderDeadline(
  callerSignal: AbortSignal,
  timeoutMs: number,
): ProviderDeadline {
  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };

  if (callerSignal.aborted) {
    controller.abort();
  } else {
    callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          if (!controller.signal.aborted) controller.abort();
        }, timeoutMs)
      : undefined;

  return {
    signal: controller.signal,
    isCallerAborted: () => callerSignal.aborted,
    isTimedOut: () => timedOut,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      callerSignal.removeEventListener('abort', onCallerAbort);
    },
  };
}

/** Build the normalized error that corresponds to an aborted deadline. */
export function deadlineError(deadline: ProviderDeadline): Error {
  if (deadline.isCallerAborted()) return new LlmAbortError();
  if (deadline.isTimedOut()) return new LlmTimeoutError();
  return new LlmAbortError();
}

export function throwIfDeadlineExceeded(deadline: ProviderDeadline): void {
  if (deadline.signal.aborted) throw deadlineError(deadline);
}

/**
 * Abortable delay used by deterministic providers. The timer and listener are
 * released on both success and abort.
 */
export function waitForProviderDelay(
  delayMs: number,
  deadline: ProviderDeadline,
): Promise<void> {
  if (delayMs <= 0) {
    if (deadline.signal.aborted) return Promise.reject(deadlineError(deadline));
    return Promise.resolve();
  }
  if (deadline.signal.aborted) return Promise.reject(deadlineError(deadline));

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      deadline.signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = (): void => finish(deadlineError(deadline));
    const timer = setTimeout(() => finish(), delayMs);
    deadline.signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface ErrorShape {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
}

function readErrorShape(error: unknown): ErrorShape {
  if (typeof error !== 'object' || error === null) return {};
  return error as ErrorShape;
}

function readStatus(error: unknown): number | undefined {
  const { status } = readErrorShape(error);
  if (typeof status === 'number' && Number.isInteger(status)) return status;
  if (typeof status === 'string' && /^\d{3}$/.test(status.trim())) {
    return Number(status.trim());
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function isAbortLike(error: unknown): boolean {
  const { name } = readErrorShape(error);
  return typeof name === 'string' && name.toLowerCase() === 'aborterror';
}

function isQuotaSignal(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized === '429' ||
    normalized === 'resource_exhausted' ||
    /(^|\D)429(\D|$)/.test(normalized) ||
    normalized.includes('resource_exhausted') ||
    normalized.includes('quota') ||
    normalized.includes('rate limit') ||
    normalized.includes('rate_limit')
  );
}

function isTimeoutSignal(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('deadline exceeded') ||
    normalized.includes('etimedout')
  );
}

/**
 * Extract a retry hint from a provider message without retaining the message.
 * Only a number is returned; the surrounding body is discarded immediately.
 */
function extractRetryAfterSeconds(
  message: string | undefined,
): number | undefined {
  if (!message) return undefined;
  const patterns: RegExp[] = [
    /"retry(?:_?after|_?delay)"\s*:\s*"?(\d+(?:\.\d+)?)\s*s"?/i,
    /retry\s+(?:after|in)\s+(\d+(?:\.\d+)?)\s*(?:s|seconds?)\b/i,
    /retry[-_ ]after\s*[:=]?\s*(\d+(?:\.\d+)?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return Math.ceil(value);
    }
  }
  return undefined;
}

function quotaError(message: string | undefined): ProviderQuotaError {
  const retryAfterSeconds = extractRetryAfterSeconds(message);
  return new ProviderQuotaError({
    window:
      retryAfterSeconds !== undefined && retryAfterSeconds > 60
        ? 'day'
        : 'minute',
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });
}

/**
 * Normalize any adapter/SDK failure into the shared error set.
 *
 * - 429 / RESOURCE_EXHAUSTED / quota wording -> ProviderQuotaError (no body)
 * - 5xx and other HTTP failures -> LlmProviderUnavailableError
 * - timeout wording -> LlmTimeoutError
 * - abort -> LlmAbortError
 * - everything else -> LlmProviderUnavailableError
 *
 * This function never returns the original provider error, so a response body
 * or key embedded in its message cannot leak through an error response.
 */
export function normalizeProviderError(error: unknown): Error {
  if (isKnownProviderError(error)) return error as Error;
  if (isAbortLike(error)) return new LlmAbortError();

  const { code, message } = readErrorShape(error);
  const status = readStatus(error);
  if (status === 429) {
    return quotaError(readString(message));
  }
  if (status !== undefined) {
    return new LlmProviderUnavailableError();
  }

  const codeText = readString(code);
  const messageText = readString(message);
  if (isQuotaSignal(codeText) || isQuotaSignal(messageText)) {
    return quotaError(messageText);
  }
  if (isTimeoutSignal(codeText) || isTimeoutSignal(messageText)) {
    return new LlmTimeoutError();
  }
  return new LlmProviderUnavailableError();
}

/**
 * Normalize an Interactions API `error` event. The error object is inspected
 * only for a code/retry hint and is never attached to the thrown error.
 */
export function normalizeProviderStreamError(
  error: { code?: string; message?: string } | undefined,
): Error {
  return normalizeProviderError({
    code: error?.code,
    message: error?.message,
  });
}
