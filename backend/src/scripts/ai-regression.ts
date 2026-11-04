import { readFileSync } from 'fs';
import * as path from 'path';
import { writeBaseline } from '../ai-agent/regression/baseline';
import {
  classifyRegressionTurn,
  DEFAULT_LIVE_TURN_RETRIES,
  familiesForCorpus,
  paceDelayMs,
  retryWaitMs,
  runRegressionHarness,
} from '../ai-agent/regression/harness';
import { PHASE2_LIVE_SAMPLE } from '../ai-agent/regression/phase2-sample';
import type {
  RegressionCorpus,
  RegressionMode,
  RegressionRunReport,
  RegressionTurnRecord,
} from '../ai-agent/regression/types';

/**
 * CLI wrapper for the conversation regression harness.
 *
 * Scripted mode (default) is offline and deterministic; live mode is opt-in
 * with `AI_REGRESSION_LIVE=1` and runs each dialogue three times against the
 * configured provider. `AI_REGRESSION_CORPUS=generalization` selects the
 * 15-family unseen-phrasing set; `AI_REGRESSION_CORPUS=phase2` combines both
 * sets. In live phase-2 mode the default is the paced 24-dialogue sample with
 * one run each. `AI_AGENT_MODEL_FIRST=true` (or
 * `AI_REGRESSION_MODEL_FIRST=true`) selects the model-first path.
 *
 * The live provider is rate limited, so turns are paced from the previous
 * request's input tokens (`AI_REGRESSION_INPUT_TOKENS_PER_MINUTE`, default
 * 7,000) or a fixed `AI_REGRESSION_PACE_MS`. Degraded turns (quota or silent
 * zero tokens) are retried up to `AI_REGRESSION_TURN_RETRIES` (default 2)
 * after `AI_REGRESSION_RETRY_WAIT_MS`. Every successful run writes its JSON and
 * Markdown artifact; live failures leave the existing scripted artifacts
 * untouched.
 */

