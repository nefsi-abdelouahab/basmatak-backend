import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AI_AGENT_CONFIG } from '../src/ai-agent/ai-agent.constants';
import { QuotaService } from '../src/ai-agent/budget/quota.service';
import {
  AiAgentConfig,
  AiAgentLimits,
  defaultAiAgentConfig,
} from '../src/ai-agent/config/ai-agent.config';
import { LLM_PROVIDER } from '../src/ai-agent/llm/provider.interface';
import { MockProvider } from '../src/ai-agent/llm/mock.provider';
import type {
  LlmDeterministicScript,
  LlmStreamEvent,
  LlmTurnRequest,
} from '../src/ai-agent/llm/provider.types';
import { policyMessage } from '../src/ai-agent/orchestrator/answer-policy';
import { IntentRouter } from '../src/ai-agent/router/intent-router';
import { applyTrustProxy } from '../src/main';
import { createTestApp, TestAppHandle } from './utils/test-db';

const CHAT = '/api/v1/ai-agent/chat';
const STATUS = '/api/v1/ai-agent/status';

const ANSWER: LlmDeterministicScript = {
  text: ['Basmatak connects volunteers with organizations [K1].'],
  usage: { inputTokens: 12, outputTokens: 8 },
};

const KNOWLEDGE_QUESTION = 'What is Basmatak?';
const LIVE_DATA_QUESTION =
  'What are the exact current totals for opportunities, organizations, and volunteers?';

/**
 * Deterministic provider with a concurrency gate. It never touches the
 * network; the gate lets the test hold provider calls open to exercise the
 * two-slot cap and prove that denied requests return immediately.
 */
class LoadProvider extends MockProvider {
  readonly requests: LlmTurnRequest[] = [];
  active = 0;
  maxActive = 0;

  private holding = false;
  private gate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;

  constructor(config: AiAgentConfig) {
    super(config);
    this.setScript(ANSWER);
  }

  get calls(): number {
    return this.requests.length;
  }

  hold(): void {
    this.holding = true;
    this.gate = new Promise<void>((resolve) => {
      this.openGate = resolve;
    });
  }

  release(): void {
    this.holding = false;
    this.openGate?.();
    this.gate = undefined;
    this.openGate = undefined;
  }

  reset(): void {
    this.release();
    this.requests.length = 0;
    this.active = 0;
    this.maxActive = 0;
  }

  override async *streamTurn(
    request: LlmTurnRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    this.requests.push(request);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.holding && this.gate !== undefined) {
        await this.gate;
      }
      yield* super.streamTurn(request, signal);
    } finally {
      this.active -= 1;
    }
  }
}

interface ParsedEvent {
  event: string;
  data: unknown;
}

function responseText(response: { text?: string; body?: unknown }): string {
  if (typeof response.text === 'string') return response.text;
  if (Buffer.isBuffer(response.body)) return response.body.toString('utf8');
  return '';
}

/** Parse SSE frames without depending on line wrapping or frame ordering. */
function sseEvents(response: { text?: string; body?: unknown }): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const frame of responseText(response).split(/\r?\n\r?\n/)) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (dataLines.length === 0) continue;
    try {
      events.push({ event, data: JSON.parse(dataLines.join('\n')) });
    } catch {
      // Comments/heartbeats carry no JSON and are ignored.
    }
  }
  return events;
}

function metaMode(response: { text?: string; body?: unknown }): string {
  const meta = sseEvents(response).find((event) => event.event === 'meta');
  return String((meta?.data as { mode?: string } | undefined)?.mode);
}

