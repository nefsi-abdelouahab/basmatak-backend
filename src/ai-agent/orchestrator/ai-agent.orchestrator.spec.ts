import { EventEmitter } from 'events';
import { Response } from 'express';
import { AppLogger } from '../../common/logger/app.logger';
import type {
  AiAgentChatMessage,
  AiAgentLocale,
  AiAgentMode,
} from '../ai-agent.types';
import { QuotaService } from '../budget/quota.service';
import { ProviderQuotaError } from '../budget/quota.types';
import {
  AiAgentConfig,
  AiAgentLimits,
  defaultAiAgentConfig,
} from '../config/ai-agent.config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { RetrievalResult } from '../knowledge/retriever';
import {
  LlmProviderUnavailableError,
  LlmServerError,
} from '../llm/provider-errors';
import type { LlmProvider } from '../llm/provider.interface';
import type {
  LlmDeterministicScript,
  LlmProviderCapabilities,
  LlmStreamEvent,
  LlmTurnRequest,
} from '../llm/provider.types';
import { MockProvider } from '../llm/mock.provider';
import { PromptBuilder } from '../prompt/prompt-builder';
import type { IntentRouter, RouterDecision } from '../router/intent-router';
import { SseWriter } from '../sse/sse-writer';
import type { ToolRegistry } from '../tools/tool-registry';
import type {
  ToolBatchExecutionResult,
  ToolDescriptor,
  ToolExecutionResult,
} from '../tools/tool.types';
import { ToolExecutor } from '../tools/tool-executor';
import { UsageMeterService } from '../usage/usage-meter.service';
import {
  AI_AGENT_MAX_PROVIDER_CALLS,
  AiAgentOrchestrator,
  stripLeadingSystemSection,
  validateToolArguments,
} from './ai-agent.orchestrator';
import { policyMessage } from './answer-policy';

interface ParsedFrame {
  event: string;
  data: unknown;
}

class FakeResponse extends EventEmitter {
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
    // No-op for the fake transport.
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): void {
    this.writableEnded = true;
    this.emit('close');
  }
}

function parseFrames(chunks: string[]): ParsedFrame[] {
  return chunks
    .join('')
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .filter((frame) => frame !== '')
    .map((frame) => {
      const lines = frame.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      if (!eventLine) {
        return { event: 'heartbeat', data: frame.replace(/^: /, '') };
      }
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      return { event: eventLine.slice(7), data: JSON.parse(data) };
    });
}

function visibleFrames(frames: ParsedFrame[]): ParsedFrame[] {
  return frames.filter((frame) => frame.event !== 'heartbeat');
}

function toolSuccess(tool: string, data: unknown): ToolExecutionResult {
  return {
    ok: true,
    tool,
    data,
    meta: { charCount: 0, truncated: false },
  };
}

function batch(results: ToolExecutionResult[]): ToolBatchExecutionResult {
  return { results, totalChars: 0, truncated: false };
}

const OPPORTUNITY_TOOL: ToolDescriptor = {
  name: 'search_opportunities',
  description: 'Search public volunteering opportunities.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum rows.',
        minimum: 1,
        maximum: 8,
      },
      text: {
        type: 'string',
        description: 'Search text.',
        minLength: 1,
        maxLength: 100,
      },
      compact: {
        type: 'boolean',
        description: 'Return only slug and title.',
      },
    },
  },
  allowedIntents: ['opportunity_search'],
  readOnly: true,
};

const ORGANIZATION_TOOL: ToolDescriptor = {
  name: 'search_organizations',
  description: 'Search public organizations.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum rows.',
        minimum: 1,
        maximum: 8,
      },
      name: {
        type: 'string',
        description: 'Organization name.',
        minLength: 1,
        maxLength: 120,
      },
    },
  },
  allowedIntents: ['organization_search'],
  readOnly: true,
};

const MODEL_FIRST_DESCRIPTORS: ToolDescriptor[] = [
  OPPORTUNITY_TOOL,
  ORGANIZATION_TOOL,
  {
    name: 'search_reference_data',
    description: 'Search public reference data.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    allowedIntents: ['reference_lookup'],
    readOnly: true,
  },
  {
    name: 'platform_stats',
    description: 'Return public platform counts.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    allowedIntents: ['platform_stats'],
    readOnly: true,
  },
  {
    name: 'search_knowledge',
    description: 'Search the public knowledge base.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    allowedIntents: ['knowledge_lookup'],
    readOnly: true,
  },
  {
    name: 'get_opportunity_details',
    description: 'Return one public opportunity.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    allowedIntents: ['opportunity_details'],
    readOnly: true,
  },
  {
    name: 'get_organization_details',
    description: 'Return one public organization.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    allowedIntents: ['organization_details'],
    readOnly: true,
  },
];

class QueueProvider extends MockProvider {
  readonly requests: LlmTurnRequest[] = [];
  private readonly queue: LlmDeterministicScript[] = [];

  queueTurn(script: LlmDeterministicScript): this {
    this.queue.push(script);
    return this;
  }

  get calls(): number {
    return this.requests.length;
  }

  override async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    this.requests.push(request);
    const script = this.queue.shift();
    if (script === undefined) {
      throw new LlmProviderUnavailableError();
    }
    this.setScript(script);
    yield* super.streamTurn(request, signal);
  }
}

/** Emits one text delta and then fails with a retryable 5xx. */
class TextThenServerErrorProvider implements LlmProvider {
  readonly capabilities: LlmProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    contextWindow: 32_768,
  };
  calls = 0;

  async *streamTurn(): AsyncIterable<LlmStreamEvent> {
    this.calls += 1;
    yield { type: 'interaction', interactionId: 'interaction-1' };
    yield { type: 'text', delta: 'Partial [K1]' };
    throw new LlmServerError(503);
  }
}

function createConfig(
  overrides: Partial<Omit<AiAgentConfig, 'limits'>> & {
    limits?: Partial<AiAgentLimits>;
  } = {},
): AiAgentConfig {
  const base = defaultAiAgentConfig();
  return {
    ...base,
    enabled: true,
    provider: 'mock',
    ...overrides,
    limits: {
      ...base.limits,
      // The strict tool schema used by these tests pushes the rendered prompt
      // just past the production default. Keep the quota unchanged in
      // production and give the fake provider enough room in tests.
      maxInputTokens: 6000,
      ...(overrides.limits ?? {}),
    },
  };
}

function createRetrieval(
  text = 'Basmatak connects volunteers with opportunities.',
  source = 'faq/en.md',
  title = 'Basmatak FAQ',
): RetrievalResult {
  return {
    chunks: [
      {
        id: 'chunk-1',
        source,
        title,
        locale: 'en',
        headingTrail: ['What is Basmatak?'],
        text,
        charCount: text.length,
        score: 5,
      },
    ],
    totalChars: text.length,
    estimatedTokens: 6,
    truncated: false,
  };
}

function knowledgeOnlyDecision(
  overrides: Partial<RouterDecision> = {},
): RouterDecision {
  return {
    intent: 'knowledge_only',
    language: 'en',
    action: 'answer',
    tools: [],
    toolIntents: [],
    knowledgeQuery: 'what is basmatak',
    topScore: 5,
    reason: 'TEST_KNOWLEDGE',
    ...overrides,
  };
}

