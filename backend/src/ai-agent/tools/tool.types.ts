/**
 * Shared contract for the Session 6 read-only public-data tools.
 *
 * Every tool declares a provider-facing JSON schema, an explicit intent
 * allowlist, and a single read-only handler. The registry rejects anything
 * that is not marked read-only, and the executor is the only code that invokes
 * a handler. There is deliberately no write path, no caller-supplied Mongo
 * filter, and no raw document in the result contract.
 */

export const TOOL_DESCRIPTION_MAX_CHARS = 400;
export const TOOL_DEFAULT_ROWS = 5;
export const TOOL_MAX_ROWS = 8;
export const TOOL_MAX_RESULT_CHARS = 1200;
export const TOOL_TOTAL_RESULT_CHARS = 3000;
export const TOOL_TIMEOUT_MS = 5000;

export const TOOL_INTENTS = [
  'opportunity_search',
  'organization_search',
  'reference_lookup',
  'platform_stats',
] as const;

export type ToolIntent = (typeof TOOL_INTENTS)[number];

export interface ToolPropertySchema {
  type: 'string' | 'integer' | 'boolean' | 'array';
  description: string;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  /** Item contract for `type: 'array'` (string lists only). */
  items?: {
    type: 'string';
    minLength?: number;
    maxLength?: number;
  };
  minItems?: number;
  maxItems?: number;
  default?: string | number | boolean;
}

export interface ToolInputSchema {
  type: 'object';
  additionalProperties: false;
  properties: Record<string, ToolPropertySchema>;
  required?: readonly string[];
}

export type ToolHandler = (input: unknown) => Promise<unknown> | unknown;

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  readonly allowedIntents: readonly ToolIntent[];
  readonly readOnly: true;
}

export interface ToolDefinition extends ToolDescriptor {
  readonly handler: ToolHandler;
}

/** A tool class can be handed to the registry without exposing its internals. */
export interface ReadOnlyTool {
  readonly definition: ToolDefinition;
}

/** Controlled argument error: its message is safe to return to the model. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export interface ToolClock {
  now(): number;
}

export const TOOL_CLOCK = Symbol('TOOL_CLOCK');

export const SYSTEM_TOOL_CLOCK: ToolClock = Object.freeze({
  now: () => Date.now(),
});

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INVALID_RESULT'
  | 'RESULT_BUDGET_EXHAUSTED';

export interface ToolExecutionMeta {
  /** Serialized length of `data` (never of the envelope). */
  charCount: number;
  truncated: boolean;
}

export interface ToolExecutionError {
  code: ToolErrorCode;
  message: string;
}

export interface ToolExecutionSuccess {
  ok: true;
  tool: string;
  data: unknown;
  meta: ToolExecutionMeta;
}

export interface ToolExecutionFailure {
  ok: false;
  tool: string;
  error: ToolExecutionError;
  meta: ToolExecutionMeta;
}

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

export interface ToolExecutionRequest {
  name: string;
  arguments?: unknown;
}

export interface ToolBatchExecutionResult {
  results: ToolExecutionResult[];
  totalChars: number;
  truncated: boolean;
}

/**
 * Build a frozen read-only definition. The registry repeats these checks at
 * runtime so a malformed object can never become an executable tool.
 */
export function defineReadOnlyTool(
  definition: Omit<ToolDefinition, 'readOnly'> & {
    readonly readOnly?: true;
  },
): ToolDefinition {
  return Object.freeze({
    ...definition,
    readOnly: true as const,
    allowedIntents: Object.freeze([...definition.allowedIntents]),
    inputSchema: Object.freeze({
      ...definition.inputSchema,
      properties: Object.freeze({ ...definition.inputSchema.properties }),
      ...(definition.inputSchema.required !== undefined
        ? { required: Object.freeze([...definition.inputSchema.required]) }
        : {}),
    }),
    handler: definition.handler,
  });
}

/**
 * Keys that must never appear in a tool payload. They cover account data,
 * contact data, registry/internal identifiers, exact coordinates, private
 * organization fields, and excluded collections (applications, talents,
 * submissions, sessions, verification documents).
 */
export const FORBIDDEN_TOOL_RESULT_KEYS: ReadonlySet<string> = new Set(
  [
    '_id',
    '__v',
    'userId',
    'email',
    'phone',
    'contact',
    'registryId',
    'registrationNumber',
    'birthDate',
    'passwordHash',
    'coordinates',
    'latitude',
    'longitude',
    'address',
    'organizationId',
    'coverMediaId',
    'annualReportMediaId',
    'documents',
    'verificationDocuments',
    'verification',
    'verificationStatus',
    'sessions',
    'applications',
    'application',
    'talents',
    'talent',
    'submissions',
    'submission',
    'privateProfile',
    'publicProfile',
    'reliability',
  ].map((key) => key.toLowerCase()),
);

/** Return the first forbidden key found anywhere in a JSON-like value. */
export function findForbiddenToolResultKey(value: unknown): string | null {
  const stack: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_TOOL_RESULT_KEYS.has(key.toLowerCase())) {
        return key;
      }
      stack.push(child);
    }
  }
  return null;
}
