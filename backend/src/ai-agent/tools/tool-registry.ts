import { Injectable } from '@nestjs/common';
import {
  ReadOnlyTool,
  TOOL_DESCRIPTION_MAX_CHARS,
  TOOL_INTENTS,
  ToolDefinition,
  ToolDescriptor,
  ToolIntent,
} from './tool.types';

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const TOOL_INTENT_SET = new Set<string>(TOOL_INTENTS);

/**
 * Read-only tool registry.
 *
 * Registration is the only mutation the registry exposes, and it rejects any
 * definition that is not explicitly `readOnly: true`, has an invalid name or
 * description, or duplicates an existing tool. `list()` returns metadata only;
 * the executor gets the handler through `get()`.
 */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(tools: ReadOnlyTool[] = []) {
    for (const tool of tools) {
      this.register(tool.definition);
    }
  }

  register(definition: ToolDefinition): void {
    if (
      definition === null ||
      typeof definition !== 'object' ||
      definition.readOnly !== true
    ) {
      throw new Error('Only read-only tool definitions can be registered.');
    }
    if (
      typeof definition.name !== 'string' ||
      !TOOL_NAME_PATTERN.test(definition.name)
    ) {
      throw new Error('Tool names must be lowercase snake_case.');
    }
    if (
      typeof definition.description !== 'string' ||
      definition.description.trim().length === 0 ||
      definition.description.length > TOOL_DESCRIPTION_MAX_CHARS
    ) {
      throw new Error(
        `Tool descriptions must be 1 to ${TOOL_DESCRIPTION_MAX_CHARS} characters.`,
      );
    }
    if (typeof definition.handler !== 'function') {
      throw new Error('Tool definitions must include a handler.');
    }
    if (
      !Array.isArray(definition.allowedIntents) ||
      definition.allowedIntents.length === 0 ||
      definition.allowedIntents.some(
        (intent: ToolIntent) => !TOOL_INTENT_SET.has(intent),
      )
    ) {
      throw new Error('Tool definitions must declare allowed intents.');
    }
    if (
      definition.inputSchema === null ||
      typeof definition.inputSchema !== 'object' ||
      definition.inputSchema.type !== 'object' ||
      definition.inputSchema.additionalProperties !== false
    ) {
      throw new Error(
        'Tool input schemas must be strict JSON objects (additionalProperties: false).',
      );
    }
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered.`);
    }

    const frozen = Object.freeze({
      ...definition,
      allowedIntents: Object.freeze([...definition.allowedIntents]),
      inputSchema: Object.freeze({
        ...definition.inputSchema,
        properties: Object.freeze({ ...definition.inputSchema.properties }),
      }),
    }) as ToolDefinition;
    this.tools.set(frozen.name, frozen);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      allowedIntents: tool.allowedIntents,
      readOnly: true,
    }));
  }
}
