import { estimateTokens } from '../budget/token-estimator';
import { AiAgentConfig, defaultAiAgentConfig } from '../config/ai-agent.config';
import type { AiAgentChatMessage } from '../ai-agent.types';
import { PlatformStatsTool } from '../tools/platform-stats.tool';
import { SearchOpportunitiesTool } from '../tools/search-opportunities.tool';
import { SearchOrganizationsTool } from '../tools/search-organizations.tool';
import { SearchReferenceDataTool } from '../tools/search-reference-data.tool';
import type { ToolDescriptor } from '../tools/tool.types';
import { PromptBuilder } from './prompt-builder';
import type { BuiltPrompt, PromptBuildInput } from './prompt.types';

const dummy = {} as never;

function config(): AiAgentConfig {
  return defaultAiAgentConfig();
}

function build(input: PromptBuildInput): BuiltPrompt {
  const result = new PromptBuilder(config()).build(input);
  if (!result.ok) {
    throw new Error(
      `Expected the prompt to fit (required=${result.error.estimatedRequiredTokens}, budget=${result.error.maxInputTokens})`,
    );
  }
  return result.prompt;
}

function allRegisteredTools(): ToolDescriptor[] {
  return [
    new SearchOpportunitiesTool(dummy, dummy, dummy, dummy).definition,
    new SearchOrganizationsTool(dummy).definition,
    new SearchReferenceDataTool(dummy, dummy).definition,
    new PlatformStatsTool(dummy, dummy, dummy, dummy).definition,
  ];
}

const ARABIC_HISTORY: AiAgentChatMessage[] = Array.from(
  { length: 6 },
  (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content:
      index % 2 === 0
        ? 'أبحث عن فرصة تطوع قريبة مني في مجال التعليم، ويفضل أن تكون مفتوحة للتقديم هذا الشهر مع إمكانية العمل عن بُعد. '
            .repeat(5)
            .trim()
        : 'يمكنك تصفّح صفحة الفرص واختيار المجال والولاية المناسبين، وسأعرض لك الروابط المتاحة بعد البحث في الفرص المنشورة. '
            .repeat(5)
            .trim(),
  }),
);

function expectFits(prompt: BuiltPrompt): void {
  expect(prompt.estimatedInputTokens).toBeLessThanOrEqual(10000);
  expect(prompt.estimatedTotalTokens).toBe(
    prompt.estimatedInputTokens + prompt.estimatedOutputTokens,
  );
  expect(prompt.text).not.toContain('<input_schema>');
  expect(prompt.text).not.toContain('<description>');
}

describe('default AI agent prompt budget', () => {
  it('fits an empty Arabic prompt', () => {
    const prompt = build({
      message: '',
      locale: 'ar',
      responseLanguage: 'ar',
    });

    expect(prompt.language).toBe('ar');
    expectFits(prompt);
  });

  it('fits an Arabic prompt with six history messages', () => {
    const historyTokens = ARABIC_HISTORY.reduce(
      (total, message) =>
        total + estimateTokens(message.content, { overheadTokens: 0 }).tokens,
      0,
    );
    expect(historyTokens).toBeGreaterThan(1000);

    const prompt = build({
      message: 'ما أحدث الفرص المنشورة حالياً؟',
      locale: 'ar',
      responseLanguage: 'ar',
      history: ARABIC_HISTORY,
    });

    expect(prompt.dropped.historyMessages).toBe(0);
    expect(prompt.text).toContain('<history>');
    expectFits(prompt);
  });

  it('fits an Arabic prompt with every registered tool declared', () => {
    const tools = allRegisteredTools();
    const prompt = build({
      message: 'أبحث عن فرصة تطوع في منظمة موثقة، وأريد إحصاءات المنصة أيضاً.',
      locale: 'ar',
      responseLanguage: 'ar',
      tools,
    });

    expect(tools).toHaveLength(4);
    expect(prompt.estimatedToolDeclarationTokens).toBeGreaterThan(0);
    expect(prompt.text).toContain('<tools>');
    expect(prompt.text).toContain(
      'Tool declarations are supplied separately to the provider',
    );
    expectFits(prompt);
  });
});
