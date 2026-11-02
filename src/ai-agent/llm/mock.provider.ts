import { Inject, Injectable } from '@nestjs/common';
import { AI_AGENT_CONFIG, MOCK_ANSWER_DELTAS } from '../ai-agent.constants';
import { AiAgentLocale } from '../ai-agent.types';
import { AiAgentConfig } from '../config/ai-agent.config';
import { LlmProvider } from './provider.interface';
import {
  createProviderDeadline,
  isLlmAbortError,
  isKnownProviderError,
  normalizeProviderError,
  throwIfDeadlineExceeded,
  waitForProviderDelay,
} from './provider-errors';
import {
  DEFAULT_LLM_TIMEOUT_MS,
  LlmDeterministicScript,
  LlmFinishReason,
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmTurnRequest,
} from './provider.types';

export interface MockAnswerInput {
  locale: AiAgentLocale;
}

/**
 * Deterministic demo/provider double.
 *
 * `streamTurn` implements the Session 8 provider contract. `streamAnswer` is
 * the Session 2 compatibility surface used by the current SSE controller and
 * preserves the exact three-delta mock answer, delay, and abort behavior.
 */
@Injectable()
export class MockProvider implements LlmProvider {
  readonly capabilities: LlmProviderCapabilities = Object.freeze({
    streaming: true,
    functionCalling: true,
    contextWindow: 32_768,
  });

  private script?: LlmDeterministicScript;

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
  ) {}

  /** Test seam: install (or clear) a deterministic scripted turn. */
  setScript(script?: LlmDeterministicScript): this {
    this.script = script;
    return this;
  }

  async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const script = this.script ?? this.defaultScript(request.locale ?? 'en');
    const delayMs = script.delayMs ?? this.config.mockDelayMs;
    const deadline = createProviderDeadline(
      signal,
      request.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    );

    try {
      if (script.error) {
        throw isKnownProviderError(script.error)
          ? script.error
          : normalizeProviderError(script.error);
      }

      if (script.interactionId) {
        yield { type: 'interaction', interactionId: script.interactionId };
      }

      for (const delta of script.text ?? []) {
        throwIfDeadlineExceeded(deadline);
        await waitForProviderDelay(delayMs, deadline);
        throwIfDeadlineExceeded(deadline);
        yield { type: 'text', delta };
      }

      for (const call of script.toolCalls ?? []) {
        throwIfDeadlineExceeded(deadline);
        await waitForProviderDelay(delayMs, deadline);
        throwIfDeadlineExceeded(deadline);
        yield {
          type: 'tool_call',
          callId: call.callId,
          name: call.name,
          arguments: call.arguments,
        };
      }

      if (script.usage) {
        yield { type: 'usage', usage: script.usage };
      }

      yield {
        type: 'finish',
        finishReason: this.resolveFinishReason(script),
        ...(script.interactionId !== undefined
          ? { interactionId: script.interactionId }
          : {}),
        ...(script.usage !== undefined ? { usage: script.usage } : {}),
      };
    } catch (error) {
      if (isKnownProviderError(error)) throw error;
      throw normalizeProviderError(error);
    } finally {
      deadline.dispose();
    }
  }

  /**
   * Session 2 compatibility: the controller consumes only text deltas and
   * treats an abort as a normal early return, so observable SSE behavior is
   * unchanged.
   */
  async *streamAnswer(
    input: MockAnswerInput,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    try {
      for await (const event of this.streamTurn(
        {
          systemInstruction: '',
          input: '',
          maxOutputTokens: 0,
          locale: input.locale,
        },
        signal,
      )) {
        if (event.type === 'text') yield event.delta;
      }
    } catch (error) {
      if (isLlmAbortError(error)) return;
      throw error;
    }
  }

  private defaultScript(locale: AiAgentLocale): LlmDeterministicScript {
    return {
      text: MOCK_ANSWER_DELTAS[locale] ?? MOCK_ANSWER_DELTAS.en,
      finishReason: 'stop',
    };
  }

  private resolveFinishReason(script: LlmDeterministicScript): LlmFinishReason {
    if (script.finishReason !== undefined) return script.finishReason;
    return (script.toolCalls?.length ?? 0) > 0 ? 'tool_calls' : 'stop';
  }
}
