import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { REGRESSION_FAMILIES } from './dialogues';
import { GENERALIZATION_FAMILIES } from './generalization';
import type { RegressionDialogueRecord, RegressionRunReport } from './types';
import { REGRESSION_BASELINE_DIR } from './types';

/**
 * Baseline artifacts are intentionally small and public: aggregate counts plus
 * failing dialogue ids/reasons. Full per-turn telemetry lives in the JSON file.
 */

export function buildBaselineJson(report: RegressionRunReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function status(records: readonly RegressionDialogueRecord[]): string {
  if (records.length === 0) return '—';
  return records.every((record) => record.qualityPass) ? 'pass' : 'fail';
}

function notes(records: readonly RegressionDialogueRecord[]): string {
  const reasons = [
    ...new Set(
      records.flatMap((record) =>
        record.failedChecks.map((reason) => reason.trim()),
      ),
    ),
  ];
  return reasons.join('; ').replace(/\|/gu, '\\|');
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function buildBaselineMarkdown(report: RegressionRunReport): string {
  const families =
    report.corpus === 'generalization'
      ? GENERALIZATION_FAMILIES
      : report.corpus === 'phase2'
        ? [...REGRESSION_FAMILIES, ...GENERALIZATION_FAMILIES]
        : REGRESSION_FAMILIES;
  const lines: string[] = [];
  lines.push('# AI conversation baseline');
  lines.push('');
  lines.push(`- Change: \`${report.change}\``);
  lines.push(`- Corpus: \`${report.corpus}\``);
  lines.push(`- Model-first: \`${report.modelFirst}\``);
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Provider: \`${report.provider}\` / \`${report.model}\``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Runs per dialogue: ${report.runsPerDialogue}`);
  lines.push(`- maxInputTokens: ${report.maxInputTokens}`);
  lines.push(
    `- Families: ${report.totals.families}; dialogue runs: ${report.totals.dialogues}; turns: ${report.totals.turns}`,
  );
  lines.push(
    `- Passed dialogue runs: ${report.totals.passedDialogues}; failed: ${report.totals.failedDialogues}; structural failures: ${report.totals.structuralFailures}`,
  );
  lines.push(
    `- Dialogue pass rate: ${percent(
      report.totals.dialogues === 0
        ? 0
        : report.totals.passedDialogues / report.totals.dialogues,
    )}; turn pass rate: ${percent(
      report.totals.turns === 0
        ? 0
        : report.totals.passedTurns / report.totals.turns,
    )}`,
  );
  lines.push(
    `- Per turn: input tokens avg ${report.metrics.avgInputTokens.toFixed(1)} / max ${report.metrics.maxInputTokens}; output tokens avg ${report.metrics.avgOutputTokens.toFixed(1)} / max ${report.metrics.maxOutputTokens}; provider calls avg ${report.metrics.avgProviderCalls.toFixed(2)} / max ${report.metrics.maxProviderCalls}; tool calls avg ${report.metrics.avgToolCalls.toFixed(2)} / max ${report.metrics.maxToolCalls}; latency avg ${report.metrics.avgLatencyMs.toFixed(1)} ms / max ${report.metrics.maxLatencyMs} ms`,
  );
  lines.push('');
  lines.push('| Family | en | ar | Notes |');
  lines.push('| --- | --- | --- | --- |');

  for (const family of families) {
    const en = report.dialogues.filter(
      (record) => record.family === family.id && record.locale === 'en',
    );
    const ar = report.dialogues.filter(
      (record) => record.family === family.id && record.locale === 'ar',
    );
    lines.push(
      `| ${family.title} | ${status(en)} | ${status(ar)} | ${notes([
        ...en,
        ...ar,
      ])} |`,
    );
  }

  lines.push('');
  lines.push('## Failing dialogue runs');
  lines.push('');
  const failing = report.dialogues.filter((record) => !record.qualityPass);
  if (failing.length === 0) {
    lines.push('None.');
  } else {
    for (const record of failing) {
      const reasons = record.failedChecks.join('; ');
      lines.push(
        `- \`${record.id}\` (run ${record.run}): ${reasons.replace(/\|/gu, '\\|')}`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

export interface BaselinePaths {
  jsonPath: string;
  markdownPath: string;
}

/**
 * Stable artifact names. The legacy `router-first.json` / `router-first.md`
 * files from the Phase 0 baseline are left untouched so the before/after
 * reports in this change sit next to them.
 */
export function baselineArtifactStem(report: RegressionRunReport): string {
  const variant = report.modelFirst ? 'model-first' : 'router-first';
  if (report.corpus === 'phase2') {
    return `${variant}-phase2-${report.mode}`;
  }
  if (report.corpus === 'generalization') {
    return `${variant}-generalization${report.mode === 'live' ? '-live' : ''}`;
  }
  return `${variant}-${report.mode}`;
}

export function writeBaseline(
  report: RegressionRunReport,
  baseDir: string = process.cwd(),
): BaselinePaths {
  const directory = path.join(baseDir, ...REGRESSION_BASELINE_DIR);
  mkdirSync(directory, { recursive: true });
  const stem = baselineArtifactStem(report);
  const jsonPath = path.join(directory, `${stem}.json`);
  const markdownPath = path.join(directory, `${stem}.md`);
  writeFileSync(jsonPath, buildBaselineJson(report), 'utf8');
  writeFileSync(markdownPath, buildBaselineMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}
