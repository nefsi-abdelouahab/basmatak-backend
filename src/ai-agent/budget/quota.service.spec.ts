import { AiAgentLimits, defaultAiAgentConfig } from '../config/ai-agent.config';
import {
  QuotaReservationAllowed,
  QuotaReservationDenied,
  QuotaReservationResult,
} from './quota.types';
import { computeAiAgentMode, QuotaService } from './quota.service';

function makeService(overrides: Partial<AiAgentLimits> = {}): QuotaService {
  const base = defaultAiAgentConfig();
  return new QuotaService({
    ...base,
    limits: { ...base.limits, ...overrides },
  });
}

function at(iso: string): void {
  jest.setSystemTime(new Date(iso));
}

function expectAllowed(
  result: QuotaReservationResult,
): QuotaReservationAllowed {
  if (!result.allowed) {
    throw new Error(`Expected an allowed reservation, got ${result.reason}`);
  }
  return result;
}

function expectDenied(result: QuotaReservationResult): QuotaReservationDenied {
  if (result.allowed) {
    throw new Error('Expected a denied reservation');
  }
  return result;
}

function reserveAndRelease(
  service: QuotaService,
  ip: string,
  tokens = 10,
): QuotaReservationAllowed {
  const result = service.reserve({
    ip,
    estimatedInputTokens: tokens,
    maxOutputTokens: 0,
  });
  const allowed = expectAllowed(result);
  service.release(allowed.reservationId);
  return allowed;
}

function commitTokens(service: QuotaService, tokens: number): void {
  const result = service.reserve({
    ip: '10.0.0.50',
    estimatedInputTokens: tokens,
    maxOutputTokens: 0,
  });
  const allowed = expectAllowed(result);
  const commit = service.commit(allowed.reservationId, {
    inputTokens: tokens,
    outputTokens: 0,
    estimated: false,
  });
  expect(commit.committed).toBe(true);
}

