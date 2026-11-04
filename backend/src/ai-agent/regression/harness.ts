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
import { SearchOpportunitiesTool } from '../tools/search-opportunities.tool';
import { SearchOrganizationsTool } from '../tools/search-organizations.tool';
import { SearchReferenceDataTool } from '../tools/search-reference-data.tool';
import { ToolExecutor } from '../tools/tool-executor';
import { ToolRegistry } from '../tools/tool-registry';
import { AiAgentOrchestrator } from '../orchestrator/ai-agent.orchestrator';
import { FixtureToolExecutor } from './fixtures';
import { REGRESSION_FAMILIES } from './dialogues';
import {
  ScriptedRegressionProvider,
  RecordingProvider,
} from './scripted-provider';
import { scoreTurn } from './scoring';
import type {
  RegressionCheck,
  RegressionDialogueRecord,
  RegressionHarnessOptions,
  RegressionMode,
  RegressionRouterSnapshot,
  RegressionRunReport,
  RegressionTurn,
  RegressionTurnRecord,
} from './types';

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

function buildRegistry(): ToolRegistry {
  return new ToolRegistry([
    new SearchOpportunitiesTool(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    new SearchOrganizationsTool({} as never),
    new SearchReferenceDataTool({} as never, {} as never),
    new PlatformStatsTool({} as never, {} as never, {} as never, {} as never),
  ]);
}

export function regressionModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RegressionMode {
  return env.AI_REGRESSION_LIVE === '1' ? 'live' : 'scripted';
}

export function runsPerDialogueFor(mode: RegressionMode): number {
  return mode === 'live' ? 3 : 1;
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

  const router = new RecordingRouter(
    new IntentRouter(knowledge, buildRegistry(), config),
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
  );

  return {
    config,
    mode,
    knowledge,
    router,
    providerRecorder,
    scriptedProvider,
    toolExecutor,
    orchestrator,
  };
}

async function runTurn(
  runtime: HarnessRuntime,
  turn: RegressionTurn,
  locale: AiAgentLocale,
  history: readonly AiAgentChatMessage[],
): Promise<RegressionTurnRecord> {
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
): Promise<RegressionDialogueRecord> {
  const startedAt = Date.now();
  const history: AiAgentChatMessage[] = [];
  const records: RegressionTurnRecord[] = [];
  const failedChecks: string[] = [];

  for (const [index, turn] of turns.entries()) {
    const record = await runTurn(runtime, turn, locale, history);
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

export async function runRegressionHarness(
  options: RegressionHarnessOptions = {},
): Promise<RegressionRunReport> {
  const mode = options.mode ?? regressionModeFromEnv();
  const config =
    options.config ?? (mode === 'live' ? liveConfig() : scriptedConfig());
  const runsPerDialogue = runsPerDialogueFor(mode);
  const runtime = buildRuntime(config, mode);
  const records: RegressionDialogueRecord[] = [];

  for (const family of REGRESSION_FAMILIES) {
    for (const locale of ['en', 'ar'] as const) {
      const dialogue = locale === 'en' ? family.en : family.ar;
      for (let run = 1; run <= runsPerDialogue; run += 1) {
        records.push(
          await runDialogue(
            runtime,
            family.id,
            family.title,
            locale,
            dialogue.turns,
            run,
          ),
        );
      }
    }
  }

  const turns = records.flatMap((record) => record.turns);
  return {
    change: 'model-first-ai-intent-and-tools',
    mode,
    generatedAt: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    maxInputTokens: config.limits.maxInputTokens,
    runsPerDialogue,
    totals: {
      families: REGRESSION_FAMILIES.length,
      dialogues: records.length,
      turns: turns.length,
      passedDialogues: records.filter((record) => record.qualityPass).length,
      failedDialogues: records.filter((record) => !record.qualityPass).length,
      passedTurns: turns.filter((turn) => turn.qualityPass).length,
      failedTurns: turns.filter((turn) => !turn.qualityPass).length,
      structuralFailures: turns.filter((turn) => !turn.structuralPass).length,
    },
    dialogues: records,
  };
}
