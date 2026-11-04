import { Response } from 'express';
import { AppLogger } from '../../common/logger/app.logger';
import type {
  AiAgentChatMessage,
  AiAgentLocale,
  AiAgentMode,
} from '../ai-agent.types';
import { QuotaService } from '../budget/quota.service';
import {
  AiAgentConfig,
  defaultAiAgentConfig,
  loadAiAgentConfig,
} from '../config/ai-agent.config';
import type { ConversationFocus } from '../conversation-focus';
import { KnowledgeChunker } from '../knowledge/chunker';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeLoader } from '../knowledge/loader';
import { KnowledgeNormalizer } from '../knowledge/normalizer';
import { createLlmProvider } from '../llm/provider.factory';
import { PromptBuilder } from '../prompt/prompt-builder';
import { IntentRouter } from '../router/intent-router';
import type { RouterDecision } from '../router/intent-router';
import { SseWriter } from '../sse/sse-writer';
import type { SseStream } from '../sse/sse-writer';
import { PlatformStatsTool } from '../tools/platform-stats.tool';
import { SearchKnowledgeTool } from '../tools/search-knowledge.tool';
import { SearchOpportunitiesTool } from '../tools/search-opportunities.tool';
import { SearchOrganizationsTool } from '../tools/search-organizations.tool';
import { SearchReferenceDataTool } from '../tools/search-reference-data.tool';
import { GetOpportunityDetailsTool } from '../tools/get-opportunity-details.tool';
import { GetOrganizationDetailsTool } from '../tools/get-organization-details.tool';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolRegistry } from '../tools/tool-registry';
import { AiAgentOrchestrator } from '../orchestrator/ai-agent.orchestrator';
import { FixtureToolExecutor } from './fixtures';
import { REGRESSION_FAMILIES } from './dialogues';
import { GENERALIZATION_FAMILIES } from './generalization';
import {
  ScriptedRegressionProvider,
  RecordingProvider,
} from './scripted-provider';
import { scoreTurn } from './scoring';
import type {
  RegressionCheck,
  RegressionCorpus,
  RegressionDialogueRecord,
  RegressionFamily,
  RegressionHarnessOptions,
  RegressionMetrics,
  RegressionMode,
  RegressionRouterSnapshot,
  RegressionRunReport,
  RegressionTurn,
  RegressionTurnRecord,
} from './types';
import { REGRESSION_CHANGE_NAME } from './types';

/**
 * Conversation-level regression harness.
 *
 * It wires the real router, knowledge index, prompt builder, orchestrator, and
 * real tool descriptors. Only the provider and the database-backed tool
 * executor are replaced: a scripted/recorded provider for CI and deterministic
 * public fixtures for tool results. No request leaves the process in scripted
 * mode.
 */

const SILENT_LOGGER = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
} as unknown as AppLogger;

interface ParsedFrame {
  event: string;
  data: unknown;
}

class FakeResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  writableEnded = false;
  destroyed = false;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  flushHeaders(): void {
    // The harness only needs the frames, not a real socket.
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): void {
    this.writableEnded = true;
  }
}

function parseFrames(chunks: readonly string[]): ParsedFrame[] {
  return chunks
    .join('')
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .filter((frame) => frame !== '')
    .map((frame) => {
      const lines = frame.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      if (eventLine === undefined) {
        return { event: 'heartbeat', data: frame.replace(/^: /, '') };
      }
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      return { event: eventLine.slice(7), data: JSON.parse(data) };
    });
}

function tokenText(frames: readonly ParsedFrame[]): string {
  let text = '';
  for (const frame of frames) {
    if (frame.event !== 'token') continue;
    const data = frame.data;
    if (
      data !== null &&
      typeof data === 'object' &&
      typeof (data as { delta?: unknown }).delta === 'string'
    ) {
      text += (data as { delta: string }).delta;
    }
  }
  return text;
}

function visibleEvents(frames: readonly ParsedFrame[]): string[] {
  return frames
    .filter((frame) => frame.event !== 'heartbeat')
    .map((frame) => frame.event);
}

