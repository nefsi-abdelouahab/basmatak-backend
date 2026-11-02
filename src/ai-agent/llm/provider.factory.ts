import { AiAgentConfig } from '../config/ai-agent.config';
import { FakeProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { MockProvider } from './mock.provider';
import { LlmProvider } from './provider.interface';
import { LlmProviderUnavailableError } from './provider-errors';
import {
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmTurnRequest,
} from './provider.types';

export interface LlmProviderAdapters {
  gemini: LlmProvider;
  groq: LlmProvider;
  mock: LlmProvider;
  fake: LlmProvider;
}

const UNAVAILABLE_CAPABILITIES: LlmProviderCapabilities = Object.freeze({
  streaming: false,
  functionCalling: false,
  contextWindow: 0,
});

/**
 * Safe terminal provider for an unknown `AI_AGENT_PROVIDER`. Construction
 * never throws; only an attempted turn fails closed.
 */
export class UnavailableLlmProvider implements LlmProvider {
  readonly capabilities = UNAVAILABLE_CAPABILITIES;

  constructor(readonly configuredName: string) {}

  async *streamTurn(
    _request: LlmTurnRequest,
    _signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    throw new LlmProviderUnavailableError();
  }
}

export function normalizeLlmProviderName(provider: string): string {
  return provider.trim().toLowerCase();
}

/**
 * Select an adapter by configuration. Caller code is identical for every
 * provider; only `AI_AGENT_PROVIDER` changes.
 */
export function selectLlmProvider(
  provider: string,
  adapters: LlmProviderAdapters,
): LlmProvider {
  switch (normalizeLlmProviderName(provider)) {
    case 'gemini':
      return adapters.gemini;
    case 'groq':
      return adapters.groq;
    case 'mock':
      return adapters.mock;
    case 'fake':
      return adapters.fake;
    default:
      return new UnavailableLlmProvider(provider);
  }
}

/** Convenience constructor used by tests and future non-DI call sites. */
export function createLlmProvider(config: AiAgentConfig): LlmProvider {
  switch (normalizeLlmProviderName(config.provider)) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'groq':
      return new GroqProvider(config);
    case 'mock':
      return new MockProvider(config);
    case 'fake':
      return new FakeProvider();
    default:
      return new UnavailableLlmProvider(config.provider);
  }
}
