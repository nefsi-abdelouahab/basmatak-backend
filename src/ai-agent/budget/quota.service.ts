import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AiAgentMode } from '../ai-agent.types';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import { AiAgentConfig } from '../config/ai-agent.config';
import {
  ProviderQuotaErrorOptions,
  QuotaBudgetSnapshot,
  QuotaCommitResult,
  QuotaCooldownSnapshot,
  QuotaDenialCode,
  QuotaDenialReason,
  QuotaReservationInput,
  QuotaReservationResult,
  QuotaUsageCommit,
} from './quota.types';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

interface CounterWindow {
  minuteKey: number;
  minuteCount: number;
  dayKey: number;
  dayCount: number;
}

interface TokenBudgetWindow {
  dayKey: number;
  committedTokens: number;
  reservedTokens: number;
}

interface ReservationRecord {
  id: string;
  dayKey: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  reservedTokens: number;
}

function utcMinuteKey(now: number): number {
  return Math.floor(now / MINUTE_MS);
}

function utcDayKey(now: number): number {
  return Math.floor(now / DAY_MS);
}

function nextUtcMinute(now: number): number {
  return (utcMinuteKey(now) + 1) * MINUTE_MS;
}

function nextUtcDay(now: number): number {
  return (utcDayKey(now) + 1) * DAY_MS;
}