class RecordingRouter {
  readonly decisions: RouterDecision[] = [];

  constructor(private readonly delegate: IntentRouter) {}

  route(
    message: string,
    locale: AiAgentLocale,
    history: readonly AiAgentChatMessage[] = [],
    focus?: ConversationFocus,
  ): RouterDecision {
    const decision = this.delegate.route(message, locale, history, focus);
    this.decisions.push(decision);
    return decision;
  }

  reset(): void {
    this.decisions.length = 0;
  }

  last(): RouterDecision | undefined {
    return this.decisions[this.decisions.length - 1];
  }
}

function routerSnapshot(
  decision: RouterDecision | undefined,
): RegressionRouterSnapshot | undefined {
  if (decision === undefined) return undefined;
  return {
    action: decision.action,
    intent: decision.intent,
    language: decision.language,
    reason: decision.reason,
    tools: decision.tools.map((tool) => tool.name),
    topScore: decision.topScore,
  };
}

function scriptedConfig(): AiAgentConfig {
  const base = defaultAiAgentConfig();
  return {
    ...base,
    enabled: true,
    provider: 'scripted',
    model: 'scripted',
    heartbeatIntervalMs: 0,
    limits: { ...base.limits },
  };
}

function liveConfig(): AiAgentConfig {
  const base = loadAiAgentConfig();
  return {
    ...base,
    heartbeatIntervalMs: 0,
    limits: { ...base.limits },
  };
}

