import { KnowledgeService } from '../knowledge/knowledge.service';
import { RetrievalResult, RetrievedChunk } from '../knowledge/retriever';
import {
  SEARCH_KNOWLEDGE_DEFAULT_LIMIT,
  SEARCH_KNOWLEDGE_MAX_LIMIT,
  SEARCH_KNOWLEDGE_QUERY_MAX_CHARS,
  SEARCH_KNOWLEDGE_TOOL_NAME,
  SearchKnowledgeTool,
} from './search-knowledge.tool';

function makeChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: 'faq/en.md#1',
    source: 'faq/en.md',
    title: 'Basmatak FAQ',
    locale: 'en',
    headingTrail: ['What is Basmatak?'],
    text: 'Basmatak connects volunteers with opportunities.',
    charCount: 45,
    score: 12.5,
    ...overrides,
  };
}

function emptyResult(reason: RetrievalResult['reason']): RetrievalResult {
  return {
    chunks: [],
    totalChars: 0,
    estimatedTokens: 0,
    truncated: false,
    reason,
  };
}

function makeTool(
  result: RetrievalResult = {
    chunks: [makeChunk()],
    totalChars: 45,
    estimatedTokens: 12,
    truncated: false,
  },
) {
  const search = jest.fn(() => result);
  const knowledge = { search } as unknown as KnowledgeService;
  const tool = new SearchKnowledgeTool(knowledge);
  return { tool, search };
}