describe('QuotaService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    at('2026-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows four requests per IP per UTC minute and blocks the fifth', () => {
    const service = makeService();

    for (let index = 0; index < 4; index += 1) {
      reserveAndRelease(service, '203.0.113.1');
    }

    const denied = expectDenied(
      service.reserve({
        ip: '203.0.113.1',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );

    expect(denied.code).toBe('RATE_LIMITED');
    expect(denied.reason).toBe('ip_minute');
    expect(denied.retryAfterSeconds).toBe(60);
    expect(denied.mode).toBe('normal');
  });

  it('allows the fifteenth per-IP request of the day and blocks the sixteenth', () => {
    const service = makeService();
    const ip = '203.0.113.2';

    for (let index = 0; index < 15; index += 1) {
      // Four requests per minute: 4 + 4 + 4 + 3.
      const minute = Math.floor(index / 4);
      at(`2026-01-01T00:0${minute}:00.000Z`);
      reserveAndRelease(service, ip);
    }

    at('2026-01-01T00:03:00.000Z');
    const denied = expectDenied(
      service.reserve({
        ip,
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );

    expect(denied.code).toBe('RATE_LIMITED');
    expect(denied.reason).toBe('ip_day');
    expect(denied.retryAfterSeconds).toBeGreaterThan(80_000);

    // The next UTC day resets the per-IP window.
    at('2026-01-02T00:03:00.000Z');
    expectAllowed(
      service.reserve({
        ip,
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
  });

  it('isolates per-IP counters', () => {
    const service = makeService();

    for (let index = 0; index < 4; index += 1) {
      reserveAndRelease(service, '203.0.113.3');
    }

    expectDenied(
      service.reserve({
        ip: '203.0.113.3',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );

    expectAllowed(
      service.reserve({
        ip: '203.0.113.4',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
  });

  it('allows eight global requests per minute and blocks the ninth', () => {
    const service = makeService();

    for (let index = 0; index < 8; index += 1) {
      reserveAndRelease(service, `198.51.100.${index + 1}`);
    }

    const denied = expectDenied(
      service.reserve({
        ip: '198.51.100.200',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );

    expect(denied.code).toBe('RATE_LIMITED');
    expect(denied.reason).toBe('global_minute');
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it('allows eighty global requests per day, blocks the eighty-first, and cleans up old IPs', () => {
    const service = makeService();

    for (let minute = 0; minute < 10; minute += 1) {
      at(`2026-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`);
      for (let index = 0; index < 8; index += 1) {
        reserveAndRelease(service, `198.51.100.${minute * 8 + index + 1}`);
      }
    }

    at('2026-01-01T00:10:00.000Z');
    const denied = expectDenied(
      service.reserve({
        ip: '198.51.100.250',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );

    expect(denied.reason).toBe('global_day');
    expect(denied.retryAfterSeconds).toBeGreaterThan(80_000);

    at('2026-01-02T00:11:00.000Z');
    expectAllowed(
      service.reserve({
        ip: '198.51.100.251',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
    expect(service.trackedIpCount).toBe(1);
  });

  it('resets the per-IP minute window at the next UTC minute', () => {
    const service = makeService();
    const ip = '203.0.113.5';
    at('2026-01-01T00:00:50.000Z');

    for (let index = 0; index < 4; index += 1) {
      reserveAndRelease(service, ip);
    }

    const denied = expectDenied(
      service.reserve({
        ip,
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
    expect(denied.retryAfterSeconds).toBe(10);

    at('2026-01-01T00:01:01.000Z');
    expectAllowed(
      service.reserve({
        ip,
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
  });

  it('releases old IP windows after a UTC day rollover', () => {
    const service = makeService();
    reserveAndRelease(service, '203.0.113.10');
    reserveAndRelease(service, '203.0.113.11');
    reserveAndRelease(service, '203.0.113.12');
    expect(service.trackedIpCount).toBe(3);

    at('2026-01-02T00:00:01.000Z');
    reserveAndRelease(service, '203.0.113.13');
    expect(service.trackedIpCount).toBe(1);
  });

  it('rejects the third concurrent request and frees the slot on release or commit', () => {
    const service = makeService();
    const shared = {
      estimatedInputTokens: 10,
      maxOutputTokens: 0,
    };

    const first = expectAllowed(
      service.reserve({ ip: '203.0.113.20', ...shared }),
    );
    const second = expectAllowed(
      service.reserve({ ip: '203.0.113.21', ...shared }),
    );
    expect(service.activeConcurrencyCount).toBe(2);

    const busy = expectDenied(
      service.reserve({ ip: '203.0.113.22', ...shared }),
    );
    expect(busy.code).toBe('AI_AGENT_BUSY');
    expect(busy.reason).toBe('concurrency');
    expect(service.activeConcurrencyCount).toBe(2);

    expect(service.release(first.reservationId)).toBe(true);
    expect(service.activeConcurrencyCount).toBe(1);

    const third = expectAllowed(
      service.reserve({ ip: '203.0.113.22', ...shared }),
    );
    expect(service.activeConcurrencyCount).toBe(2);

    expect(service.commit(second.reservationId)).toMatchObject({
      committed: true,
      estimated: true,
    });
    expect(service.activeConcurrencyCount).toBe(1);
    expect(service.commit(third.reservationId).committed).toBe(true);
    expect(service.activeConcurrencyCount).toBe(0);
  });

  it('derives every degradation threshold from a 1,000-token budget', () => {
    const service = makeService({
      dailyTokenBudget: 1000,
      globalRequestsPerDay: 1000,
      globalRequestsPerMinute: 1000,
      ipRequestsPerDay: 1000,
      ipRequestsPerMinute: 1000,
      maxConcurrent: 100,
    });

    expect(service.getMode()).toBe('normal');
    commitTokens(service, 699);
    expect(service.getMode()).toBe('normal');
    commitTokens(service, 1);
    expect(service.getMode()).toBe('conservative');
    commitTokens(service, 199);
    expect(service.getMode()).toBe('conservative');
    commitTokens(service, 1);
    expect(service.getMode()).toBe('knowledge_only');
    commitTokens(service, 99);
    expect(service.getMode()).toBe('knowledge_only');
    commitTokens(service, 1);
    expect(service.getMode()).toBe('exhausted');
    expect(service.getBudgetSnapshot()).toMatchObject({
      dailyLimit: 1000,
      usedToday: 1000,
      remaining: 0,
      mode: 'exhausted',
    });
  });

  it('uses the most restrictive daily request budget in the ladder', () => {
    const service = makeService({
      dailyTokenBudget: 1_000_000,
      globalRequestsPerDay: 10,
      globalRequestsPerMinute: 100,
      ipRequestsPerDay: 100,
      ipRequestsPerMinute: 100,
      maxConcurrent: 100,
    });

    for (let index = 0; index < 7; index += 1) {
      reserveAndRelease(service, `192.0.2.${index + 1}`);
    }
    expect(service.getMode()).toBe('conservative');

    for (let index = 7; index < 9; index += 1) {
      reserveAndRelease(service, `192.0.2.${index + 1}`);
    }
    expect(service.getMode()).toBe('knowledge_only');

    reserveAndRelease(service, '192.0.2.10');
    expect(service.getMode()).toBe('exhausted');
  });

  it('exposes the exact public mode boundaries', () => {
    expect(computeAiAgentMode(0.699)).toBe('normal');
    expect(computeAiAgentMode(0.7)).toBe('conservative');
    expect(computeAiAgentMode(0.899)).toBe('conservative');
    expect(computeAiAgentMode(0.9)).toBe('knowledge_only');
    expect(computeAiAgentMode(0.999)).toBe('knowledge_only');
    expect(computeAiAgentMode(1)).toBe('exhausted');
    expect(computeAiAgentMode(Number.POSITIVE_INFINITY)).toBe('exhausted');
    expect(computeAiAgentMode(Number.NaN)).toBe('normal');
    expect(computeAiAgentMode(-0.1)).toBe('normal');
  });

  it('applies a minute cooldown with retryAfter and expires at the window', () => {
    const service = makeService();
    at('2026-01-01T00:00:50.000Z');

    const cooldown = service.markProviderQuotaExhausted({
      window: 'minute',
      retryAfterSeconds: 30,
    });

    expect(cooldown).toEqual({
      active: true,
      window: 'minute',
      retryAfterSeconds: 30,
    });
    expect(service.getMode()).toBe('normal');

    const denied = expectDenied(
      service.reserve({
        ip: '203.0.113.30',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
    expect(denied.code).toBe('AI_AGENT_QUOTA_EXHAUSTED');
    expect(denied.reason).toBe('cooldown_minute');
    expect(denied.retryAfterSeconds).toBe(30);

    at('2026-01-01T00:01:21.000Z');
    expect(service.getCooldown()).toEqual({ active: false });
    expectAllowed(
      service.reserve({
        ip: '203.0.113.30',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
  });

  it('applies a day cooldown, forces exhausted mode, and resets at UTC midnight', () => {
    const service = makeService();
    at('2026-01-01T12:00:00.000Z');

    const cooldown = service.markProviderQuotaExhausted({
      window: 'day',
      retryAfterSeconds: 3600,
    });
    expect(cooldown.active).toBe(true);
    expect(cooldown.window).toBe('day');
    expect(cooldown.retryAfterSeconds).toBe(43_200);
    expect(service.getMode()).toBe('exhausted');

    const denied = expectDenied(
      service.reserve({
        ip: '203.0.113.31',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
    expect(denied.code).toBe('AI_AGENT_QUOTA_EXHAUSTED');
    expect(denied.reason).toBe('cooldown_day');

    at('2026-01-02T00:00:01.000Z');
    expect(service.getCooldown()).toEqual({ active: false });
    expect(service.getMode()).toBe('normal');
  });

  it('commits and releases reservations idempotently', () => {
    const service = makeService({
      dailyTokenBudget: 1000,
      maxConcurrent: 4,
      ipRequestsPerDay: 100,
      ipRequestsPerMinute: 100,
      globalRequestsPerDay: 100,
      globalRequestsPerMinute: 100,
    });

    const committed = expectAllowed(
      service.reserve({
        ip: '203.0.113.40',
        estimatedInputTokens: 100,
        maxOutputTokens: 50,
      }),
    );
    expect(service.getBudgetSnapshot().remaining).toBe(850);

    expect(
      service.commit(committed.reservationId, {
        inputTokens: 80,
        outputTokens: 20,
        estimated: false,
      }),
    ).toEqual({
      committed: true,
      inputTokens: 80,
      outputTokens: 20,
      totalTokens: 100,
      estimated: false,
    });
    expect(service.activeConcurrencyCount).toBe(0);
    expect(service.getBudgetSnapshot()).toMatchObject({
      usedToday: 100,
      remaining: 900,
    });

    // Second commit and a later release are both no-ops.
    expect(service.commit(committed.reservationId).committed).toBe(false);
    expect(service.release(committed.reservationId)).toBe(false);
    expect(service.getBudgetSnapshot()).toMatchObject({
      usedToday: 100,
      remaining: 900,
    });

    const released = expectAllowed(
      service.reserve({
        ip: '203.0.113.41',
        estimatedInputTokens: 100,
        maxOutputTokens: 50,
      }),
    );
    expect(service.release(released.reservationId)).toBe(true);
    expect(service.release(released.reservationId)).toBe(false);
    expect(service.activeConcurrencyCount).toBe(0);
    expect(service.getBudgetSnapshot()).toMatchObject({
      usedToday: 100,
      remaining: 900,
    });
  });

  it('commits the reservation estimate when provider usage is unavailable', () => {
    const service = makeService({
      dailyTokenBudget: 1000,
      maxConcurrent: 4,
      ipRequestsPerDay: 100,
      ipRequestsPerMinute: 100,
      globalRequestsPerDay: 100,
      globalRequestsPerMinute: 100,
    });

    const reservation = expectAllowed(
      service.reserve({
        ip: '203.0.113.42',
        estimatedInputTokens: 100,
        maxOutputTokens: 50,
      }),
    );

    expect(service.commit(reservation.reservationId)).toEqual({
      committed: true,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimated: true,
    });
    expect(service.getBudgetSnapshot().usedToday).toBe(150);
  });

  it('resets all state, including cooldowns and reservations', () => {
    const service = makeService();
    expectAllowed(
      service.reserve({
        ip: '203.0.113.50',
        estimatedInputTokens: 10,
        maxOutputTokens: 0,
      }),
    );
    service.markProviderQuotaExhausted({ window: 'day' });

    service.reset();

    expect(service.activeConcurrencyCount).toBe(0);
    expect(service.activeReservationCount).toBe(0);
    expect(service.trackedIpCount).toBe(0);
    expect(service.getCooldown()).toEqual({ active: false });
    expect(service.getMode()).toBe('normal');

    // A fresh day still starts from a clean budget.
    at(`2026-01-02T00:00:00.000Z`);
    expect(service.getMode()).toBe('normal');
    expect(service.getBudgetSnapshot().usedToday).toBe(0);
  });
});
