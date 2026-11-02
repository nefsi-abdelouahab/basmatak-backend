import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../common/logger/app.logger';
import { redactLogText } from '../../common/logger/log-redaction';
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
  ProviderDeadline,
  throwIfDeadlineExceeded,
} from './provider-errors';
import {
  DEFAULT_LLM_TIMEOUT_MS,
  LlmFinishReason,
  LlmFunctionResultInput,
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmToolDeclaration,
  LlmTurnInput,
  LlmTurnRequest,
  LlmUsage,
} from './provider.types';

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const MAX_INTERACTION_STATE = 32;
const INTERACTION_TTL_MS = 10 * 60_000;
const MAX_ERROR_BODY_CHARS = 4096;
const MAX_ERROR_DETAIL_CHARS = 500;

interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface GroqChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
}

interface PendingToolCall {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
}

interface StreamState {
  text: string;
  finishReason?: LlmFinishReason;
  usage?: LlmUsage;
  pending: Map<number, PendingToolCall>;
  sawChunk: boolean;
}

interface StoredInteraction {
  messages: GroqMessage[];
  expiresAt: number;
}

interface GroqErrorDetails {
  code?: string;
  message?: string;
}

interface GroqFailure {
  status?: number;
  code?: string;
  detail?: string;
  stack?: string;
}

export interface GroqProviderOptions {
  /** Test seam; defaults to `process.env.GROQ_API_KEY`. */
  readApiKey?: () => string | undefined;
  /** Test seam for the HTTP client; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam; defaults to the public Groq OpenAI-compatible endpoint. */
  baseUrl?: string;
  /** Test seam; defaults to an AppLogger scoped to this adapter. */
  logger?: AppLogger;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readToken(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function readStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const status = error.status;
  if (typeof status === 'number' && Number.isInteger(status)) return status;
  if (typeof status === 'string' && /^\d{3}$/.test(status.trim())) {
    return Number(status.trim());
  }
  return undefined;
}

function readErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const code = error.code;
  return typeof code === 'string' && code.trim() !== ''
    ? code.trim()
    : undefined;
}

/**
 * Groq adapter.
 *
 * Groq exposes an OpenAI-compatible Chat Completions API. This adapter keeps
 * the provider-neutral contract: it streams text deltas, emits completed tool
 * calls, reports provider usage, and normalizes every transport/HTTP failure
 * before it reaches the orchestrator.
 *
 * Groq has no server-side interaction id, so completed turns are kept in a
 * small bounded in-memory map. When the orchestrator continues a tool round
 * with `previousInteractionId`, the adapter replays the prior messages and
 * appends the tool results, which keeps the OpenAI message sequence valid.
 */
@Injectable()
export class GroqProvider implements LlmProvider {
  readonly capabilities: LlmProviderCapabilities = Object.freeze({
    streaming: true,
    functionCalling: true,
    contextWindow: 131_072,
  });

