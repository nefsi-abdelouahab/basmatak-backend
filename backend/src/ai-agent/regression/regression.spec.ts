import {
  baselineArtifactStem,
  buildBaselineJson,
  buildBaselineMarkdown,
} from './baseline';
import { REGRESSION_DIALOGUES, REGRESSION_FAMILIES } from './dialogues';
import {
  GENERALIZATION_DIALOGUES,
  GENERALIZATION_FAMILIES,
} from './generalization';
import {
  classifyRegressionTurn,
  DEFAULT_INPUT_TOKENS_PER_MINUTE,
  familiesForCorpus,
  paceDelayMs,
  regressionModeFromEnv,
  runRegressionHarness,
  runsPerDialogueFor,
} from './harness';
import type { RegressionRunReport, RegressionTurnRecord } from './types';

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

  it('defines 15 generalization families with 30 unseen-phrasing dialogues', () => {
    expect(GENERALIZATION_FAMILIES).toHaveLength(15);
    expect(GENERALIZATION_DIALOGUES).toHaveLength(30);

    const ids = new Set<string>();
    for (const family of GENERALIZATION_FAMILIES) {
      expect(family.en.family).toBe(family.id);
      expect(family.ar.family).toBe(family.id);
      for (const dialogue of [family.en, family.ar]) {
        expect(['en', 'ar']).toContain(dialogue.locale);
        expect(dialogue.turns.length).toBeGreaterThanOrEqual(1);
        expect(dialogue.turns.length).toBeLessThanOrEqual(4);
        expect(ids.has(dialogue.id)).toBe(false);
        ids.add(dialogue.id);
      }
    }
  });

  it('schedules three live runs per dialogue and one scripted run', () => {
    expect(runsPerDialogueFor('scripted')).toBe(1);
    expect(runsPerDialogueFor('live')).toBe(3);
  });

  it('combines both sets into the 70-dialogue phase-2 corpus', () => {
    const families = familiesForCorpus('phase2');
    expect(families).toHaveLength(35);
    expect(families.flatMap((family) => [family.en, family.ar])).toHaveLength(
      70,
    );
    expect(families.map((family) => family.id)).toEqual(
      expect.arrayContaining([
        'greeting',
        'platform-stats',
        'gen-ordinal-first',
        'gen-detail-org',
      ]),
    );
  });

  it('derives a conservative live pace from input tokens and env overrides', () => {
    expect(paceDelayMs(0, {})).toBe(0);
    expect(paceDelayMs(3_500, {})).toBe(30_000);
    expect(paceDelayMs(DEFAULT_INPUT_TOKENS_PER_MINUTE, {})).toBe(60_000);
    expect(
      paceDelayMs(3_500, {
        AI_REGRESSION_INPUT_TOKENS_PER_MINUTE: '3500',
      }),
    ).toBe(60_000);
    expect(paceDelayMs(3_500, { AI_REGRESSION_PACE_MS: '250' })).toBe(250);
  });

  it('separates provider-served, quota, silent, and deterministic turns', () => {
    const base = {
      inputTokens: 0,
      providerCalls: 0,
    } as RegressionTurnRecord;

    expect(classifyRegressionTurn({ ...base, inputTokens: 10 })).toBe(
      'provider_served',
    );
    expect(
      classifyRegressionTurn({
        ...base,
        providerCalls: 1,
        inputTokens: 0,
        errorCode: 'AI_AGENT_QUOTA_EXHAUSTED',
      }),
    ).toBe('quota');
    expect(classifyRegressionTurn({ ...base, providerCalls: 1 })).toBe(
      'silent_fallback',
    );
    expect(classifyRegressionTurn(base)).toBe('deterministic');
  });
});

