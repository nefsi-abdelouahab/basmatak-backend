import * as path from 'path';
import {
  DEFAULT_AI_AGENT_MODEL,
  DEFAULT_AI_AGENT_PROVIDER,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
} from '../ai-agent.constants';
import { AiAgentMode } from '../ai-agent.types';

/**
 * Absolute minimum BM25 top score for the deterministic intent router. Scores
 * are corpus-dependent, so this is intentionally conservative for the current
 * seed corpus and is clamped to the documented hard bounds by the router.
 */
export const DEFAULT_ROUTER_MIN_SCORE = 1.5;
export const MIN_ROUTER_MIN_SCORE = 0.5;
export const MAX_ROUTER_MIN_SCORE = 5;

/**
 * Internal caps reserved for later sessions. Session 3 enforces the request,
 * concurrency, and daily token caps in memory; the public status response only
 * exposes the fixed DTO limits.
 *
 * Defaults follow the approved proposal (§4.1), with the Session 12 tuning of
 * the global RPM to 80% of the published free-tier ceiling. Hard maxima are
 * intentionally conservative so a typo in an environment variable cannot
 * silently remove a safety bound. Invalid values fall back to the documented
 * default.
 */
export interface AiAgentLimits {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxHistoryMessages: number;
  maxHistoryChars: number;
  maxKnowledgeChunks: number;
  maxKnowledgeChars: number;
  maxToolRounds: number;
  maxToolRows: number;
  maxToolResultChars: number;
  /**
   * Optional for compatibility with existing `Partial<AiAgentLimits>` fixtures.
   * The router falls back to `DEFAULT_ROUTER_MIN_SCORE` when omitted.
   */
  routerMinScore?: number;
  ipRequestsPerMinute: number;
  ipRequestsPerDay: number;
  globalRequestsPerMinute: number;
  globalRequestsPerDay: number;
  maxConcurrent: number;
  dailyTokenBudget: number;
  retrievalFallback: boolean;
  fallbackEnabled: boolean;
}

export interface AiAgentConfig {
  enabled: boolean;
  provider: string;
  model: string;
  knowledgeDir: string;
  mode: AiAgentMode;
  /**
   * Phase 1 rollout flag. When `false` (the default) every routing, prompt, and
   * answer byte is identical to the router-first implementation. When `true`
   * the model chooses tools from the complete read-only registry and the
   * deterministic router is shadow-only.
   */
  modelFirst: boolean;
  /**
   * Production default is 15 s. Tests may override the config object (or the
   * `AI_AGENT_CONFIG` provider) to make the heartbeat observable without a
   * long-running test. Not exposed as an environment variable in Session 2.
   */
  heartbeatIntervalMs: number;
  /**
   * Test-only delay between mock token deltas. Production is 0. Kept out of
   * `.env.example` so the mock never becomes a production tuning knob.
   */
  mockDelayMs: number;
  limits: AiAgentLimits;
}

export function defaultAiAgentLimits(): AiAgentLimits {
  return {
    maxInputTokens: 10000,
    maxOutputTokens: 1000,
    maxHistoryMessages: 6,
    maxHistoryChars: 4000,
    maxKnowledgeChunks: 4,
    maxKnowledgeChars: 6000,
    maxToolRounds: 1,
    maxToolRows: 5,
    maxToolResultChars: 1200,
    routerMinScore: DEFAULT_ROUTER_MIN_SCORE,
    ipRequestsPerMinute: 4,
    ipRequestsPerDay: 15,
    // 8 RPM is 80% of the 10 RPM free-tier ceiling published for the default
    // flash model. Leaving one fifth of the provider window unused absorbs
    // retries/tool follow-ups and sharing with other apps on the same key.
    // Verify the live AI Studio value at deploy; quotas change by model/account
    // and must never be exceeded. Daily request/token caps stay deliberately
    // lower than the provider ceiling because traffic is unknown.
    globalRequestsPerMinute: 8,
    globalRequestsPerDay: 80,
    maxConcurrent: 2,
    dailyTokenBudget: 150_000,
    retrievalFallback: true,
    fallbackEnabled: false,
  };
}

export function defaultAiAgentConfig(): AiAgentConfig {
  return {
    enabled: false,
    provider: DEFAULT_AI_AGENT_PROVIDER,
    model: DEFAULT_AI_AGENT_MODEL,
    knowledgeDir: path.resolve(process.cwd(), 'ai-agent'),
    mode: 'normal',
    modelFirst: false,
    heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    mockDelayMs: 0,
    limits: defaultAiAgentLimits(),
  };
}

/**
 * Immutable default snapshot for tests and documentation. Never mutate this
 * object: `loadAiAgentConfig` returns a fresh value.
 */
export const DEFAULT_AI_AGENT_CONFIG: Readonly<AiAgentConfig> =
  defaultAiAgentConfig();

type EnvReader = (key: string) => unknown;

