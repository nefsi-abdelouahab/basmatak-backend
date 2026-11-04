import {
  buildBaselineMarkdown,
  writeBaseline,
} from '../ai-agent/regression/baseline';
import { runRegressionHarness } from '../ai-agent/regression/harness';

/**
 * CLI wrapper for the conversation regression harness.
 *
 * Scripted mode (default) is offline, deterministic, and writes the router-first
 * baseline under `test/ai-baseline/`. Live mode is opt-in with
 * `AI_REGRESSION_LIVE=1`, runs each dialogue three times against the configured
 * provider, and never overwrites the CI baseline.
 */
async function main(): Promise<void> {
  const report = await runRegressionHarness();
  const { totals } = report;

  console.log(
    `AI regression: mode=${report.mode} provider=${report.provider} model=${report.model}`,
  );
  console.log(
    `families=${totals.families} dialogueRuns=${totals.dialogues} turns=${totals.turns} passedDialogues=${totals.passedDialogues} failedDialogues=${totals.failedDialogues} structuralFailures=${totals.structuralFailures}`,
  );

  const failing = report.dialogues.filter((record) => !record.qualityPass);
  for (const record of failing) {
    console.log(
      `FAIL ${record.id} run=${record.run}: ${record.failedChecks.join('; ')}`,
    );
  }

  if (report.mode === 'scripted') {
    const paths = writeBaseline(report);
    console.log(`baseline=${paths.jsonPath}`);
    console.log(`report=${paths.markdownPath}`);
  } else {
    console.log(buildBaselineMarkdown(report));
  }

  if (totals.structuralFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    `AI regression failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
