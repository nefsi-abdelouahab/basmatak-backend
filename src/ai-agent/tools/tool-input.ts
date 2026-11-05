import { TOOL_DEFAULT_ROWS, TOOL_MAX_ROWS, ToolInputError } from './tool.types';

export const TOOL_TEXT_FILTER_MAX_CHARS = 120;
export const TOOL_CODE_FILTER_MAX_CHARS = 40;

const SAFE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertAllowedKeys(
  input: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  // Omitted arguments are an empty filter set. Supplied arguments must be a
  // plain object; arrays, scalars and `null` are always rejected.
  if (input === undefined) {
    return {};
  }
  if (!isPlainRecord(input)) {
    throw new ToolInputError('Arguments must be an object.');
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new ToolInputError(
        `Unknown argument ${JSON.stringify(key.slice(0, 40))}.`,
      );
    }
  }
  return input;
}

export function readOptionalText(
  input: Record<string, unknown>,
  key: string,
  maxChars = TOOL_TEXT_FILTER_MAX_CHARS,
): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ToolInputError(`${key} must be a string.`);
  }
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0) {
    return undefined;
  }
  if (text.length > maxChars) {
    throw new ToolInputError(`${key} must be at most ${maxChars} characters.`);
  }
  return text;
}

export function readOptionalCode(
  input: Record<string, unknown>,
  key: string,
  maxChars = TOOL_CODE_FILTER_MAX_CHARS,
): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ToolInputError(`${key} must be a string.`);
  }
  const code = value.trim();
  if (code.length === 0) {
    return undefined;
  }
  if (code.length > maxChars || !SAFE_CODE_PATTERN.test(code)) {
    throw new ToolInputError(
      `${key} must be a code of 1 to ${maxChars} letters, digits, "_" or "-".`,
    );
  }
  return code;
}

export function readOptionalObjectId(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value.trim())) {
    throw new ToolInputError(`${key} must be a 24-character hexadecimal id.`);
  }
  return value.trim();
}

export function readOptionalBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new ToolInputError(`${key} must be a boolean.`);
  }
  return value;
}

export function readOptionalStringList(
  input: Record<string, unknown>,
  key: string,
  options: {
    maxItems?: number;
    maxChars?: number;
    pattern?: RegExp;
  } = {},
): string[] | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ToolInputError(`${key} must be an array of strings.`);
  }

  const maxItems = options.maxItems ?? 8;
  const maxChars = options.maxChars ?? TOOL_TEXT_FILTER_MAX_CHARS;
  if (value.length === 0) {
    return undefined;
  }
  if (value.length > maxItems) {
    throw new ToolInputError(`${key} must have at most ${maxItems} items.`);
  }

  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ToolInputError(`${key} must be an array of strings.`);
    }
    const text = item.trim();
    if (text === '' || text.length > maxChars) {
      throw new ToolInputError(
        `${key} items must be 1 to ${maxChars} characters.`,
      );
    }
    if (options.pattern !== undefined && !options.pattern.test(text)) {
      throw new ToolInputError(`${key} contains an invalid item.`);
    }
    if (seen.has(text)) continue;
    seen.add(text);
    list.push(text);
  }

  return list.length > 0 ? list : undefined;
}

export function readOptionalEnum<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== 'string' ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new ToolInputError(`${key} must be one of ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function readLimit(
  input: Record<string, unknown>,
  defaultLimit = TOOL_DEFAULT_ROWS,
  maxLimit = TOOL_MAX_ROWS,
): number {
  const value = input.limit;
  if (value === undefined) {
    return defaultLimit;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maxLimit
  ) {
    throw new ToolInputError(`limit must be an integer from 1 to ${maxLimit}.`);
  }
  return value;
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse whitespace and add an ellipsis when the text is cut. */
export function truncateText(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  if (maxChars <= 1) {
    return '…'.slice(0, maxChars);
  }
  return `${collapsed.slice(0, maxChars - 1).trimEnd()}…`;
}
