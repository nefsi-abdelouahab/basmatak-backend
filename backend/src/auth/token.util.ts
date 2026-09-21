import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

export type DurationUnit = 'ms' | 's' | 'm' | 'h' | 'd';

const UNIT_MS: Record<DurationUnit, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Opaque-token primitives: a 256-bit random value whose SHA-256 hash is what
 * gets stored (sessions.refreshTokenHash, verification_tokens.tokenHash). Raw
 * values are never persisted so a DB leak cannot mint sessions or reset
 * passwords.
 */
@Injectable()
export class TokenUtil {
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Parses "15m" / "30d" / "1h" / plain seconds; falls back when unset/malformed. */
  parseDuration(value: string | undefined, fallbackMs: number): number {
    if (!value) {
      return fallbackMs;
    }
    const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(value.trim());
    if (!match) {
      return fallbackMs;
    }
    const amount = parseInt(match[1], 10);
    const unit = (match[2] ?? 's').toLowerCase() as DurationUnit;
    return amount * UNIT_MS[unit];
  }
}
