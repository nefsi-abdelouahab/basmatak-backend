import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Explicit CORS allowlist parsing (backend-v2-fix-cors-allowlist).
 *
 * The browser sends a bare origin (`http://localhost:3000`, never with a
 * trailing slash), and the `cors` package only honours `*` as a bare string
 * or `true` — never as an array member. The old wiring
 * (`CORS_ORIGIN.split(',')` straight into `enableCors`) therefore turned the
 * `.env` value `*` into the literal array `["*"]`, which matches nothing and
 * denies every preflight. This parser keeps the allowlist explicit:
 * split on commas, trim, strip trailing slashes, drop empties, and drop bare
 * `*` entries (reported via `droppedWildcard`, fail-closed, no wildcard mode).
 */
export interface ParsedCorsOrigins {
  origins: string[];
  droppedWildcard: boolean;
}

export function parseCorsOrigins(raw: string | undefined): ParsedCorsOrigins {
  let droppedWildcard = false;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { origins: [], droppedWildcard };
  }
  const origins: string[] = [];
  for (const part of raw.split(',')) {
    const origin = part.trim().replace(/\/+$/, '');
    if (origin.length === 0) {
      continue;
    }
    if (origin === '*') {
      droppedWildcard = true;
      continue;
    }
    if (!origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return { origins, droppedWildcard };
}

/** Pinned preflight surface: methods, request headers, exposed headers. */
export const CORS_METHODS = [
  'GET',
  'HEAD',
  'PUT',
  'PATCH',
  'POST',
  'DELETE',
  'OPTIONS',
] as const;

export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
] as const;

export const CORS_EXPOSED_HEADERS = ['Content-Disposition'] as const;

export function buildCorsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    methods: [...CORS_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
    optionsSuccessStatus: 204,
  };
}