function parseEnv(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const raw of text.replace(/\r\n/gu, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(
      line,
    );
    if (match === null) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      if (match[2].startsWith('"')) {
        value = value.replace(/\\n/gu, '\n').replace(/\\r/gu, '\r');
      }
    } else {
      const comment = value.indexOf(' #');
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

/** Load `backend/.env` for a standalone script without logging any values. */
function loadEnvFile(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const candidate of candidates) {
    let text: string;
    try {
      text = readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseEnv(text);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return candidate;
  }
  return undefined;
}

function corpusFromEnv(value: string | undefined): RegressionCorpus {
  if (value === 'generalization' || value === 'phase2') return value;
  return 'baseline';
}

function modelFirstFromEnv(): boolean | undefined {
  const raw =
    process.env.AI_REGRESSION_MODEL_FIRST ?? process.env.AI_AGENT_MODEL_FIRST;
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function positiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function nonNegativeInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

function turnRetriesFromEnv(): number | undefined {
  return nonNegativeInt(process.env.AI_REGRESSION_TURN_RETRIES);
}

function dialogueIdsFromEnv(): readonly string[] | undefined {
  const raw = process.env.AI_REGRESSION_DIALOGUE_IDS;
  if (raw === undefined || raw.trim() === '') return undefined;
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

function runsFromEnv(
  mode: RegressionMode,
  corpus: RegressionCorpus,
): number | undefined {
  const explicit = positiveInt(process.env.AI_REGRESSION_RUNS);
  if (explicit !== undefined) return explicit;
  // The paced Phase-2 live sample is one run per dialogue by default.
  if (mode === 'live' && corpus === 'phase2') return 1;
  return undefined;
}

interface PlanEstimate {
  turns: number;
  pacePerTurnMs: number;
  expectedMs: number;
  worstCaseMs: number;
}

function estimatePlan(
  corpus: RegressionCorpus,
  dialogueIds: readonly string[] | undefined,
  runsPerDialogue: number,
  mode: RegressionMode,
): PlanEstimate {
  const wanted =
    dialogueIds === undefined ? undefined : new Set<string>(dialogueIds);
  let turns = 0;
  for (const family of familiesForCorpus(corpus)) {
    for (const dialogue of [family.en, family.ar]) {
      if (wanted !== undefined && !wanted.has(dialogue.id)) continue;
      turns += dialogue.turns.length * runsPerDialogue;
    }
  }

  const fixedPace = positiveInt(process.env.AI_REGRESSION_PACE_MS);
  const assumedInputTokens = 3_000;
  const pacePerTurnMs =
    mode === 'live'
      ? (fixedPace ?? paceDelayMs(assumedInputTokens, process.env))
      : 0;
  const retryDelayMs = mode === 'live' ? retryWaitMs(3_000) : 0;
  const retries =
    mode === 'live' ? (turnRetriesFromEnv() ?? DEFAULT_LIVE_TURN_RETRIES) : 0;
  const perTurnOverheadMs = mode === 'live' ? 1_500 : 25;

  const expectedMs = turns * (pacePerTurnMs + perTurnOverheadMs);
  const worstCaseMs =
    expectedMs + turns * retries * (retryDelayMs + perTurnOverheadMs);
  return { turns, pacePerTurnMs, expectedMs, worstCaseMs };
}

function minutes(ms: number): string {
  return (ms / 60_000).toFixed(1);
}

interface TurnSummary {
  providerServed: number;
  providerServedPassed: number;
  quota: number;
  silentFallback: number;
  deterministic: number;
}

function summarizeTurns(turns: readonly RegressionTurnRecord[]): TurnSummary {
  const summary: TurnSummary = {
    providerServed: 0,
    providerServedPassed: 0,
    quota: 0,
    silentFallback: 0,
    deterministic: 0,
  };
  for (const turn of turns) {
    const outcome = classifyRegressionTurn(turn);
    if (outcome === 'provider_served') {
      summary.providerServed += 1;
      if (turn.qualityPass) summary.providerServedPassed += 1;
    } else if (outcome === 'quota') {
      summary.quota += 1;
    } else if (outcome === 'silent_fallback') {
      summary.silentFallback += 1;
    } else {
      summary.deterministic += 1;
    }
  }
  return summary;
}

function percent(passed: number, total: number): string {
  if (total === 0) return 'n/a';
  return `${((passed / total) * 100).toFixed(1)}%`;
}

function reportSummary(report: RegressionRunReport): void {
  const { totals, metrics } = report;
  const turns = report.dialogues.flatMap((dialogue) => dialogue.turns);
  const summary = summarizeTurns(turns);

  console.log(
    `AI regression: mode=${report.mode} corpus=${report.corpus} modelFirst=${report.modelFirst} provider=${report.provider} model=${report.model}`,
  );
  console.log(
    `families=${totals.families} dialogueRuns=${totals.dialogues} turns=${totals.turns} passedDialogues=${totals.passedDialogues} failedDialogues=${totals.failedDialogues} passedTurns=${totals.passedTurns} failedTurns=${totals.failedTurns} structuralFailures=${totals.structuralFailures}`,
  );
  console.log(
    `metrics: inputTokens avg=${metrics.avgInputTokens.toFixed(1)} max=${metrics.maxInputTokens}; outputTokens avg=${metrics.avgOutputTokens.toFixed(1)} max=${metrics.maxOutputTokens}; providerCalls avg=${metrics.avgProviderCalls.toFixed(2)} max=${metrics.maxProviderCalls}; toolCalls avg=${metrics.avgToolCalls.toFixed(2)} max=${metrics.maxToolCalls}; latencyMs avg=${metrics.avgLatencyMs.toFixed(1)} max=${metrics.maxLatencyMs}`,
  );
  console.log(
    `outcomes: providerServed=${summary.providerServed} providerServedPassed=${summary.providerServedPassed} providerServedPassRate=${percent(summary.providerServedPassed, summary.providerServed)} quota=${summary.quota} silentFallback=${summary.silentFallback} deterministic=${summary.deterministic}`,
  );

  const failing = report.dialogues.filter((record) => !record.qualityPass);
  for (const record of failing) {
    const degraded = record.turns.filter((turn) => {
      const outcome = classifyRegressionTurn(turn);
      return outcome === 'quota' || outcome === 'silent_fallback';
    }).length;
    console.log(
      `FAIL ${record.id} run=${record.run} degradedTurns=${degraded}: ${record.failedChecks.join('; ')}`,
    );
  }
}

async function main(): Promise<void> {
  const envFile = loadEnvFile();
  const corpus = corpusFromEnv(process.env.AI_REGRESSION_CORPUS);
  const mode: RegressionMode =
    process.env.AI_REGRESSION_LIVE === '1' ? 'live' : 'scripted';
  const modelFirst = modelFirstFromEnv();
  const requestedIds = dialogueIdsFromEnv();
  const dialogueIds =
    requestedIds ??
    (mode === 'live' && corpus === 'phase2' ? PHASE2_LIVE_SAMPLE : undefined);
  const runsPerDialogue = runsFromEnv(mode, corpus);

  if (dialogueIds !== undefined && dialogueIds.length === 0) {
    throw new Error('AI_REGRESSION_DIALOGUE_IDS did not contain any ids.');
  }

  const effectiveRuns = runsPerDialogue ?? (mode === 'live' ? 3 : 1);
  const plan = estimatePlan(corpus, dialogueIds, effectiveRuns, mode);
  console.log(
    `AI regression plan: mode=${mode} corpus=${corpus} dialogues=${dialogueIds?.length ?? 'all'} runsPerDialogue=${effectiveRuns} turns=${plan.turns} pacePerTurnMs=${plan.pacePerTurnMs} estimatedDuration=${minutes(plan.expectedMs)}min worstCase=${minutes(plan.worstCaseMs)}min retries=${mode === 'live' ? (turnRetriesFromEnv() ?? DEFAULT_LIVE_TURN_RETRIES) : 0}`,
  );
  if (envFile !== undefined) {
    console.log(`envFile=${envFile}`);
  }

  const report = await runRegressionHarness({
    corpus,
    mode,
    ...(modelFirst !== undefined ? { modelFirst } : {}),
    ...(dialogueIds !== undefined ? { dialogueIds } : {}),
    ...(runsPerDialogue !== undefined ? { runsPerDialogue } : {}),
    ...(mode === 'live' && turnRetriesFromEnv() !== undefined
      ? { turnRetries: turnRetriesFromEnv() as number }
      : {}),
  });

  reportSummary(report);

  const paths = writeBaseline(report);
  console.log(`baseline=${paths.jsonPath}`);
  console.log(`report=${paths.markdownPath}`);

  if (report.totals.structuralFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    `AI regression failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
