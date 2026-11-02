import { Injectable } from '@nestjs/common';
import { LlmProvider } from './provider.interface';
import {
  createProviderDeadline,
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

const FAKE_ANSWER_DELTAS = [
  'This is the fake provider answer. ',
  'It proves that provider selection is configuration-only. ',
  'No network call was made.',
] as const;

/**
 * Second deterministic provider. It exists to prove the orchestrator/caller is
 * provider-agnostic, and exposes a smaller context window so capability
 * negotiation can be exercised without a real adapter.
 */
@Injectable()
export class FakeProvider implements LlmProvider {
  readonly capabilities: LlmProviderCapabilities = Object.freeze({
    streaming: true,
    functionCalling: true,
    contextWindow: 8_192,
  });

  private script?: LlmDeterministicScript;

  constructor(script?: LlmDeterministicScript) {
    this.script = script;
  }

  /** Test seam: install (or clear) a deterministic scripted turn. */
  setScript(script?: LlmDeterministicScript): this {
    this.script = script;
    return this;
  }

  async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const script = this.script ?? { text: FAKE_ANSWER_DELTAS };
    const delayMs = script.delayMs ?? 0;
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

  private resolveFinishReason(script: LlmDeterministicScript): LlmFinishReason {
    if (script.finishReason !== undefined) return script.finishReason;
    return (script.toolCalls?.length ?? 0) > 0 ? 'tool_calls' : 'stop';
  }
}