function liveDataDecision(
  overrides: Partial<RouterDecision> = {},
): RouterDecision {
  return {
    intent: 'live_data',
    language: 'en',
    action: 'answer',
    tools: [OPPORTUNITY_TOOL],
    toolIntents: ['opportunity_search'],
    knowledgeQuery: 'current opportunities',
    topScore: 0,
    reason: 'TEST_LIVE',
    ...overrides,
  };
}

function organizationDecision(
  overrides: Partial<RouterDecision> = {},
): RouterDecision {
  return liveDataDecision({
    tools: [ORGANIZATION_TOOL],
    toolIntents: ['organization_search'],
    knowledgeQuery: 'organization',
    ...overrides,
  });
}

interface Harness {
  config: AiAgentConfig;
  writer: SseWriter;
  response: FakeResponse;
  quota: QuotaService;
  orchestrator: AiAgentOrchestrator;
  provider: LlmProvider;
  router: { route: jest.Mock };
  knowledge: { search: jest.Mock };
  toolExecutor: { executeMany: jest.Mock };
  usageMeter?: UsageMeterService;
}

function createHarness(
  options: {
    config?: AiAgentConfig;
    provider?: LlmProvider;
    decision?: RouterDecision;
    retrieval?: RetrievalResult;
    executeMany?: jest.Mock;
    logger?: AppLogger;
    tools?: ToolDescriptor[];
    usageMeter?: UsageMeterService;
  } = {},
): Harness {
  const config = options.config ?? createConfig();
  const writer = new SseWriter(config);
  const response = new FakeResponse();
  const quota = new QuotaService(config);
  const router = {
    route: jest.fn(() => options.decision ?? knowledgeOnlyDecision()),
  };
  const knowledge = {
    search: jest.fn(() => options.retrieval ?? createRetrieval()),
  };
  const toolExecutor = {
    executeMany:
      options.executeMany ??
      jest.fn(async () =>
        batch([toolSuccess('search_opportunities', { items: [] })]),
      ),
  };
  const provider = options.provider ?? new QueueProvider(config);
  const toolRegistry =
    options.tools === undefined
      ? undefined
      : ({ list: () => options.tools } as unknown as ToolRegistry);
  const orchestrator = new AiAgentOrchestrator(
    config,
    router as unknown as IntentRouter,
    knowledge as unknown as KnowledgeService,
    new PromptBuilder(config),
    toolExecutor as unknown as ToolExecutor,
    quota,
    provider,
    options.logger,
    toolRegistry,
    options.usageMeter,
  );

  return {
    config,
    writer,
    response,
    quota,
    orchestrator,
    provider,
    router,
    knowledge,
    toolExecutor,
    ...(options.usageMeter !== undefined
      ? { usageMeter: options.usageMeter }
      : {}),
  };
}

async function runOrchestrator(
  harness: Harness,
  message: string,
  mode: AiAgentMode = 'normal',
  signal: AbortSignal = new AbortController().signal,
  history: AiAgentChatMessage[] = [],
  locale: AiAgentLocale = 'en',
): Promise<{
  result: Awaited<ReturnType<AiAgentOrchestrator['run']>>;
  frames: ParsedFrame[];
}> {
  const stream = harness.writer.start(harness.response as unknown as Response);
  const result = await harness.orchestrator.run({
    message,
    locale,
    history,
    mode,
    stream,
    signal,
  });
  stream.end();
  return {
    result,
    frames: visibleFrames(parseFrames(harness.response.chunks)),
  };
}

function queueProvider(harness: Harness): QueueProvider {
  return harness.provider as QueueProvider;
}

describe('orchestrator helpers', () => {
  it('strips only the leading duplicated system section', () => {
    expect(
      stripLeadingSystemSection(
        '<system_rules>rules</system_rules>\n<user_message>Hi</user_message>',
      ),
    ).toBe('<user_message>Hi</user_message>');
    expect(stripLeadingSystemSection('plain text')).toBe('plain text');
    expect(stripLeadingSystemSection('<system_rules>unclosed')).toBe(
      '<system_rules>unclosed',
    );
  });

  it('validates strict tool arguments before execution', () => {
    const schema = OPPORTUNITY_TOOL.inputSchema;
    expect(validateToolArguments(schema, { limit: 2, text: 'beach' })).toBe(
      undefined,
    );
    expect(validateToolArguments(schema, null)).toBe(
      'Arguments must be an object.',
    );
    expect(validateToolArguments(schema, { extra: true })).toBe(
      'Unknown argument.',
    );
    expect(validateToolArguments(schema, { limit: 0 })).toBe(
      'Invalid argument value.',
    );
    expect(validateToolArguments(schema, { limit: 1.5 })).toBe(
      'Invalid argument value.',
    );
    expect(validateToolArguments(schema, { text: 3 })).toBe(
      'Invalid argument value.',
    );
    expect(
      validateToolArguments(
        {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string', description: 'Name.' } },
          required: ['name'],
        },
        {},
      ),
    ).toBe('Missing required argument.');
  });
});

