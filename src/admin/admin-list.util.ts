import { FilterQuery, Types } from 'mongoose';
import {
  DecodedPageCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';

/**
 * Shared admin-list paging/sort helpers (Session 10 `backend-v2-admin-lists`).
 * Request paging stays on the Session 7 cursor shape; `pageSize` is an alias
 * of `limit` (same default 20 / max 50). Sort tokens are whitelisted per list
 * (DTO `IsIn`); unknown tokens are rejected with `400` before reaching here.
 */
export interface AdminListParams {
  limit?: string | null;
  pageSize?: string | null;
  cursor?: string | null;
  sort?: string | null;
}

export function adminLimit(params: AdminListParams): number {
  return normalizeLimit(params.pageSize ?? params.limit ?? undefined);
}

export function adminCursor(params: AdminListParams): string | undefined {
  return params.cursor ?? undefined;
}

export interface AdminSortDef {
  sort: Record<string, 1 | -1>;
  token: string;
  cursorFilter?: (decoded: DecodedPageCursor) => FilterQuery<any>;
  valueExtractor?: (item: any) => string | undefined;
}

/** `_id` cursor constraint honoring direction; empty when no valid cursor. */
function idConstraint(
  decoded: DecodedPageCursor,
  operator: '$gt' | '$lt',
): FilterQuery<any> {
  return decoded.id && Types.ObjectId.isValid(decoded.id)
    ? { _id: { [operator]: new Types.ObjectId(decoded.id) } }
    : {};
}

/** `newest`/`oldest` over `_id` (ObjectIds are time-ordered). */
export function idSort(token: string): AdminSortDef {
  if (token === 'oldest') {
    return {
      sort: { _id: 1 },
      token,
      cursorFilter: (decoded: DecodedPageCursor) =>
        idConstraint(decoded, '$gt'),
    };
  }
  return { sort: { _id: -1 }, token };
}

/**
 * Ascending/descending sort over a single string field with a stable `_id`
 * tie-break. The last field value travels in the page cursor (`value`).
 */
export function fieldSort(
  token: string,
  field: string,
  order: 1 | -1 = 1,
): AdminSortDef {
  const operator = order === 1 ? '$gt' : '$lt';
  return {
    sort: { [field]: order, _id: 1 },
    token,
    cursorFilter: (decoded: DecodedPageCursor) => {
      if (!decoded.value) {
        return idConstraint(decoded, '$gt');
      }
      return {
        $or: [
          { [field]: { [operator]: decoded.value } },
          {
            [field]: decoded.value,
            ...idConstraint(decoded, '$gt'),
          },
        ],
      };
    },
    valueExtractor: (item: any) => {
      const value = item?.[field];
      if (value === undefined || value === null) {
        return undefined;
      }
      return String(value);
    },
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
