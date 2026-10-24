/**
 * Transport and configuration types for the Basmatak AI assistant.
 *
 * These types are the public contract shared by the SSE writer, the controller,
 * and (from later sessions) the orchestrator. Keep event payloads additive:
 * adding an optional field is safe, renaming or removing one is not.
 */

export type AiAgentLocale = 'en' | 'ar';

export type AiAgentMode =
  'normal' | 'conservative' | 'knowledge_only' | 'retrieval_only' | 'exhausted';

export type AiAgentChatRole = 'user' | 'assistant';

export interface AiAgentChatMessage {
  role: AiAgentChatRole;
  content: string;
}

export interface AiAgentMetaEvent {
  conversationId: string;
  locale: AiAgentLocale;
  mode: AiAgentMode;
}

export type AiAgentStatusState =
  'searching' | 'thinking' | 'answering' | 'tool';

export interface AiAgentStatusEvent {
  state: AiAgentStatusState;
  tool?: string;
}

export interface AiAgentTokenEvent {
  delta: string;
}

export type AiAgentFinishReason = 'stop' | 'length' | 'error';

export interface AiAgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated?: boolean;
}

export interface AiAgentDoneEvent {
  finishReason: AiAgentFinishReason;
  truncated?: boolean;
  usage?: AiAgentUsage;
}

export type AiAgentErrorCode =
  | 'AI_AGENT_DISABLED'
  | 'AI_AGENT_INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'AI_AGENT_QUOTA_EXHAUSTED'
  | 'AI_AGENT_BUSY'
  | 'AI_AGENT_PROVIDER_UNAVAILABLE'
  | 'AI_AGENT_TIMEOUT'
  | 'AI_AGENT_INTERNAL_ERROR';

export interface AiAgentErrorEvent {
  code: AiAgentErrorCode;
  message: string;
}

/**
 * Every event the writer is allowed to emit. `sources` is deliberately absent
 * until the grounding session; do not add it early.
 */
export interface AiAgentSseEventMap {
  meta: AiAgentMetaEvent;
  status: AiAgentStatusEvent;
  token: AiAgentTokenEvent;
  done: AiAgentDoneEvent;
  error: AiAgentErrorEvent;
}

export type AiAgentSseEventName = keyof AiAgentSseEventMap;

export interface AiAgentKnowledgeCounts {
  files: number;
  chunks: number;
}

export interface AiAgentPublicLimits {
  messageChars: number;
  historyMessages: number;
  historyChars: number;
}

/**
 * Public status payload. It must never contain the provider, model, API key,
 * token counts, usage, or internal configuration.
 */
export interface AiAgentStatusResponse {
  enabled: boolean;
  mode: AiAgentMode;
  knowledge: AiAgentKnowledgeCounts;
  limits: AiAgentPublicLimits;
}
