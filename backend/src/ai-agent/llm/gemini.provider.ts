import { Inject, Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import { AiAgentConfig } from '../config/ai-agent.config';
import { LlmProvider } from './provider.interface';
import {
  createProviderDeadline,
  deadlineError,
  LlmAbortError,
  LlmInvalidResponseError,
  LlmProviderUnavailableError,
  LlmTimeoutError,
  normalizeProviderError,
  normalizeProviderStreamError,
  ProviderDeadline,
  throwIfDeadlineExceeded,
} from './provider-errors';
import {
  DEFAULT_LLM_TIMEOUT_MS,
  LlmFinishReason,
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmTurnInput,
  LlmTurnRequest,
  LlmUsage,
} from './provider.types';

/**
 * The official `@google/genai` SDK is required because it is the supported
 * server-side client for the Gemini Interactions API, including streaming
 * lifecycle events, function calls, usage, and `previous_interaction_id`.
 * Importing it has no side effects and never reads a key; the client is built
 * lazily on the first turn.
 */

export interface GeminiProviderOptions {
  /** Test seam; defaults to `process.env.GEMINI_API_KEY`. */
  readApiKey?: () => string | undefined;
}

interface PendingFunctionCall {
  callId: string;
  name: string;
  chunks: string[];
  initialArguments: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly capabilities: LlmProviderCapabilities = Object.freeze({
    streaming: true,
    functionCalling: true,
    contextWindow: 1_000_000,
  });

  private readonly readApiKey: () => string | undefined;
  private client?: GoogleGenAI;
  private clientApiKey?: string;

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    options: GeminiProviderOptions = {},
  ) {
    this.readApiKey = options.readApiKey ?? (() => process.env.GEMINI_API_KEY);
  }

  async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      // Fail closed only when a turn is attempted. Module boot and the public
      // status endpoint never need a key.
      throw new LlmProviderUnavailableError();
    }

    const deadline = createProviderDeadline(
      signal,
      request.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    );
    let iterator: AsyncIterator<Interactions.InteractionSSEEvent> | undefined;

    try {
      throwIfDeadlineExceeded(deadline);

      const stream = await this.awaitWithDeadline(
        this.getClient(apiKey).interactions.create(this.buildParams(request), {
          signal: deadline.signal,
          // Session 9 owns the single transient-5xx retry. The adapter never
          // retries on its own.
          retries: { strategy: 'none' },
        }),
        deadline,
      );
      iterator = stream[Symbol.asyncIterator]();

      let interactionId: string | undefined;
      let interactionAnnounced = false;
      let status: string | undefined;
      let latestUsage: Interactions.Interaction['usage'];
      let usageEmitted = false;
      let toolCalls = 0;
      let finished = false;
      const emittedCallIds = new Set<string>();
      const pendingCalls = new Map<number, PendingFunctionCall>();
      const orphanArgumentChunks = new Map<number, string[]>();

      const announce = (id: string | undefined): LlmStreamEvent | undefined => {
        if (id === undefined || id === interactionId) return undefined;
        interactionId = id;
        if (interactionAnnounced) return undefined;
        interactionAnnounced = true;
        return { type: 'interaction', interactionId: id };
      };

      while (!finished) {
        const next = await this.awaitWithDeadline(iterator.next(), deadline);
        if (next.done === true) break;
        throwIfDeadlineExceeded(deadline);
        const event = next.value;

        switch (event.event_type) {
          case 'interaction.created': {
            const announcement = announce(event.interaction.id);
            if (announcement) yield announcement;
            break;
          }

          case 'interaction.status_update': {
            const announcement = announce(event.interaction_id);
            if (announcement) yield announcement;
            if (event.status !== undefined) status = event.status;
            if (event.usage !== undefined) latestUsage = event.usage;
            break;
          }

          case 'step.start': {
            if (event.step.type === 'function_call') {
              const orphanChunks = orphanArgumentChunks.get(event.index);
              orphanArgumentChunks.delete(event.index);
              pendingCalls.set(event.index, {
                callId: event.step.id,
                name: event.step.name,
                chunks: orphanChunks ?? [],
                initialArguments: event.step.arguments,
              });
            }
            break;
          }

          case 'step.delta': {
            if (event.delta.type === 'text' && event.delta.text !== '') {
              yield { type: 'text', delta: event.delta.text };
              break;
            }
            if (event.delta.type === 'arguments_delta') {
              const chunk = event.delta.arguments ?? '';
              const pending = pendingCalls.get(event.index);
              if (pending) {
                pending.chunks.push(chunk);
              } else {
                const chunks = orphanArgumentChunks.get(event.index) ?? [];
                chunks.push(chunk);
                orphanArgumentChunks.set(event.index, chunks);
              }
            }
            break;
          }

          case 'step.stop': {
            latestUsage = event.usage ?? event.step_usage ?? latestUsage;
            const pending = pendingCalls.get(event.index);
            if (!pending) break;
            pendingCalls.delete(event.index);
            const call = this.resolveFunctionCall(pending);
            if (emittedCallIds.has(call.callId)) break;
            emittedCallIds.add(call.callId);
            toolCalls += 1;
            yield {
              type: 'tool_call',
              callId: call.callId,
              name: call.name,
              arguments: call.arguments,
            };
            break;
          }

          case 'interaction.completed': {
            const interaction = event.interaction;
            const announcement = announce(interaction.id);
            if (announcement) yield announcement;
            if (interaction.status !== undefined) status = interaction.status;
            if (interaction.usage !== undefined) {
              latestUsage = interaction.usage;
            }

            // Some SDK/server combinations include the final function-call
            // steps only on the completion event. Emit any call that was not
            // already emitted from step.stop.
            for (const step of interaction.steps ?? []) {
              if (step.type !== 'function_call') continue;
              if (emittedCallIds.has(step.id)) continue;
              const argumentsObject = this.resolveStepArguments(step.arguments);
              const callId = this.validateCallMetadata(step.id, step.name);
              emittedCallIds.add(callId);
              toolCalls += 1;
              yield {
                type: 'tool_call',
                callId,
                name: step.name,
                arguments: argumentsObject,
              };
            }

            this.throwIfInteractionFailed(interaction);

            const finishReason = this.resolveFinishReason(status, toolCalls);
            const usage = this.mapUsage(latestUsage);
            if (usage !== undefined && !usageEmitted) {
              usageEmitted = true;
              yield { type: 'usage', usage };
            }
            yield {
              type: 'finish',
              finishReason,
              ...(interactionId !== undefined ? { interactionId } : {}),
              ...(usage !== undefined ? { usage } : {}),
            };
            finished = true;
            break;
          }

          case 'error': {
            throw normalizeProviderStreamError(event.error);
          }

          default:
            break;
        }
      }

      if (!finished) {
        const finishReason = this.resolveFinishReason(status, toolCalls);
        const usage = this.mapUsage(latestUsage);
        if (usage !== undefined && !usageEmitted) {
          usageEmitted = true;
          yield { type: 'usage', usage };
        }
        yield {
          type: 'finish',
          finishReason,
          ...(interactionId !== undefined ? { interactionId } : {}),
          ...(usage !== undefined ? { usage } : {}),
        };
      }
    } catch (error) {
      if (deadline.isCallerAborted()) throw new LlmAbortError();
      if (deadline.isTimedOut()) throw new LlmTimeoutError();
      throw normalizeProviderError(error);
    } finally {
      deadline.dispose();
      if (iterator?.return !== undefined) {
        try {
          const closeResult = iterator.return();
          if (closeResult !== undefined) {
            void closeResult.catch(() => undefined);
          }
        } catch {
          // Best-effort stream cleanup; the request signal was already aborted.
        }
      }
    }
  }

  private buildParams(
    request: LlmTurnRequest,
  ): Interactions.InteractionCreateParams.CreateModelInteractionParamsStreaming {
    const model = request.model?.trim() || this.config.model;
    const tools: Interactions.Tool[] | undefined = request.tools?.map(
      (tool) => ({
        type: 'function' as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }),
    );

    return {
      model,
      input: this.mapInput(request.input),
      system_instruction: request.systemInstruction,
      ...(tools !== undefined ? { tools } : {}),
      stream: true,
      ...(request.previousInteractionId !== undefined
        ? { previous_interaction_id: request.previousInteractionId }
        : {}),
      generation_config: { max_output_tokens: request.maxOutputTokens },
    };
  }

  private mapInput(
    input: LlmTurnInput,
  ): Interactions.InteractionCreateParams.CreateModelInteractionParamsStreaming['input'] {
    if (typeof input === 'string') return input;

    const steps: Interactions.Step[] = input.map((item): Interactions.Step => {
      if (item.type === 'text') {
        return {
          type: 'user_input',
          content: [{ type: 'text', text: item.text }],
        };
      }
      return {
        type: 'function_result',
        call_id: item.callId,
        name: item.name,
        result: this.serializeFunctionResult(item.result),
        ...(item.isError === true ? { is_error: true } : {}),
      };
    });
    return steps;
  }

  private serializeFunctionResult(result: unknown): string {
    if (typeof result === 'string') return result;
    try {
      return JSON.stringify(result) ?? '';
    } catch {
      throw new LlmInvalidResponseError();
    }
  }

  private resolveApiKey(): string | undefined {
    const value = this.readApiKey();
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  private getClient(apiKey: string): GoogleGenAI {
    if (this.client === undefined || this.clientApiKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.clientApiKey = apiKey;
    }
    return this.client;
  }

  /**
   * Race an SDK promise with the turn deadline. The SDK receives the same
   * AbortSignal, but racing here guarantees prompt timeout/abort handling even
   * if a custom client ignores it.
   */
  private awaitWithDeadline<T>(
    promise: Promise<T>,
    deadline: ProviderDeadline,
  ): Promise<T> {
    if (deadline.signal.aborted) {
      return Promise.reject(deadlineError(deadline));
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        deadline.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(deadlineError(deadline));
      };
      deadline.signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      );
    });
  }

  private resolveFunctionCall(pending: PendingFunctionCall): {
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
  } {
    const callId = this.validateCallMetadata(pending.callId, pending.name);
    const raw = pending.chunks.length > 0 ? pending.chunks.join('') : undefined;
    if (raw !== undefined && raw.trim() !== '') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new LlmInvalidResponseError();
      }
      return {
        callId,
        name: pending.name,
        arguments: this.resolveStepArguments(parsed),
      };
    }
    return {
      callId,
      name: pending.name,
      arguments: this.resolveStepArguments(pending.initialArguments),
    };
  }

  private resolveStepArguments(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) return {};
    if (!isRecord(value)) throw new LlmInvalidResponseError();
    return value;
  }

  private validateCallMetadata(callId: unknown, name: unknown): string {
    if (typeof callId !== 'string' || callId.trim() === '') {
      throw new LlmInvalidResponseError();
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new LlmInvalidResponseError();
    }
    return callId;
  }

  private throwIfInteractionFailed(
    interaction: Interactions.Interaction,
  ): void {
    const status = interaction.status;
    if (status !== 'failed' && status !== 'cancelled') return;
    const firstError = interaction.errors?.[0];
    throw normalizeProviderError({
      code: firstError?.code,
      message: firstError?.message,
    });
  }

  private resolveFinishReason(
    status: string | undefined,
    toolCalls: number,
  ): LlmFinishReason {
    if (status === 'requires_action') {
      if (toolCalls === 0) throw new LlmInvalidResponseError();
      return 'tool_calls';
    }
    if (toolCalls > 0) return 'tool_calls';
    if (status === 'incomplete' || status === 'budget_exceeded') {
      return 'length';
    }
    if (status === 'completed') return 'stop';
    throw new LlmInvalidResponseError();
  }

  private mapUsage(
    usage: Interactions.Interaction['usage'],
  ): LlmUsage | undefined {
    if (usage === undefined) return undefined;
    const input = usage.total_input_tokens;
    const output = usage.total_output_tokens;
    const total = usage.total_tokens;
    const hasInput = typeof input === 'number' && Number.isFinite(input);
    const hasOutput = typeof output === 'number' && Number.isFinite(output);
    const hasTotal = typeof total === 'number' && Number.isFinite(total);
    if (!hasInput && !hasOutput && !hasTotal) return undefined;
    const inputTokens = hasInput ? input : 0;
    const outputTokens = hasOutput ? output : 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: hasTotal ? total : inputTokens + outputTokens,
    };
  }
}
