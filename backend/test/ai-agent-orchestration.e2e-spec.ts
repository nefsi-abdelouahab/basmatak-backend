import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import * as http from 'http';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AI_AGENT_CONFIG } from '../src/ai-agent/ai-agent.constants';
import { QuotaService } from '../src/ai-agent/budget/quota.service';
import { ProviderQuotaError } from '../src/ai-agent/budget/quota.types';
import {
  AiAgentConfig,
  AiAgentLimits,
  defaultAiAgentConfig,
} from '../src/ai-agent/config/ai-agent.config';
import {
  LlmProviderUnavailableError,
  LlmServerError,
} from '../src/ai-agent/llm/provider-errors';
import { LLM_PROVIDER } from '../src/ai-agent/llm/provider.interface';
import type {
  LlmDeterministicScript,
  LlmStreamEvent,
  LlmTurnRequest,
} from '../src/ai-agent/llm/provider.types';
import { MockProvider } from '../src/ai-agent/llm/mock.provider';
import { SseWriter } from '../src/ai-agent/sse/sse-writer';
import { UsageMeterService } from '../src/ai-agent/usage/usage-meter.service';
import { LocationsCollection } from '../src/locations/schemas/location.schema';
import { OpportunitiesCollection } from '../src/opportunities/schemas/opportunity.schema';
import { OrganizationsCollection } from '../src/organizations/schemas/organization.schema';
import { SkillsCollection } from '../src/skills/schemas/skill.schema';
import { createTestApp, TestAppHandle } from './utils/test-db';

const CHAT = '/api/v1/ai-agent/chat';

function baseLimits(overrides: Partial<AiAgentLimits> = {}): AiAgentLimits {
  const base = defaultAiAgentConfig().limits;
  return {
    ...base,
    ipRequestsPerMinute: 1000,
    ipRequestsPerDay: 100_000,
    globalRequestsPerMinute: 10_000,
    globalRequestsPerDay: 1_000_000,
    maxConcurrent: 100,
    dailyTokenBudget: 10_000_000,
    ...overrides,
  };
}

/** One explicit script per provider turn; an empty queue is a test failure. */
class ScriptedProvider extends MockProvider {
  readonly requests: LlmTurnRequest[] = [];
  private readonly queue: LlmDeterministicScript[] = [];

  queueTurn(script: LlmDeterministicScript): this {
    this.queue.push(script);
    return this;
  }

  get calls(): number {
    return this.requests.length;
  }