describe('AiAgentOrchestrator', () => {
  it('answers a knowledge question with one provider call and no citation UI', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      interactionId: 'interaction-1',
      text: ['Basmatak is a platform [K1].'],
      usage: { inputTokens: 40, outputTokens: 8 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(result).toMatchObject({
      mode: 'normal',
      finishReason: 'stop',
      inputTokens: 40,
      outputTokens: 8,
      totalTokens: 48,
      estimated: false,
      toolCalls: 0,
      refusal: false,
      truncated: false,
    });
    expect(harness.router.route).toHaveBeenCalledTimes(1);
    expect(harness.knowledge.search).toHaveBeenCalledTimes(1);
    expect(harness.toolExecutor.executeMany).not.toHaveBeenCalled();
    expect(queueProvider(harness).calls).toBe(1);

    const request = queueProvider(harness).requests[0];
    expect(request.systemInstruction).toContain('You are Basma');
    expect(typeof request.input).toBe('string');
    expect(request.input as string).not.toContain('<system_rules>');
    expect(request.previousInteractionId).toBeUndefined();
    expect(request.tools).toBeUndefined();

    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    expect((frames[1].data as { delta: string }).delta).toBe(
      'Basmatak is a platform.',
    );
    expect(frames.some((frame) => frame.event === 'sources')).toBe(false);
  });

  it('logs a content-free event when the prompt budget is exceeded', async () => {
    const logger = {
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger;
    const harness = createHarness({
      config: createConfig({ limits: { maxInputTokens: 10 } }),
      logger,
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'SECRET_PROMPT_TEXT',
    );

    expect(result.errorCode).toBe('AI_AGENT_INVALID_INPUT');
    expect(queueProvider(harness).calls).toBe(0);
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'error']);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    const record = JSON.parse(
      (logger.warn as jest.Mock).mock.calls[0][0] as string,
    ) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: 'ai_agent_prompt_budget_exceeded',
      provider: 'mock',
      model: expect.any(String),
      toolCount: 0,
      historyMessages: 0,
      maxInputTokens: 10,
    });
    expect(record.estimatedRequiredTokens).toBeGreaterThan(10);
    expect(JSON.stringify(record)).not.toContain('SECRET_PROMPT_TEXT');
  });

  it('passes client history to the router and to the prompt', async () => {
    const harness = createHarness();
    const history: AiAgentChatMessage[] = [
      { role: 'user', content: 'How does verification work?' },
      {
        role: 'assistant',
        content: 'The organization reviews the evidence before verifying.',
      },
    ];
    queueProvider(harness).queueTurn({
      text: ['It reviews the evidence, then verifies the contribution.'],
    });

    await runOrchestrator(
      harness,
      'explain more',
      'normal',
      new AbortController().signal,
      history,
    );

    expect(harness.router.route).toHaveBeenCalledWith(
      'explain more',
      'en',
      history,
      undefined,
    );
    const input = queueProvider(harness).requests[0]?.input;
    expect(typeof input).toBe('string');
    expect(input as string).toContain('How does verification work?');
    expect(input as string).toContain(
      'The organization reviews the evidence before verifying.',
    );
  });

  it('answers a focused opportunity follow-up from linked slugs without the provider', async () => {
    const history: AiAgentChatMessage[] = [
      { role: 'user', content: 'اعطني فرص' },
      {
        role: 'assistant',
        content:
          'إليك الفرص: [تنظيف الشاطئ](/ar/opportunities/beach-cleanup) و[غرس الأشجار](/ar/opportunities/tree-planting).',
      },
    ];
    const harness = createHarness({
      decision: liveDataDecision({
        language: 'ar',
        reason: 'FOCUS_OPPORTUNITY_DETAIL',
        focusOpportunitySlugs: ['beach-cleanup'],
      }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              {
                slug: 'beach-cleanup',
                title: 'تنظيف الشاطئ',
                status: 'published',
                applicationDeadline: '2026-10-30T00:00:00.000Z',
                openPositions: 2,
                location: { wilaya: '16', municipality: '1601' },
                locationNames: {
                  wilaya: { ar: 'الجزائر', fr: 'Algiers' },
                  municipality: {
                    ar: 'باب الوادي',
                    fr: 'Bab El Oued',
                  },
                },
              },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل هي مفتوحة',
      'normal',
      new AbortController().signal,
      history,
      'ar',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_opportunities',
        arguments: { slugs: ['beach-cleanup'], limit: 1 },
      },
    ]);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toContain('[تنظيف الشاطئ](/ar/opportunities/beach-cleanup)');
    expect(answer).toContain('مفتوحة للتقديم');
    expect(answer).toContain('آخر موعد 30 أكتوبر 2026');
    expect(answer).toContain('المناصب المتاحة 2');
    expect(answer).toContain('الموقع باب الوادي، الجزائر');
  });

  it('resolves an ordinal follow-up to the focused slug when the decision has none', async () => {
    const history: AiAgentChatMessage[] = [
      { role: 'user', content: 'show me opportunities' },
      {
        role: 'assistant',
        content:
          '[Beach cleanup](/en/opportunities/beach-cleanup) and [Tree planting](/en/opportunities/tree-planting)',
      },
    ];
    const harness = createHarness({
      decision: liveDataDecision({
        reason: 'FOCUS_OPPORTUNITY_DETAIL',
      }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              {
                slug: 'tree-planting',
                title: 'Tree planting',
                status: 'published',
                applicationDeadline: '2026-12-01T00:00:00.000Z',
                openPositions: 0,
                location: null,
                locationNames: null,
              },
            ],
          }),
        ]),
      ),
    });

    await runOrchestrator(
      harness,
      'tell me about the second',
      'normal',
      new AbortController().signal,
      history,
      'en',
    );

    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_opportunities',
        arguments: { slugs: ['tree-planting'], limit: 1 },
      },
    ]);
  });

  it('reruns a focused organization lookup for a lookup confirmation', async () => {
    const history: AiAgentChatMessage[] = [
      { role: 'user', content: 'هل تعرف جمعية نور' },
      { role: 'assistant', content: 'سأتحقق من معلومات جمعية نور لك.' },
    ];
    const harness = createHarness({
      decision: organizationDecision({
        language: 'ar',
        reason: 'FOCUS_ORGANIZATION_FOLLOW_UP',
        focusOrganizationName: 'نور',
      }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'dev-org-nour',
                nameAr: 'جمعية نور للتضامن',
                nameFr: 'Association Nour de Solidarité',
              },
            ],
          }),
        ]),
      ),
    });

    const { frames } = await runOrchestrator(
      harness,
      'هل تحققت',
      'normal',
      new AbortController().signal,
      history,
      'ar',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_organizations',
        arguments: { name: 'نور', limit: 8 },
      },
    ]);
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'لم أجد جمعية بهذا الاسم تحديداً، هل تقصد [جمعية نور للتضامن](/ar/orgs/dev-org-nour)؟',
    );
  });

  it('replaces a promise with the deterministic organization lookup', async () => {
    const harness = createHarness({
      decision: knowledgeOnlyDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'dev-org-nour',
                nameAr: 'جمعية نور للتضامن',
                nameFr: 'Association Nour de Solidarité',
              },
            ],
          }),
        ]),
      ),
    });
    queueProvider(harness).queueTurn({
      text: ['سأتحقق من معلومات جمعية نور لك.'],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل تعرف جمعية نور',
      'normal',
      new AbortController().signal,
      [],
      'ar',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_organizations',
        arguments: { name: 'نور', limit: 8 },
      },
    ]);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_organizations'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'لم أجد جمعية بهذا الاسم تحديداً، هل تقصد [جمعية نور للتضامن](/ar/orgs/dev-org-nour)؟',
    );
    expect(answer).not.toContain('سأتحقق');
  });

  it('replaces a promise with not-found when no entity can be resolved', async () => {
    const harness = createHarness({
      decision: knowledgeOnlyDecision({ language: 'en' }),
    });
    queueProvider(harness).queueTurn({
      text: ["I'll check and get back to you."],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'did you check',
      'normal',
    );

    expect(result.refusal).toBe(true);
    expect(harness.toolExecutor.executeMany).not.toHaveBeenCalled();
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('notFound', 'en'));
    expect(answer).not.toContain("I'll check");
  });

  it('passes the derived focus to the router and the prompt', async () => {
    const history: AiAgentChatMessage[] = [
      { role: 'user', content: 'show me opportunities' },
      {
        role: 'assistant',
        content: '[Beach cleanup](/en/opportunities/beach-cleanup)',
      },
    ];
    const harness = createHarness({ decision: liveDataDecision() });
    queueProvider(harness).queueTurn({
      text: ['It is open for applications.'],
    });

    await runOrchestrator(
      harness,
      'are they still open',
      'normal',
      new AbortController().signal,
      history,
    );

    const focus = (harness.router.route as jest.Mock).mock.calls[0]?.[3] as
      { opportunities: Array<{ slug: string }>; topic: string } | undefined;
    expect(focus?.topic).toBe('opportunity_search');
    expect(focus?.opportunities.map((item) => item.slug)).toEqual([
      'beach-cleanup',
    ]);
    const input = queueProvider(harness).requests[0]?.input;
    expect(input as string).toContain('<conversation_focus>');
    expect(input as string).toContain(
      'Previously shown opportunities: Beach cleanup (beach-cleanup)',
    );
  });

  it('estimates usage when the provider omits it', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform [K1].'],
    });

    const { result } = await runOrchestrator(harness, 'What is Basmatak?');

    expect(result.estimated).toBe(true);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it('answers greetings locally without a provider or tool call', async () => {
    const harness = createHarness({
      decision: knowledgeOnlyDecision({
        intent: 'greeting',
        action: 'direct_reply',
        directReply: 'Hello! How can I help?',
        reason: 'GREETING',
      }),
    });

    const { result, frames } = await runOrchestrator(harness, 'Hello');

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.knowledge.search).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(frames.map((frame) => frame.event)).toEqual(['token']);
    expect((frames[0].data as { delta: string }).delta).toBe(
      'Hello! How can I help?',
    );
  });

  it('logs the router as a shadow signal and declares every tool on every model-first turn', async () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger;
    const harness = createHarness({
      config: createConfig({
        modelFirst: true,
        limits: { maxInputTokens: 12_000 },
      }),
      decision: liveDataDecision(),
      logger,
      tools: MODEL_FIRST_DESCRIPTORS,
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [{ slug: 'beach-cleanup', title: 'Beach cleanup' }],
          }),
        ]),
      ),
    });
    queueProvider(harness).queueTurn({
      text: [],
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 3 },
        },
      ],
    });
    queueProvider(harness).queueTurn({
      text: ['Here is [Beach cleanup](/en/opportunities/beach-cleanup).'],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'show me opportunities',
    );

    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });
    expect(queueProvider(harness).calls).toBe(2);
    const expectedNames = MODEL_FIRST_DESCRIPTORS.map(
      (tool) => tool.name,
    ).sort();
    for (const request of queueProvider(harness).requests) {
      expect((request.tools ?? []).map((tool) => tool.name).sort()).toEqual(
        expectedNames,
      );
    }
    expect(harness.router.route).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
    const shadow = JSON.parse(
      (logger.log as jest.Mock).mock.calls[0]?.[0] as string,
    ) as Record<string, unknown>;
    expect(shadow).toMatchObject({
      event: 'ai_agent_router_shadow',
      intent: 'live_data',
      action: 'answer',
      reason: 'TEST_LIVE',
    });
    expect(JSON.stringify(shadow)).not.toContain('show me opportunities');
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toContain(
      '[Beach cleanup](/en/opportunities/beach-cleanup)',
    );
  });

  it('short-circuits exact greetings but sends capability questions to the provider', async () => {
    const greeting = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision({
        intent: 'greeting',
        action: 'direct_reply',
        directReply: 'Hello! How can I help?',
        reason: 'GREETING',
      }),
      tools: MODEL_FIRST_DESCRIPTORS,
    });

    const greetingResult = await runOrchestrator(greeting, 'Hello');

    expect(queueProvider(greeting).calls).toBe(0);
    expect(greeting.toolExecutor.executeMany).not.toHaveBeenCalled();
    expect(greetingResult.frames).toEqual([
      { event: 'token', data: { delta: 'Hello! How can I help?' } },
    ]);

    const capability = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision({
        intent: 'greeting',
        action: 'direct_reply',
        directReply: 'I can help with opportunities.',
        reason: 'CAPABILITY',
      }),
      tools: MODEL_FIRST_DESCRIPTORS,
    });
    queueProvider(capability).queueTurn({
      text: ['I can help you find opportunities and organizations.'],
    });

    const capabilityResult = await runOrchestrator(
      capability,
      'what can you do?',
    );

    expect(queueProvider(capability).calls).toBe(1);
    expect(capabilityResult.result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
    });
    expect(
      capabilityResult.frames
        .filter((frame) => frame.event === 'token')
        .map((frame) => (frame.data as { delta: string }).delta)
        .join(''),
    ).toBe('I can help you find opportunities and organizations.');
  });

  it('retries once when the shadow router needs live data but the model calls no tool', async () => {
    const harness = createHarness({
      config: createConfig({
        modelFirst: true,
        limits: { maxInputTokens: 12_000 },
      }),
      decision: liveDataDecision(),
      tools: MODEL_FIRST_DESCRIPTORS,
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [{ slug: 'beach-cleanup', title: 'Beach cleanup' }],
          }),
        ]),
      ),
    });
    queueProvider(harness).queueTurn({
      text: ['Beach cleanup is available.'],
    });
    queueProvider(harness).queueTurn({
      text: [],
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 3 },
        },
      ],
    });
    queueProvider(harness).queueTurn({
      text: ['Here is [Beach cleanup](/en/opportunities/beach-cleanup).'],
    });

    const { result } = await runOrchestrator(harness, 'show me opportunities');

    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });
    expect(queueProvider(harness).calls).toBe(3);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledTimes(1);
    expect(queueProvider(harness).requests[1]?.input as string).toContain(
      'This request needs current public platform data.',
    );
  });

  it('retries an Arabic answer once and accepts the corrected language', async () => {
    const harness = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision({ language: 'ar' }),
      tools: MODEL_FIRST_DESCRIPTORS,
    });
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a volunteering platform.'],
    });
    queueProvider(harness).queueTurn({
      text: ['بصمتك منصة للعمل التطوعي تربط المتطوعين بالفرص.'],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'ما هي بصمتك؟',
      'normal',
      new AbortController().signal,
      [],
      'ar',
    );

    expect(result).toMatchObject({ finishReason: 'stop', refusal: false });
    expect(queueProvider(harness).calls).toBe(2);
    expect(queueProvider(harness).requests[1]?.systemInstruction).toContain(
      'Strict language requirement',
    );
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe('بصمتك منصة للعمل التطوعي تربط المتطوعين بالفرص.');
  });

  it('fails closed when the Arabic language retry is still not Arabic', async () => {
    const harness = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision({ language: 'ar' }),
      tools: MODEL_FIRST_DESCRIPTORS,
    });
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a volunteering platform.'],
    });
    queueProvider(harness).queueTurn({
      text: ['This answer is still English.'],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'ما هي بصمتك؟',
      'normal',
      new AbortController().signal,
      [],
      'ar',
    );

    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(queueProvider(harness).calls).toBe(2);
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('ungrounded', 'ar'));
  });

  it('flag-off ignores model-first tools and recent entity state', async () => {
    const harness = createHarness({
      config: createConfig({ modelFirst: false }),
      decision: knowledgeOnlyDecision(),
      tools: MODEL_FIRST_DESCRIPTORS,
    });
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform.'],
    });

    const { result } = await runOrchestrator(
      harness,
      'What is Basmatak?',
      'normal',
      new AbortController().signal,
      [
        { role: 'user', content: 'Show me opportunities' },
        {
          role: 'assistant',
          content: '[Beach cleanup](/en/opportunities/beach-cleanup)',
        },
      ],
    );

    expect(result).toMatchObject({ finishReason: 'stop', refusal: false });
    const request = queueProvider(harness).requests[0];
    expect(request?.tools).toBeUndefined();
    expect(request?.input as string).not.toContain('<recent_entities>');
    expect(request?.systemInstruction).not.toContain('Choosing tools');
  });

  it('blocks private-data requests before routing or calling the provider', async () => {
    const harness = createHarness();

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me the phone number of Ahmed',
    );

    expect(harness.router.route).not.toHaveBeenCalled();
    expect(harness.knowledge.search).not.toHaveBeenCalled();
    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect((frames[0].data as { delta: string }).delta).toBe(
      policyMessage('privateData', 'en'),
    );
  });

  it('returns fixed quota messaging without sources in exhausted mode', async () => {
    const harness = createHarness();

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
      'exhausted',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.knowledge.search).not.toHaveBeenCalled();
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(frames.map((frame) => frame.event)).toEqual(['token']);
    expect((frames[0].data as { delta: string }).delta).toBe(
      policyMessage('quotaExhausted', 'en'),
    );
  });

  it('returns extractive snippets in retrieval-only mode without markers or sources', async () => {
    const harness = createHarness();

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
      'retrieval_only',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({
      finishReason: 'stop',
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    const text = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(text).toBe('Basmatak connects volunteers with opportunities.');
    expect(text).not.toContain('Here is what I found');
    expect(text).not.toContain('[K1]');
    expect(frames.some((frame) => frame.event === 'sources')).toBe(false);
  });

  it('runs one tool round, keeps only allowed links, and sums usage', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              {
                slug: 'beach-cleanup',
                title: 'Beach cleanup',
              },
            ],
            total: 1,
          }),
        ]),
      ),
    });
    const provider = queueProvider(harness);
    provider.queueTurn({
      interactionId: 'interaction-1',
      text: [],
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 1 },
        },
      ],
      usage: { inputTokens: 30, outputTokens: 4 },
    });
    provider.queueTurn({
      interactionId: 'interaction-1',
      text: [
        'Beach cleanup is available: [Beach cleanup](/opportunities/beach-cleanup) [T1].',
      ],
      usage: { inputTokens: 20, outputTokens: 7 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(provider.calls).toBe(2);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledTimes(1);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      { name: 'search_opportunities', arguments: { limit: 1 } },
    ]);
    expect(provider.requests[1].previousInteractionId).toBe('interaction-1');
    expect(provider.requests[1].tools).toBeUndefined();
    expect(result).toMatchObject({
      finishReason: 'stop',
      inputTokens: 50,
      outputTokens: 11,
      totalTokens: 61,
      estimated: false,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
      refusal: false,
    });

    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'status',
      'token',
      'cards',
    ]);
    expect(frames[0].data).toEqual({ state: 'searching' });
    expect(frames[1].data).toEqual({
      state: 'tool',
      tool: 'search_opportunities',
    });
    expect((frames[2].data as { delta: string }).delta).toBe(
      'Beach cleanup is available: [Beach cleanup](/en/opportunities/beach-cleanup).',
    );
    expect(frames[3].data).toEqual({
      cards: [
        {
          kind: 'opportunity',
          slug: 'beach-cleanup',
          title: 'Beach cleanup',
          href: '/en/opportunities/beach-cleanup',
        },
      ],
    });
    expect(frames.some((frame) => frame.event === 'sources')).toBe(false);
  });

  it('runs a deterministic opportunity search when the model skips the tool', async () => {
    const harness = createHarness({
      decision: liveDataDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              {
                slug: 'mentorat-bootcamp-code-pour-jeunes-oran',
                title: 'Mentorat bootcamp code pour jeunes — Oran',
              },
            ],
          }),
        ]),
      ),
    });
    const provider = queueProvider(harness);
    provider.queueTurn({
      text: ['لم تتوفر لدي تفاصيل عن الفرص في الوقت الحالي.'],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'أعطني فرصة تطوعية في البرمجة',
    );

    expect(provider.calls).toBe(1);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledTimes(1);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_opportunities',
        arguments: {
          text: 'البرمجه',
          limit: 3,
          sort: 'newest',
          compact: true,
        },
      },
    ]);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });

    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toContain(
      '[Mentorat bootcamp code pour jeunes — Oran](/en/opportunities/mentorat-bootcamp-code-pour-jeunes-oran)',
    );
  });

  it('returns the no-opportunities message when the deterministic fallback finds nothing', async () => {
    const harness = createHarness({
      decision: liveDataDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([toolSuccess('search_opportunities', { items: [] })]),
      ),
    });
    queueProvider(harness).queueTurn({
      text: ['لم تتوفر لدي تفاصيل عن الفرص في الوقت الحالي.'],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'أعطني فرصة تطوعية في البرمجة',
    );

    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('noOpportunities', 'ar'));
  });

  it('answers a generic browse with an empty-text search and no provider call', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              { slug: 'alpha', title: 'Alpha' },
              { slug: 'beta', title: 'Beta' },
              { slug: 'gamma', title: 'Gamma' },
              { slug: 'delta', title: 'Delta' },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What opportunities are available?',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledTimes(1);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_opportunities',
        arguments: { limit: 3, sort: 'newest', compact: true },
      },
    ]);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });
    expect(frames[0].data).toEqual({ state: 'searching' });
    expect(frames[1].data).toEqual({
      state: 'tool',
      tool: 'search_opportunities',
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'Here are the latest published opportunities: [Alpha](/en/opportunities/alpha), [Beta](/en/opportunities/beta), and [Gamma](/en/opportunities/gamma) — you can browse more on the [Opportunities page](/en/opportunities).',
    );
  });

  it('answers a generic Arabic browse with Arabic links', async () => {
    const harness = createHarness({
      decision: liveDataDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [{ slug: 'coding-club', title: 'نادي البرمجة' }],
          }),
        ]),
      ),
    });

    const { frames } = await runOrchestrator(
      harness,
      'ما هي الفرص المتوفرة',
      'normal',
      new AbortController().signal,
      [],
      'ar',
    );

    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'إليك أحدث الفرص المنشورة: [نادي البرمجة](/ar/opportunities/coding-club) — يمكنك تصفح المزيد في [صفحة الفرص](/ar/opportunities).',
    );
  });

  it('answers an Arabic browse in Arabic while links follow the English UI locale', async () => {
    const harness = createHarness({
      decision: liveDataDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              { slug: 'alpha', title: 'Alpha' },
              { slug: 'beta', title: 'Beta' },
              { slug: 'gamma', title: 'Gamma' },
              { slug: 'delta', title: 'Delta' },
            ],
          }),
        ]),
      ),
    });

    const { frames } = await runOrchestrator(
      harness,
      'ما هي الفرص المتوفرة',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'إليك أحدث الفرص المنشورة: [Alpha](/en/opportunities/alpha)، [Beta](/en/opportunities/beta)، و[Gamma](/en/opportunities/gamma) — يمكنك تصفح المزيد في [صفحة الفرص](/en/opportunities).',
    );
    expect(answer).not.toContain('Delta');
    expect(answer).not.toMatch(/https?:\/\//u);
  });

  it('looks up a full organization name deterministically in the message language', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'dev-org-nour',
                nameAr: 'جمعية نور للتضامن',
                nameFr: 'Association Nour de Solidarité',
              },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل هناك جمعية نور للتضامن',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
      {
        name: 'search_organizations',
        arguments: { name: 'نور للتضامن', limit: 8 },
      },
    ]);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_organizations'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'وجدت هذه الجمعية: [جمعية نور للتضامن](/en/orgs/dev-org-nour).',
    );
    expect(answer).not.toMatch(/https?:\/\//u);
  });

  it('suggests the single close Arabic organization match instead of not-found', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'dev-org-nour',
                nameAr: 'جمعية نور للتضامن',
                nameFr: 'Association Nour de Solidarité',
              },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل هناك جمعية نور',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_organizations'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'لم أجد جمعية بهذا الاسم تحديداً، هل تقصد [جمعية نور للتضامن](/en/orgs/dev-org-nour)؟',
    );
    expect(frames.some((frame) => frame.event === 'error')).toBe(false);
  });

  it('answers an English association-name question in English with Arabic UI links', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'en' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'green-earth',
                nameAr: 'الأرض الخضراء',
                nameFr: 'Green Earth',
              },
            ],
          }),
        ]),
      ),
    });

    const { frames } = await runOrchestrator(
      harness,
      'Is there an association named Green Earth?',
      'normal',
      new AbortController().signal,
      [],
      'ar',
    );

    expect(queueProvider(harness).calls).toBe(0);
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'I found this organization: [Green Earth](/ar/orgs/green-earth).',
    );
  });

  it('suggests the single close English organization match instead of not-found', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'en' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'dev-org-nour',
                nameAr: 'جمعية نور للتضامن',
                nameFr: 'Association Nour de Solidarité',
              },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'Is there an association named Nour?',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 1,
      toolNames: ['search_organizations'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      "I couldn't find that exact name. Did you mean [Association Nour de Solidarité](/en/orgs/dev-org-nour)?",
    );
    expect(frames.some((frame) => frame.event === 'error')).toBe(false);
  });

  it('keeps the exact Arabic organization-not-found text when no whole-word match exists', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'hope',
                nameAr: 'جمعية الأمل',
                nameFr: 'Association de l’Espoir',
              },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل هناك جمعية نور',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result.refusal).toBe(true);
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('organizationNotFound', 'ar'));
  });

  it('does not guess when more than one whole-word organization match exists', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_organizations', {
            items: [
              {
                slug: 'nour-solidarity',
                nameAr: 'جمعية نور للتضامن',
                nameFr: 'Association Nour de Solidarité',
              },
              {
                slug: 'nour-hope',
                nameAr: 'جمعية نور للأمل',
                nameFr: 'Association Nour de l’Espoir',
              },
            ],
          }),
        ]),
      ),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل هناك جمعية نور',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result.refusal).toBe(true);
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('organizationNotFound', 'ar'));
  });

  it('answers an organization tool failure with the unavailable policy, not an internal error', async () => {
    const harness = createHarness({
      decision: organizationDecision({ language: 'ar' }),
      executeMany: jest.fn(async () => {
        throw new Error('organization query failed');
      }),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'هل هناك جمعية نور للتضامن',
      'normal',
      new AbortController().signal,
      [],
      'en',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      toolCalls: 1,
      toolNames: ['search_organizations'],
    });
    expect(result.errorCode).toBeUndefined();
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('toolUnavailable', 'ar'));
    expect(frames.some((frame) => frame.event === 'error')).toBe(false);
  });

  it.each([
    ['English', 'show me opportunities', 'en'],
    ['Arabic', 'ما هي الفرص المتوفرة', 'ar'],
  ] as const)(
    'returns the exact no-opportunities message for a generic %s browse',
    async (_label, message, language) => {
      const harness = createHarness({
        decision: liveDataDecision({ language }),
        executeMany: jest.fn(async () =>
          batch([toolSuccess('search_opportunities', { items: [] })]),
        ),
      });

      const { result, frames } = await runOrchestrator(
        harness,
        message,
        'normal',
        new AbortController().signal,
        [],
        language,
      );

      expect(queueProvider(harness).calls).toBe(0);
      expect(harness.toolExecutor.executeMany).toHaveBeenCalledWith([
        {
          name: 'search_opportunities',
          arguments: { limit: 3, sort: 'newest', compact: true },
        },
      ]);
      expect(result).toMatchObject({
        finishReason: 'stop',
        refusal: true,
        toolCalls: 1,
        toolNames: ['search_opportunities'],
      });
      const answer = frames
        .filter((frame) => frame.event === 'token')
        .map((frame) => (frame.data as { delta: string }).delta)
        .join('');
      expect(answer).toBe(policyMessage('noOpportunities', language));
    },
  );

  it('runs the opportunity fallback after another tool round without an opportunity call', async () => {
    const statsTool: ToolDescriptor = {
      name: 'platform_stats',
      description: 'Public platform counters.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      allowedIntents: ['platform_stats'],
      readOnly: true,
    };
    const executeMany = jest
      .fn()
      .mockResolvedValueOnce(
        batch([toolSuccess('platform_stats', { opportunities: 11 })]),
      )
      .mockResolvedValueOnce(
        batch([
          toolSuccess('search_opportunities', {
            items: [{ slug: 'coding-club', title: 'Coding club' }],
          }),
        ]),
      );
    const harness = createHarness({
      decision: liveDataDecision({
        tools: [OPPORTUNITY_TOOL, statsTool],
        toolIntents: ['opportunity_search', 'platform_stats'],
        reason: 'TEST_MIXED',
      }),
      executeMany,
    });
    const provider = queueProvider(harness);
    provider.queueTurn({
      toolCalls: [
        {
          callId: 'call-1',
          name: 'platform_stats',
          arguments: {},
        },
      ],
    });
    provider.queueTurn({ text: ['There are no opportunities.'] });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(provider.calls).toBe(2);
    expect(executeMany).toHaveBeenCalledTimes(2);
    expect(executeMany).toHaveBeenNthCalledWith(2, [
      {
        name: 'search_opportunities',
        arguments: {
          text: 'programming',
          limit: 3,
          sort: 'newest',
          compact: true,
        },
      },
    ]);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      toolCalls: 2,
      toolNames: ['platform_stats', 'search_opportunities'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(
      'I found this opportunity for you: [Coding club](/en/opportunities/coding-club) — you can browse more on the [Opportunities page](/en/opportunities).',
    );
  });

  it('allows one general browse link when the user asks where to browse', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['You can browse [opportunities](/opportunities).'],
      usage: { inputTokens: 12, outputTokens: 6 },
    });

    const { frames } = await runOrchestrator(
      harness,
      'Where can I find opportunities?',
    );

    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    expect((frames[1].data as { delta: string }).delta).toBe(
      'You can browse [opportunities](/en/opportunities).',
    );
  });

  it('turns a general browse link into plain text when the user did not ask to browse', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['You can browse [opportunities](/opportunities).'],
      usage: { inputTokens: 12, outputTokens: 6 },
    });

    const { frames } = await runOrchestrator(harness, 'What is Basmatak?');

    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    expect((frames[1].data as { delta: string }).delta).toBe(
      'You can browse opportunities.',
    );
  });

  it('answers no-opportunities immediately when a successful opportunity result is empty', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([toolSuccess('search_opportunities', { items: [], total: 0 })]),
      ),
    });
    queueProvider(harness).queueTurn({
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { text: 'nothing' },
        },
      ],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'status',
      'token',
    ]);
    expect((frames[2].data as { delta: string }).delta).toBe(
      policyMessage('noOpportunities', 'en'),
    );
    expect(frames.some((frame) => frame.event === 'sources')).toBe(false);
  });

  it('answers the area-specific no-opportunities message when a place resolved', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [],
            resolvedPlace: {
              type: 'wilaya',
              code: '31',
              nameAr: 'وهران',
              nameFr: 'Oran',
            },
          }),
        ]),
      ),
    });
    queueProvider(harness).queueTurn({
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { text: 'opportunities in Oran' },
        },
      ],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'opportunities in Oran',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'status',
      'token',
    ]);
    expect((frames[2].data as { delta: string }).delta).toBe(
      policyMessage('noOpportunitiesInArea', 'en'),
    );
  });

  it('uses the area-specific message when the fallback resolves a place but finds nothing', async () => {
    const harness = createHarness({
      decision: liveDataDecision({ language: 'ar' }),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [],
            resolvedPlace: {
              type: 'wilaya',
              code: '31',
              nameAr: 'وهران',
              nameFr: 'Oran',
            },
          }),
        ]),
      ),
    });
    queueProvider(harness).queueTurn({
      text: ['لم تتوفر لدي تفاصيل عن الفرص في الوقت الحالي.'],
    });

    const { result, frames } = await runOrchestrator(harness, 'فرص في وهران');

    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      toolCalls: 1,
      toolNames: ['search_opportunities'],
    });
    const answer = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(answer).toBe(policyMessage('noOpportunitiesInArea', 'ar'));
  });

  it('rejects unknown tools without executing them', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(),
    });
    queueProvider(harness).queueTurn({
      toolCalls: [
        {
          callId: 'call-1',
          name: 'delete_everything',
          arguments: {},
        },
      ],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(harness.toolExecutor.executeMany).not.toHaveBeenCalled();
    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      toolCalls: 0,
    });
    expect((frames[frames.length - 1].data as { delta: string }).delta).toBe(
      policyMessage('toolUnavailable', 'en'),
    );
  });

  it('rejects invalid tool arguments without executing the handler', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(),
    });
    queueProvider(harness).queueTurn({
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 'many' },
        },
      ],
    });

    const { result } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(harness.toolExecutor.executeMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      toolCalls: 0,
    });
  });

  it('does not run a second tool round when the default cap is one', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [{ slug: 'beach', title: 'Beach cleanup' }],
          }),
        ]),
      ),
    });
    const provider = queueProvider(harness);
    provider.queueTurn({
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 1 },
        },
      ],
    });
    provider.queueTurn({
      toolCalls: [
        {
          callId: 'call-2',
          name: 'search_opportunities',
          arguments: { limit: 1 },
        },
      ],
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(provider.calls).toBe(2);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      toolCalls: 1,
    });
    expect((frames[frames.length - 1].data as { delta: string }).delta).toBe(
      policyMessage('toolUnavailable', 'en'),
    );
  });

  it('allows two configured tool rounds and a third final provider call', async () => {
    const harness = createHarness({
      config: createConfig({ limits: { maxToolRounds: 2 } }),
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [{ slug: 'beach', title: 'Beach cleanup' }],
          }),
        ]),
      ),
    });
    const provider = queueProvider(harness);
    const toolTurn = {
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 1 },
        },
      ],
    };
    provider.queueTurn(toolTurn);
    provider.queueTurn({
      toolCalls: [
        {
          callId: 'call-2',
          name: 'search_opportunities',
          arguments: { limit: 1 },
        },
      ],
    });
    provider.queueTurn({ text: ['Beach cleanup is available [T1].'] });

    const { result } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
    );

    expect(provider.calls).toBe(AI_AGENT_MAX_PROVIDER_CALLS);
    expect(harness.toolExecutor.executeMany).toHaveBeenCalledTimes(2);
    expect(provider.requests[1].tools).toBeDefined();
    expect(provider.requests[2].tools).toBeUndefined();
    expect(result).toMatchObject({
      finishReason: 'stop',
      toolCalls: 2,
      refusal: false,
    });
  });

  it('accepts an uncited answer and keeps the usage', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform.'],
      usage: { inputTokens: 12, outputTokens: 6 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: false,
      inputTokens: 12,
      outputTokens: 6,
      totalTokens: 18,
    });
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    expect((frames[1].data as { delta: string }).delta).toBe(
      'Basmatak is a platform.',
    );
  });

  it('strips citation markers and source wording from a final answer', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform [K1].\n\nSources:\n- faq/en.md'],
      usage: { inputTokens: 12, outputTokens: 6 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(result).toMatchObject({ finishReason: 'stop', refusal: false });
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    const text = (frames[1].data as { delta: string }).delta;
    expect(text).toBe('Basmatak is a platform.');
    expect(text).not.toContain('[K1]');
    expect(text).not.toMatch(/sources?/iu);
  });

  it('replaces an answer that is empty after sanitization with the ungrounded policy', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['[K1]'],
      usage: { inputTokens: 12, outputTokens: 6 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({
      finishReason: 'stop',
      refusal: true,
      inputTokens: 12,
      outputTokens: 6,
      totalTokens: 18,
    });
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token']);
    expect((frames[1].data as { delta: string }).delta).toBe(
      policyMessage('ungrounded', 'en'),
    );
  });

  it('keeps a MAX_TOKENS partial answer and marks it truncated', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform [K1].'],
      finishReason: 'length',
      usage: { inputTokens: 10, outputTokens: 4 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({
      finishReason: 'length',
      truncated: true,
      inputTokens: 10,
      outputTokens: 4,
    });
    expect(
      frames
        .filter((frame) => frame.event === 'token')
        .map((frame) => (frame.data as { delta: string }).delta)
        .join(''),
    ).toBe('Basmatak is a platform.');
  });

  it('turns a provider 429 into a cooldown and one in-stream error', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      error: new ProviderQuotaError({
        window: 'minute',
        retryAfterSeconds: 45,
      }),
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({
      finishReason: 'error',
      rateLimited: true,
      errorCode: 'AI_AGENT_QUOTA_EXHAUSTED',
    });
    expect(harness.quota.getCooldown()).toMatchObject({
      active: true,
      window: 'minute',
    });
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'error']);
    expect(frames[1].data).toMatchObject({
      code: 'AI_AGENT_QUOTA_EXHAUSTED',
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('retries one transient 5xx before any text and then succeeds', async () => {
    const harness = createHarness();
    const provider = queueProvider(harness);
    provider.queueTurn({ error: new LlmServerError(503) });
    provider.queueTurn({
      text: ['Basmatak is a platform [K1].'],
      usage: { inputTokens: 10, outputTokens: 4 },
    });

    const { result } = await runOrchestrator(harness, 'What is Basmatak?');

    expect(provider.calls).toBe(2);
    expect(result).toMatchObject({
      finishReason: 'stop',
      inputTokens: 10,
      outputTokens: 4,
    });
  });

  it('does not retry a 5xx after text was produced', async () => {
    const provider = new TextThenServerErrorProvider();
    const harness = createHarness({ provider });

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
    );

    expect(provider.calls).toBe(1);
    expect(result).toMatchObject({
      finishReason: 'error',
      errorCode: 'AI_AGENT_PROVIDER_UNAVAILABLE',
    });
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'error']);
    expect(frames.some((frame) => frame.event === 'token')).toBe(false);
  });

  it('stops on client abort without emitting tokens or an error', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['Late answer [K1].'],
      delayMs: 100,
    });
    const controller = new AbortController();
    const stream = harness.writer.start(
      harness.response as unknown as Response,
    );

    const pending = harness.orchestrator.run({
      message: 'What is Basmatak?',
      locale: 'en',
      history: [],
      mode: 'normal',
      stream,
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    const result = await pending;
    stream.end();

    expect(result.finishReason).toBe('aborted');
    const frames = visibleFrames(parseFrames(harness.response.chunks));
    expect(frames.map((frame) => frame.event)).toEqual(['status']);
    expect(frames.some((frame) => frame.event === 'token')).toBe(false);
    expect(frames.some((frame) => frame.event === 'error')).toBe(false);
    expect(harness.quota.activeConcurrencyCount).toBe(0);
  });

  it('returns the live-data limitation in knowledge-only mode', async () => {
    const harness = createHarness({ decision: liveDataDecision() });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me programming opportunities',
      'knowledge_only',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: false });
    expect((frames[frames.length - 1].data as { delta: string }).delta).toBe(
      policyMessage('knowledgeOnlyLive', 'en'),
    );
  });
});