function streamedAnswer(response: { text?: string; body?: unknown }): string {
  return sseEvents(response)
    .filter((event) => event.event === 'token')
    .map((event) => String((event.data as { delta?: string }).delta ?? ''))
    .join('');
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not settle within ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`${label} was not reached within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Session 12 quota and load validation.
 *
 * The whole suite runs against the in-memory app and a deterministic provider
 * double: no Gemini call, no network, no real API key. Each test resets the
 * in-memory quota state and installs the caps it needs, so the request windows,
 * concurrency gate, and token ladder are exercised against the real controller,
 * SSE writer, orchestrator, and usage meter.
 */
describe('ai-agent quota and load (S12)', () => {
  let handle: TestAppHandle;
  let app: INestApplication;
  let config: AiAgentConfig;
  let provider: LoadProvider;
  let quota: QuotaService;
  let router: IntentRouter;
  let defaultLimits: AiAgentLimits;

  const chat = (ip: string, message = KNOWLEDGE_QUESTION) =>
    request(app.getHttpServer())
      .post(CHAT)
      .set('X-Forwarded-For', ip)
      .send({ message, locale: 'en' });

  const status = () => request(app.getHttpServer()).get(STATUS);

  const installLimits = (overrides: Partial<AiAgentLimits> = {}): void => {
    config.limits = { ...defaultLimits, ...overrides };
    config.mockDelayMs = 0;
    quota.reset();
    provider.reset();
  };

  /** Commit provider-reported tokens until the budget is at `target`. */
  const seedTokens = (target: number): void => {
    const used = quota.getBudgetSnapshot().usedToday;
    const delta = target - used;
    if (delta <= 0) return;
    const reservation = quota.reserve({
      ip: 'seed-budget',
      estimatedInputTokens: delta,
      maxOutputTokens: 0,
    });
    if (!reservation.allowed) {
      throw new Error(`seed reservation denied: ${reservation.reason}`);
    }
    expect(
      quota.commit(reservation.reservationId, {
        inputTokens: delta,
        outputTokens: 0,
      }).committed,
    ).toBe(true);
  };

  beforeAll(async () => {
    const base = defaultAiAgentConfig();
    defaultLimits = { ...base.limits };
    config = {
      ...base,
      enabled: true,
      provider: 'mock',
      mockDelayMs: 0,
      limits: { ...defaultLimits },
    };
    provider = new LoadProvider(config);

    handle = await createTestApp([], {
      env: { THROTTLE_LIMIT: '1000000' },
      providers: [
        { token: AI_AGENT_CONFIG, useValue: config },
        { token: LLM_PROVIDER, useValue: provider },
      ],
    });
    app = handle.app;
    quota = app.get(QuotaService);
    router = app.get(IntentRouter);

    applyTrustProxy(app, { TRUST_PROXY: '1' });
    await app.listen(0);
  });

  afterAll(async () => {
    await handle.close();
  });

  afterEach(() => {
    provider.release();
  });

  describe('tuned free-tier defaults', () => {
    it('keeps per-IP, global, concurrency, and token caps at the documented values', () => {
      const { limits } = defaultAiAgentConfig();
      expect(limits).toMatchObject({
        ipRequestsPerMinute: 4,
        ipRequestsPerDay: 15,
        // 80% of the published 10 RPM free-tier ceiling.
        globalRequestsPerMinute: 8,
        globalRequestsPerDay: 80,
        maxConcurrent: 2,
        dailyTokenBudget: 150_000,
        retrievalFallback: true,
      });
    });
  });

  describe('request windows', () => {
    it('allows four requests per minute per IP, then blocks the fifth', async () => {
      installLimits();
      const ip = '198.51.100.10';

      for (let index = 0; index < 4; index += 1) {
        const allowed = await withTimeout(chat(ip), 5_000, `request ${index}`);
        expect(allowed.status).toBe(200);
      }
      expect(provider.calls).toBe(4);

      const denied = await chat(ip);
      expect(denied.status).toBe(429);
      expect(denied.body).toMatchObject({
        code: 'RATE_LIMITED',
        details: { reason: 'ip_minute' },
      });
      expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
      expect(provider.calls).toBe(4);

      // A different client is unaffected.
      const other = await chat('198.51.100.11');
      expect(other.status).toBe(200);
    });

    it('allows fifteen requests per day per IP, then blocks the sixteenth', async () => {
      installLimits({
        ipRequestsPerMinute: 100,
        ipRequestsPerDay: 15,
        globalRequestsPerMinute: 100,
        globalRequestsPerDay: 1_000,
        maxConcurrent: 10,
      });
      const ip = '198.51.100.20';

      for (let index = 0; index < 15; index += 1) {
        const allowed = await withTimeout(chat(ip), 5_000, `request ${index}`);
        expect(allowed.status).toBe(200);
      }
      expect(provider.calls).toBe(15);

      const denied = await chat(ip);
      expect(denied.status).toBe(429);
      expect(denied.body).toMatchObject({
        code: 'RATE_LIMITED',
        details: { reason: 'ip_day' },
      });
      expect(provider.calls).toBe(15);
    });

    it('enforces the global minute cap across different client IPs', async () => {
      installLimits({
        ipRequestsPerMinute: 100,
        ipRequestsPerDay: 1_000,
        globalRequestsPerMinute: 8,
        globalRequestsPerDay: 1_000,
        maxConcurrent: 10,
      });

      for (let index = 0; index < 8; index += 1) {
        const allowed = await withTimeout(
          chat(`198.51.100.${30 + index}`),
          5_000,
          `request ${index}`,
        );
        expect(allowed.status).toBe(200);
      }
      expect(provider.calls).toBe(8);

      const denied = await chat('198.51.100.99');
      expect(denied.status).toBe(429);
      expect(denied.body).toMatchObject({
        code: 'RATE_LIMITED',
        details: { reason: 'global_minute' },
      });
      expect(provider.calls).toBe(8);
    });

    it('enforces the global daily cap across different client IPs', async () => {
      installLimits({
        ipRequestsPerMinute: 100,
        ipRequestsPerDay: 1_000,
        globalRequestsPerMinute: 1_000,
        globalRequestsPerDay: 80,
        maxConcurrent: 10,
      });

      // The first 79 requests use the provider normally. The 80th fills the
      // global daily counter to 100%, so it is admitted and served extractively
      // without a provider call — the budget boundary itself cannot overspend.
      for (let index = 0; index < 79; index += 1) {
        const allowed = await withTimeout(
          chat(`10.12.${Math.floor(index / 250)}.${(index % 250) + 1}`),
          10_000,
          `request ${index}`,
        );
        expect(allowed.status).toBe(200);
      }
      expect(provider.calls).toBe(79);

      const boundary = await withTimeout(
        chat('10.12.0.80'),
        10_000,
        'budget-boundary request',
      );
      expect(boundary.status).toBe(200);
      expect(metaMode(boundary)).toBe('retrieval_only');
      expect(provider.calls).toBe(79);

      const denied = await chat('10.12.9.9');
      expect(denied.status).toBe(429);
      expect(denied.body).toMatchObject({
        code: 'RATE_LIMITED',
        details: { reason: 'global_day' },
      });
      expect(provider.calls).toBe(79);
    });
  });

  describe('concurrency and burst load', () => {
    it('serves two concurrent turns, answers status, and rejects the third immediately', async () => {
      installLimits({
        ipRequestsPerMinute: 100,
        ipRequestsPerDay: 1_000,
        globalRequestsPerMinute: 1_000,
        globalRequestsPerDay: 1_000,
        maxConcurrent: 2,
      });
      provider.hold();

      const first = chat('198.51.100.50');
      const second = chat('198.51.100.51');
      const firstResult = withTimeout(first, 10_000, 'first concurrent turn');
      const secondResult = withTimeout(
        second,
        10_000,
        'second concurrent turn',
      );

      await waitFor(() => provider.active === 2, 'two active provider calls');

      // Health/status stays responsive while both provider slots are occupied.
      const statusResponse = await withTimeout(
        status(),
        2_000,
        'status while busy',
      );
      expect(statusResponse.status).toBe(200);

      const denied = await withTimeout(
        chat('198.51.100.52'),
        3_000,
        'third concurrent turn',
      );
      expect(denied.status).toBe(429);
      expect(denied.body).toMatchObject({
        code: 'AI_AGENT_BUSY',
        details: { reason: 'concurrency' },
      });
      expect(denied.headers['retry-after']).toBe('1');

      provider.release();
      const [firstResponse, secondResponse] = await withTimeout(
        Promise.all([firstResult, secondResult]),
        10_000,
        'held turns after release',
      );
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(provider.maxActive).toBeLessThanOrEqual(2);

      const next = await withTimeout(
        chat('198.51.100.53'),
        5_000,
        'post-release turn',
      );
      expect(next.status).toBe(200);
    });

    it('settles a burst of twenty parallel turns without hanging or exceeding the cap', async () => {
      installLimits({
        ipRequestsPerMinute: 100,
        ipRequestsPerDay: 1_000,
        globalRequestsPerMinute: 1_000,
        globalRequestsPerDay: 1_000,
        maxConcurrent: 2,
      });
      config.mockDelayMs = 10;

      const burst = Array.from({ length: 20 }, (_value, index) =>
        chat(`203.0.113.${index + 1}`),
      );
      const responses = await withTimeout(
        Promise.all(burst),
        20_000,
        'twenty-request burst',
      );

      const ok = responses.filter((response) => response.status === 200);
      const denied = responses.filter((response) => response.status === 429);
      expect(ok.length + denied.length).toBe(20);
      expect(ok.length).toBeGreaterThan(0);
      expect(denied.length).toBeGreaterThan(0);
      expect(responses.some((response) => response.status >= 500)).toBe(false);
      for (const response of denied) {
        expect(response.body.code).toBe('AI_AGENT_BUSY');
      }
      expect(provider.maxActive).toBeLessThanOrEqual(2);
      // Only admitted turns reach the provider, exactly once each.
      expect(provider.calls).toBe(ok.length);
      expect(quota.activeConcurrencyCount).toBe(0);
    });
  });

  describe('degradation ladder', () => {
    const budgetOverrides: Partial<AiAgentLimits> = {
      ipRequestsPerMinute: 100,
      ipRequestsPerDay: 1_000,
      globalRequestsPerMinute: 1_000,
      globalRequestsPerDay: 1_000,
      maxConcurrent: 10,
      dailyTokenBudget: 150_000,
    };

    it('reaches conservative mode at 70% and still calls the provider with lower caps', async () => {
      installLimits(budgetOverrides);
      seedTokens(105_000);
      expect(quota.getMode()).toBe('conservative');

      const response = await withTimeout(chat('192.0.2.70'), 5_000, '70% turn');
      expect(response.status).toBe(200);
      expect(metaMode(response)).toBe('conservative');
      expect(provider.calls).toBe(1);
      expect(provider.requests[0].maxOutputTokens).toBeLessThanOrEqual(300);
      expect(streamedAnswer(response)).toContain('[K1]');
    });

    it('reaches knowledge-only mode at 90% and refuses live data without a provider call', async () => {
      installLimits(budgetOverrides);
      seedTokens(135_000);
      expect(quota.getMode()).toBe('knowledge_only');
      expect(router.route(LIVE_DATA_QUESTION, 'en').intent).toBe('live_data');

      const live = await withTimeout(
        chat('192.0.2.90', LIVE_DATA_QUESTION),
        5_000,
        '90% live-data turn',
      );
      expect(live.status).toBe(200);
      expect(metaMode(live)).toBe('knowledge_only');
      expect(provider.calls).toBe(0);
      expect(streamedAnswer(live)).toContain(
        policyMessage('knowledgeOnlyLive', 'en'),
      );

      const knowledge = await withTimeout(
        chat('192.0.2.91'),
        5_000,
        '90% knowledge turn',
      );
      expect(knowledge.status).toBe(200);
      expect(metaMode(knowledge)).toBe('knowledge_only');
      expect(provider.calls).toBe(1);
      expect(provider.requests[0].tools).toBeUndefined();
    });

    it('serves extractive retrieval at 100% and the fixed exhausted answer when fallback is off', async () => {
      installLimits(budgetOverrides);
      seedTokens(150_000);
      expect(quota.getMode()).toBe('exhausted');

      const retrieval = await withTimeout(
        chat('192.0.2.100'),
        5_000,
        '100% retrieval turn',
      );
      expect(retrieval.status).toBe(200);
      expect(metaMode(retrieval)).toBe('retrieval_only');
      expect(provider.calls).toBe(0);
      const retrievalText = streamedAnswer(retrieval);
      expect(retrievalText.trim().length).toBeGreaterThan(0);
      expect(retrievalText).not.toContain('Here is what I found');
      const done = sseEvents(retrieval).find((event) => event.event === 'done');
      expect(
        (done?.data as { usage?: { totalTokens?: number } }).usage?.totalTokens,
      ).toBe(0);

      config.limits = { ...config.limits, retrievalFallback: false };
      const exhausted = await withTimeout(
        chat('192.0.2.101'),
        5_000,
        '100% exhausted turn',
      );
      expect(exhausted.status).toBe(200);
      expect(metaMode(exhausted)).toBe('exhausted');
      expect(provider.calls).toBe(0);
      expect(streamedAnswer(exhausted)).toContain(
        policyMessage('quotaExhausted', 'en'),
      );
    });
  });

  describe('provider cooldown', () => {
    it('returns 429 with Retry-After during a simulated provider cooldown and makes no call', async () => {
      installLimits();
      const cooldown = quota.markProviderQuotaExhausted({
        window: 'minute',
        retryAfterSeconds: 30,
      });
      expect(cooldown.active).toBe(true);

      const denied = await withTimeout(
        chat('198.51.100.60'),
        3_000,
        'cooldown turn',
      );
      expect(denied.status).toBe(429);
      expect(denied.body).toMatchObject({
        code: 'AI_AGENT_QUOTA_EXHAUSTED',
        details: { reason: 'cooldown_minute' },
      });
      expect(Number(denied.headers['retry-after'])).toBeGreaterThanOrEqual(30);
      expect(provider.calls).toBe(0);
    });
  });
});
