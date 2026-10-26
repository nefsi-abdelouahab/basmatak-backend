import type { AiAgentFinishReason, AiAgentLocale } from '../ai-agent.types';
import type { ToolDescriptor } from '../tools/tool.types';

/**
 * Provider-neutral contract for a single assistant turn.
 *
 * Nothing here may reference a provider SDK. Session 9's orchestrator consumes
 * these types; adapters are free to translate them into Gemini, Groq, or a
 * deterministic test double.
 */

/** Total turn deadline used by every provider unless the caller overrides it. */
export const DEFAULT_LLM_TIMEOUT_MS = 45_000;

export interface LlmProviderCapabilities {
  /** The provider can stream text incrementally. */
  readonly streaming: boolean;
  /** The provider can emit function/tool calls. */
  readonly functionCalling: boolean;
  /** Maximum input + output context in tokens. */
  readonly contextWindow: number;
}

export type LlmFinishReason = 'stop' | 'length' | 'tool_calls' | 'error';

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Present only when the caller supplied an estimate instead of provider usage. */
  estimated?: boolean;
}

export interface LlmToolParameters {
  type: 'object';
  properties: Record<string, unknown>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

/** Metadata-only tool declaration. Handlers never cross the provider boundary. */
export interface LlmToolDeclaration {
  name: string;
  description: string;
  parameters: LlmToolParameters;
}

export interface LlmTextInput {
  type: 'text';
  text: string;
}

export interface LlmFunctionResultInput {
  type: 'function_result';
  callId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

/**
 * A text turn or a follow-up turn that returns tool results. Plain strings are
 * the common case; the structured form lets Session 9 close the tool loop
 * without provider-specific input types.
 */
export type LlmTurnInput =
  string | readonly (LlmTextInput | LlmFunctionResultInput)[];

export interface LlmTurnRequest {
  /** Optional model override; adapters fall back to the configured model. */
  model?: string;
  systemInstruction: string;
  input: LlmTurnInput;
  tools?: readonly LlmToolDeclaration[];
  /** Server-side interaction id from a previous turn. */
  previousInteractionId?: string;
  maxOutputTokens: number;
  /** Overrides `DEFAULT_LLM_TIMEOUT_MS`; tests use a tiny value. */
  timeoutMs?: number;
  /**
   * Provider-neutral language hint. Only deterministic test providers use it
   * to pick a fixture; real adapters ignore it.
   */
  locale?: AiAgentLocale;
}

export type LlmStreamEvent =
  | {
      type: 'interaction';
      interactionId: string;
    }
  | {
      type: 'text';
      delta: string;
    }
  | {
      type: 'tool_call';
      callId: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: 'usage';
      usage: LlmUsage;
    }
  | {
      type: 'finish';
      finishReason: LlmFinishReason;
      interactionId?: string;
      usage?: LlmUsage;
    };

/** Derive the provider-facing declaration from a registry descriptor. */
export function toLlmToolDeclaration(
  descriptor: ToolDescriptor,
): LlmToolDeclaration {
  return {
    name: descriptor.name,
    description: descriptor.description,
    parameters: {
      type: 'object',
      properties: { ...descriptor.inputSchema.properties },
      ...(descriptor.inputSchema.required !== undefined
        ? { required: [...descriptor.inputSchema.required] }
        : {}),
      additionalProperties: descriptor.inputSchema.additionalProperties,
    },
  };
}

/**
 * Map a provider-neutral finish reason onto the existing SSE finish reason.
 *
 * `length` maps directly to `length` (the answer was truncated by the output
 * cap). `stop` maps to `stop` and `error` to `error`. `tool_calls` is an
 * intermediate outcome: Session 9 runs the tool round and starts another turn,
 * so it must never be emitted as a final SSE `done`; the fallback mapping is
 * `stop` only for callers that treat a provisional turn as complete.
 */
export function toAiAgentFinishReason(
  reason: LlmFinishReason,
): AiAgentFinishReason {
  if (reason === 'length') return 'length';
  if (reason === 'error') return 'error';
  return 'stop';
}

export type LlmMissingCapability =
  'streaming' | 'function_calling' | 'context_window';

export interface LlmCapabilityRequirement {
  streaming?: boolean;
  functionCalling?: boolean;
  minContextWindow?: number;
}

export type LlmCapabilityCheck =
  { ok: true } | { ok: false; missing: readonly LlmMissingCapability[] };

/**
 * Small negotiation guard for Session 9. No fallback or degradation is applied
 * here: the caller decides what to do when a requirement is missing.
 */
export function checkLlmCapabilities(
  capabilities: LlmProviderCapabilities,
  requirement: LlmCapabilityRequirement,
): LlmCapabilityCheck {
  const missing: LlmMissingCapability[] = [];
  if (requirement.streaming === true && !capabilities.streaming) {
    missing.push('streaming');
  }
  if (requirement.functionCalling === true && !capabilities.functionCalling) {
    missing.push('function_calling');
  }
  if (
    requirement.minContextWindow !== undefined &&
    capabilities.contextWindow < requirement.minContextWindow
  ) {
    missing.push('context_window');
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export function supportsLlmCapabilities(
  capabilities: LlmProviderCapabilities,
  requirement: LlmCapabilityRequirement,
): boolean {
  return checkLlmCapabilities(capabilities, requirement).ok;
}

export interface LlmScriptedToolCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Deterministic test-provider script. Production adapters never read it; Mock
 * and Fake use it to exercise tool, usage, finish, and error paths without a
 * network call.
 */
export interface LlmDeterministicScript {
  interactionId?: string;
  text?: readonly string[];
  toolCalls?: readonly LlmScriptedToolCall[];
  usage?: LlmUsage;
  finishReason?: LlmFinishReason;
  /** Delay before each text delta/tool call. Overrides the mock config delay. */
  delayMs?: number;
  /** Optional normalized failure to throw before emitting events. */
  error?: Error;
}