function readString(read: EnvReader, key: string): string | undefined {
  const raw = read(key);
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim();
  return value === '' ? undefined : value;
}

/**
 * Parse an integer within a hard range. Missing, blank, non-numeric, or
 * non-integer values use the default; out-of-range numbers are clamped so a
 * dangerous value cannot escape the hard bound.
 */
function readInteger(
  read: EnvReader,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = read(key);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readBoolean(read: EnvReader, key: string, fallback: boolean): boolean {
  const raw = read(key);
  if (raw === undefined || raw === null) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

/**
 * The kill switch is intentionally strict: only the literal string `true`
 * (trimmed) enables the feature. `TRUE`, `1`, `yes`, missing, and invalid
 * values all mean disabled.
 */
function readEnabled(read: EnvReader): boolean {
  const raw = read('AI_AGENT_ENABLED');
  return raw !== undefined && raw !== null && String(raw).trim() === 'true';
}

/**
 * Resolve the knowledge root exactly like `src/scripts/ai-check.ts`:
 * `AI_AGENT_KNOWLEDGE_DIR` when non-empty, otherwise `process.cwd()/ai-agent`,
 * always absolute.
 */
export function resolveKnowledgeDir(
  read: EnvReader = (key) => process.env[key],
): string {
  const configured = readString(read, 'AI_AGENT_KNOWLEDGE_DIR');
  return path.resolve(configured ?? path.join(process.cwd(), 'ai-agent'));
}

/**
 * Build the typed configuration from a key/value reader. Exported separately
 * from Nest wiring so it can be unit-tested without booting the application.
 */
export function loadAiAgentConfig(
  read: EnvReader = (key) => process.env[key],
): AiAgentConfig {
  const limits: AiAgentLimits = {
    maxInputTokens: readInteger(
      read,
      'AI_AGENT_MAX_INPUT_TOKENS',
      10000,
      1,
      100_000,
    ),
    maxOutputTokens: readInteger(
      read,
      'AI_AGENT_MAX_OUTPUT_TOKENS',
      1000,
      1,
      1200,
    ),
    maxHistoryMessages: readInteger(
      read,
      'AI_AGENT_MAX_HISTORY_MESSAGES',
      6,
      1,
      8,
    ),
    maxHistoryChars: readInteger(
      read,
      'AI_AGENT_MAX_HISTORY_CHARS',
      4000,
      1,
      6000,
    ),
    maxKnowledgeChunks: readInteger(
      read,
      'AI_AGENT_MAX_KNOWLEDGE_CHUNKS',
      4,
      1,
      6,
    ),
    maxKnowledgeChars: readInteger(
      read,
      'AI_AGENT_MAX_KNOWLEDGE_CHARS',
      6000,
      1,
      8000,
    ),
    maxToolRounds: readInteger(read, 'AI_AGENT_MAX_TOOL_ROUNDS', 1, 0, 2),
    maxToolRows: readInteger(read, 'AI_AGENT_MAX_TOOL_ROWS', 5, 1, 8),
    maxToolResultChars: readInteger(
      read,
      'AI_AGENT_MAX_TOOL_RESULT_CHARS',
      1200,
      1,
      3000,
    ),
    // Prompt/router tuning is intentionally internal in Session 7. Keeping it
    // out of the environment preserves the existing deployment contract.
    routerMinScore: DEFAULT_ROUTER_MIN_SCORE,
    ipRequestsPerMinute: readInteger(read, 'AI_AGENT_IP_RPM', 4, 1, 1000),
    ipRequestsPerDay: readInteger(read, 'AI_AGENT_IP_RPD', 15, 1, 100_000),
    globalRequestsPerMinute: readInteger(
      read,
      'AI_AGENT_GLOBAL_RPM',
      8,
      1,
      10_000,
    ),
    globalRequestsPerDay: readInteger(
      read,
      'AI_AGENT_GLOBAL_RPD',
      80,
      1,
      1_000_000,
    ),
    maxConcurrent: readInteger(read, 'AI_AGENT_MAX_CONCURRENT', 2, 1, 100),
    dailyTokenBudget: readInteger(
      read,
      'AI_AGENT_DAILY_TOKEN_BUDGET',
      150_000,
      1,
      10_000_000,
    ),
    retrievalFallback: readBoolean(read, 'AI_AGENT_RETRIEVAL_FALLBACK', true),
    fallbackEnabled: readBoolean(read, 'AI_AGENT_FALLBACK_ENABLED', false),
  };

  return {
    enabled: readEnabled(read),
    provider:
      readString(read, 'AI_AGENT_PROVIDER') ?? DEFAULT_AI_AGENT_PROVIDER,
    model: readString(read, 'AI_AGENT_MODEL') ?? DEFAULT_AI_AGENT_MODEL,
    knowledgeDir: resolveKnowledgeDir(read),
    mode: 'normal',
    modelFirst: readBoolean(read, 'AI_AGENT_MODEL_FIRST', false),
    heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    mockDelayMs: 0,
    limits,
  };
}