function buildRegistry(knowledge: KnowledgeService): ToolRegistry {
  return new ToolRegistry([
    new SearchKnowledgeTool(knowledge),
    new SearchOpportunitiesTool(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    new SearchOrganizationsTool({} as never),
    new SearchReferenceDataTool({} as never, {} as never),
    new PlatformStatsTool({} as never, {} as never, {} as never, {} as never),
    new GetOpportunityDetailsTool({} as never, {} as never, {} as never),
    new GetOrganizationDetailsTool({} as never),
  ]);
}

/** Pick the model-first script/expectations when the run has them. */
export function effectiveRegressionTurn(
  turn: RegressionTurn,
  modelFirst: boolean,
): RegressionTurn {
  if (!modelFirst || turn.modelFirst === undefined) return turn;
  return {
    message: turn.message,
    scriptToolCalls: turn.modelFirst.scriptToolCalls ?? turn.scriptToolCalls,
    scriptAnswer: turn.modelFirst.scriptAnswer ?? turn.scriptAnswer,
    expect: turn.modelFirst.expect ?? turn.expect,
  };
}

export function familiesForCorpus(
  corpus: RegressionCorpus,
): readonly RegressionFamily[] {
  if (corpus === 'generalization') return GENERALIZATION_FAMILIES;
  if (corpus === 'phase2') {
    return [...REGRESSION_FAMILIES, ...GENERALIZATION_FAMILIES];
  }
  return REGRESSION_FAMILIES;
}

export function regressionModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RegressionMode {
  return env.AI_REGRESSION_LIVE === '1' ? 'live' : 'scripted';
}

export function runsPerDialogueFor(mode: RegressionMode): number {
  return mode === 'live' ? 3 : 1;
}

export type RegressionTurnOutcome =
  'provider_served' | 'quota' | 'silent_fallback' | 'deterministic';

/**
 * Classify one turn for live reporting. Provider-served turns are the only
 * evidence of real model behavior; quota and silent zero-token degradations
 * are tracked separately so they never inflate or deflate the quality rate.
 */
export function classifyRegressionTurn(
  turn: RegressionTurnRecord,
): RegressionTurnOutcome {
  if (turn.errorCode === 'AI_AGENT_QUOTA_EXHAUSTED') return 'quota';
  if (turn.inputTokens > 0) return 'provider_served';
  if (turn.providerCalls > 0) return 'silent_fallback';
  return 'deterministic';
}

/** Free-tier input-tokens-per-minute budget used when no override is set. */
export const DEFAULT_INPUT_TOKENS_PER_MINUTE = 7_000;

function positiveNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Delay before the next live turn. `AI_REGRESSION_PACE_MS` pins a fixed wait;
 * otherwise the wait is derived from the previous request's input tokens and
 * `AI_REGRESSION_INPUT_TOKENS_PER_MINUTE` (default 7,000).
 */
export function paceDelayMs(
  previousInputTokens: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const fixed = positiveNumber(env.AI_REGRESSION_PACE_MS);
  if (fixed !== undefined) return Math.trunc(fixed);
  if (previousInputTokens <= 0) return 0;
  const perMinute =
    positiveNumber(env.AI_REGRESSION_INPUT_TOKENS_PER_MINUTE) ??
    DEFAULT_INPUT_TOKENS_PER_MINUTE;
  return Math.ceil((previousInputTokens / perMinute) * 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const DEFAULT_LIVE_TURN_RETRIES = 2;

/**
 * Wait before retrying a degraded live turn. `AI_REGRESSION_RETRY_WAIT_MS`
 * pins a fixed wait; otherwise the same input-token-derived pace is reused.
 */
export function retryWaitMs(
  previousInputTokens: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const fixed = positiveNumber(env.AI_REGRESSION_RETRY_WAIT_MS);
  if (fixed !== undefined) return Math.trunc(fixed);
  return paceDelayMs(previousInputTokens, env);
}

function isDegradedTurn(record: RegressionTurnRecord): boolean {
  const outcome = classifyRegressionTurn(record);
  return outcome === 'quota' || outcome === 'silent_fallback';
}

interface PacingState {
  lastInputTokens: number;
}

async function paceBeforeTurn(
  runtime: HarnessRuntime,
  pacing: PacingState,
): Promise<void> {
  if (runtime.mode !== 'live') return;
  const delay = paceDelayMs(pacing.lastInputTokens);
  if (delay > 0) await sleep(delay);
}

function checkReasons(
  turn: number,
  checks: readonly RegressionCheck[],
): string[] {
  return checks
    .filter((check) => !check.pass)
    .map(
      (check) =>
        `turn ${turn} ${check.name}: ${check.reason ?? 'check failed'}`,
    );
}

interface HarnessRuntime {
  config: AiAgentConfig;
  mode: RegressionMode;
  knowledge: KnowledgeService;
  router: RecordingRouter;
  registry: ToolRegistry;
  providerRecorder: RecordingProvider;
  scriptedProvider: ScriptedRegressionProvider;
  toolExecutor: FixtureToolExecutor;
  orchestrator: AiAgentOrchestrator;
}

function buildRuntime(
  config: AiAgentConfig,
  mode: RegressionMode,
): HarnessRuntime {
  const knowledge = new KnowledgeService(
    new KnowledgeLoader(config.knowledgeDir),
    new KnowledgeChunker(),
    new KnowledgeNormalizer(),
    config,
    SILENT_LOGGER,
  );
  knowledge.onModuleInit();

  const registry = buildRegistry(knowledge);
  const router = new RecordingRouter(
    new IntentRouter(knowledge, registry, config),
  );
  const scriptedProvider = new ScriptedRegressionProvider();
  const delegate =
    mode === 'scripted' ? scriptedProvider : createLlmProvider(config);
  const providerRecorder = new RecordingProvider(delegate);
  const toolExecutor = new FixtureToolExecutor();
  const orchestrator = new AiAgentOrchestrator(
    config,
    router as unknown as IntentRouter,
    knowledge,
    new PromptBuilder(config),
    toolExecutor as unknown as ToolExecutor,
    new QuotaService(config),
    providerRecorder,
    SILENT_LOGGER,
    registry,
  );

  return {
    config,
    mode,
    knowledge,
    router,
    registry,
    providerRecorder,
    scriptedProvider,
    toolExecutor,
    orchestrator,
  };
}

async function runTurn(
  runtime: HarnessRuntime,
  sourceTurn: RegressionTurn,
  locale: AiAgentLocale,
  history: readonly AiAgentChatMessage[],
  modelFirst: boolean,
  pacing: PacingState,
): Promise<RegressionTurnRecord> {
  const turn = effectiveRegressionTurn(sourceTurn, modelFirst);
  await paceBeforeTurn(runtime, pacing);
  runtime.router.reset();
  runtime.providerRecorder.reset();
  runtime.toolExecutor.reset();
  if (runtime.mode === 'scripted') {
    runtime.scriptedProvider.setTurn(turn);
  }

  const writer = new SseWriter(runtime.config);
  const response = new FakeResponse();
  const stream: SseStream = writer.start(response as unknown as Response);
  const startedAt = Date.now();
  const result = await runtime.orchestrator.run({
    message: turn.message,
    locale,
    history: [...history],
    mode: 'normal' as AiAgentMode,
    stream,
    signal: new AbortController().signal,
  });
  const latencyMs = Date.now() - startedAt;
  stream.end();

  const frames = parseFrames(response.chunks);
  const events = visibleEvents(frames);
  const finalText = tokenText(frames);
  const router = routerSnapshot(runtime.router.last());
  const providerCalls = runtime.providerRecorder.providerCalls;
  if (result.inputTokens > 0) {
    pacing.lastInputTokens = result.inputTokens;
  }
  const declaredTools = [
    ...new Set([
      ...(router?.tools ?? []),
      ...runtime.providerRecorder.declaredTools,
    ]),
  ].sort();
  const providerToolCalls = runtime.providerRecorder.toolCalls.map((call) => ({
    name: call.name,
    arguments: { ...call.arguments },
  }));
  const executedToolCalls = runtime.toolExecutor.calls.map((call) => ({
    name: call.name,
    arguments: { ...call.arguments },
  }));

  const checks = scoreTurn({
    turn,
    locale,
    finalText,
    events,
    ...(runtime.router.last() !== undefined
      ? { router: runtime.router.last() as RouterDecision }
      : {}),
    executedToolCalls,
    refusal: result.refusal,
    providerCalls,
    modelFirst,
  });
  const structuralPass = checks
    .filter((check) => check.structural)
    .every((check) => check.pass);
  const qualityPass = checks.every((check) => check.pass);

  return {
    index: 0,
    message: turn.message,
    locale,
    historyBefore: [...history],
    ...(router !== undefined ? { router } : {}),
    declaredTools,
    providerToolCalls,
    executedToolCalls,
    finalText,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.totalTokens,
    estimatedTokens: result.estimated,
    providerCalls,
    latencyMs,
    events,
    mode: result.mode,
    finishReason: result.finishReason,
    refusal: result.refusal,
    truncated: result.truncated,
    ...(result.errorCode !== undefined ? { errorCode: result.errorCode } : {}),
    checks,
    structuralPass,
    qualityPass,
  };
}

async function runDialogue(
  runtime: HarnessRuntime,
  familyId: string,
  title: string,
  locale: AiAgentLocale,
  turns: readonly RegressionTurn[],
  run: number,
  modelFirst: boolean,
  pacing: PacingState,
  turnRetries: number,
): Promise<RegressionDialogueRecord> {
  const startedAt = Date.now();
  const history: AiAgentChatMessage[] = [];
  const records: RegressionTurnRecord[] = [];
  const failedChecks: string[] = [];

  for (const [index, turn] of turns.entries()) {
    let record = await runTurn(
      runtime,
      turn,
      locale,
      history,
      modelFirst,
      pacing,
    );
    for (
      let retry = 0;
      retry < turnRetries && isDegradedTurn(record);
      retry += 1
    ) {
      const wait = retryWaitMs(
        pacing.lastInputTokens > 0
          ? pacing.lastInputTokens
          : DEFAULT_INPUT_TOKENS_PER_MINUTE,
      );
      if (wait > 0) await sleep(wait);
      record = await runTurn(
        runtime,
        turn,
        locale,
        history,
        modelFirst,
        pacing,
      );
    }
    record.index = index + 1;
    records.push(record);
    failedChecks.push(...checkReasons(record.index, record.checks));
    history.push(
      { role: 'user', content: turn.message },
      { role: 'assistant', content: record.finalText },
    );
  }

  const structuralPass = records.every((record) => record.structuralPass);
  const qualityPass = records.every((record) => record.qualityPass);

  return {
    id: `${familyId}-${locale}`,
    family: familyId,
    title,
    locale,
    run,
    turns: records,
    durationMs: Date.now() - startedAt,
    structuralPass,
    qualityPass,
    failedChecks: [...new Set(failedChecks)],
  };
}

function maxOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function avgOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function computeMetrics(
  turns: readonly RegressionTurnRecord[],
  dialogues = 0,
): RegressionMetrics {
  const inputTokens = turns.map((turn) => turn.inputTokens);
  const outputTokens = turns.map((turn) => turn.outputTokens);
  const providerCalls = turns.map((turn) => turn.providerCalls);
  const toolCalls = turns.map((turn) => turn.executedToolCalls.length);
  const latencyMs = turns.map((turn) => turn.latencyMs);
  return {
    dialogues,
    turns: turns.length,
    avgInputTokens: avgOf(inputTokens),
    maxInputTokens: maxOf(inputTokens),
    avgOutputTokens: avgOf(outputTokens),
    maxOutputTokens: maxOf(outputTokens),
    avgProviderCalls: avgOf(providerCalls),
    maxProviderCalls: maxOf(providerCalls),
    avgToolCalls: avgOf(toolCalls),
    maxToolCalls: maxOf(toolCalls),
    avgLatencyMs: avgOf(latencyMs),
    maxLatencyMs: maxOf(latencyMs),
  };
}

export async function runRegressionHarness(
  options: RegressionHarnessOptions = {},
): Promise<RegressionRunReport> {
  const mode = options.mode ?? regressionModeFromEnv();
  const baseConfig =
    options.config ?? (mode === 'live' ? liveConfig() : scriptedConfig());
  const modelFirst = options.modelFirst ?? baseConfig.modelFirst;
  const config: AiAgentConfig =
    modelFirst === baseConfig.modelFirst
      ? baseConfig
      : { ...baseConfig, modelFirst };
  const corpus = options.corpus ?? 'baseline';
  const families = familiesForCorpus(corpus);
  const runsPerDialogue = options.runsPerDialogue ?? runsPerDialogueFor(mode);
  const turnRetries =
    options.turnRetries ?? (mode === 'live' ? DEFAULT_LIVE_TURN_RETRIES : 0);
  const runtime = buildRuntime(config, mode);
  const records: RegressionDialogueRecord[] = [];
  const pacing: PacingState = { lastInputTokens: 0 };
  const wanted =
    options.dialogueIds === undefined
      ? undefined
      : new Set(options.dialogueIds);
  const found = new Set<string>();

  for (const family of families) {
    for (const locale of ['en', 'ar'] as const) {
      const dialogue = locale === 'en' ? family.en : family.ar;
      if (wanted !== undefined && !wanted.has(dialogue.id)) continue;
      found.add(dialogue.id);
      for (let run = 1; run <= runsPerDialogue; run += 1) {
        records.push(
          await runDialogue(
            runtime,
            family.id,
            family.title,
            locale,
            dialogue.turns,
            run,
            modelFirst,
            pacing,
            turnRetries,
          ),
        );
      }
    }
  }

  if (wanted !== undefined) {
    const unknown = [...wanted].filter((id) => !found.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown dialogue ids: ${unknown.join(', ')}`);
    }
  }

  const turns = records.flatMap((record) => record.turns);
  return {
    change: REGRESSION_CHANGE_NAME,
    corpus,
    modelFirst,
    mode,
    generatedAt: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    maxInputTokens: config.limits.maxInputTokens,
    runsPerDialogue,
    totals: {
      families: new Set(records.map((record) => record.family)).size,
      dialogues: records.length,
      turns: turns.length,
      passedDialogues: records.filter((record) => record.qualityPass).length,
      failedDialogues: records.filter((record) => !record.qualityPass).length,
      passedTurns: turns.filter((turn) => turn.qualityPass).length,
      failedTurns: turns.filter((turn) => !turn.qualityPass).length,
      structuralFailures: turns.filter((turn) => !turn.structuralPass).length,
    },
    metrics: computeMetrics(turns, records.length),
    dialogues: records,
  };
}
