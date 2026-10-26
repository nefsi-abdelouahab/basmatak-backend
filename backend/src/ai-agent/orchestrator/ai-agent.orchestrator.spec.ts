import { EventEmitter } from 'events';
import { Response } from 'express';
import type { AiAgentMode } from '../ai-agent.types';
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
import type {
  ToolBatchExecutionResult,
  ToolDescriptor,
  ToolExecutionResult,
} from '../tools/tool.types';
import { ToolExecutor } from '../tools/tool-executor';
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
    },
  },
  allowedIntents: ['opportunity_search'],
  readOnly: true,
};

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
    limits: { ...base.limits, ...(overrides.limits ?? {}) },
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
}

function createHarness(
  options: {
    config?: AiAgentConfig;
    provider?: LlmProvider;
    decision?: RouterDecision;
    retrieval?: RetrievalResult;
    executeMany?: jest.Mock;
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
  const orchestrator = new AiAgentOrchestrator(
    config,
    router as unknown as IntentRouter,
    knowledge as unknown as KnowledgeService,
    new PromptBuilder(config),
    toolExecutor as unknown as ToolExecutor,
    quota,
    provider,
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
  };
}

async function runOrchestrator(
  harness: Harness,
  message: string,
  mode: AiAgentMode = 'normal',
  signal: AbortSignal = new AbortController().signal,
): Promise<{
  result: Awaited<ReturnType<AiAgentOrchestrator['run']>>;
  frames: ParsedFrame[];
}> {
  const stream = harness.writer.start(harness.response as unknown as Response);
  const result = await harness.orchestrator.run({
    message,
    locale: 'en',
    history: [],
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
  it('answers a knowledge question with one provider call and validated sources', async () => {
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
    expect(request.systemInstruction).toContain('Basmatak public assistant');
    expect(typeof request.input).toBe('string');
    expect(request.input as string).not.toContain('<system_rules>');
    expect(request.previousInteractionId).toBeUndefined();
    expect(request.tools).toBeUndefined();

    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'sources',
      'token',
    ]);
    const sources = frames[1].data as {
      knowledge: Array<Record<string, unknown>>;
      data: unknown[];
    };
    expect(sources.knowledge).toEqual([
      {
        id: 'K1',
        title: 'Basmatak FAQ',
        source: 'faq/en.md',
        heading: 'What is Basmatak?',
      },
    ]);
    expect(sources.data).toEqual([]);
    expect((frames[2].data as { delta: string }).delta).toBe(
      'Basmatak is a platform [K1].',
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

  it('returns fixed quota messaging and browse links in exhausted mode', async () => {
    const harness = createHarness();

    const { result, frames } = await runOrchestrator(
      harness,
      'What is Basmatak?',
      'exhausted',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(harness.knowledge.search).not.toHaveBeenCalled();
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(frames[0].event).toBe('sources');
    expect((frames[0].data as { data: unknown[] }).data).toHaveLength(2);
    expect((frames[1].data as { delta: string }).delta).toBe(
      policyMessage('quotaExhausted', 'en'),
    );
  });

  it('returns extractive snippets in retrieval-only mode without a provider call', async () => {
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
    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'sources',
      'token',
    ]);
    const text = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { delta: string }).delta)
      .join('');
    expect(text).toContain(policyMessage('retrievalIntro', 'en'));
    expect(text).toContain('[K1]');
    expect((frames[1].data as { knowledge: unknown[] }).knowledge).toHaveLength(
      1,
    );
  });

  it('runs one tool round, validates the data citation, and sums usage', async () => {
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
      text: ['Beach cleanup is available [T1].'],
      usage: { inputTokens: 20, outputTokens: 7 },
    });

    const { result, frames } = await runOrchestrator(
      harness,
      'Show me current opportunities',
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
      'sources',
      'token',
    ]);
    expect(frames[0].data).toEqual({ state: 'searching' });
    expect(frames[1].data).toEqual({
      state: 'tool',
      tool: 'search_opportunities',
    });
    expect((frames[2].data as { data: unknown[] }).data).toEqual([
      {
        id: 'T1-1',
        citationId: 'T1',
        type: 'opportunity',
        title: 'Beach cleanup',
        path: '/opportunities/beach-cleanup',
      },
    ]);
  });

  it('answers not-found immediately when a successful tool result is empty', async () => {
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
      'Show me current opportunities',
    );

    expect(queueProvider(harness).calls).toBe(1);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: true });
    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'status',
      'sources',
      'token',
    ]);
    expect((frames[2].data as { data: unknown[] }).data).toHaveLength(2);
    expect((frames[3].data as { delta: string }).delta).toBe(
      policyMessage('notFound', 'en'),
    );
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
      'Show me current opportunities',
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
      'Show me current opportunities',
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
      'Show me current opportunities',
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
      'Show me current opportunities',
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

  it('replaces an answer with no valid citation and keeps the usage', async () => {
    const harness = createHarness();
    queueProvider(harness).queueTurn({
      text: ['Unsupported answer without sources.'],
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
    expect(frames.map((frame) => frame.event)).toEqual([
      'status',
      'sources',
      'token',
    ]);
    expect((frames[2].data as { delta: string }).delta).toBe(
      policyMessage('ungrounded', 'en'),
    );
  });

  it('keeps a cited MAX_TOKENS partial answer and marks it truncated', async () => {
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
    ).toBe('Basmatak is a platform [K1].');
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
      'Show me current opportunities',
      'knowledge_only',
    );

    expect(queueProvider(harness).calls).toBe(0);
    expect(result).toMatchObject({ finishReason: 'stop', refusal: false });
    expect((frames[frames.length - 1].data as { delta: string }).delta).toBe(
      policyMessage('knowledgeOnlyLive', 'en'),
    );
  });
});
