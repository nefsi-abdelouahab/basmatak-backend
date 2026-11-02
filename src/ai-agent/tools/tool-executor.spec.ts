import { ToolExecutor } from './tool-executor';
import { ToolRegistry } from './tool-registry';
import {
  ReadOnlyTool,
  ToolDefinition,
  ToolHandler,
  ToolInputError,
  defineReadOnlyTool,
  findForbiddenToolResultKey,
} from './tool.types';

function makeTool(
  name: string,
  handler: ToolHandler,
  overrides: Partial<
    Omit<ToolDefinition, 'name' | 'handler' | 'readOnly'>
  > = {},
): ReadOnlyTool {
  return {
    definition: defineReadOnlyTool({
      name,
      description: `${name} test tool.`,
      allowedIntents: ['opportunity_search'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      handler,
      ...overrides,
    }),
  };
}

describe('ToolExecutor', () => {
  it('executes a known tool and reports the serialized payload size', async () => {
    const data = { items: [{ id: 'one', title: 'Beach cleanup' }] };
    const executor = new ToolExecutor(
      new ToolRegistry([makeTool('ok_tool', () => data)]),
    );

    const result = await executor.execute('ok_tool', {});

    expect(result).toEqual({
      ok: true,
      tool: 'ok_tool',
      data,
      meta: {
        charCount: JSON.stringify(data).length,
        truncated: false,
      },
    });
  });

  it('passes validated arguments through to the handler', async () => {
    const handler = jest.fn((input: unknown) => ({ input }));
    const executor = new ToolExecutor(
      new ToolRegistry([makeTool('echo_tool', handler)]),
    );

    const result = await executor.execute('echo_tool', { text: 'beach' });

    expect(handler).toHaveBeenCalledWith({ text: 'beach' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ input: { text: 'beach' } });
    }
  });

  it('allows omitted arguments for no-argument tools', async () => {
    const handler = jest.fn(() => ({ count: 1 }));
    const executor = new ToolExecutor(
      new ToolRegistry([makeTool('stats_tool', handler)]),
    );

    const result = await executor.execute('stats_tool');

    expect(handler).toHaveBeenCalledWith(undefined);
    expect(result).toMatchObject({
      ok: true,
      tool: 'stats_tool',
      data: { count: 1 },
    });
  });

  it('returns TOOL_NOT_FOUND without invoking any handler', async () => {
    const handler = jest.fn(() => ({ ok: true }));
    const executor = new ToolExecutor(
      new ToolRegistry([makeTool('known_tool', handler)]),
    );

    const result = await executor.execute('missing_tool');

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      tool: 'missing_tool',
      error: {
        code: 'TOOL_NOT_FOUND',
        message: 'Unknown or unavailable tool.',
      },
      meta: { charCount: 0, truncated: false },
    });
  });

  it('maps controlled argument errors to INVALID_ARGUMENT', async () => {
    const executor = new ToolExecutor(
      new ToolRegistry([
        makeTool('strict_tool', () => {
          throw new ToolInputError('limit must be an integer from 1 to 8.');
        }),
      ]),
    );

    const result = await executor.execute('strict_tool', {});

    expect(result).toEqual({
      ok: false,
      tool: 'strict_tool',
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'limit must be an integer from 1 to 8.',
      },
      meta: { charCount: 0, truncated: false },
    });
    expect(result).not.toHaveProperty('stack');
    expect(JSON.stringify(result)).not.toContain('ToolInputError');
  });

  it('hides handler failures behind a safe UNAVAILABLE error', async () => {
    const executor = new ToolExecutor(
      new ToolRegistry([
        makeTool('broken_tool', () => {
          throw new Error('mongo secret: connection refused');
        }),
      ]),
    );

    const result = await executor.execute('broken_tool');

    expect(result).toEqual({
      ok: false,
      tool: 'broken_tool',
      error: {
        code: 'UNAVAILABLE',
        message: 'Tool is temporarily unavailable.',
      },
      meta: { charCount: 0, truncated: false },
    });
    expect(JSON.stringify(result)).not.toContain('mongo secret');
    expect(result).not.toHaveProperty('stack');
  });

  it('times out a slow handler and returns a safe TIMEOUT error', async () => {
    const executor = new ToolExecutor(
      new ToolRegistry([
        makeTool('slow_tool', () => new Promise<never>(() => undefined)),
      ]),
      { timeoutMs: 20 },
    );

    const startedAt = Date.now();
    const result = await executor.execute('slow_tool');

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result).toEqual({
      ok: false,
      tool: 'slow_tool',
      error: {
        code: 'TIMEOUT',
        message: 'Tool execution timed out.',
      },
      meta: { charCount: 0, truncated: false },
    });
    expect(result).not.toHaveProperty('stack');
  });

  it('caps each result at the configured character budget', async () => {
    const executor = new ToolExecutor(
      new ToolRegistry([
        makeTool('big_tool', () => ({
          items: Array.from({ length: 8 }, (_, index) => ({
            id: String(index),
            title: 'Opportunity '.repeat(20),
            description: 'x'.repeat(500),
          })),
        })),
      ]),
      { perResultMaxChars: 120 },
    );

    const result = await executor.execute('big_tool');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`Expected success, got ${result.error.code}`);
    }
    expect(result.meta.charCount).toBeLessThanOrEqual(120);
    expect(result.meta.truncated).toBe(true);
    expect(JSON.stringify(result.data).length).toBe(result.meta.charCount);
    expect(findForbiddenToolResultKey(result.data)).toBeNull();
  });

  it('shares the total character budget across executeMany calls', async () => {
    const executor = new ToolExecutor(
      new ToolRegistry([
        makeTool('big_tool', () => ({ value: 'x'.repeat(500) })),
      ]),
      { perResultMaxChars: 100, totalMaxChars: 200 },
    );

    const batch = await executor.executeMany([
      { name: 'big_tool' },
      { name: 'big_tool' },
      { name: 'big_tool' },
    ]);

    expect(batch.results).toHaveLength(3);
    expect(batch.totalChars).toBeLessThanOrEqual(200);
    expect(batch.totalChars).toBe(
      batch.results.reduce((sum, result) => sum + result.meta.charCount, 0),
    );
    expect(batch.truncated).toBe(true);
    expect(batch.results[0].ok).toBe(true);
    expect(batch.results[1].ok).toBe(true);
    expect(batch.results[2]).toMatchObject({
      ok: false,
      tool: 'big_tool',
      error: {
        code: 'RESULT_BUDGET_EXHAUSTED',
        message: 'The shared tool result budget is exhausted.',
      },
      meta: { charCount: 0, truncated: false },
    });
  });

  it('does not run a call when the shared budget is already too small', async () => {
    const handler = jest.fn(() => ({ ok: true }));
    const executor = new ToolExecutor(
      new ToolRegistry([makeTool('known_tool', handler)]),
      { totalMaxChars: 10 },
    );

    const batch = await executor.executeMany([{ name: 'known_tool' }]);

    expect(handler).not.toHaveBeenCalled();
    expect(batch).toEqual({
      results: [
        {
          ok: false,
          tool: 'known_tool',
          error: {
            code: 'RESULT_BUDGET_EXHAUSTED',
            message: 'The shared tool result budget is exhausted.',
          },
          meta: { charCount: 0, truncated: false },
        },
      ],
      totalChars: 0,
      truncated: false,
    });
  });

  it('returns an empty batch for an empty request list', async () => {
    const executor = new ToolExecutor(new ToolRegistry());

    await expect(executor.executeMany([])).resolves.toEqual({
      results: [],
      totalChars: 0,
      truncated: false,
    });
  });

  it('rejects top-level and nested forbidden result keys', async () => {
    const payloads: unknown[] = [
      { userId: 'user-1' },
      { items: [{ contact: { email: 'secret@example.com' } }] },
      { items: [{ nested: { registryId: 'ORG-1' } }] },
      { items: [{ coordinates: [3.1, 36.7] }] },
    ];

    for (const payload of payloads) {
      const executor = new ToolExecutor(
        new ToolRegistry([makeTool('leak_tool', () => payload)]),
      );
      const result = await executor.execute('leak_tool');

      expect(result).toEqual({
        ok: false,
        tool: 'leak_tool',
        error: {
          code: 'INVALID_RESULT',
          message: 'Tool result was rejected by the privacy guard.',
        },
        meta: { charCount: 0, truncated: false },
      });
    }
  });

  it('rejects a non-serializable result safely', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const executor = new ToolExecutor(
      new ToolRegistry([makeTool('unserializable_tool', () => circular)]),
    );

    const result = await executor.execute('unserializable_tool');

    expect(result).toEqual({
      ok: false,
      tool: 'unserializable_tool',
      error: {
        code: 'INVALID_RESULT',
        message: 'Tool result was not JSON serializable.',
      },
      meta: { charCount: 0, truncated: false },
    });
    expect(JSON.stringify(result)).not.toContain('"self"');
  });
});
