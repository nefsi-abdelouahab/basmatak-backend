import { DEFAULT_LIMIT, MAX_LIMIT } from './pagination.constants';
import { CursorState } from './paginated.interface';

/**
 * Normalizes a raw limit: < 1 or NaN falls back to the default; values above
 * MAX are capped (inventory §0: default 20, max 50).
 */
export function normalizeLimit(
  raw: string | number | undefined | null,
): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_LIMIT;
  }
  const parsed =
    typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

const CURSOR_PREFIX = 'cursor:';

/** Encodes a cursor value (e.g. an ObjectId hex string) for use in URLs. */
export function encodeCursor(value: string): string {
  return Buffer.from(`${CURSOR_PREFIX}${value}`, 'utf8').toString('base64');
}

/** Decodes a cursor string; returns null for missing/ malformed values. */
export function decodeCursor(cursor: string | undefined | null): string | null {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    return decoded.startsWith(CURSOR_PREFIX)
      ? decoded.slice(CURSOR_PREFIX.length)
      : null;
  } catch {
    return null;
  }
}

/** Builds a page cursor state from a decoded reference key. */
export function buildCursor(
  lastReference: string | null | undefined,
): Pick<CursorState, 'cursor'> {
  return { cursor: lastReference ? encodeCursor(lastReference) : null };
}

export { DEFAULT_LIMIT, MAX_LIMIT } from './pagination.constants';