describe('SearchKnowledgeTool', () => {
  it('exposes a read-only definition with the documented bounds', () => {
    const { tool } = makeTool();
    const definition = tool.getDefinition();

    expect(definition.name).toBe(SEARCH_KNOWLEDGE_TOOL_NAME);
    expect(definition.name).toBe('search_knowledge');
    expect(definition.description.toLowerCase()).toContain('read-only');
    expect(definition.inputSchema.required).toEqual(['query']);
    expect(definition.inputSchema.additionalProperties).toBe(false);
    expect(definition.inputSchema.properties.query).toMatchObject({
      type: 'string',
      minLength: 1,
      maxLength: SEARCH_KNOWLEDGE_QUERY_MAX_CHARS,
    });
    expect(definition.inputSchema.properties.locale.enum).toEqual([
      'en',
      'ar',
      'fr',
    ]);
    expect(definition.inputSchema.properties.limit).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: SEARCH_KNOWLEDGE_MAX_LIMIT,
      default: SEARCH_KNOWLEDGE_DEFAULT_LIMIT,
    });
  });

  it('trims the query, forwards locale and limit, and returns chunk metadata', () => {
    const { tool, search } = makeTool();

    const result = tool.execute({
      query: '  Basmatak volunteers  ',
      locale: 'ar',
      limit: 2,
    });

    expect(search).toHaveBeenCalledWith('Basmatak volunteers', 'ar', {
      topK: 2,
    });
    expect(result).toEqual({
      chunks: [
        {
          id: 'faq/en.md#1',
          source: 'faq/en.md',
          title: 'Basmatak FAQ',
          locale: 'en',
          headingTrail: ['What is Basmatak?'],
          text: 'Basmatak connects volunteers with opportunities.',
          charCount: 45,
          score: 12.5,
        },
      ],
      totalChars: 45,
      estimatedTokens: 12,
      truncated: false,
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('defaults to four results and passes an omitted locale through', () => {
    const { tool, search } = makeTool();

    tool.execute({ query: 'Basmatak' });

    expect(search).toHaveBeenCalledWith('Basmatak', undefined, {
      topK: SEARCH_KNOWLEDGE_DEFAULT_LIMIT,
    });
  });

  it('accepts the exact query maximum and rejects one character over it', () => {
    const { tool, search } = makeTool();
    const atLimit = 'x'.repeat(SEARCH_KNOWLEDGE_QUERY_MAX_CHARS);

    expect(tool.execute({ query: atLimit }).reason).toBeUndefined();
    expect(search).toHaveBeenCalledWith(atLimit, undefined, {
      topK: SEARCH_KNOWLEDGE_DEFAULT_LIMIT,
    });

    const over = tool.execute({
      query: 'x'.repeat(SEARCH_KNOWLEDGE_QUERY_MAX_CHARS + 1),
    });
    expect(over).toMatchObject({
      chunks: [],
      totalChars: 0,
      estimatedTokens: 0,
      truncated: false,
      reason: 'INVALID_ARGUMENT',
    });
  });

  it.each([
    ['non-object input', null],
    ['array input', []],
    ['missing query', {}],
    ['empty query', { query: '' }],
    ['blank query', { query: '   ' }],
    ['non-string query', { query: 42 }],
    ['unsupported locale', { query: 'hello', locale: 'de' }],
    ['null locale', { query: 'hello', locale: null }],
    ['zero limit', { query: 'hello', limit: 0 }],
    ['limit over six', { query: 'hello', limit: 7 }],
    ['fractional limit', { query: 'hello', limit: 1.5 }],
    ['string limit', { query: 'hello', limit: '3' }],
    ['unknown argument', { query: 'hello', extra: true }],
  ])('rejects %s with a safe INVALID_ARGUMENT result', (_label, input) => {
    const { tool, search } = makeTool();

    const result = tool.execute(input);

    expect(result).toMatchObject({
      chunks: [],
      totalChars: 0,
      estimatedTokens: 0,
      truncated: false,
      reason: 'INVALID_ARGUMENT',
    });
    expect(result.message).toEqual(expect.any(String));
    expect(result.message).not.toContain('at ');
    expect(search).not.toHaveBeenCalled();
  });

  it('passes through EMPTY_CORPUS and NO_MATCH reasons', () => {
    const empty = makeTool(emptyResult('EMPTY_CORPUS'));
    expect(empty.tool.execute({ query: 'Basmatak' })).toMatchObject({
      chunks: [],
      reason: 'EMPTY_CORPUS',
    });

    const noMatch = makeTool(emptyResult('NO_MATCH'));
    expect(noMatch.tool.execute({ query: 'unknown' })).toMatchObject({
      chunks: [],
      reason: 'NO_MATCH',
    });
  });

  it('supports limit six and reports truncation without exceeding the cap', () => {
    const chunks = Array.from({ length: 6 }, (_value, index) =>
      makeChunk({
        id: `faq/en.md#${index + 1}`,
        headingTrail: [`Section ${index + 1}`],
      }),
    );
    const { tool, search } = makeTool({
      chunks,
      totalChars: chunks.length * 45,
      estimatedTokens: chunks.length * 12,
      truncated: true,
    });

    const result = tool.execute({ query: 'Basmatak', limit: 6 });

    expect(search).toHaveBeenCalledWith('Basmatak', undefined, { topK: 6 });
    expect(result.chunks).toHaveLength(6);
    expect(result.truncated).toBe(true);
  });

  it('returns excerpts only, never full documents or file contents', () => {
    const { tool } = makeTool();

    const result = tool.execute({ query: 'Basmatak' });

    expect(result.chunks[0].text).toBe(
      'Basmatak connects volunteers with opportunities.',
    );
    expect(result.chunks[0]).not.toHaveProperty('document');
    expect(result.chunks[0]).not.toHaveProperty('blocks');
    expect(result.chunks[0]).not.toHaveProperty('fullText');
    expect(JSON.stringify(result)).not.toContain('all documents');
  });

  it('turns an internal failure into a safe SEARCH_FAILED result', () => {
    const search = jest.fn(() => {
      throw new Error('database stack trace should not leak');
    });
    const tool = new SearchKnowledgeTool({
      search,
    } as unknown as KnowledgeService);

    const result = tool.execute({ query: 'Basmatak' });

    expect(result).toEqual({
      chunks: [],
      totalChars: 0,
      estimatedTokens: 0,
      truncated: false,
      reason: 'SEARCH_FAILED',
      message: 'Knowledge search is temporarily unavailable.',
    });
    expect(JSON.stringify(result)).not.toContain('stack trace');
  });
});
