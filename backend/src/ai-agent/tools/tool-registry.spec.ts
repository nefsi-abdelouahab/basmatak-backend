import { ToolRegistry } from './tool-registry';
import {
  ReadOnlyTool,
  TOOL_DESCRIPTION_MAX_CHARS,
  ToolDefinition,
} from './tool.types';

function definition(
  overrides: Partial<Record<keyof ToolDefinition, unknown>> = {},
): ToolDefinition {
  return {
    name: 'test_tool',
    description: 'A read-only test tool.',
    allowedIntents: ['opportunity_search'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    readOnly: true,
    handler: () => ({ items: [] }),
    ...overrides,
  } as unknown as ToolDefinition;
}

function tool(
  overrides: Partial<Record<keyof ToolDefinition, unknown>> = {},
): ReadOnlyTool {
  return { definition: definition(overrides) };
}

describe('ToolRegistry', () => {
  it('registers read-only tools and lists metadata without handlers', () => {
    const registry = new ToolRegistry([
      tool({ name: 'first_tool' }),
      tool({
        name: 'second_tool',
        allowedIntents: ['platform_stats'],
      }),
    ]);

    expect(registry.names()).toEqual(['first_tool', 'second_tool']);
    expect(registry.has('first_tool')).toBe(true);
    expect(registry.has('missing_tool')).toBe(false);

    const listed = registry.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]).toEqual({
      name: 'first_tool',
      description: 'A read-only test tool.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      allowedIntents: ['opportunity_search'],
      readOnly: true,
    });
    expect(Object.keys(listed[0])).not.toContain('handler');
    expect(listed[1].allowedIntents).toEqual(['platform_stats']);
  });

  it('returns the executable definition through get()', () => {
    const registry = new ToolRegistry([tool()]);
    const registered = registry.get('test_tool');

    expect(registered).toBeDefined();
    expect(typeof registered?.handler).toBe('function');
    expect(registry.get('missing_tool')).toBeUndefined();
  });

  it('supports registering a tool after construction', () => {
    const registry = new ToolRegistry();
    registry.register(definition({ name: 'late_tool' }));

    expect(registry.names()).toEqual(['late_tool']);
  });

  it('freezes the registered definition and its metadata', () => {
    const registry = new ToolRegistry([tool()]);
    const registered = registry.get('test_tool');

    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered?.allowedIntents)).toBe(true);
    expect(Object.isFrozen(registered?.inputSchema)).toBe(true);
    expect(Object.isFrozen(registered?.inputSchema.properties)).toBe(true);
  });

  it('rejects a duplicate tool name', () => {
    const registry = new ToolRegistry([tool()]);

    expect(() => registry.register(definition())).toThrow(
      'Tool "test_tool" is already registered.',
    );
  });

  it('rejects definitions that are not explicitly read-only', () => {
    const registry = new ToolRegistry();

    expect(() => registry.register(definition({ readOnly: false }))).toThrow(
      'Only read-only tool definitions can be registered.',
    );
    expect(() => registry.register(null as unknown as ToolDefinition)).toThrow(
      'Only read-only tool definitions can be registered.',
    );
  });

  it('rejects names that are not lowercase snake_case', () => {
    for (const name of [
      'BadName',
      'bad-name',
      '1bad',
      '',
      'a',
      'a'.repeat(65),
    ]) {
      const registry = new ToolRegistry();
      expect(() => registry.register(definition({ name }))).toThrow(
        'Tool names must be lowercase snake_case.',
      );
    }
  });

  it('requires a non-empty description within the 400-character limit', () => {
    const registry = new ToolRegistry();
    const valid = definition({
      description: 'x'.repeat(TOOL_DESCRIPTION_MAX_CHARS),
    });
    expect(() => registry.register(valid)).not.toThrow();

    for (const description of [
      '',
      '   ',
      'x'.repeat(TOOL_DESCRIPTION_MAX_CHARS + 1),
    ]) {
      const invalidRegistry = new ToolRegistry();
      expect(() =>
        invalidRegistry.register(definition({ description })),
      ).toThrow(
        `Tool descriptions must be 1 to ${TOOL_DESCRIPTION_MAX_CHARS} characters.`,
      );
    }
  });

  it('requires a handler function', () => {
    const registry = new ToolRegistry();

    expect(() => registry.register(definition({ handler: undefined }))).toThrow(
      'Tool definitions must include a handler.',
    );
  });

  it('requires a non-empty allowlist of known intents', () => {
    for (const allowedIntents of [
      [],
      ['unknown_intent'],
      ['opportunity_search', 'unknown_intent'],
    ]) {
      const registry = new ToolRegistry();
      expect(() => registry.register(definition({ allowedIntents }))).toThrow(
        'Tool definitions must declare allowed intents.',
      );
    }
  });

  it('requires a strict object input schema', () => {
    const invalidSchemas: unknown[] = [
      null,
      { type: 'array', additionalProperties: false, properties: {} },
      { type: 'object', additionalProperties: true, properties: {} },
      { type: 'object', properties: {} },
    ];

    for (const inputSchema of invalidSchemas) {
      const registry = new ToolRegistry();
      expect(() => registry.register(definition({ inputSchema }))).toThrow(
        'Tool input schemas must be strict JSON objects (additionalProperties: false).',
      );
    }
  });
});
