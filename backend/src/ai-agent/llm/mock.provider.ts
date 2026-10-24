import { Inject, Injectable } from '@nestjs/common';
import { AI_AGENT_CONFIG, MOCK_ANSWER_DELTAS } from '../ai-agent.constants';
import { AiAgentLocale } from '../ai-agent.types';
import { AiAgentConfig } from '../config/ai-agent.config';

export interface MockAnswerInput {
  locale: AiAgentLocale;
}

/**
 * Deterministic stand-in for the real LLM provider. It streams the same short
 * answer on every request and never touches the network or the knowledge
 * corpus. Session 8 will replace this behind the provider interface.
 */
@Injectable()
export class MockProvider {
  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
  ) {}

  async *streamAnswer(
    input: MockAnswerInput,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const deltas = MOCK_ANSWER_DELTAS[input.locale] ?? MOCK_ANSWER_DELTAS.en;
    for (const delta of deltas) {
      if (!(await this.waitForDelay(signal))) return;
      yield delta;
    }
  }

  /**
   * Wait between deltas, waking immediately on abort. The timer and listener
   * are always released so a client disconnect cannot leave a pending handle.
   */
  private waitForDelay(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    if (this.config.mockDelayMs <= 0) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (allowed: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(allowed);
      };
      const onAbort = (): void => finish(false);
      const timer = setTimeout(() => finish(true), this.config.mockDelayMs);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