describe('scripted conversation regression', () => {
  let report: RegressionRunReport;

  beforeAll(async () => {
    report = await runRegressionHarness({
      mode: 'scripted',
      corpus: 'baseline',
      modelFirst: false,
    });
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

describe('scripted model-first conversation regression', () => {
  let report: RegressionRunReport;

  beforeAll(async () => {
    report = await runRegressionHarness({
      mode: 'scripted',
      corpus: 'baseline',
      modelFirst: true,
    });
  }, 120000);

  it('passes all 40 baseline dialogues with no structural failures', () => {
    expect(report.modelFirst).toBe(true);
    expect(report.corpus).toBe('baseline');
    expect(report.totals.dialogues).toBe(40);
    expect(report.totals.structuralFailures).toBe(0);
    expect(report.totals.passedDialogues).toBe(40);
    expect(report.totals.failedDialogues).toBe(0);
  });

  it('declares every approved read-only tool and keeps tool use bounded', () => {
    const detail = report.dialogues.find(
      (record) => record.id === 'opportunity-detail-en',
    )?.turns[1];
    expect(detail?.declaredTools).toEqual(
      expect.arrayContaining([
        'get_opportunity_details',
        'get_organization_details',
        'platform_stats',
        'search_knowledge',
        'search_opportunities',
        'search_organizations',
        'search_reference_data',
      ]),
    );
    expect(detail?.executedToolCalls).toEqual([
      { name: 'get_opportunity_details', arguments: { slug: 'beach-cleanup' } },
    ]);
    expect(report.metrics.maxProviderCalls).toBeLessThanOrEqual(3);
    expect(report.metrics.maxToolCalls).toBeLessThanOrEqual(2);
  });

  it('uses model-first artifact names next to the router-first reports', () => {
    expect(baselineArtifactStem(report)).toBe('model-first-scripted');
    expect(baselineArtifactStem({ ...report, modelFirst: false })).toBe(
      'router-first-scripted',
    );
    expect(
      baselineArtifactStem({
        ...report,
        corpus: 'generalization',
        mode: 'scripted',
      }),
    ).toBe('model-first-generalization');
    expect(
      baselineArtifactStem({
        ...report,
        modelFirst: false,
        corpus: 'generalization',
        mode: 'scripted',
      }),
    ).toBe('router-first-generalization');
    expect(
      baselineArtifactStem({
        ...report,
        corpus: 'phase2',
        mode: 'live',
      }),
    ).toBe('model-first-phase2-live');
    expect(
      baselineArtifactStem({
        ...report,
        modelFirst: false,
        corpus: 'phase2',
        mode: 'scripted',
      }),
    ).toBe('router-first-phase2-scripted');
  });
});

describe('scripted generalization regression', () => {
  let report: RegressionRunReport;

  beforeAll(async () => {
    report = await runRegressionHarness({
      mode: 'scripted',
      corpus: 'generalization',
      modelFirst: true,
    });
  }, 120000);

  it('passes all 30 unseen-phrasing dialogues with no structural failures', () => {
    expect(report.corpus).toBe('generalization');
    expect(report.modelFirst).toBe(true);
    expect(report.totals.families).toBe(15);
    expect(report.totals.dialogues).toBe(30);
    expect(report.totals.structuralFailures).toBe(0);
    expect(report.totals.passedDialogues).toBe(30);
    expect(report.totals.failedDialogues).toBe(0);
    expect(baselineArtifactStem(report)).toBe('model-first-generalization');
  });

  it('covers follow-up references through detail tools', () => {
    const ordinal = report.dialogues.find(
      (record) => record.id === 'gen-ordinal-first-en',
    )?.turns[1];
    expect(ordinal?.executedToolCalls).toEqual([
      { name: 'get_opportunity_details', arguments: { slug: 'beach-cleanup' } },
    ]);
    expect(ordinal?.finalText).toContain('/en/opportunities/beach-cleanup');

    const confirmation = report.dialogues.find(
      (record) => record.id === 'gen-yesno-confirm-ar',
    )?.turns[1];
    expect(confirmation?.executedToolCalls).toEqual([
      {
        name: 'get_organization_details',
        arguments: { slug: 'nour-association' },
      },
    ]);
    expect(confirmation?.finalText).toContain('/ar/orgs/nour-association');
  });
});

describe('scripted model-first phase-2 token budget', () => {
  let report: RegressionRunReport;

  beforeAll(async () => {
    report = await runRegressionHarness({
      mode: 'scripted',
      corpus: 'phase2',
      modelFirst: true,
    });
  }, 240000);

  it('keeps average input tokens at or below 3,000 across 70 dialogues', () => {
    expect(report.corpus).toBe('phase2');
    expect(report.totals.dialogues).toBe(70);
    expect(report.metrics.avgInputTokens).toBeLessThanOrEqual(3_000);
  }, 60000);

  it('keeps every turn at or below 4,000 input tokens', () => {
    expect(report.metrics.maxInputTokens).toBeLessThanOrEqual(4_000);
    const worst = report.dialogues
      .flatMap((dialogue) => dialogue.turns)
      .sort((a, b) => b.inputTokens - a.inputTokens)[0];
    expect(worst?.inputTokens).toBeLessThanOrEqual(4_000);
  });

  it('still passes every phase-2 dialogue and writes a phase-2 artifact', () => {
    expect(report.totals.structuralFailures).toBe(0);
    expect(report.totals.passedDialogues).toBe(70);
    expect(baselineArtifactStem(report)).toBe('model-first-phase2-scripted');
    expect(buildBaselineMarkdown(report)).toContain(
      '| Browse with dialect and synonyms |',
    );
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
