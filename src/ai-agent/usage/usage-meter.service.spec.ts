import { AppLogger } from '../../common/logger/app.logger';
import { QuotaBudgetSnapshot } from '../budget/quota.types';
import { AiAgentRequestLog, UsageMeterService } from './usage-meter.service';

function makeLogger(): {
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
} {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

const BUDGET: QuotaBudgetSnapshot = {
  dailyLimit: 150_000,
  usedToday: 0,
  remaining: 150_000,
  mode: 'normal',
};

function usageReport(meter: UsageMeterService) {
  return meter.getReport(BUDGET);
}

describe('UsageMeterService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-03T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns zero aggregates and the supplied budget for an empty meter', () => {
    const meter = new UsageMeterService(makeLogger() as unknown as AppLogger);

    expect(usageReport(meter)).toEqual({
      today: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
        refusals: 0,
        rateLimited: 0,
        averageLatencyMs: 0,
      },
      last7Days: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
        refusals: 0,
        rateLimited: 0,
        averageLatencyMs: 0,
      },
      fallbacks: {
        today: {
          quota: 0,
          provider_error: 0,
          no_tool_retry_failed: 0,
          language_retry_failed: 0,
          total: 0,
        },
        last7Days: {
          quota: 0,
          provider_error: 0,
          no_tool_retry_failed: 0,
          language_retry_failed: 0,
          total: 0,
        },
      },
      budget: BUDGET,
    });
  });

  it('counts silent fallbacks by reason and logs a structured warning', () => {
    const logger = makeLogger();
    const meter = new UsageMeterService(logger as unknown as AppLogger);

    meter.recordFallback('quota');
    meter.recordFallback('quota');
    meter.recordFallback('provider_error');
    meter.recordFallback('no_tool_retry_failed');
    meter.recordFallback('language_retry_failed');

    const report = usageReport(meter);
    expect(report.fallbacks.today).toEqual({
      quota: 2,
      provider_error: 1,
      no_tool_retry_failed: 1,
      language_retry_failed: 1,
      total: 5,
    });
    expect(report.fallbacks.last7Days).toEqual(report.fallbacks.today);

    expect(logger.warn).toHaveBeenCalledTimes(5);
    const first = JSON.parse(logger.warn.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(first).toEqual({
      event: 'ai_agent_fallback',
      reason: 'quota',
      count: 1,
      day: '2026-01-03',
    });
    const second = JSON.parse(logger.warn.mock.calls[1][0] as string) as Record<
      string,
      unknown
    >;
    expect(second.count).toBe(2);
    expect(JSON.stringify(report)).not.toContain('2026-01-03');
  });

  it('rolls fallback counts over the seven-day window and across reset', () => {
    const meter = new UsageMeterService(makeLogger() as unknown as AppLogger);

    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    meter.recordFallback('quota');
    jest.setSystemTime(new Date('2026-01-03T12:00:00.000Z'));
    meter.recordFallback('provider_error');

    expect(usageReport(meter).fallbacks.today.total).toBe(1);
    expect(usageReport(meter).fallbacks.last7Days.total).toBe(2);

    meter.reset();
    expect(usageReport(meter).fallbacks.today.total).toBe(0);
    expect(usageReport(meter).fallbacks.last7Days.total).toBe(0);
  });

  it('rolls up requests, tokens, tool calls, refusals, 429s, and latency', () => {
    const meter = new UsageMeterService(makeLogger() as unknown as AppLogger);

    meter.record({
      latencyMs: 100,
      inputTokens: 10,
      outputTokens: 5,
      toolCalls: 1,
    });
    meter.record({ latencyMs: 200, refusal: true, rateLimited: true });
    meter.record({ latencyMs: 300, inputTokens: 20, outputTokens: 10 });

    expect(usageReport(meter).today).toEqual({
      requests: 3,
      inputTokens: 30,
      outputTokens: 15,
      totalTokens: 45,
      toolCalls: 1,
      refusals: 1,
      rateLimited: 1,
      averageLatencyMs: 200,
    });
    expect(usageReport(meter).last7Days).toEqual(usageReport(meter).today);
  });

  it('sums a rolling seven-day window and prunes older buckets', () => {
    const meter = new UsageMeterService(makeLogger() as unknown as AppLogger);

    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    meter.record({ inputTokens: 1, outputTokens: 0 });
    jest.setSystemTime(new Date('2026-01-07T12:00:00.000Z'));
    meter.record({ inputTokens: 2, outputTokens: 0 });
    jest.setSystemTime(new Date('2026-01-08T12:00:00.000Z'));
    meter.record({ inputTokens: 3, outputTokens: 0 });

    const report = usageReport(meter);
    expect(report.today.requests).toBe(1);
    expect(report.today.totalTokens).toBe(3);
    expect(report.last7Days.requests).toBe(2);
    expect(report.last7Days.totalTokens).toBe(5);
    expect(meter.trackedDayCount).toBe(2);
  });

  it('emits one warn at 70%, one error at 90%, and an explicit alert at 100% per day', () => {
    const logger = makeLogger();
    const meter = new UsageMeterService(logger as unknown as AppLogger);

    meter.logQuotaThreshold(0.699);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    meter.logQuotaThreshold(0.7);
    meter.logQuotaThreshold(0.8);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logger.warn.mock.calls[0][0] as string)).toMatchObject({
      event: 'ai_agent_budget_threshold',
      threshold: 70,
      utilization: 0.7,
    });

    meter.logQuotaThreshold(0.9);
    meter.logQuotaThreshold(0.95);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logger.error.mock.calls[0][0] as string)).toMatchObject({
      event: 'ai_agent_budget_threshold',
      threshold: 90,
      utilization: 0.9,
    });

    meter.logQuotaThreshold(1);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(JSON.parse(logger.error.mock.calls[1][0] as string)).toMatchObject({
      event: 'ai_agent_budget_alert',
      threshold: 100,
      utilization: 1,
    });

    // A new UTC day starts a new alert cycle.
    jest.setSystemTime(new Date('2026-01-04T00:00:01.000Z'));
    meter.logQuotaThreshold(0.7);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('logs only allowlisted operational fields and never content or IPs', () => {
    const logger = makeLogger();
    const meter = new UsageMeterService(logger as unknown as AppLogger);

    const entry = {
      requestId: 'request-1',
      mode: 'conservative',
      provider: 'gemini',
      locale: 'en',
      messageChars: 42,
      historyMessages: 2,
      historyChars: 120,
      toolNames: ['search_opportunities'],
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      estimated: true,
      firstTokenMs: 12,
      latencyMs: 34,
      finishReason: 'stop',
      errorCode: 'AI_AGENT_TIMEOUT',
      // Deliberately forbidden fields: the sanitizer must drop them.
      message: 'SECRET MESSAGE',
      prompt: 'SECRET PROMPT',
      ip: '203.0.113.99',
    } as unknown as AiAgentRequestLog;

    meter.logRequest(entry);

    expect(logger.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logger.log.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(payload).toEqual({
      event: 'ai_agent_request',
      requestId: 'request-1',
      mode: 'conservative',
      provider: 'gemini',
      locale: 'en',
      messageChars: 42,
      historyMessages: 2,
      historyChars: 120,
      toolNames: ['search_opportunities'],
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      estimated: true,
      firstTokenMs: 12,
      latencyMs: 34,
      finishReason: 'stop',
      errorCode: 'AI_AGENT_TIMEOUT',
    });

    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'SECRET MESSAGE',
      'SECRET PROMPT',
      '203.0.113.99',
      '"message"',
      '"prompt"',
      '"ip"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('resets aggregates and alert state', () => {
    const logger = makeLogger();
    const meter = new UsageMeterService(logger as unknown as AppLogger);

    meter.record({ inputTokens: 5 });
    meter.logQuotaThreshold(0.7);
    meter.reset();

    expect(meter.trackedDayCount).toBe(0);
    expect(usageReport(meter).today.requests).toBe(0);
    meter.logQuotaThreshold(0.7);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
