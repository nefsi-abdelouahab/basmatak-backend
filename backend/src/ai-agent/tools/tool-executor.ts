import { Inject, Injectable, Optional } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import {
  TOOL_MAX_RESULT_CHARS,
  TOOL_TIMEOUT_MS,
  TOOL_TOTAL_RESULT_CHARS,
  ToolBatchExecutionResult,
  ToolDefinition,
  ToolErrorCode,
  ToolExecutionFailure,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolInputError,
  findForbiddenToolResultKey,
} from './tool.types';

export const TOOL_EXECUTOR_OPTIONS = Symbol('TOOL_EXECUTOR_OPTIONS');

export interface ToolExecutorOptions {
  /** Test-only override; production uses the fixed 5-second timeout. */
  timeoutMs?: number;
  perResultMaxChars?: number;
  totalMaxChars?: number;
}

const MIN_BUDGET_FOR_CALL = 64;

class ToolTimeoutError extends Error {
  constructor() {
    super('Tool execution timed out.');
    this.name = 'ToolTimeoutError';
  }
}

class ToolResultSerializationError extends Error {
  constructor() {
    super('Tool result is not JSON serializable.');
    this.name = 'ToolResultSerializationError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serialize(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new ToolResultSerializationError();
  }
  return json;
}

function serializedLength(value: unknown): number {
  try {
    return serialize(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(serialize(value)) as unknown;
}

function markTruncated(value: unknown): unknown {
  if (isPlainObject(value)) {
    return { ...value, truncated: true };
  }
  return { value, truncated: true };
}

function findLongestArray(value: unknown): unknown[] | null {
  let best: unknown[] | null = null;
  let bestLength = -1;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') {
      continue;
    }
    if (Array.isArray(current)) {
      if (current.length > 0) {
        const length = serializedLength(current);
        if (length > bestLength) {
          best = current;
          bestLength = length;
        }
      }
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    for (const child of Object.values(current)) {
      stack.push(child);
    }
  }
  return best;
}

function removeLastArrayItem(value: unknown): boolean {
  const array = findLongestArray(value);
  if (array === null) {
    return false;
  }
  array.pop();
  return true;
}

function truncateStrings(value: unknown, maxChars: number): unknown {
  if (typeof value === 'string') {
    return value.length <= maxChars
      ? value
      : `${value.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateStrings(item, maxChars));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        truncateStrings(child, maxChars),
      ]),
    );
  }
  return value;
}

function fitPayload(
  value: unknown,
  maxChars: number,
): { data: unknown; truncated: boolean } {
  let payload = cloneJson(value);
  if (serializedLength(payload) <= maxChars) {
    return { data: payload, truncated: false };
  }

  payload = markTruncated(payload);
  while (serializedLength(payload) > maxChars && removeLastArrayItem(payload)) {
    // Drop whole rows/items from the end before cutting strings.
  }
  if (serializedLength(payload) <= maxChars) {
    return { data: payload, truncated: true };
  }

  for (const stringLimit of [200, 120, 80, 40, 20, 8]) {
    payload = markTruncated(truncateStrings(payload, stringLimit));
    while (
      serializedLength(payload) > maxChars &&
      removeLastArrayItem(payload)
    ) {
      // Keep shrinking until the serialized payload fits.
    }
    if (serializedLength(payload) <= maxChars) {
      return { data: payload, truncated: true };
    }
  }

  // A JSON object needs at least two characters; `0` is the only one-character
  // JSON payload. This only matters for test-only overrides below the normal
  // 1,200-character production cap.
  return {
    data: maxChars < 2 ? 0 : {},
    truncated: true,
  };
}

function failure(
  tool: string,
  code: ToolErrorCode,
  message: string,
): ToolExecutionFailure {
  return {
    ok: false,
    tool,
    error: { code, message },
    meta: { charCount: 0, truncated: false },
  };
}

/**
 * Read-only tool executor.
 *
 * Every call is bounded by a 5-second timeout, a 1,200-character payload cap,
 * and (across `executeMany`) a shared 3,000-character budget. Errors are safe
 * codes/messages only; stack traces and database details never cross this
 * boundary. A final forbidden-key guard rejects any accidental private field.
 */
@Injectable()
export class ToolExecutor {
  private readonly timeoutMs: number;
  private readonly perResultMaxChars: number;
  private readonly totalMaxChars: number;

  constructor(
    private readonly registry: ToolRegistry,
    @Optional()
    @Inject(TOOL_EXECUTOR_OPTIONS)
    options: ToolExecutorOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? TOOL_TIMEOUT_MS;
    this.perResultMaxChars = options.perResultMaxChars ?? TOOL_MAX_RESULT_CHARS;
    this.totalMaxChars = options.totalMaxChars ?? TOOL_TOTAL_RESULT_CHARS;
  }

  async execute(name: string, args?: unknown): Promise<ToolExecutionResult> {
    return this.executeOne(name, args, this.perResultMaxChars);
  }

  /**
   * Execute several tools against one shared 3,000-character budget. Calls
   * that no longer have room return `RESULT_BUDGET_EXHAUSTED` without running.
   */
  async executeMany(
    requests: ToolExecutionRequest[],
  ): Promise<ToolBatchExecutionResult> {
    const results: ToolExecutionResult[] = [];
    let remaining = this.totalMaxChars;

    for (const request of Array.isArray(requests) ? requests : []) {
      const requestedName =
        typeof request?.name === 'string' ? request.name.slice(0, 64) : '';
      if (remaining < MIN_BUDGET_FOR_CALL) {
        results.push(
          failure(
            requestedName,
            'RESULT_BUDGET_EXHAUSTED',
            'The shared tool result budget is exhausted.',
          ),
        );
        continue;
      }

      const result = await this.executeOne(
        request?.name,
        request?.arguments,
        Math.min(this.perResultMaxChars, remaining),
      );
      remaining -= result.meta.charCount;
      results.push(result);
    }

    return {
      results,
      totalChars: this.totalMaxChars - remaining,
      truncated: results.some((result) => result.meta.truncated),
    };
  }

  private async executeOne(
    name: string,
    args: unknown,
    maxChars: number,
  ): Promise<ToolExecutionResult> {
    const requestedName = typeof name === 'string' ? name.slice(0, 64) : '';
    const definition = this.registry.get(requestedName);
    if (!definition) {
      return failure(
        requestedName,
        'TOOL_NOT_FOUND',
        'Unknown or unavailable tool.',
      );
    }

    let raw: unknown;
    try {
      raw = await this.runHandler(definition, args);
    } catch (error) {
      if (error instanceof ToolInputError) {
        return failure(definition.name, 'INVALID_ARGUMENT', error.message);
      }
      if (error instanceof ToolTimeoutError) {
        return failure(definition.name, 'TIMEOUT', 'Tool execution timed out.');
      }
      return failure(
        definition.name,
        'UNAVAILABLE',
        'Tool is temporarily unavailable.',
      );
    }

    if (findForbiddenToolResultKey(raw) !== null) {
      return failure(
        definition.name,
        'INVALID_RESULT',
        'Tool result was rejected by the privacy guard.',
      );
    }

    try {
      serialize(raw);
    } catch {
      return failure(
        definition.name,
        'INVALID_RESULT',
        'Tool result was not JSON serializable.',
      );
    }

    const fitted = fitPayload(raw, maxChars);
    if (findForbiddenToolResultKey(fitted.data) !== null) {
      return failure(
        definition.name,
        'INVALID_RESULT',
        'Tool result was rejected by the privacy guard.',
      );
    }

    return {
      ok: true,
      tool: definition.name,
      data: fitted.data,
      meta: {
        charCount: serializedLength(fitted.data),
        truncated: fitted.truncated,
      },
    };
  }

  private async runHandler(
    definition: ToolDefinition,
    input: unknown,
  ): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new ToolTimeoutError());
      }, this.timeoutMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    try {
      const handler = Promise.resolve().then(() => definition.handler(input));
      return await Promise.race([handler, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
