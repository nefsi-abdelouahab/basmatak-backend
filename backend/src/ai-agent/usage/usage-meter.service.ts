import { Injectable, Optional } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app.logger';
import {
  AiAgentErrorCode,
  AiAgentFinishReason,
  AiAgentLocale,
  AiAgentMode,
} from '../ai-agent.types';
import { QuotaBudgetSnapshot } from '../budget/quota.types';

const DAY_MS = 86_400_000;
const ROLLING_DAYS = 7;

interface UsageBucket {
  dayKey: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  refusals: number;
  rateLimited: number;
  latencyMsTotal: number;
  latencySamples: number;
}

export interface UsageRecordInput {
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls?: number;
  refusal?: boolean;
  rateLimited?: boolean;
}

export interface AiAgentUsageAggregate {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  refusals: number;
  /** 429 responses, including pre-stream denials and provider 429s. */
  rateLimited: number;
  averageLatencyMs: number;
}

export interface AiAgentUsageReport {
  today: AiAgentUsageAggregate;
  last7Days: AiAgentUsageAggregate;
  budget: QuotaBudgetSnapshot;
}

export interface AiAgentRequestLog {
  requestId: string;
  mode: AiAgentMode;
  provider: string;
  locale: AiAgentLocale;
  messageChars: number;
  historyMessages: number;
  historyChars: number;
  toolNames: ReadonlyArray<string>;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
  firstTokenMs?: number;
  latencyMs: number;
  finishReason: AiAgentFinishReason | 'aborted';
  errorCode?: AiAgentErrorCode;
}

function utcDayKey(now: number): number {
  return Math.floor(now / DAY_MS);
}

function normalizeCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function emptyBucket(dayKey: number): UsageBucket {
  return {
    dayKey,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
    refusals: 0,
    rateLimited: 0,
    latencyMsTotal: 0,
    latencySamples: 0,
  };
}

/**
 * In-memory aggregate usage meter. It never receives message text, prompts,
 * retrieved text, tool payloads, emails, or IP addresses, so none can leak into
 * the admin report or the structured log line.
 */
@Injectable()
export class UsageMeterService {
  private readonly buckets = new Map<number, UsageBucket>();
  private readonly logger: AppLogger;

  private alertDayKey = -1;
  private alertThreshold = 0;

  constructor(@Optional() logger?: AppLogger) {
    this.logger = logger ?? new AppLogger('AiAgentUsage');
  }

  record(input: UsageRecordInput, now: number = Date.now()): void {
    const dayKey = utcDayKey(now);
    const bucket = this.getOrCreateBucket(dayKey);
    const inputTokens = normalizeCount(input.inputTokens);
    const outputTokens = normalizeCount(input.outputTokens);

    bucket.requests += 1;
    bucket.inputTokens += inputTokens;
    bucket.outputTokens += outputTokens;
    bucket.totalTokens += inputTokens + outputTokens;
    bucket.toolCalls += normalizeCount(input.toolCalls);
    if (input.refusal === true) bucket.refusals += 1;
    if (input.rateLimited === true) bucket.rateLimited += 1;

    if (
      input.latencyMs !== undefined &&
      Number.isFinite(input.latencyMs) &&
      input.latencyMs >= 0
    ) {
      bucket.latencyMsTotal += input.latencyMs;
      bucket.latencySamples += 1;
    }

    this.prune(dayKey);
  }

  getReport(
    budget: QuotaBudgetSnapshot,
    now: number = Date.now(),
  ): AiAgentUsageReport {
    const todayKey = utcDayKey(now);
    this.prune(todayKey);

    const today = this.summarize([todayKey]);
    const rollingKeys = Array.from(
      { length: ROLLING_DAYS },
      (_value, index) => todayKey - index,
    );
    const last7Days = this.summarize(rollingKeys);

    return { today, last7Days, budget };
  }

