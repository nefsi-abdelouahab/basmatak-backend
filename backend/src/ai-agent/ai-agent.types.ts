/**
 * Transport and configuration types for Basma, the Basmatak AI assistant.
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

/**
 * A knowledge source validated from a `[K#]` citation. `source` is the
 * corpus-relative document path, never an absolute filesystem path.
 */
export interface AiAgentKnowledgeSource {
  id: string;
  title: string;
  source: string;
  heading?: string;
}

export type AiAgentDataSourceType =
  'opportunity' | 'organization' | 'reference' | 'stats';

/**
 * A public-data source validated from a `[T#]` citation. `citationId` is the
 * marker the model wrote; `id` is unique per row so clients can key chips.
 * `path` is a locale-less public frontend route; no internal identifiers leave
 * the backend.
 */
export interface AiAgentDataSource {
  id: string;
  citationId: string;
  type: AiAgentDataSourceType;
  title: string;
  path?: string;
}

/**
 * Sources are emitted only after the complete buffered answer has passed
 * citation validation, never for an unvalidated partial stream.
 */
export interface AiAgentSourcesEvent {
  knowledge: AiAgentKnowledgeSource[];
  data: AiAgentDataSource[];
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
  /** Present when a quota/cooldown reset time is known. */
  retryAfterSeconds?: number;
}

/** Every event the writer is allowed to emit. */
export interface AiAgentSseEventMap {
  meta: AiAgentMetaEvent;
  status: AiAgentStatusEvent;
  sources: AiAgentSourcesEvent;
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