describe('model-first fallback counters', () => {
  const BUDGET = {
    dailyLimit: 150_000,
    usedToday: 0,
    remaining: 150_000,
    mode: 'normal' as const,
  };

  function fallbackCounts(meter: UsageMeterService) {
    return meter.getReport(BUDGET).fallbacks.today;
  }

  it('counts a quota fallback when the provider is disabled by mode', async () => {
    const usageMeter = new UsageMeterService({
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger);
    const harness = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision(),
      usageMeter,
    });

    await runOrchestrator(harness, 'What is Basmatak?', 'retrieval_only');

    expect(queueProvider(harness).calls).toBe(0);
    expect(fallbackCounts(usageMeter)).toEqual({
      quota: 1,
      provider_error: 0,
      no_tool_retry_failed: 0,
      language_retry_failed: 0,
      total: 1,
    });
  });

  it('counts a provider error when the provider is unavailable', async () => {
    const usageMeter = new UsageMeterService({
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger);
    const harness = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision(),
      usageMeter,
    });

    const { result } = await runOrchestrator(harness, 'What is Basmatak?');

    expect(result.errorCode).toBe('AI_AGENT_PROVIDER_UNAVAILABLE');
    expect(fallbackCounts(usageMeter)).toMatchObject({
      provider_error: 1,
      total: 1,
    });
  });

  it('counts a zero-token provider turn as a provider error', async () => {
    const usageMeter = new UsageMeterService({
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger);
    const harness = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision(),
      usageMeter,
    });
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform.'],
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    const { result } = await runOrchestrator(harness, 'What is Basmatak?');

    expect(result).toMatchObject({ finishReason: 'stop', inputTokens: 0 });
    expect(fallbackCounts(usageMeter)).toMatchObject({
      provider_error: 1,
      total: 1,
    });
  });

  it('counts an empty final answer as a failed tool retry', async () => {
    const usageMeter = new UsageMeterService({
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger);
    const harness = createHarness({
      config: createConfig({
        modelFirst: true,
        limits: { maxInputTokens: 12_000 },
      }),
      decision: liveDataDecision(),
      tools: MODEL_FIRST_DESCRIPTORS,
      usageMeter,
    });
    queueProvider(harness).queueTurn({ text: [] });
    queueProvider(harness).queueTurn({ text: [] });

    const { result } = await runOrchestrator(harness, 'Show me opportunities');

    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(fallbackCounts(usageMeter)).toMatchObject({
      no_tool_retry_failed: 1,
      total: 1,
    });
  });

  it('counts a failed language retry separately', async () => {
    const usageMeter = new UsageMeterService({
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as AppLogger);
    const harness = createHarness({
      config: createConfig({ modelFirst: true }),
      decision: knowledgeOnlyDecision({ language: 'ar' }),
      usageMeter,
    });
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform.'],
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    queueProvider(harness).queueTurn({
      text: ['Basmatak is a platform.'],
      usage: { inputTokens: 10, outputTokens: 4 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'ما هو بصمتك؟',
      'normal',
      new AbortController().signal,
      [],
      'ar',
    );

    expect(queueProvider(harness).calls).toBe(2);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect((frames[frames.length - 1].data as { delta: string }).delta).toBe(
      policyMessage('ungrounded', 'ar'),
    );
    expect(fallbackCounts(usageMeter)).toMatchObject({
      language_retry_failed: 1,
      total: 1,
    });
  });
});

describe('generated UI cards', () => {
  it('emits one cards event after tokens for links that survive sanitization', async () => {
    const harness = createHarness({
      decision: liveDataDecision(),
      executeMany: jest.fn(async () =>
        batch([
          toolSuccess('search_opportunities', {
            items: [
              { slug: 'beach-cleanup', title: 'Beach cleanup' },
              { slug: 'tree-planting', title: 'Tree planting' },
            ],
          }),
        ]),
      ),
    });
    const provider = queueProvider(harness);
    provider.queueTurn({
      interactionId: 'interaction-1',
      text: [],
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { limit: 2 },
        },
      ],
      usage: { inputTokens: 30, outputTokens: 4 },
    });
    provider.queueTurn({
      interactionId: 'interaction-1',
      text: [
        'Open [Beach cleanup](/en/opportunities/beach-cleanup) or [Invented](/en/opportunities/invented).',
      ],
      usage: { inputTokens: 20, outputTokens: 7 },
    });

    const { frames } = await runOrchestrator(
      harness,
      'Show me a beach cleanup opportunity',
    );

    const events = frames.map((frame) => frame.event);
    const tokenIndex = events.indexOf('token');
    const cardsIndex = events.indexOf('cards');
    expect(tokenIndex).toBeGreaterThanOrEqual(0);
    expect(cardsIndex).toBeGreaterThan(tokenIndex);
    expect(events.filter((event) => event === 'cards')).toHaveLength(1);
    expect(events).not.toContain('sources');

    const cards = frames[cardsIndex]?.data as {
      cards: Array<Record<string, unknown>>;
    };
    expect(cards.cards).toEqual([
      {
        kind: 'opportunity',
        slug: 'beach-cleanup',
        title: 'Beach cleanup',
        href: '/en/opportunities/beach-cleanup',
      },
    ]);
  });
});