function secondsUntil(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function normalizeNow(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : Date.now();
}

function normalizeCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Pure degradation ladder. The caller passes the most restrictive daily
 * utilization ratio (tokens or requests).
 */
export function computeAiAgentMode(utilization: number): AiAgentMode {
  if (Number.isNaN(utilization) || utilization < 0) return 'normal';
  if (utilization >= 1) return 'exhausted';
  if (utilization >= 0.9) return 'knowledge_only';
  if (utilization >= 0.7) return 'conservative';
  return 'normal';
}

/**
 * In-memory free-tier budget guard.
 *
 * - UTC minute and UTC day request windows (per IP and globally).
 * - A global concurrency cap.
 * - A daily token budget shared by estimated input and output tokens.
 * - Provider cooldowns for the current minute or day.
 *
 * Nothing here is persisted and IP strings never leave this service. All
 * state is deliberately single-process: the Render deployment is one instance.
 */
@Injectable()
export class QuotaService {
  private readonly ipWindows = new Map<string, CounterWindow>();
  private readonly reservations = new Map<string, ReservationRecord>();

  private global: CounterWindow = {
    minuteKey: -1,
    minuteCount: 0,
    dayKey: -1,
    dayCount: 0,
  };

  private budget: TokenBudgetWindow = {
    dayKey: -1,
    committedTokens: 0,
    reservedTokens: 0,
  };

  private activeConcurrency = 0;
  private minuteCooldownUntil = 0;
  private dayCooldownUntil = 0;

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
  ) {}

  /**
   * Current public degradation mode. A day-scoped provider cooldown forces
   * `exhausted` because the shared provider's daily quota is unavailable even
   * when local counters are low. Minute cooldowns are exposed through the
   * reservation denial instead (they are short-lived).
   */
  getMode(now: number = Date.now()): AiAgentMode {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);
    if (this.isDayCooldownActive(nowMs)) return 'exhausted';
    return computeAiAgentMode(this.getUtilizationInternal());
  }

  /** Most restrictive daily utilization, used by the threshold alerts. */
  getUtilization(now: number = Date.now()): number {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);
    return this.getUtilizationInternal();
  }

  /**
   * Atomically check every gate and reserve request, concurrency, and token
   * budget. No counter changes when the result is denied.
   */
  reserve(
    input: QuotaReservationInput,
    now: number = Date.now(),
  ): QuotaReservationResult {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);
    this.pruneStaleIps(nowMs);

    const mode = this.getMode(nowMs);
    const limits = this.config.limits;
    const ipKey = this.normalizeIp(input.ip);
    const ip = this.getIpWindow(ipKey, nowMs);

    if (ip.minuteCount >= limits.ipRequestsPerMinute) {
      return this.deny(
        'ip_minute',
        'RATE_LIMITED',
        secondsUntil(nextUtcMinute(nowMs), nowMs),
        mode,
      );
    }
    if (ip.dayCount >= limits.ipRequestsPerDay) {
      return this.deny(
        'ip_day',
        'RATE_LIMITED',
        secondsUntil(nextUtcDay(nowMs), nowMs),
        mode,
      );
    }
    if (this.global.minuteCount >= limits.globalRequestsPerMinute) {
      return this.deny(
        'global_minute',
        'RATE_LIMITED',
        secondsUntil(nextUtcMinute(nowMs), nowMs),
        mode,
      );
    }
    if (this.global.dayCount >= limits.globalRequestsPerDay) {
      return this.deny(
        'global_day',
        'RATE_LIMITED',
        secondsUntil(nextUtcDay(nowMs), nowMs),
        mode,
      );
    }
    if (this.activeConcurrency >= limits.maxConcurrent) {
      return this.deny('concurrency', 'AI_AGENT_BUSY', 1, mode);
    }

    const cooldown = this.getCooldown(nowMs);
    if (cooldown.active && cooldown.window === 'day') {
      return this.deny(
        'cooldown_day',
        'AI_AGENT_QUOTA_EXHAUSTED',
        cooldown.retryAfterSeconds ?? 1,
        mode,
      );
    }
    if (cooldown.active) {
      return this.deny(
        'cooldown_minute',
        'AI_AGENT_QUOTA_EXHAUSTED',
        cooldown.retryAfterSeconds ?? 1,
        mode,
      );
    }

    if (mode === 'exhausted' || mode === 'retrieval_only') {
      return this.deny(
        'mode',
        'AI_AGENT_QUOTA_EXHAUSTED',
        secondsUntil(nextUtcDay(nowMs), nowMs),
        mode,
      );
    }

    const estimatedInputTokens = normalizeCount(input.estimatedInputTokens);
    const maxOutputTokens = normalizeCount(input.maxOutputTokens);
    const reservedTokens = estimatedInputTokens + maxOutputTokens;
    const effectiveUsed =
      this.budget.committedTokens + this.budget.reservedTokens;

    // A reservation must fit inside the remaining budget. This prevents the
    // last in-flight request from overspending before it commits.
    if (effectiveUsed + reservedTokens > limits.dailyTokenBudget) {
      return this.deny(
        'token_budget',
        'AI_AGENT_QUOTA_EXHAUSTED',
        secondsUntil(nextUtcDay(nowMs), nowMs),
        mode,
      );
    }

    ip.minuteCount += 1;
    ip.dayCount += 1;
    this.global.minuteCount += 1;
    this.global.dayCount += 1;
    this.activeConcurrency += 1;
    this.budget.reservedTokens += reservedTokens;

    const reservationId = randomUUID();
    this.reservations.set(reservationId, {
      id: reservationId,
      dayKey: this.budget.dayKey,
      estimatedInputTokens,
      maxOutputTokens,
      reservedTokens,
    });

    return {
      allowed: true,
      reservationId,
      mode,
      estimatedInputTokens,
      maxOutputTokens,
      reservedTokens,
    };
  }

  /**
   * Commit a reservation exactly once. Without provider usage the reserved
   * input estimate plus max output is committed and marked estimated. The
   * concurrency slot is released here as well, so a successful request never
   * needs a separate release call.
   */
  commit(
    reservationId: string,
    usage?: QuotaUsageCommit,
    now: number = Date.now(),
  ): QuotaCommitResult {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);

    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return {
        committed: false,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimated: false,
      };
    }

    this.reservations.delete(reservationId);
    this.releaseConcurrencySlot();

    const inputTokens =
      usage === undefined
        ? reservation.estimatedInputTokens
        : normalizeCount(usage.inputTokens);
    const outputTokens =
      usage === undefined
        ? reservation.maxOutputTokens
        : normalizeCount(usage.outputTokens);
    const totalTokens = inputTokens + outputTokens;
    const estimated = usage === undefined || usage.estimated === true;

    if (reservation.dayKey === this.budget.dayKey) {
      this.budget.reservedTokens = Math.max(
        0,
        this.budget.reservedTokens - reservation.reservedTokens,
      );
      this.budget.committedTokens += totalTokens;
    }

    return {
      committed: true,
      inputTokens,
      outputTokens,
      totalTokens,
      estimated,
    };
  }

  /**
   * Release an unused reservation exactly once. Safe to call after commit:
   * unknown or already-settled reservations are a no-op.
   */
  release(reservationId: string, now: number = Date.now()): boolean {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);

    const reservation = this.reservations.get(reservationId);
    if (!reservation) return false;

    this.reservations.delete(reservationId);
    this.releaseConcurrencySlot();

    if (reservation.dayKey === this.budget.dayKey) {
      this.budget.reservedTokens = Math.max(
        0,
        this.budget.reservedTokens - reservation.reservedTokens,
      );
    }
    return true;
  }

  /**
   * Record a provider 429/quota error. The relevant UTC window is blocked; a
   * provider-supplied retryAfter can extend the block but never beyond the
   * next UTC day. There is no automatic retry.
   */
  markProviderQuotaExhausted(
    options: ProviderQuotaErrorOptions = {},
    now: number = Date.now(),
  ): QuotaCooldownSnapshot {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);

    const window = options.window ?? 'minute';
    const windowEnd =
      window === 'day' ? nextUtcDay(nowMs) : nextUtcMinute(nowMs);
    let until = windowEnd;

    if (
      options.retryAfterSeconds !== undefined &&
      Number.isFinite(options.retryAfterSeconds) &&
      options.retryAfterSeconds > 0
    ) {
      until = Math.max(
        until,
        nowMs + Math.ceil(options.retryAfterSeconds) * 1000,
      );
    }
    until = Math.min(until, nextUtcDay(nowMs));

    if (window === 'day') {
      this.dayCooldownUntil = Math.max(this.dayCooldownUntil, until);
    } else {
      this.minuteCooldownUntil = Math.max(this.minuteCooldownUntil, until);
    }

    return this.getCooldown(nowMs);
  }

  getCooldown(now: number = Date.now()): QuotaCooldownSnapshot {
    const nowMs = normalizeNow(now);

    if (this.dayCooldownUntil > nowMs) {
      return {
        active: true,
        window: 'day',
        retryAfterSeconds: secondsUntil(this.dayCooldownUntil, nowMs),
      };
    }
    if (this.minuteCooldownUntil > nowMs) {
      return {
        active: true,
        window: 'minute',
        retryAfterSeconds: secondsUntil(this.minuteCooldownUntil, nowMs),
      };
    }
    return { active: false };
  }

  getBudgetSnapshot(now: number = Date.now()): QuotaBudgetSnapshot {
    const nowMs = normalizeNow(now);
    this.ensureWindows(nowMs);

    const dailyLimit = this.config.limits.dailyTokenBudget;
    const usedToday = this.budget.committedTokens;
    const remaining = Math.max(
      0,
      dailyLimit - usedToday - this.budget.reservedTokens,
    );

    return {
      dailyLimit,
      usedToday,
      remaining,
      mode: this.getMode(nowMs),
    };
  }

  /** Test/diagnostic visibility only; not part of the HTTP contract. */
  get activeConcurrencyCount(): number {
    return this.activeConcurrency;
  }

  /** Test/diagnostic visibility only; not part of the HTTP contract. */
  get activeReservationCount(): number {
    return this.reservations.size;
  }

  /** Test/diagnostic visibility only; not part of the HTTP contract. */
  get trackedIpCount(): number {
    return this.ipWindows.size;
  }

  /** Clears all counters, reservations, and cooldowns (test seam). */
  reset(): void {
    this.ipWindows.clear();
    this.reservations.clear();
    this.global = { minuteKey: -1, minuteCount: 0, dayKey: -1, dayCount: 0 };
    this.budget = { dayKey: -1, committedTokens: 0, reservedTokens: 0 };
    this.activeConcurrency = 0;
    this.minuteCooldownUntil = 0;
    this.dayCooldownUntil = 0;
  }

  private deny(
    reason: QuotaDenialReason,
    code: QuotaDenialCode,
    retryAfterSeconds: number,
    mode: AiAgentMode,
  ): QuotaReservationResult {
    return {
      allowed: false,
      code,
      reason,
      retryAfterSeconds: Math.max(1, Math.trunc(retryAfterSeconds)),
      mode,
    };
  }

  private getIpWindow(ip: string, now: number): CounterWindow {
    const minuteKey = utcMinuteKey(now);
    const dayKey = utcDayKey(now);
    let window = this.ipWindows.get(ip);

    if (!window) {
      window = { minuteKey, minuteCount: 0, dayKey, dayCount: 0 };
      this.ipWindows.set(ip, window);
      return window;
    }

    if (window.minuteKey !== minuteKey) {
      window.minuteKey = minuteKey;
      window.minuteCount = 0;
    }
    if (window.dayKey !== dayKey) {
      window.dayKey = dayKey;
      window.dayCount = 0;
    }
    return window;
  }

  private ensureWindows(now: number): void {
    const minuteKey = utcMinuteKey(now);
    const dayKey = utcDayKey(now);

    if (this.global.minuteKey !== minuteKey) {
      this.global.minuteKey = minuteKey;
      this.global.minuteCount = 0;
    }
    if (this.global.dayKey !== dayKey) {
      this.global.dayKey = dayKey;
      this.global.dayCount = 0;
    }
    if (this.budget.dayKey !== dayKey) {
      this.budget.dayKey = dayKey;
      this.budget.committedTokens = 0;
      this.budget.reservedTokens = 0;
    }
  }

  /**
   * Drop IP counters from previous UTC days. Request counters for the current
   * day must stay until midnight so the daily limit remains accurate.
   */
  private pruneStaleIps(now: number): void {
    this.ensureWindows(now);
    const currentDay = utcDayKey(now);
    for (const [ip, window] of this.ipWindows) {
      if (window.dayKey !== currentDay) {
        this.ipWindows.delete(ip);
      }
    }
  }

  private getUtilizationInternal(): number {
    const limits = this.config.limits;
    const tokenRatio =
      this.budget.committedTokens / Math.max(1, limits.dailyTokenBudget);
    const requestRatio =
      this.global.dayCount / Math.max(1, limits.globalRequestsPerDay);
    return Math.max(tokenRatio, requestRatio);
  }

  private isDayCooldownActive(now: number): boolean {
    return this.dayCooldownUntil > now;
  }

  private releaseConcurrencySlot(): void {
    this.activeConcurrency = Math.max(0, this.activeConcurrency - 1);
  }

  private normalizeIp(ip: string): string {
    const value = typeof ip === 'string' ? ip.trim() : '';
    return value === '' ? 'unknown' : value;
  }
}
