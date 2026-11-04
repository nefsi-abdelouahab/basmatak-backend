import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { REGRESSION_FAMILIES } from './dialogues';
import type { RegressionDialogueRecord, RegressionRunReport } from './types';
import {
  REGRESSION_BASELINE_DIR,
  REGRESSION_BASELINE_JSON,
  REGRESSION_BASELINE_MD,
} from './types';

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

export function buildBaselineMarkdown(report: RegressionRunReport): string {
  const lines: string[] = [];
  lines.push('# AI conversation baseline');
  lines.push('');
  lines.push(`- Change: \`${report.change}\``);
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
  lines.push('');
  lines.push('| Family | en | ar | Notes |');
  lines.push('| --- | --- | --- | --- |');

  for (const family of REGRESSION_FAMILIES) {
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

export function writeBaseline(
  report: RegressionRunReport,
  baseDir: string = process.cwd(),
): BaselinePaths {
  const directory = path.join(baseDir, ...REGRESSION_BASELINE_DIR);
  mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, REGRESSION_BASELINE_JSON);
  const markdownPath = path.join(directory, REGRESSION_BASELINE_MD);
  writeFileSync(jsonPath, buildBaselineJson(report), 'utf8');
  writeFileSync(markdownPath, buildBaselineMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}
