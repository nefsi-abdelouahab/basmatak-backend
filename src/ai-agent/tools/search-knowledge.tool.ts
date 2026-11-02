import { Injectable } from '@nestjs/common';
import { KnowledgeLocale } from '../knowledge/knowledge.types';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { RetrievalReason } from '../knowledge/retriever';

/**
 * Read-only knowledge lookup tool.
 *
 * This is deliberately not wired into the chat SSE/orchestrator yet. Session 5
 * exposes a small, JSON-serializable contract that a later prompt builder can
 * invoke: trimmed query (1..500 characters), optional en/ar/fr locale boost,
 * and an optional 1..6 result limit (default 4). Every retriever cap still
 * applies, and only chunk-sized excerpts are returned.
 */

export const SEARCH_KNOWLEDGE_TOOL_NAME = 'search_knowledge';
export const SEARCH_KNOWLEDGE_QUERY_MAX_CHARS = 500;
export const SEARCH_KNOWLEDGE_DEFAULT_LIMIT = 4;
export const SEARCH_KNOWLEDGE_MAX_LIMIT = 6;

const SUPPORTED_LOCALES: ReadonlyArray<KnowledgeLocale> = ['en', 'ar', 'fr'];
const ALLOWED_ARGUMENTS = new Set(['query', 'locale', 'limit']);

export type SearchKnowledgeReason =
  RetrievalReason | 'INVALID_ARGUMENT' | 'SEARCH_FAILED';

export interface SearchKnowledgeToolInput {
  query: string;
  locale?: KnowledgeLocale;
  limit?: number;
}

export interface SearchKnowledgeToolChunk {
  id: string;
  source: string;
  title: string;
  locale: KnowledgeLocale;
  headingTrail: string[];
  text: string;
  charCount: number;
  score: number;
}

export interface SearchKnowledgeToolResult {
  chunks: SearchKnowledgeToolChunk[];
  totalChars: number;
  estimatedTokens: number;
  truncated: boolean;
  reason?: SearchKnowledgeReason;
  /** Safe, human-readable explanation for argument and internal failures. */
  message?: string;
}

export interface SearchKnowledgeToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    additionalProperties: false;
    required: ['query'];
    properties: {
      query: {
        type: 'string';
        minLength: number;
        maxLength: number;
        description: string;
      };
      locale: {
        type: 'string';
        enum: KnowledgeLocale[];
        description: string;
      };
      limit: {
        type: 'integer';
        minimum: number;
        maximum: number;
        default: number;
        description: string;
      };
    };
  };
}

interface ParsedInput {
  query: string;
  locale?: KnowledgeLocale;
  limit: number;
}

type ParseResult =
  { ok: true; value: ParsedInput } | { ok: false; message: string };

function invalidArgument(message: string): SearchKnowledgeToolResult {
  return {
    chunks: [],
    totalChars: 0,
    estimatedTokens: 0,
    truncated: false,
    reason: 'INVALID_ARGUMENT',
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isKnowledgeLocale(value: unknown): value is KnowledgeLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value)
  );
}

@Injectable()
export class SearchKnowledgeTool {
  readonly name = SEARCH_KNOWLEDGE_TOOL_NAME;
  readonly description =
    'Search the Basmatak knowledge base for relevant FAQ, policy, guide, glossary, or topic excerpts. Read-only.';
  readonly inputSchema: SearchKnowledgeToolDefinition['inputSchema'] = {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        maxLength: SEARCH_KNOWLEDGE_QUERY_MAX_CHARS,
        description:
          'Natural-language search query, trimmed, 1 to 500 characters.',
      },
      locale: {
        type: 'string',
        enum: [...SUPPORTED_LOCALES],
        description:
          'Optional locale boost. Omit it to search without a locale preference.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: SEARCH_KNOWLEDGE_MAX_LIMIT,
        default: SEARCH_KNOWLEDGE_DEFAULT_LIMIT,
        description:
          'Maximum chunks to return (1 to 6). Defaults to 4; every retriever cap still applies.',
      },
    },
  };

  constructor(private readonly knowledge: KnowledgeService) {}

  getDefinition(): SearchKnowledgeToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  /**
   * Execute the tool. Invalid input and internal failures return a safe result
   * object; this method never throws and never includes a stack trace.
   */
  execute(input: unknown): SearchKnowledgeToolResult {
    const parsed = this.parseInput(input);
    if (!parsed.ok) return invalidArgument(parsed.message);

    try {
      const result = this.knowledge.search(
        parsed.value.query,
        parsed.value.locale,
        { topK: parsed.value.limit },
      );

      return {
        chunks: result.chunks.map((chunk) => ({
          id: chunk.id,
          source: chunk.source,
          title: chunk.title,
          locale: chunk.locale,
          headingTrail: [...chunk.headingTrail],
          text: chunk.text,
          charCount: chunk.charCount,
          score: chunk.score,
        })),
        totalChars: result.totalChars,
        estimatedTokens: result.estimatedTokens,
        truncated: result.truncated,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    } catch {
      return {
        chunks: [],
        totalChars: 0,
        estimatedTokens: 0,
        truncated: false,
        reason: 'SEARCH_FAILED',
        message: 'Knowledge search is temporarily unavailable.',
      };
    }
  }

  private parseInput(input: unknown): ParseResult {
    if (!isRecord(input)) {
      return { ok: false, message: 'Arguments must be an object.' };
    }

    for (const key of Object.keys(input)) {
      if (!ALLOWED_ARGUMENTS.has(key)) {
        return { ok: false, message: `Unknown argument "${key}".` };
      }
    }

    if (typeof input.query !== 'string') {
      return { ok: false, message: 'Query must be a string.' };
    }

    const query = input.query.trim();
    if (query.length === 0) {
      return { ok: false, message: 'Query must not be empty.' };
    }
    if (query.length > SEARCH_KNOWLEDGE_QUERY_MAX_CHARS) {
      return {
        ok: false,
        message: `Query must be at most ${SEARCH_KNOWLEDGE_QUERY_MAX_CHARS} characters.`,
      };
    }

    let locale: KnowledgeLocale | undefined;
    if (input.locale !== undefined) {
      if (!isKnowledgeLocale(input.locale)) {
        return {
          ok: false,
          message: 'Locale must be one of en, ar, or fr.',
        };
      }
      locale = input.locale;
    }

    let limit = SEARCH_KNOWLEDGE_DEFAULT_LIMIT;
    if (input.limit !== undefined) {
      if (
        typeof input.limit !== 'number' ||
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > SEARCH_KNOWLEDGE_MAX_LIMIT
      ) {
        return {
          ok: false,
          message: `Limit must be an integer from 1 to ${SEARCH_KNOWLEDGE_MAX_LIMIT}.`,
        };
      }
      limit = input.limit;
    }

    return { ok: true, value: { query, locale, limit } };
  }
}
