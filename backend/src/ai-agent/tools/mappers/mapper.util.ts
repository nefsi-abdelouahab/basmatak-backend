import { Types } from 'mongoose';

/** Shared, defensive helpers for the public projection mappers. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function toIdString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Types.ObjectId) {
    return value.toHexString();
  }
  if (
    isRecord(value) &&
    typeof value.toHexString === 'function' &&
    typeof (value as { toHexString: () => unknown }).toHexString() === 'string'
  ) {
    return (value as { toHexString: () => string }).toHexString();
  }
  return null;
}

export function toText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

export function toTruncatedText(
  value: unknown,
  maxChars: number,
): string | null {
  const text = toText(value);
  if (text === null || text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 1) {
    return '…'.slice(0, maxChars);
  }
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export function toIsoString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
