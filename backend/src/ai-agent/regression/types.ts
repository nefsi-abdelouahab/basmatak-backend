import type { AiAgentChatMessage, AiAgentLocale } from '../ai-agent.types';
import type { AiAgentConfig } from '../config/ai-agent.config';
import type { RouterIntent } from '../router/intent-router';

/**
 * Conversation-level regression harness types.
 *
 * The harness intentionally stores only public/diagnostic data: dialogue text,
 * tool names/arguments, sanitized answer text, token counters, and pass/fail
 * reasons. It never stores provider prompts, raw model output, secrets, or
 * private tool payloads.
 */

export const REGRESSION_CHANGE_NAME = 'model-first-ai-intent-and-tools';
export const REGRESSION_BASELINE_DIR = ['test', 'ai-baseline'] as const;
export const REGRESSION_BASELINE_JSON = 'router-first.json';
export const REGRESSION_BASELINE_MD = 'router-first.md';

export interface RegressionToolCallScript {
  name: string;
  arguments: Record<string, unknown>;
}

export type RegressionArgExpectation =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'exact'; expected: Record<string, unknown> }
  | { kind: 'slugs'; slugs: readonly string[] }
  | { kind: 'name'; names: readonly string[] }
  | { kind: 'text'; accepted: readonly string[] };

export interface RegressionTurnExpectation {
  /** Expected router decision shape. */
  routerAction?: 'answer' | 'direct_reply';
  routerIntent?: RouterIntent;
  /** Exact set of tools that must actually execute this turn. */
  expectedTools?: readonly string[];
  /** Tools that must execute even if `expectedTools` is not exact. */
  mustCall?: readonly string[];
  /** Tools that must never execute this turn. */
  mustNotCall?: readonly string[];
  /** Argument rules for every executed tool call. */
  toolArgs?: RegressionArgExpectation;
  /** Required substrings of the final answer (case-insensitive). */
  keyFacts?: readonly string[];
  /** Whether the orchestrator must report a refusal. */
  expectRefusal?: boolean;
  /** Internal links that must survive sanitization. */
  expectedLinks?: readonly string[];
  /** Upper bound on Markdown links in the final answer. */
  maxLinks?: number;
  /** Mark this turn as a private-data request for the structural guard. */
  privateData?: boolean;
}

export interface RegressionTurn {
  message: string;
  /** Tool calls the scripted provider should issue when they are declared. */
  scriptToolCalls?: readonly RegressionToolCallScript[];
  /** Deterministic answer used by the scripted provider. */
  scriptAnswer: string;
  expect: RegressionTurnExpectation;
}

export interface RegressionDialogue {
  /** Stable id: `<family>-<locale>`. */
  id: string;
  family: string;
  locale: AiAgentLocale;
  turns: readonly RegressionTurn[];
}

export interface RegressionFamily {
  id: string;
  title: string;
  en: RegressionDialogue;
  ar: RegressionDialogue;
}

export type RegressionMode = 'scripted' | 'live';

export type RegressionCheckName =
  | 'router'
  | 'tool_choice'
  | 'tool_args'
  | 'key_facts'
  | 'refusal'
  | 'language'
  | 'safety'
  | 'promise'
  | 'links'
  | 'events';

export interface RegressionCheck {
  name: RegressionCheckName;
  /** Structural checks must pass in every scripted run. */
  structural: boolean;
  pass: boolean;
  reason?: string;
}

export interface RecordedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface RegressionRouterSnapshot {
  action: string;
  intent: string;
  language: string;
  reason: string;
  tools: string[];
  topScore: number;
}

export interface RegressionTurnRecord {
  index: number;
  message: string;
  locale: AiAgentLocale;
  historyBefore: AiAgentChatMessage[];
  router?: RegressionRouterSnapshot;
  declaredTools: string[];
  providerToolCalls: RecordedToolCall[];
  executedToolCalls: RecordedToolCall[];
  finalText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedTokens: boolean;
  providerCalls: number;
  latencyMs: number;
  events: string[];
  mode: string;
  finishReason: string;
  refusal: boolean;
  truncated: boolean;
  errorCode?: string;
  checks: RegressionCheck[];
  structuralPass: boolean;
  qualityPass: boolean;
}

export interface RegressionDialogueRecord {
  id: string;
  family: string;
  title: string;
  locale: AiAgentLocale;
  run: number;
  turns: RegressionTurnRecord[];
  durationMs: number;
  structuralPass: boolean;
  qualityPass: boolean;
  failedChecks: string[];
}

export interface RegressionTotals {
  families: number;
  dialogues: number;
  turns: number;
  passedDialogues: number;
  failedDialogues: number;
  passedTurns: number;
  failedTurns: number;
  structuralFailures: number;
}

export interface RegressionRunReport {
  change: string;
  mode: RegressionMode;
  generatedAt: string;
  provider: string;
  model: string;
  maxInputTokens: number;
  runsPerDialogue: number;
  totals: RegressionTotals;
  dialogues: RegressionDialogueRecord[];
}

export interface RegressionHarnessOptions {
  config?: AiAgentConfig;
  mode?: RegressionMode;
  /** Live mode only: run each dialogue this many times. Defaults to 3. */
  runsPerDialogue?: number;
}
