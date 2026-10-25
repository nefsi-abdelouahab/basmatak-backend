import { AiAgentMode } from '../ai-agent.types';

/**
 * Result of asking the quota service for a provider-call reservation.
 *
 * Request and concurrency limits are hard gates: a denied reservation never
 * increments a counter and never starts a provider call.
 */
export type QuotaDenialCode =
  'RATE_LIMITED' | 'AI_AGENT_BUSY' | 'AI_AGENT_QUOTA_EXHAUSTED';

export type QuotaDenialReason =
  | 'ip_minute'
  | 'ip_day'
  | 'global_minute'
  | 'global_day'
  | 'concurrency'
  | 'cooldown_minute'
  | 'cooldown_day'
  | 'mode'
  | 'token_budget';

export interface QuotaReservationInput {
  /** Client address used only as an in-memory map key. Never logged. */
  ip: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
}

export interface QuotaReservationAllowed {
  allowed: true;
  reservationId: string;
  mode: AiAgentMode;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  reservedTokens: number;
}

export interface QuotaReservationDenied {
  allowed: false;
  mode: AiAgentMode;
  code: QuotaDenialCode;
  reason: QuotaDenialReason;
  retryAfterSeconds: number;
}

export type QuotaReservationResult =
  QuotaReservationAllowed | QuotaReservationDenied;

export interface QuotaUsageCommit {
  inputTokens: number;
  outputTokens: number;
  /**
   * True when the caller is committing an estimate because the provider did
   * not return usage. Defaults to false (provider-reported usage).
   */
  estimated?: boolean;
}

export interface QuotaCommitResult {
  committed: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
}

export interface QuotaBudgetSnapshot {
  dailyLimit: number;
  /** Committed (or provider-reported) tokens today. */
  usedToday: number;
  /** Daily limit minus committed and currently reserved tokens. */
  remaining: number;
  mode: AiAgentMode;
}

export type ProviderQuotaWindow = 'minute' | 'day';

export interface QuotaCooldownSnapshot {
  active: boolean;
  window?: ProviderQuotaWindow;
  retryAfterSeconds?: number;
}

export interface ProviderQuotaErrorOptions {
  window?: ProviderQuotaWindow;
  retryAfterSeconds?: number;
}

/**
 * Normalized provider 429/quota error. Session 3 uses it as a deterministic
 * test seam; Session 8 will map the real provider's errors onto the same type.
 */
export class ProviderQuotaError extends Error {
  readonly window: ProviderQuotaWindow;
  readonly retryAfterSeconds?: number;

  constructor(options: ProviderQuotaErrorOptions = {}) {
    super('The provider reported a quota limit');
    this.name = 'ProviderQuotaError';
    this.window = options.window ?? 'minute';
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isProviderQuotaError(
  error: unknown,
): error is ProviderQuotaError {
  return error instanceof ProviderQuotaError;
}