  reset(): void {
    this.requests.length = 0;
    this.queue.length = 0;
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

interface ParsedFrame {
  event: string;
  data: unknown;
}

function parseSse(rawText: string): ParsedFrame[] {
  return rawText
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

function visibleFrames(rawText: string): ParsedFrame[] {
  return parseSse(rawText).filter((frame) => frame.event !== 'heartbeat');
}

function responseText(response: { text?: string; body?: unknown }): string {
  if (typeof response.text === 'string') return response.text;
  if (Buffer.isBuffer(response.body)) return response.body.toString('utf8');
  return '';
}

function tokenText(frames: ParsedFrame[]): string {
  return frames
    .filter((frame) => frame.event === 'token')
    .map((frame) => (frame.data as { delta: string }).delta)
    .join('');
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for the stream to clean up');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const KNOWLEDGE_QUESTION = 'What is Basmatak?';
const LIVE_QUESTION = 'Show me current volunteering opportunities';
const OPPORTUNITY_ID = new Types.ObjectId('64d100000000000000000101');
const ORGANIZATION_ID = new Types.ObjectId('64c100000000000000000101');

describe('ai-agent answer orchestration e2e (Session 9)', () => {
  let handle: TestAppHandle;
  let app: INestApplication;
  let connection: Connection;
  let config: AiAgentConfig;
  let baseLimitSnapshot: AiAgentLimits;
  let provider: ScriptedProvider;
  let quota: QuotaService;
  let usage: UsageMeterService;
  let writer: SseWriter;
  let port: number;

  const postChat = (body: object) =>
    request(app.getHttpServer()).post(CHAT).send(body);

  beforeAll(async () => {
    const base = defaultAiAgentConfig();
    config = {
      ...base,
      enabled: true,
      provider: 'mock',
      heartbeatIntervalMs: 15_000,
      mockDelayMs: 0,
      limits: baseLimits(),
    };
    baseLimitSnapshot = { ...config.limits };
    provider = new ScriptedProvider(config);

    handle = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [
        { token: AI_AGENT_CONFIG, useValue: config },
        { token: LLM_PROVIDER, useValue: provider },
      ],
    });
    app = handle.app;
    connection = app.get<Connection>(getConnectionToken());
    quota = app.get(QuotaService);
    usage = app.get(UsageMeterService);
    writer = app.get(SseWriter);
    await app.listen(0);

    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
      throw new Error('The test server did not expose a TCP address');
    }
    port = address.port;
  });

  afterAll(async () => {
    await handle.close();
  });

  beforeEach(async () => {
    quota.reset();
    usage.reset();
    config.enabled = true;
    config.heartbeatIntervalMs = 15_000;
    config.limits = { ...baseLimitSnapshot };
    provider.reset();

    await Promise.all([
      connection.collection(OpportunitiesCollection).deleteMany({}),
      connection.collection(OrganizationsCollection).deleteMany({}),
      connection.collection(SkillsCollection).deleteMany({}),
      connection.collection(LocationsCollection).deleteMany({}),
    ]);

    await connection.collection(OrganizationsCollection).insertOne({
      _id: ORGANIZATION_ID,
      userId: new Types.ObjectId('64f100000000000000000101'),
      slug: 'orchestration-green',
      registryId: 'ORG-ORCH-SECRET',
      nameAr: 'الأرض الخضراء',
      nameFr: 'Orchestration Green',
      description: 'Orchestration test organization.',
      type: 'association',
      registrationNumber: 'REG-ORCH-SECRET',
      location: {
        wilayaId: '16',
        municipalityId: '1601',
        address: 'Orchestration secret street',
      },
      contact: {
        email: 'orchestration-secret@example.com',
        phone: '0550000201',
      },
      publicProfile: { enabled: true },
      verificationStatus: 'verified',
      status: 'active',
    });
    await connection.collection(OpportunitiesCollection).insertOne({
      _id: OPPORTUNITY_ID,
      organizationId: ORGANIZATION_ID,
      slug: 'beach-cleanup-e2e',
      registryId: 'OPP-ORCH-SECRET',
      title: 'Beach cleanup e2e',
      description: 'Join the orchestration beach cleanup.',
      categoryId: new Types.ObjectId('64a100000000000000000101'),
      status: 'published',
      mode: 'onsite',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-02T00:00:00.000Z'),
      applicationDeadline: new Date('2026-10-30T00:00:00.000Z'),
      prerequisites: ['Orchestration secret prerequisite'],
      location: {
        wilayaId: '16',
        municipalityId: '1601',
        coordinates: [3.05, 36.75],
      },
      positions: [
        {
          title: 'Volunteer',
          description: 'Help out',
          requiredCount: 5,
          filledCount: 2,
          deliverables: ['Orchestration secret deliverable'],
        },
      ],
    });
  });

  it('answers a knowledge question with one provider call and validated sources', async () => {
    const answer =
      'Basmatak connects volunteers with opportunities and organizations [K1].';
    provider.queueTurn({
      interactionId: 'interaction-knowledge',
      text: [answer],
      usage: { inputTokens: 123, outputTokens: 11 },
    });

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'sources',
      'token',
      'done',
    ]);
    expect((frames[0].data as { mode: string }).mode).toBe('normal');
    expect(frames[1].data).toEqual({ state: 'searching' });

    const sources = frames[2].data as {
      knowledge: Array<Record<string, unknown>>;
      data: unknown[];
    };
    expect(sources.knowledge).toEqual([
      {
        id: 'K1',
        title: 'Basmatak frequently asked questions',
        source: 'faq/en.md',
        heading: expect.stringContaining('What is Basmatak?'),
      },
    ]);
    expect(sources.data).toEqual([]);
    expect(tokenText(frames)).toBe(answer);
    expect(frames[4].data).toEqual({
      finishReason: 'stop',
      usage: {
        inputTokens: 123,
        outputTokens: 11,
        totalTokens: 134,
        estimated: false,
      },
    });

    expect(provider.calls).toBe(1);
    expect(provider.requests[0].previousInteractionId).toBeUndefined();
    expect(provider.requests[0].tools).toBeUndefined();
    expect(provider.requests[0].maxOutputTokens).toBe(400);
    expect(provider.requests[0].systemInstruction).toContain(
      'Basmatak public assistant',
    );
    expect(provider.requests[0].input as string).not.toContain(
      '<system_rules>',
    );
    expect(writer.activeSessionCount).toBe(0);
    expect(quota.activeConcurrencyCount).toBe(0);
  });

