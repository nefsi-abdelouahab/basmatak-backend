import { buildBaselineJson, buildBaselineMarkdown } from './baseline';
import { REGRESSION_DIALOGUES, REGRESSION_FAMILIES } from './dialogues';
import {
  regressionModeFromEnv,
  runRegressionHarness,
  runsPerDialogueFor,
} from './harness';
import type { RegressionRunReport } from './types';

const liveMode = regressionModeFromEnv() === 'live';

describe('conversation regression corpus', () => {
  it('defines 20 families, one English and one Arabic dialogue each', () => {
    expect(REGRESSION_FAMILIES).toHaveLength(20);
    expect(REGRESSION_DIALOGUES).toHaveLength(40);

    const ids = new Set<string>();
    for (const family of REGRESSION_FAMILIES) {
      expect(family.en.family).toBe(family.id);
      expect(family.ar.family).toBe(family.id);
      expect(family.en.locale).toBe('en');
      expect(family.ar.locale).toBe('ar');
      for (const dialogue of [family.en, family.ar]) {
        expect(dialogue.turns.length).toBeGreaterThanOrEqual(1);
        expect(dialogue.turns.length).toBeLessThanOrEqual(4);
        expect(ids.has(dialogue.id)).toBe(false);
        ids.add(dialogue.id);
      }
    }
  });

  it('keeps every dialogue within the supported locales and four turns', () => {
    for (const dialogue of REGRESSION_DIALOGUES) {
      expect(['en', 'ar']).toContain(dialogue.locale);
      for (const turn of dialogue.turns) {
        expect(turn.message.trim()).not.toBe('');
        expect(typeof turn.scriptAnswer).toBe('string');
      }
    }
  });

  it('schedules three live runs per dialogue and one scripted run', () => {
    expect(runsPerDialogueFor('scripted')).toBe(1);
    expect(runsPerDialogueFor('live')).toBe(3);
  });
});

describe('scripted conversation regression', () => {
  let report: RegressionRunReport;

  beforeAll(async () => {
    report = await runRegressionHarness({ mode: 'scripted' });
  }, 120000);

  it('runs all 40 bilingual dialogues offline with no structural failures', () => {
    expect(report.mode).toBe('scripted');
    expect(report.totals.families).toBe(20);
    expect(report.totals.dialogues).toBe(40);
    expect(report.totals.turns).toBeGreaterThanOrEqual(40);
    expect(report.totals.structuralFailures).toBe(0);
    expect(report.totals.passedDialogues + report.totals.failedDialogues).toBe(
      40,
    );
  });

  it('records router, tools, text, tokens, provider calls, and latency per turn', () => {
    const browse = report.dialogues.find(
      (record) => record.id === 'opportunity-browse-en',
    );
    expect(browse).toBeDefined();
    const browseTurn = browse?.turns[0];
    expect(browseTurn?.router?.reason).toBe('LIVE_TOPIC');
    expect(browseTurn?.providerCalls).toBe(0);
    expect(browseTurn?.executedToolCalls).toEqual([
      {
        name: 'search_opportunities',
        arguments: { limit: 3, sort: 'newest', compact: true },
      },
    ]);
    expect(browseTurn?.finalText).toContain('Beach cleanup');
    expect(browseTurn?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(browseTurn?.events).not.toContain('sources');

    const stats = report.dialogues.find(
      (record) => record.id === 'platform-stats-en',
    )?.turns[0];
    expect(stats?.declaredTools).toContain('platform_stats');
    expect(stats?.providerCalls).toBe(2);
    expect(stats?.providerToolCalls).toEqual([
      { name: 'platform_stats', arguments: {} },
    ]);
    expect(stats?.totalTokens).toBeGreaterThan(0);
    expect(stats?.estimatedTokens).toBe(true);

    const greeting = report.dialogues.find(
      (record) => record.id === 'greeting-en',
    )?.turns[0];
    expect(greeting?.providerCalls).toBe(0);
    expect(greeting?.executedToolCalls).toEqual([]);
    expect(greeting?.finalText).toContain('Basma');
  });

  it('reports quality gaps per dialogue instead of aborting the scripted run', () => {
    const failing = report.dialogues.filter((record) => !record.qualityPass);
    expect(report.totals.failedDialogues).toBe(failing.length);

    for (const record of failing) {
      expect(record.failedChecks.length).toBeGreaterThan(0);
      expect(record.failedChecks.join(' ')).toMatch(/turn \d+/u);
    }
  });

  it('produces reviewable JSON and Markdown baseline artifacts', () => {
    const json = buildBaselineJson(report);
    expect(JSON.parse(json)).toMatchObject({
      change: 'model-first-ai-intent-and-tools',
      mode: 'scripted',
      totals: { families: 20, dialogues: 40, structuralFailures: 0 },
    });

    const markdown = buildBaselineMarkdown(report);
    expect(markdown).toContain('# AI conversation baseline');
    expect(markdown).toContain('| Family | en | ar | Notes |');
    expect(markdown).toContain('## Failing dialogue runs');
    expect(markdown.split('\n').length).toBeLessThan(80);
  });
});

const describeLive = liveMode ? describe : describe.skip;

describeLive('live conversation regression', () => {
  it('runs every dialogue three times with semantic checks', async () => {
    const report = await runRegressionHarness({ mode: 'live' });
    expect(report.mode).toBe('live');
    expect(report.runsPerDialogue).toBe(3);
    expect(report.totals.dialogues).toBe(120);
    expect(report.totals.structuralFailures).toBe(0);
    for (const dialogue of report.dialogues) {
      for (const turn of dialogue.turns) {
        expect(turn.checks.length).toBeGreaterThan(0);
      }
    }
  }, 600000);
});
