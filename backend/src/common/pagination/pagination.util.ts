import { FilterQuery, Model, Types } from 'mongoose';
import { DEFAULT_LIMIT, MAX_LIMIT } from './pagination.constants';
import { CursorPage, CursorState } from './paginated.interface';

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

/**
 * Parses the roadmap's comma-separated multi-value encoding (`?x=a,b`) into
 * a deduped string list. Accepts a single string, an array (repeated query
 * params), or undefined. Trims entries, drops empties, preserves order.
 */
export function toArray(value: string | string[] | undefined | null): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const parts = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const token of String(part).split(',')) {
      const trimmed = token.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export interface DecodedPageCursor {
  /** Last document id for the `_id` tie-break. */
  id: string | null;
  /** 1-based page number of the page that supplied this cursor. */
  page: number;
  /** Sort token that produced the cursor (server-owned whitelist value). */
  sort?: string;
  /** Last sort-field value for composite sorts (ISO date / number as string). */
  value?: string;
}

/**
 * Encodes a counted-page cursor carrying the ordering state necessary for
 * deterministic pagination: last id, next page number, sort token, and the
 * last sort-field value for composite sorts. Opaque to clients.
 */
export function encodePageCursor(input: {
  id: string;
  page: number;
  sort?: string;
  value?: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      id: input.id,
      p: input.page,
      s: input.sort,
      v: input.value,
    }),
    'utf8',
  ).toString('base64');
}

/**
 * Decodes a counted-page cursor. Accepts the new JSON format and legacy
 * `cursor:<ObjectId>` cursors (treated as page 2 with `_id` ordering).
 * Returns null when no cursor was supplied; returns a best-effort legacy
 * shape for malformed-but-present cursors? No — malformed yields null and
 * the caller falls back to the first page (existing behavior).
 */
export function decodePageCursor(
  cursor: string | undefined | null,
): DecodedPageCursor | null {
  if (!cursor) {
    return null;
  }
  try {
    const text = Buffer.from(cursor, 'base64').toString('utf8');
    // Legacy format first (prefix `cursor:`).
    if (text.startsWith(CURSOR_PREFIX)) {
      const id = text.slice(CURSOR_PREFIX.length);
      if (!id) {
        return null;
      }
      return { id, page: 2 };
    }
    const parsed = JSON.parse(text) as {
      id?: unknown;
      p?: unknown;
      s?: unknown;
      v?: unknown;
    };
    if (typeof parsed.id !== 'string' || !parsed.id) {
      return null;
    }
    const page =
      typeof parsed.p === 'number' && Number.isFinite(parsed.p) && parsed.p >= 1
        ? Math.floor(parsed.p)
        : 2;
    const out: DecodedPageCursor = { id: parsed.id, page };
    if (typeof parsed.s === 'string' && parsed.s) {
      out.sort = parsed.s;
    }
    if (typeof parsed.v === 'string' && parsed.v) {
      out.value = parsed.v;
    }
    return out;
  } catch {
    return null;
  }
}

export interface ExecPageOptions<T> {
  limit?: string | number | undefined | null;
  cursor?: string | undefined | null;
  /** Mongoose sort (deterministic, with a stable `_id` tie-break). */
  sort: Record<string, 1 | -1>;
  /** Sort token recorded in the next cursor (for debugging / validation). */
  sortToken?: string;
  /**
   * Builds the cursor constraint from the decoded cursor. Defaults to the
   * newest-first `_id $lt` constraint; ascending `_id` sorts should pass
   * `$gt`. Composite sorts pass their own `$or` tie-break filter.
   */
  cursorFilter?: (decoded: DecodedPageCursor) => FilterQuery<T>;
  /** Extracts the composite sort-field value from the last item (if any). */
  valueExtractor?: (item: any) => string | undefined;
}

/**
 * Shared counted-page executor (Session 7 Decision 1). Callers provide the
 * authorized base filter and deterministic sort; the helper counts that base
 * filter, applies only the cursor constraint to fetch `limit + 1` rows, and
 * returns the shared `{ items, nextCursor, limit, total, page, pages }`
 * metadata. Count and rows can observe a concurrent write (documented,
 * acceptable for additive list metadata — no transaction).
 */
export async function execPage<T extends { _id: Types.ObjectId }, R = T>(
  model: Model<T>,
  baseFilter: FilterQuery<T>,
  opts: ExecPageOptions<T>,
  mapper?: (items: T[]) => Promise<R[]> | R[],
): Promise<CursorPage<R>> {
  const limit = normalizeLimit(opts.limit);
  const decoded = decodePageCursor(opts.cursor ?? undefined);
  const page = decoded?.page ?? 1;
  const pageFilter: FilterQuery<T> = { ...baseFilter };
  if (decoded?.id) {
    if (opts.cursorFilter) {
      Object.assign(pageFilter, opts.cursorFilter(decoded));
    } else if (Types.ObjectId.isValid(decoded.id)) {
      (pageFilter as Record<string, unknown>)._id = {
        $lt: new Types.ObjectId(decoded.id),
      };
    }
  }
  const total = await model.countDocuments(baseFilter).exec();
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const rows = await model
    .find(pageFilter)
    .sort(opts.sort)
    .limit(limit + 1)
    .exec();
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.length > 0 ? slice[slice.length - 1] : null;
  const nextCursor =
    hasMore && last
      ? encodePageCursor({
          id: last._id.toString(),
          page: page + 1,
          sort: opts.sortToken,
          value: opts.valueExtractor ? opts.valueExtractor(last) : undefined,
        })
      : null;
  const items = (
    mapper ? await mapper(slice) : (slice as unknown as R[])
  ) as R[];
  return { items, nextCursor, limit, total, page, pages };
}

export { DEFAULT_LIMIT, MAX_LIMIT } from './pagination.constants';
