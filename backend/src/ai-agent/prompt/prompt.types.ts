import type {
  AiAgentChatMessage,
  AiAgentLocale,
  AiAgentMode,
} from '../ai-agent.types';
import type { ConversationFocus } from '../conversation-focus';
import type { RecentEntities } from '../recent-entities';
import type { RetrievalResult } from '../knowledge/retriever';
import type { RouterIntent } from '../router/intent-router';
import type { ToolDescriptor, ToolExecutionResult } from '../tools/tool.types';

/**
 * Provider-neutral prompt contract.
 *
 * `BuiltPrompt` is JSON-safe and contains no handler, logger, or provider
 * object. Session 8 can turn `text` (or `system` plus the delimited sections)
 * into a provider request, and Session 9 can use `citations` to validate the
 * answer's citation IDs.
 */

/** Internal response language. The public DTO remains `AiAgentLocale`. */
export type PromptLanguage = 'ar' | 'en';

export type PromptSectionName =
  | 'system_rules'
  | 'response_style'
  | 'style_examples'
  | 'link_rules'
  | 'tools'
  | 'knowledge'
  | 'tool_results'
  | 'recent_entities'
  | 'conversation_focus'
  | 'history'
  | 'examples'
  | 'user_message';

export interface PromptExample {
  input: string;
  output: string;
}

export interface PromptCitation {
  /** `K1..Kn` for knowledge, `T1..Tn` for tool results. */
  id: string;
  kind: 'knowledge' | 'tool';
  /** Knowledge source path, relative to the corpus root. */
  source?: string;
  /** Knowledge document title. */
  title?: string;
  /** Knowledge heading trail joined with ` > `. */
  heading?: string;
  /** Knowledge chunk locale. */
  locale?: string;
  /** BM25 score of the knowledge chunk. */
  score?: number;
  /** Tool name for a tool-result citation. */
  tool?: string;
  /** Whether the tool call succeeded. */
  ok?: boolean;
  /** Whether the tool payload was shortened by the executor or builder. */
  truncated?: boolean;
}

export interface PromptDropped {
  historyMessages: number;
  knowledgeChunks: number;
  toolResults: number;
  examples: number;
}

export interface PromptBuildInput {
  message: string;
  /** Transport locale. Kept for compatibility; style uses `responseLanguage`. */
  locale: AiAgentLocale;
  /** Language detected by the router or supplied by the caller. */
  responseLanguage: PromptLanguage;
  history?: AiAgentChatMessage[];
  /** Server-derived entities and topic from the previous turns. */
  focus?: ConversationFocus;
  /**
   * Phase 1 model-first state: recently shown entities plus the last question,
   * last answer, pending confirmation, and resolved ordinal/pronoun/yes-no/slug
   * reference. Rendered as required, non-trimmable untrusted data.
   */
  recentEntities?: RecentEntities;
  /** Select the model-first system prompt and recent-entities section. */
  modelFirst?: boolean;
  knowledge?: RetrievalResult;
  toolResults?: ToolExecutionResult[];
  /** Metadata-only descriptors. Handlers are never accepted or rendered. */
  tools?: ToolDescriptor[];
  mode?: AiAgentMode;
  intent?: RouterIntent;
  /** Optional non-essential examples; trimmed after tool results. */
  examples?: PromptExample[];
}

export interface BuiltPrompt {
  version: string;
  /** Stable system rules without the surrounding delimiter section. */
  system: string;
  /** Final delimited prompt. This is the text a provider should receive. */
  text: string;
  language: PromptLanguage;
  estimatedInputTokens: number;
  /**
   * Portion of `estimatedInputTokens` charged for provider tool declarations.
   * Zero when the turn declares no tools.
   */
  estimatedToolDeclarationTokens: number;
  /** Configured output budget reserved alongside the input. */
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  truncated: boolean;
  dropped: PromptDropped;
  citations: Record<string, PromptCitation>;
  /** Included section names in their exact output order. */
  sections: PromptSectionName[];
}

export interface PromptBudgetError {
  code: 'PROMPT_BUDGET_EXCEEDED';
  /** Safe, content-free message. */
  message: string;
  estimatedRequiredTokens: number;
  maxInputTokens: number;
}

export type PromptBuildResult =
  { ok: true; prompt: BuiltPrompt } | { ok: false; error: PromptBudgetError };