  it('runs exactly one live-data tool round and cites the public row', async () => {
    provider.queueTurn({
      interactionId: 'interaction-tool',
      toolCalls: [
        {
          callId: 'call-1',
          name: 'search_opportunities',
          arguments: { text: 'beach', limit: 2 },
        },
      ],
      usage: { inputTokens: 25, outputTokens: 3 },
    });
    provider.queueTurn({
      interactionId: 'interaction-tool',
      text: ['Beach cleanup is currently open for volunteers [T1].'],
      usage: { inputTokens: 15, outputTokens: 8 },
    });

    const response = await postChat({
      message: LIVE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'status',
      'sources',
      'token',
      'done',
    ]);
    expect(frames[1].data).toEqual({ state: 'searching' });
    expect(frames[2].data).toEqual({
      state: 'tool',
      tool: 'search_opportunities',
    });

    const sources = frames[3].data as {
      knowledge: unknown[];
      data: Array<Record<string, unknown>>;
    };
    expect(sources.knowledge).toEqual([]);
    expect(sources.data).toEqual([
      {
        id: 'T1-1',
        citationId: 'T1',
        type: 'opportunity',
        title: 'Beach cleanup e2e',
        path: '/opportunities/beach-cleanup-e2e',
      },
    ]);
    expect(tokenText(frames)).toBe(
      'Beach cleanup is currently open for volunteers [T1].',
    );
    expect(frames[5].data).toEqual({
      finishReason: 'stop',
      usage: {
        inputTokens: 40,
        outputTokens: 11,
        totalTokens: 51,
        estimated: false,
      },
    });

    expect(provider.calls).toBe(2);
    expect(provider.requests[1].previousInteractionId).toBe('interaction-tool');
    expect(provider.requests[1].tools).toBeUndefined();
    expect(Array.isArray(provider.requests[1].input)).toBe(true);
    const followUp = provider.requests[1].input as ReadonlyArray<{
      type: string;
      name?: string;
    }>;
    expect(followUp[0]).toMatchObject({
      type: 'function_result',
      name: 'search_opportunities',
    });
    expect(followUp[1].type).toBe('text');

    const raw = responseText(response).toLowerCase();
    for (const forbidden of [
      'registryid',
      'org-orch-secret',
      'opp-orch-secret',
      'reg-orch-secret',
      'orchestration secret',
      'coordinates',
      'orchestration-secret@example.com',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(writer.activeSessionCount).toBe(0);
    expect(quota.activeConcurrencyCount).toBe(0);
  });

  it('answers not-found immediately when a successful tool result is empty', async () => {
    provider.queueTurn({
      toolCalls: [
        {
          callId: 'call-empty',
          name: 'search_opportunities',
          arguments: { text: 'zzz-no-such-opportunity' },
        },
      ],
      usage: { inputTokens: 10, outputTokens: 2 },
    });

    const response = await postChat({
      message: LIVE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'status',
      'sources',
      'token',
      'done',
    ]);
    expect(provider.calls).toBe(1);

    const sources = frames[3].data as {
      knowledge: unknown[];
      data: Array<{ id: string }>;
    };
    expect(sources.knowledge).toEqual([]);
    expect(sources.data.map((source) => source.id)).toEqual([
      'browse-opportunities',
      'browse-organizations',
    ]);
    expect(tokenText(frames)).toBe(
      "I don't have confirmed information on that. You can browse opportunities and organizations on the platform.",
    );
    expect(frames[5].data).toMatchObject({
      finishReason: 'stop',
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
    });
  });

  it('removes invalid citations and replaces an ungrounded answer with a refusal', async () => {
    provider.queueTurn({
      text: ['Basmatak is a platform [K9] [D1].'],
      usage: { inputTokens: 20, outputTokens: 5 },
    });

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'sources',
      'token',
      'done',
    ]);

    const sources = frames[2].data as {
      knowledge: unknown[];
      data: Array<{ id: string }>;
    };
    expect(sources.knowledge).toEqual([]);
    expect(sources.data.map((source) => source.id)).toEqual([
      'browse-opportunities',
      'browse-organizations',
    ]);

    const text = tokenText(frames);
    expect(text).toBe(
      "I couldn't confirm that answer. Could you rephrase your question?",
    );
    expect(text).not.toContain('[K9]');
    expect(text).not.toContain('[D1]');
    expect(frames[4].data).toMatchObject({
      finishReason: 'stop',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25,
      },
    });
    expect(provider.calls).toBe(1);
  });

  it('degrades a token-budget denial to retrieval-only snippets without a reservation', async () => {
    config.limits.dailyTokenBudget = 400;

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.slice(0, 4).map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'sources',
      'token',
    ]);
    expect(frames[frames.length - 1].event).toBe('done');
    expect((frames[0].data as { mode: string }).mode).toBe('retrieval_only');

    const sources = frames[2].data as {
      knowledge: Array<{ id: string }>;
      data: unknown[];
    };
    expect(sources.knowledge.length).toBeGreaterThan(0);
    expect(sources.knowledge[0].id).toBe('K1');
    const text = tokenText(frames);
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toContain('Here is what I found');
    expect(text).not.toContain('[K1]');
    expect(frames[frames.length - 1].data).toMatchObject({
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    expect(provider.calls).toBe(0);
    expect(quota.activeReservationCount).toBe(0);
    expect(quota.activeConcurrencyCount).toBe(0);
  });

  it('returns the exhausted policy answer when retrieval fallback is disabled', async () => {
    config.limits.retrievalFallback = false;
    config.limits.dailyTokenBudget = 400;
    const seed = quota.reserve({
      ip: 'orchestration-budget-seed',
      estimatedInputTokens: 400,
      maxOutputTokens: 0,
    });
    if (!seed.allowed) throw new Error('Expected the seed reservation');
    quota.commit(seed.reservationId, {
      inputTokens: 400,
      outputTokens: 0,
      estimated: false,
    });

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'sources',
      'token',
      'done',
    ]);
    expect((frames[0].data as { mode: string }).mode).toBe('exhausted');
    const sources = frames[1].data as {
      knowledge: unknown[];
      data: Array<{ type: string; path: string }>;
    };
    expect(sources.knowledge).toEqual([]);
    expect(sources.data).toEqual([
      expect.objectContaining({
        type: 'opportunity',
        path: '/opportunities',
      }),
      expect.objectContaining({
        type: 'organization',
        path: '/orgs',
      }),
    ]);
    expect(tokenText(frames)).toContain('reached its free usage limit');
    expect(provider.calls).toBe(0);
  });

  it('turns a provider 429 into a cooldown and one in-stream error', async () => {
    provider.queueTurn({
      error: new ProviderQuotaError({
        window: 'minute',
        retryAfterSeconds: 30,
      }),
    });

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'error',
    ]);
    const error = frames[2].data as {
      code: string;
      retryAfterSeconds: number;
    };
    expect(error.code).toBe('AI_AGENT_QUOTA_EXHAUSTED');
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(30);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(frames.some((frame) => frame.event === 'done')).toBe(false);
    expect(provider.calls).toBe(1);
    expect(quota.getCooldown()).toMatchObject({
      active: true,
      window: 'minute',
    });

    const denied = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(429);
    expect(denied.body).toMatchObject({
      statusCode: 429,
      code: 'AI_AGENT_QUOTA_EXHAUSTED',
      details: { reason: 'cooldown_minute' },
    });
    expect(responseText(denied)).not.toContain('event:');
    expect(provider.calls).toBe(1);
  });

  it('keeps a cited MAX_TOKENS partial answer and marks it truncated', async () => {
    const partial = 'Basmatak connects volunteers with opportunities [K1].';
    provider.queueTurn({
      text: [partial],
      finishReason: 'length',
      usage: { inputTokens: 30, outputTokens: 7 },
    });

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'sources',
      'token',
      'done',
    ]);
    expect(tokenText(frames)).toBe(partial);
    expect(frames[4].data).toEqual({
      finishReason: 'length',
      truncated: true,
      usage: {
        inputTokens: 30,
        outputTokens: 7,
        totalTokens: 37,
        estimated: false,
      },
    });
    expect(provider.calls).toBe(1);
  });

  it('retries one transient 5xx before any text and then answers', async () => {
    provider.queueTurn({ error: new LlmServerError(503) });
    provider.queueTurn({
      text: ['Basmatak connects volunteers [K1].'],
      usage: { inputTokens: 5, outputTokens: 3 },
    });

    const response = await postChat({
      message: KNOWLEDGE_QUESTION,
      locale: 'en',
    }).expect(200);

    const frames = visibleFrames(responseText(response));
    expect(frames.map((frame) => frame.event)).toEqual([
      'meta',
      'status',
      'sources',
      'token',
      'done',
    ]);
    expect(frames.some((frame) => frame.event === 'error')).toBe(false);
    expect(frames[4].data).toMatchObject({
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    });
    expect(provider.calls).toBe(2);
  });

  it('stops the provider stream on client abort and releases concurrency', async () => {
    config.heartbeatIntervalMs = 20;
    provider.queueTurn({
      text: ['Late answer [K1].'],
      delayMs: 100,
    });

    try {
      const aborted = await abortAfterMeta();
      expect(aborted.text).toContain('event: meta');
      expect(aborted.activeAtMeta).toBe(1);

      await waitFor(() => writer.activeSessionCount === 0);
      expect(writer.activeSessionCount).toBe(0);
      expect(quota.activeConcurrencyCount).toBe(0);
      expect(quota.activeReservationCount).toBe(0);

      config.heartbeatIntervalMs = 15_000;
      provider.queueTurn({ text: ['Basmatak connects volunteers [K1].'] });
      const response = await postChat({
        message: KNOWLEDGE_QUESTION,
        locale: 'en',
      }).expect(200);
      expect(responseText(response)).toContain('event: done');
      expect(writer.activeSessionCount).toBe(0);
    } finally {
      config.heartbeatIntervalMs = 15_000;
    }
  });

  function abortAfterMeta(): Promise<{ text: string; activeAtMeta: number }> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        message: KNOWLEDGE_QUESTION,
        locale: 'en',
      });
      let text = '';
      let aborted = false;
      let activeAtMeta = 0;

      const clientRequest = http.request(
        {
          host: '127.0.0.1',
          port,
          path: CHAT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (response) => {
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            text += chunk;
            if (!aborted && text.includes('event: meta')) {
              aborted = true;
              activeAtMeta = writer.activeSessionCount;
              clientRequest.destroy();
              resolve({ text, activeAtMeta });
            }
          });
          response.on('error', () => {
            // The client is intentionally torn down; the cleanup assertions
            // above are the meaningful part of this test.
          });
        },
      );

      clientRequest.on('error', (error) => {
        if (!aborted) reject(error);
      });
      clientRequest.write(body);
      clientRequest.end();
    });
  }
});
