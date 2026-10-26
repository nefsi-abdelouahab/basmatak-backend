import type {
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmTurnRequest,
} from './provider.types';

/** DI token for the provider selected by `AI_AGENT_PROVIDER`. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * Provider-neutral streaming contract.
 *
 * Implementations must:
 * - emit text deltas in generated order;
 * - emit tool calls only after their arguments are complete and parsed;
 * - emit usage when the provider reports it;
 * - emit exactly one `finish` event on a completed turn;
 * - throw a normalized error from `provider-errors.ts` on failure;
 * - stop promptly and throw `LlmAbortError` when the caller aborts;
 * - throw `LlmTimeoutError` when the turn deadline expires.
 *
 * The async iterable owns its timers/listeners and must release them when the
 * consumer finishes, breaks, or an error is thrown.
 */
export interface LlmProvider {
  readonly capabilities: LlmProviderCapabilities;
  streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent>;
}