  private readonly readApiKey: () => string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly logger: AppLogger;
  private readonly interactions = new Map<string, StoredInteraction>();

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    options: GroqProviderOptions = {},
  ) {
    this.readApiKey = options.readApiKey ?? (() => process.env.GROQ_API_KEY);
    this.fetchImpl =
      options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.baseUrl = (options.baseUrl ?? DEFAULT_GROQ_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.logger = options.logger ?? new AppLogger('GroqProvider');
  }

  async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      this.logFailure({
        detail: 'GROQ_API_KEY is missing or blank.',
      });
      throw new LlmProviderUnavailableError();
    }

    const deadline = createProviderDeadline(
      signal,
      request.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      throwIfDeadlineExceeded(deadline);
      this.pruneInteractions(Date.now());

      const continuation =
        request.previousInteractionId !== undefined
          ? this.interactions.get(request.previousInteractionId)
          : undefined;
      const interactionId =
        continuation !== undefined
          ? (request.previousInteractionId ?? randomUUID())
          : randomUUID();

      const messages = this.buildMessages(
        request,
        continuation?.messages,
        continuation !== undefined,
      );
      const body = this.buildRequestBody(request, messages);

      const response = await this.awaitWithDeadline(
        this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
          signal: deadline.signal,
        }),
        deadline,
      );

      if (!response.ok) {
        const details = await this.readErrorDetails(response, deadline);
        const error = new GroqHttpError(
          response.status,
          details.code,
          details.message,
        );
        throw error;
      }

      if (response.body === null) {
        throw new LlmInvalidResponseError();
      }

      yield { type: 'interaction', interactionId };

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      const state: StreamState = {
        text: '',
        pending: new Map<number, PendingToolCall>(),
        sawChunk: false,
      };
      let buffer = '';
      let done = false;

      while (!done) {
        const read = await this.awaitWithDeadline(reader.read(), deadline);
        if (read.done) break;

        buffer += decoder.decode(read.value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          const outcome = this.consumeLine(line, state);
          if (outcome === 'done') {
            done = true;
            break;
          }
          for (const event of outcome ?? []) yield event;
          newline = buffer.indexOf('\n');
        }
      }

      buffer += decoder.decode();
      if (!done && buffer.trim() !== '') {
        const outcome = this.consumeLine(buffer, state);
        if (outcome !== 'done' && outcome !== undefined) {
          for (const event of outcome) yield event;
        }
      }

      if (!state.sawChunk) {
        throw new LlmInvalidResponseError();
      }

      const resolvedCalls = this.resolveToolCalls(state.pending);
      const finishReason =
        state.finishReason ??
        (resolvedCalls.length > 0 ? 'tool_calls' : 'stop');

      if (finishReason === 'tool_calls' && resolvedCalls.length === 0) {
        throw new LlmInvalidResponseError();
      }
      if (finishReason === 'error') {
        throw new LlmProviderUnavailableError();
      }

      for (const call of resolvedCalls) {
        yield {
          type: 'tool_call',
          callId: call.call.callId,
          name: call.call.name,
          arguments: call.call.arguments,
        };
      }

      if (state.usage !== undefined) {
        yield { type: 'usage', usage: state.usage };
      }

      // Store before yielding `finish`: the orchestrator stops iterating as
      // soon as it sees the finish event, so code after that yield may never
      // run. The continuation must be available for the next tool round.
      this.storeInteraction(interactionId, messages, {
        role: 'assistant',
        content: state.text === '' ? null : state.text,
        ...(resolvedCalls.length > 0
          ? { tool_calls: resolvedCalls.map((call) => call.raw) }
          : {}),
      });

      yield {
        type: 'finish',
        finishReason,
        interactionId,
        ...(state.usage !== undefined ? { usage: state.usage } : {}),
      };
    } catch (error) {
      if (deadline.isCallerAborted()) {
        throw new LlmAbortError();
      }
      if (deadline.isTimedOut()) {
        this.logFailure({
          detail: 'The Groq turn exceeded the configured deadline.',
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw new LlmTimeoutError();
      }
      this.logFailure({
        status: readStatus(error),
        code: readErrorCode(error),
        detail: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw normalizeProviderError(error);
    } finally {
      deadline.dispose();
      if (reader !== undefined) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort stream cleanup; the request signal was already aborted.
        }
      }
    }
  }

  private buildMessages(
    request: LlmTurnRequest,
    previous: readonly GroqMessage[] | undefined,
    hasContinuation: boolean,
  ): GroqMessage[] {
    const base: GroqMessage[] =
      previous !== undefined
        ? previous.map((message) => ({
            ...message,
            ...(message.tool_calls !== undefined
              ? {
                  tool_calls: message.tool_calls.map((call) => ({
                    ...call,
                    function: { ...call.function },
                  })),
                }
              : {}),
          }))
        : [{ role: 'system', content: request.systemInstruction }];

    return [...base, ...this.mapInput(request.input, hasContinuation)];
  }

  private mapInput(
    input: LlmTurnInput,
    hasContinuation: boolean,
  ): GroqMessage[] {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }

    const messages: GroqMessage[] = [];
    const functionResults = input.filter(
      (item): item is LlmFunctionResultInput => item.type === 'function_result',
    );

    // A missing/expired continuation would otherwise send `tool` messages with
    // no preceding assistant `tool_calls`, which OpenAI-compatible APIs reject.
    if (functionResults.length > 0 && !hasContinuation) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: functionResults.map((item) => ({
          id: item.callId,
          type: 'function',
          function: {
            name: item.name,
            arguments: '{}',
          },
        })),
      });
    }

    for (const item of input) {
      if (item.type === 'function_result') {
        messages.push({
          role: 'tool',
          tool_call_id: item.callId,
          name: item.name,
          content: this.serializeFunctionResult(item.result),
        });
        continue;
      }
      messages.push({ role: 'user', content: item.text });
    }

    return messages;
  }

  private serializeFunctionResult(result: unknown): string {
    if (typeof result === 'string') return result;
    try {
      return JSON.stringify(result) ?? 'null';
    } catch {
      return JSON.stringify({ error: 'unserializable' });
    }
  }

  private buildRequestBody(
    request: LlmTurnRequest,
    messages: readonly GroqMessage[],
  ): Record<string, unknown> {
    const tools: LlmToolDeclaration[] = Array.isArray(request.tools)
      ? [...request.tools]
      : [];

    return {
      model: request.model?.trim() || this.config.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: Math.max(1, Math.trunc(request.maxOutputTokens)),
      ...(tools.length > 0
        ? {
            tools: tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };
  }

  private consumeLine(
    rawLine: string,
    state: StreamState,
  ): LlmStreamEvent[] | 'done' | undefined {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) return undefined;

    const payload = line.slice('data:'.length).trim();
    if (payload === '') return undefined;
    if (payload === '[DONE]') return 'done';

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new LlmInvalidResponseError();
    }
    if (!isRecord(parsed)) throw new LlmInvalidResponseError();

    state.sawChunk = true;
    const chunk = parsed as GroqChunk;
    const events: LlmStreamEvent[] = [];
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;

    if (choice !== undefined) {
      const delta = isRecord(choice.delta) ? choice.delta : undefined;
      if (delta !== undefined) {
        if (typeof delta.content === 'string' && delta.content !== '') {
          state.text += delta.content;
          events.push({ type: 'text', delta: delta.content });
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const rawCall of delta.tool_calls) {
            if (!isRecord(rawCall)) throw new LlmInvalidResponseError();
            const index =
              typeof rawCall.index === 'number' &&
              Number.isInteger(rawCall.index)
                ? rawCall.index
                : state.pending.size;
            const pending = state.pending.get(index) ?? {
              index,
              arguments: '',
            };
            if (typeof rawCall.id === 'string' && rawCall.id !== '') {
              pending.id = rawCall.id;
            }
            const fn = isRecord(rawCall.function)
              ? rawCall.function
              : undefined;
            if (fn !== undefined) {
              if (typeof fn.name === 'string' && fn.name !== '') {
                pending.name = fn.name;
              }
              if (typeof fn.arguments === 'string') {
                pending.arguments += fn.arguments;
              }
            }
            state.pending.set(index, pending);
          }
        }
      }

      if (typeof choice.finish_reason === 'string') {
        state.finishReason = this.mapFinishReason(
          choice.finish_reason,
          state.pending.size > 0,
        );
      }
    }

    if (isRecord(chunk.usage)) {
      const usage = this.mapUsage(chunk.usage);
      if (usage !== undefined) state.usage = usage;
    }

    return events;
  }

  private resolveToolCalls(pending: Map<number, PendingToolCall>): Array<{
    raw: GroqToolCall;
    call: {
      callId: string;
      name: string;
      arguments: Record<string, unknown>;
    };
  }> {
    return [...pending.values()]
      .sort((left, right) => left.index - right.index)
      .map((item, position) => {
        const name = item.name?.trim();
        if (name === undefined || name === '') {
          throw new LlmInvalidResponseError();
        }
        const callId = item.id?.trim() || `call_${position + 1}`;
        const rawArguments =
          item.arguments.trim() === '' ? '{}' : item.arguments;
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawArguments);
        } catch {
          throw new LlmInvalidResponseError();
        }
        if (!isRecord(parsed)) throw new LlmInvalidResponseError();
        return {
          raw: {
            id: callId,
            type: 'function',
            function: { name, arguments: rawArguments },
          },
          call: { callId, name, arguments: parsed },
        };
      });
  }

  private mapFinishReason(
    reason: string,
    hasToolCalls: boolean,
  ): LlmFinishReason {
    if (reason === 'tool_calls' || reason === 'function_call') {
      return 'tool_calls';
    }
    if (reason === 'length' || reason === 'max_tokens') return 'length';
    if (reason === 'error') return 'error';
    if (hasToolCalls) return 'tool_calls';
    return 'stop';
  }

  private mapUsage(raw: Record<string, unknown>): LlmUsage | undefined {
    const inputTokens = readToken(raw.prompt_tokens);
    const outputTokens = readToken(raw.completion_tokens);
    const totalTokens = readToken(raw.total_tokens);
    if (
      inputTokens === undefined &&
      outputTokens === undefined &&
      totalTokens === undefined
    ) {
      return undefined;
    }
    return {
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    };
  }

  private async readErrorDetails(
    response: Response,
    deadline: ProviderDeadline,
  ): Promise<GroqErrorDetails> {
    let text = '';
    try {
      text = await this.awaitWithDeadline(response.text(), deadline);
    } catch {
      return {};
    }
    const bounded = text.slice(0, MAX_ERROR_BODY_CHARS);
    if (bounded.trim() === '') return {};

    try {
      const parsed: unknown = JSON.parse(bounded);
      if (isRecord(parsed) && isRecord(parsed.error)) {
        const code = parsed.error.code ?? parsed.error.type;
        return {
          ...(typeof code === 'string' && code.trim() !== ''
            ? { code: code.trim() }
            : {}),
          ...(typeof parsed.error.message === 'string'
            ? { message: parsed.error.message }
            : {}),
        };
      }
    } catch {
      // Fall through to the bounded raw body.
    }

    return { message: bounded };
  }

  private storeInteraction(
    interactionId: string,
    messages: readonly GroqMessage[],
    assistant: GroqMessage,
  ): void {
    const now = Date.now();
    this.pruneInteractions(now);
    this.interactions.delete(interactionId);
    this.interactions.set(interactionId, {
      messages: [...messages, assistant],
      expiresAt: now + INTERACTION_TTL_MS,
    });

    while (this.interactions.size > MAX_INTERACTION_STATE) {
      const oldest = this.interactions.keys().next().value;
      if (oldest === undefined) break;
      this.interactions.delete(oldest);
    }
  }

  private pruneInteractions(now: number): void {
    for (const [id, stored] of this.interactions) {
      if (stored.expiresAt <= now) this.interactions.delete(id);
    }
  }

  private resolveApiKey(): string | undefined {
    const value = this.readApiKey();
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  private logFailure(failure: GroqFailure): void {
    try {
      const message = redactLogText(failure.detail, MAX_ERROR_DETAIL_CHARS);
      const stack = redactLogText(failure.stack, 2000);
      this.logger.error(
        JSON.stringify({
          event: 'ai_agent_provider_failure',
          provider: 'groq',
          model: this.config.model,
          ...(failure.status !== undefined ? { status: failure.status } : {}),
          ...(failure.code !== undefined ? { providerCode: failure.code } : {}),
          ...(message !== undefined ? { message } : {}),
          ...(stack !== undefined ? { stack } : {}),
        }),
      );
    } catch {
      // Logging must never break the request path.
    }
  }

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
}

class GroqHttpError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode?: string,
    readonly providerMessage?: string,
  ) {
    super(
      providerMessage !== undefined && providerMessage.trim() !== ''
        ? providerMessage
        : 'The Groq API request failed.',
    );
    this.name = 'GroqHttpError';
  }

  get code(): string | undefined {
    return this.providerCode;
  }
}
