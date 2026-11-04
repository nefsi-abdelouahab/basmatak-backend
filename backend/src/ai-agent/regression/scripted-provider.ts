import { LlmProviderUnavailableError } from '../llm/provider-errors';
import type { LlmProvider } from '../llm/provider.interface';
import type {
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmTurnRequest,
} from '../llm/provider.types';
import type { RecordedToolCall, RegressionTurn } from './types';

const SCRIPTED_CAPABILITIES: LlmProviderCapabilities = Object.freeze({
  streaming: true,
  functionCalling: true,
  contextWindow: 100_000,
});

/**
 * Scripted provider used by CI.
 *
 * It only emits a tool call when the router actually declared that tool in the
 * provider request. A missing declaration therefore surfaces as a missing tool
 * call (and a failed tool-choice check) instead of being hidden by the script.
 */
export class ScriptedRegressionProvider implements LlmProvider {
  readonly capabilities = SCRIPTED_CAPABILITIES;

  private turn?: RegressionTurn;
  private interactionCounter = 0;

  setTurn(turn: RegressionTurn): void {
    this.turn = turn;
  }

  async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const turn = this.turn;
    if (turn === undefined) throw new LlmProviderUnavailableError();
    if (signal.aborted) throw new LlmProviderUnavailableError();

    const isFollowUp =
      Array.isArray(request.input) &&
      request.input.some(
        (entry) =>
          typeof entry === 'object' && entry.type === 'function_result',
      );
    const declared = new Set((request.tools ?? []).map((tool) => tool.name));

    this.interactionCounter += 1;
    const interactionId = `regression-${this.interactionCounter}`;

    if (!isFollowUp && (turn.scriptToolCalls?.length ?? 0) > 0) {
      const calls = (turn.scriptToolCalls ?? []).filter((call) =>
        declared.has(call.name),
      );
      if (calls.length > 0) {
        yield { type: 'interaction', interactionId };
        for (const [index, call] of calls.entries()) {
          yield {
            type: 'tool_call',
            callId: `call-${index + 1}`,
            name: call.name,
            arguments: { ...call.arguments },
          };
        }
        yield { type: 'finish', finishReason: 'tool_calls' };
        return;
      }
    }

    yield { type: 'interaction', interactionId };
    const answer = turn.scriptAnswer;
    if (answer !== '') {
      const third = Math.max(1, Math.ceil(answer.length / 3));
      for (let index = 0; index < answer.length; index += third) {
        yield { type: 'text', delta: answer.slice(index, index + third) };
      }
    }
    yield { type: 'finish', finishReason: 'stop' };
  }
}

/**
 * Transport recorder for both scripted and live providers. The orchestrator
 * sees the delegate exactly as before; the harness gets declared tools, provider
 * tool calls, returned text, and request count without provider-specific hooks.
 */
export class RecordingProvider implements LlmProvider {
  readonly capabilities: LlmProviderCapabilities;

  readonly requests: LlmTurnRequest[] = [];
  readonly toolCalls: RecordedToolCall[] = [];
  readonly textDeltas: string[] = [];

  constructor(private readonly delegate: LlmProvider) {
    this.capabilities = delegate.capabilities;
  }

  reset(): void {
    this.requests.length = 0;
    this.toolCalls.length = 0;
    this.textDeltas.length = 0;
  }

  get providerCalls(): number {
    return this.requests.length;
  }

  get declaredTools(): string[] {
    const names = new Set<string>();
    for (const request of this.requests) {
      for (const tool of request.tools ?? []) names.add(tool.name);
    }
    return [...names].sort();
  }

  async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    this.requests.push(request);
    for await (const event of this.delegate.streamTurn(request, signal)) {
      if (event.type === 'tool_call') {
        this.toolCalls.push({
          name: event.name,
          arguments: { ...event.arguments },
        });
      } else if (event.type === 'text') {
        this.textDeltas.push(event.delta);
      }
      yield event;
    }
  }
}