  /**
   * One structured line per chat request. Only the allowlisted operational
   * fields below are serialized; callers cannot add message content or IPs.
   */
  logRequest(entry: AiAgentRequestLog): void {
    const payload: Record<string, unknown> = {
      event: 'ai_agent_request',
      requestId: entry.requestId,
      mode: entry.mode,
      provider: entry.provider,
      locale: entry.locale,
      messageChars: normalizeCount(entry.messageChars),
      historyMessages: normalizeCount(entry.historyMessages),
      historyChars: normalizeCount(entry.historyChars),
      toolNames: [...entry.toolNames],
      inputTokens: normalizeCount(entry.inputTokens),
      outputTokens: normalizeCount(entry.outputTokens),
      totalTokens: normalizeCount(entry.totalTokens),
      estimated: entry.estimated === true,
      latencyMs: normalizeCount(entry.latencyMs),
      finishReason: entry.finishReason,
    };

    if (entry.firstTokenMs !== undefined) {
      payload.firstTokenMs = normalizeCount(entry.firstTokenMs);
    }
    if (entry.errorCode !== undefined) {
      payload.errorCode = entry.errorCode;
    }

    this.logger.log(JSON.stringify(payload), 'AiAgentUsage');
  }

  /**
   * WARN at 70%, ERROR at 90%, explicit alert at 100%. Alerts are emitted once
   * per UTC day and threshold so a busy loop cannot flood the log.
   */
  logQuotaThreshold(utilization: number, now: number = Date.now()): void {
    const dayKey = utcDayKey(now);
    if (dayKey !== this.alertDayKey) {
      this.alertDayKey = dayKey;
      this.alertThreshold = 0;
    }

    const threshold =
      utilization >= 1
        ? 100
        : utilization >= 0.9
          ? 90
          : utilization >= 0.7
            ? 70
            : 0;

    if (threshold <= this.alertThreshold) return;
    this.alertThreshold = threshold;

    const payload = {
      event:
        threshold === 100
          ? 'ai_agent_budget_alert'
          : 'ai_agent_budget_threshold',
      threshold,
      utilization: Math.round(utilization * 10_000) / 10_000,
      day: new Date(now).toISOString().slice(0, 10),
    };

    if (threshold === 70) {
      this.logger.warn(JSON.stringify(payload), 'AiAgentUsage');
    } else {
      this.logger.error(JSON.stringify(payload), 'AiAgentUsage');
    }
  }

  /** Test/diagnostic visibility only; not part of the HTTP contract. */
  get trackedDayCount(): number {
    return this.buckets.size;
  }

  /** Clears aggregates and alert state (test seam). */
  reset(): void {
    this.buckets.clear();
    this.alertDayKey = -1;
    this.alertThreshold = 0;
  }

  private getOrCreateBucket(dayKey: number): UsageBucket {
    let bucket = this.buckets.get(dayKey);
    if (!bucket) {
      bucket = emptyBucket(dayKey);
      this.buckets.set(dayKey, bucket);
    }
    return bucket;
  }

  private summarize(dayKeys: ReadonlyArray<number>): AiAgentUsageAggregate {
    const totals = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      refusals: 0,
      rateLimited: 0,
      latencyMsTotal: 0,
      latencySamples: 0,
    };

    for (const dayKey of dayKeys) {
      const bucket = this.buckets.get(dayKey);
      if (!bucket) continue;
      totals.requests += bucket.requests;
      totals.inputTokens += bucket.inputTokens;
      totals.outputTokens += bucket.outputTokens;
      totals.totalTokens += bucket.totalTokens;
      totals.toolCalls += bucket.toolCalls;
      totals.refusals += bucket.refusals;
      totals.rateLimited += bucket.rateLimited;
      totals.latencyMsTotal += bucket.latencyMsTotal;
      totals.latencySamples += bucket.latencySamples;
    }

    return {
      requests: totals.requests,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      totalTokens: totals.totalTokens,
      toolCalls: totals.toolCalls,
      refusals: totals.refusals,
      rateLimited: totals.rateLimited,
      averageLatencyMs:
        totals.latencySamples === 0
          ? 0
          : Math.round(totals.latencyMsTotal / totals.latencySamples),
    };
  }

  private prune(todayKey: number): void {
    const oldestKey = todayKey - (ROLLING_DAYS - 1);
    for (const dayKey of this.buckets.keys()) {
      if (dayKey < oldestKey) {
        this.buckets.delete(dayKey);
      }
    }
  }
}
