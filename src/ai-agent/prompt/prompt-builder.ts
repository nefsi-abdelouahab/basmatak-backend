import { Inject, Injectable } from '@nestjs/common';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import type { AiAgentChatMessage, AiAgentLocale } from '../ai-agent.types';
import { estimateTokens } from '../budget/token-estimator';
import { formatConversationFocus } from '../conversation-focus';
import { formatRecentEntities } from '../recent-entities';
import type { AiAgentConfig } from '../config/ai-agent.config';
import type { RetrievedChunk } from '../knowledge/retriever';
import { toLlmToolDeclaration } from '../llm/provider.types';
import type { ToolDescriptor, ToolExecutionResult } from '../tools/tool.types';
import type {
  BuiltPrompt,
  PromptBuildInput,
  PromptBuildResult,
  PromptCitation,
  PromptDropped,
  PromptExample,
  PromptLanguage,
  PromptSectionName,
} from './prompt.types';
import {
  AI_AGENT_FEW_SHOT_EXAMPLES,
  AI_AGENT_MODEL_FIRST_FEW_SHOT_EXAMPLES,
  AI_AGENT_MODEL_FIRST_SYSTEM_PROMPT,
  AI_AGENT_MODEL_FIRST_SYSTEM_PROMPT_VERSION,
  AI_AGENT_SYSTEM_PROMPT,
  AI_AGENT_SYSTEM_PROMPT_VERSION,
  buildLinkRules,
  buildModelFirstLinkRules,
  buildModelFirstResponseStyle,
  buildResponseStyle,
  type PromptStyleExample,
} from './system-prompt';

/**
 * Deterministic, budget-bounded prompt assembly.
 *
 * Section order (stable):
 *   system_rules -> response_style -> style_examples -> link_rules -> tools
 *   -> knowledge -> tool_results -> recent_entities -> conversation_focus
 *   -> history -> examples -> user_message
 *
 * Optional content is trimmed in this exact order until the final prompt fits
 * `limits.maxInputTokens`:
 *   1. oldest history messages first;
 *   2. lowest-ranked knowledge chunks next;
 *   3. tool results from the end (lowest relevance/last result) next;
 *   4. non-essential examples last.
 *
 * The current user message, system rules, tool declarations, and the output
 * reserve are never trimmed. If they alone exceed the input budget, `build()`
 * returns a safe `ok: false` result instead of cutting safety content.
 *
 * Tool descriptors are also supplied to the provider out of band. The prompt
 * therefore contains only a short hint; `estimatedInputTokens` includes the
 * estimated declaration payload so the budget matches the whole request.
 *
 * All untrusted text (knowledge, tool results, history, examples, and the user
 * message) is escaped so delimiter-like sequences cannot close a section or
 * open a `<system_rules>` block. No prompt content is logged.
 */

const HARD_MAX_HISTORY_MESSAGES = 8;
const HARD_MAX_HISTORY_CHARS = 6000;
const MODEL_FIRST_MAX_HISTORY_MESSAGES = 4;
const HARD_MAX_KNOWLEDGE_CHUNKS = 6;
const HARD_MAX_KNOWLEDGE_CHARS = 8000;
const HARD_MAX_TOOL_RESULTS = 8;
const HARD_MAX_TOOL_RESULT_CHARS = 3000;
const HARD_MAX_OUTPUT_TOKENS = 1200;

interface PreparedHistory {
  role: 'user' | 'assistant';
  content: string;
}

interface PreparedKnowledge {
  chunk: RetrievedChunk;
  text: string;
}

interface PreparedToolResult {
  result: ToolExecutionResult;
  text: string;
  truncated: boolean;
}

interface PreparedExample {
  input: string;
  output: string;
}

interface RenderInput {
  system: string;
  style: string;
  styleExamples: readonly PromptStyleExample[];
  linkRules: string;
  locale: AiAgentLocale;
  language: PromptLanguage;
  tools: readonly ToolDescriptor[];
  knowledge: readonly PreparedKnowledge[];
  toolResults: readonly PreparedToolResult[];
  recentEntities?: string;
  focus?: string;
  history: readonly PreparedHistory[];
  examples: readonly PreparedExample[];
  message: string;
}

interface RenderedPrompt {
  text: string;
  sections: PromptSectionName[];
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Escape untrusted text so it cannot form or close a delimiter tag. */
function escapeText(value: string): string {
  return normalizeNewlines(String(value ?? ''))
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a value used inside a double-quoted XML-like attribute. */
function escapeAttribute(value: string): string {
  return normalizeNewlines(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 'null' : json;
  } catch {
    return JSON.stringify({ error: 'unserializable' });
  }
}

function estimatePromptTokens(text: string): number {
  return estimateTokens(text, { overheadTokens: 0 }).tokens;
}

const MARKDOWN_LINK_PATTERN = /\[([^\]\n]{1,300})\]\([^()\s]{1,600}\)/gu;

/** Keep only the first sentence of a long assistant turn. */
function firstSentence(value: string): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text === '') return '';
  const match = /^(.+?[.!?؟])(?:\s|$)/su.exec(text);
  return (match?.[1] ?? text).trim();
}

/**
 * Compact an older assistant turn to its first sentence plus any entity titles
 * it linked, so ordinals and pronouns still resolve without carrying the whole
 * answer forward.
 */
function compactAssistantHistory(content: string): string {
  const titles: string[] = [];
  for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
    const title = (match[1] ?? '').replace(/\s+/gu, ' ').trim();
    if (title !== '' && !titles.includes(title)) titles.push(title);
  }
  const plain = content
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  const sentence = firstSentence(plain);
  const missing = titles.filter((title) => !sentence.includes(title));
  if (missing.length === 0) return sentence;
  return `${sentence} Entity titles: ${missing.join('; ')}.`.trim();
}

function isToolExecutionResult(value: unknown): value is ToolExecutionResult {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.tool === 'string' &&
    typeof record.ok === 'boolean' &&
    record.meta !== null &&
    typeof record.meta === 'object'
  );
}

@Injectable()
export class PromptBuilder {
  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
  ) {}

  build(input: PromptBuildInput): PromptBuildResult {
    const maxInputTokens = clampInteger(
      this.config.limits.maxInputTokens,
      0,
      0,
      100_000,
    );
    const maxOutputTokens = clampInteger(
      this.config.limits.maxOutputTokens,
      0,
      0,
      HARD_MAX_OUTPUT_TOKENS,
    );
    const language: PromptLanguage =
      input.responseLanguage === 'ar' ? 'ar' : 'en';
    const message = typeof input.message === 'string' ? input.message : '';
    const modelFirst = input.modelFirst === true;
    const system = modelFirst
      ? AI_AGENT_MODEL_FIRST_SYSTEM_PROMPT
      : AI_AGENT_SYSTEM_PROMPT;
    const version = modelFirst
      ? AI_AGENT_MODEL_FIRST_SYSTEM_PROMPT_VERSION
      : AI_AGENT_SYSTEM_PROMPT_VERSION;
    const style = modelFirst
      ? buildModelFirstResponseStyle(language)
      : buildResponseStyle(language);
    const styleExamples = modelFirst
      ? AI_AGENT_MODEL_FIRST_FEW_SHOT_EXAMPLES
      : AI_AGENT_FEW_SHOT_EXAMPLES;
    const linkRules = modelFirst
      ? buildModelFirstLinkRules(input.locale)
      : buildLinkRules(input.locale);
    const tools = this.prepareTools(input.tools);
    const declarationTokens = this.estimateToolDeclarationTokens(tools);
    const focus =
      input.focus !== undefined ? formatConversationFocus(input.focus) : '';
    const recentEntities =
      modelFirst && input.recentEntities !== undefined
        ? formatRecentEntities(input.recentEntities)
        : undefined;

    const dropped: PromptDropped = {
      historyMessages: 0,
      knowledgeChunks: 0,
      toolResults: 0,
      examples: 0,
    };

    // Reserve required content before considering anything optional.
    const required = this.render({
      system,
      style,
      styleExamples,
      linkRules,
      locale: input.locale,
      language,
      tools,
      knowledge: [],
      toolResults: [],
      recentEntities,
      focus,
      history: [],
      examples: [],
      message,
    });
    const requiredTokens =
      estimatePromptTokens(required.text) + declarationTokens;
    if (requiredTokens > maxInputTokens) {
      return {
        ok: false,
        error: {
          code: 'PROMPT_BUDGET_EXCEEDED',
          message:
            'The reserved prompt content exceeds the configured input token budget.',
          estimatedRequiredTokens: requiredTokens,
          maxInputTokens,
        },
      };
    }

    const history = this.prepareHistory(input.history, dropped, modelFirst);
    const knowledge = this.prepareKnowledge(input.knowledge, dropped);
    const toolResults = this.prepareToolResults(input.toolResults, dropped);
    const examples = this.prepareExamples(input.examples, dropped);

    let rendered = this.render({
      system,
      style,
      styleExamples,
      linkRules,
      locale: input.locale,
      language,
      tools,
      knowledge,
      toolResults,
      recentEntities,
      focus,
      history,
      examples,
      message,
    });
    let inputTokens = estimatePromptTokens(rendered.text) + declarationTokens;

    // Trim in the documented order, one item at a time, until the prompt fits.
    while (inputTokens > maxInputTokens) {
      if (history.length > 0) {
        history.shift();
        dropped.historyMessages += 1;
      } else if (knowledge.length > 0) {
        knowledge.pop();
        dropped.knowledgeChunks += 1;
      } else if (toolResults.length > 0) {
        toolResults.pop();
        dropped.toolResults += 1;
      } else if (examples.length > 0) {
        examples.pop();
        dropped.examples += 1;
      } else {
        // The reserved content fit above, so this is unreachable. Fail closed
        // anyway rather than emitting a prompt over budget.
        return {
          ok: false,
          error: {
            code: 'PROMPT_BUDGET_EXCEEDED',
            message:
              'The prompt cannot fit within the configured input token budget.',
            estimatedRequiredTokens: inputTokens,
            maxInputTokens,
          },
        };
      }

      rendered = this.render({
        system,
        style,
        styleExamples,
        linkRules,
        locale: input.locale,
        language,
        tools,
        knowledge,
        toolResults,
        recentEntities,
        focus,
        history,
        examples,
        message,
      });
      inputTokens = estimatePromptTokens(rendered.text) + declarationTokens;
    }

    const citations: Record<string, PromptCitation> = {};
    knowledge.forEach((item, index) => {
      const id = `K${index + 1}`;
      const heading = Array.isArray(item.chunk.headingTrail)
        ? item.chunk.headingTrail.join(' > ')
        : '';
      citations[id] = {
        id,
        kind: 'knowledge',
        source: String(item.chunk.source ?? ''),
        title: String(item.chunk.title ?? ''),
        ...(heading !== '' ? { heading } : {}),
        ...(typeof item.chunk.locale === 'string'
          ? { locale: item.chunk.locale }
          : {}),
        ...(Number.isFinite(item.chunk.score)
          ? { score: item.chunk.score }
          : {}),
      };
    });
    toolResults.forEach((item, index) => {
      const id = `T${index + 1}`;
      citations[id] = {
        id,
        kind: 'tool',
        tool: item.result.tool,
        ok: item.result.ok,
        truncated: item.truncated || item.result.meta.truncated === true,
      };
    });

    const truncated =
      dropped.historyMessages > 0 ||
      dropped.knowledgeChunks > 0 ||
      dropped.toolResults > 0 ||
      dropped.examples > 0 ||
      toolResults.some((item) => item.truncated);

    const prompt: BuiltPrompt = {
      version,
      system,
      text: rendered.text,
      language,
      estimatedInputTokens: inputTokens,
      estimatedToolDeclarationTokens: declarationTokens,
      estimatedOutputTokens: maxOutputTokens,
      estimatedTotalTokens: inputTokens + maxOutputTokens,
      truncated,
      dropped,
      citations,
      sections: rendered.sections,
    };

    return { ok: true, prompt };
  }

  private prepareTools(
    tools: readonly ToolDescriptor[] | undefined,
  ): ToolDescriptor[] {
    if (!Array.isArray(tools)) return [];
    return tools.filter(
      (tool): tool is ToolDescriptor =>
        tool !== null &&
        typeof tool === 'object' &&
        typeof tool.name === 'string' &&
        typeof tool.description === 'string' &&
        tool.inputSchema !== null &&
        typeof tool.inputSchema === 'object',
    );
  }

  /**
   * Estimate the provider-facing declaration payload exactly as the
   * orchestrator sends it. The prompt itself no longer embeds these schemas,
   * but the provider request still charges for them.
   */
  private estimateToolDeclarationTokens(
    tools: readonly ToolDescriptor[],
  ): number {
    if (tools.length === 0) return 0;
    try {
      return estimatePromptTokens(
        JSON.stringify(tools.map((tool) => toLlmToolDeclaration(tool))),
      );
    } catch {
      return 0;
    }
  }

  private prepareHistory(
    history: readonly AiAgentChatMessage[] | undefined,
    dropped: PromptDropped,
    modelFirst: boolean,
  ): PreparedHistory[] {
    const raw = Array.isArray(history) ? history : [];
    const configuredMaxMessages = clampInteger(
      this.config.limits.maxHistoryMessages,
      6,
      0,
      HARD_MAX_HISTORY_MESSAGES,
    );
    const maxMessages = modelFirst
      ? Math.min(configuredMaxMessages, MODEL_FIRST_MAX_HISTORY_MESSAGES)
      : configuredMaxMessages;
    const maxChars = clampInteger(
      this.config.limits.maxHistoryChars,
      4000,
      0,
      HARD_MAX_HISTORY_CHARS,
    );

    const valid: PreparedHistory[] = [];
    for (const item of raw) {
      if (item === null || typeof item !== 'object') {
        dropped.historyMessages += 1;
        continue;
      }
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if (role !== 'user' && role !== 'assistant') {
        // The DTO blocks `system`, but reject it defensively here too.
        dropped.historyMessages += 1;
        continue;
      }
      if (typeof content !== 'string' || content.trim() === '') {
        dropped.historyMessages += 1;
        continue;
      }
      valid.push({ role, content: content.trim() });
    }

    const kept: PreparedHistory[] =
      maxMessages === 0
        ? []
        : valid.slice(Math.max(0, valid.length - maxMessages));
    dropped.historyMessages += valid.length - kept.length;

    if (modelFirst) {
      // Every history message predates the current user turn, so each assistant
      // answer is compacted to its first sentence plus linked entity titles.
      // `<recent_entities>` carries the full entity list for follow-ups.
      for (const message of kept) {
        if (message.role === 'assistant') {
          message.content = compactAssistantHistory(message.content);
        }
      }
    }

    let totalChars = kept.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    while (kept.length > 0 && totalChars > maxChars) {
      const removed = kept.shift();
      if (removed === undefined) break;
      totalChars -= removed.content.length;
      dropped.historyMessages += 1;
    }

    return kept;
  }

  private prepareKnowledge(
    knowledge: PromptBuildInput['knowledge'],
    dropped: PromptDropped,
  ): PreparedKnowledge[] {
    const raw = Array.isArray(knowledge?.chunks) ? knowledge.chunks : [];
    const maxChunks = clampInteger(
      this.config.limits.maxKnowledgeChunks,
      4,
      0,
      HARD_MAX_KNOWLEDGE_CHUNKS,
    );
    const maxChars = clampInteger(
      this.config.limits.maxKnowledgeChars,
      6000,
      0,
      HARD_MAX_KNOWLEDGE_CHARS,
    );

    const valid: PreparedKnowledge[] = [];
    for (const chunk of raw) {
      if (
        chunk === null ||
        typeof chunk !== 'object' ||
        typeof chunk.text !== 'string' ||
        chunk.text.trim() === ''
      ) {
        dropped.knowledgeChunks += 1;
        continue;
      }
      valid.push({ chunk, text: chunk.text.trim() });
    }

    const kept = maxChunks === 0 ? [] : valid.slice(0, maxChunks);
    dropped.knowledgeChunks += valid.length - kept.length;

    let totalChars = kept.reduce((total, item) => total + item.text.length, 0);
    while (kept.length > 0 && totalChars > maxChars) {
      const removed = kept.pop();
      if (removed === undefined) break;
      totalChars -= removed.text.length;
      dropped.knowledgeChunks += 1;
    }

    return kept;
  }

  private prepareToolResults(
    toolResults: readonly ToolExecutionResult[] | undefined,
    dropped: PromptDropped,
  ): PreparedToolResult[] {
    const raw = Array.isArray(toolResults) ? toolResults : [];
    const maxResults = clampInteger(
      this.config.limits.maxToolRows,
      5,
      0,
      HARD_MAX_TOOL_RESULTS,
    );
    const maxChars = clampInteger(
      this.config.limits.maxToolResultChars,
      1200,
      1,
      HARD_MAX_TOOL_RESULT_CHARS,
    );

    const valid: ToolExecutionResult[] = [];
    for (const result of raw) {
      if (!isToolExecutionResult(result)) {
        dropped.toolResults += 1;
        continue;
      }
      valid.push(result);
    }

    const kept = maxResults === 0 ? [] : valid.slice(0, maxResults);
    dropped.toolResults += valid.length - kept.length;

    return kept.map((result) => {
      const payload = result.ok
        ? { ok: true, data: result.data ?? null }
        : {
            ok: false,
            error: result.error ?? {
              code: 'UNAVAILABLE',
              message: 'Tool unavailable.',
            },
          };
      let text = safeJson(payload);
      let truncated = result.meta.truncated === true;

      if (text.length > maxChars) {
        text =
          maxChars <= 1
            ? text.slice(0, maxChars)
            : `${text.slice(0, maxChars - 1)}…`;
        truncated = true;
      }

      return { result, text, truncated };
    });
  }

  private prepareExamples(
    examples: readonly PromptExample[] | undefined,
    dropped: PromptDropped,
  ): PreparedExample[] {
    const raw = Array.isArray(examples) ? examples : [];
    const valid: PreparedExample[] = [];

    for (const example of raw) {
      if (
        example === null ||
        typeof example !== 'object' ||
        typeof example.input !== 'string' ||
        typeof example.output !== 'string'
      ) {
        dropped.examples += 1;
        continue;
      }
      const input = example.input.trim();
      const output = example.output.trim();
      if (input === '' && output === '') {
        dropped.examples += 1;
        continue;
      }
      valid.push({ input, output });
    }

    return valid;
  }

  private render(input: RenderInput): RenderedPrompt {
    const sections: PromptSectionName[] = [
      'system_rules',
      'response_style',
      'style_examples',
      'link_rules',
    ];
    const styleExamples = [
      '<style_examples>',
      ...input.styleExamples.flatMap((example) => [
        `<example language="${escapeAttribute(example.language)}">`,
        `<input>${escapeText(example.input)}</input>`,
        `<output>${escapeText(example.output)}</output>`,
        '</example>',
      ]),
      '</style_examples>',
    ].join('\n');
    const parts: string[] = [
      `<system_rules>\n${input.system.trim()}\n</system_rules>`,
      `<response_style language="${input.language}">\n${input.style.trim()}\n</response_style>`,
      styleExamples,
      `<link_rules locale="${input.locale}">\n${input.linkRules.trim()}\n</link_rules>`,
    ];

    if (input.tools.length > 0) {
      sections.push('tools');
      parts.push(
        '<tools>\nTool declarations are supplied separately to the provider; use them when they help answer the request.\n</tools>',
      );
    }

    if (input.knowledge.length > 0) {
      sections.push('knowledge');
      const lines: string[] = ['<knowledge>'];
      input.knowledge.forEach((item, index) => {
        const attributes = [
          `id="K${index + 1}"`,
          `source="${escapeAttribute(String(item.chunk.source ?? ''))}"`,
          `title="${escapeAttribute(String(item.chunk.title ?? ''))}"`,
          `locale="${escapeAttribute(String(item.chunk.locale ?? ''))}"`,
        ];
        const heading = Array.isArray(item.chunk.headingTrail)
          ? item.chunk.headingTrail.join(' > ')
          : '';
        if (heading !== '') {
          attributes.push(`heading="${escapeAttribute(heading)}"`);
        }
        lines.push(`<chunk ${attributes.join(' ')}>`);
        lines.push(escapeText(item.text));
        lines.push('</chunk>');
      });
      lines.push('</knowledge>');
      parts.push(lines.join('\n'));
    }

    if (input.toolResults.length > 0) {
      sections.push('tool_results');
      const lines: string[] = ['<tool_results>'];
      input.toolResults.forEach((item, index) => {
        const attributes = [
          `id="T${index + 1}"`,
          `tool="${escapeAttribute(item.result.tool)}"`,
          `ok="${item.result.ok ? 'true' : 'false'}"`,
        ];
        if (item.truncated) {
          attributes.push('truncated="true"');
        }
        if (!item.result.ok && item.result.error?.code) {
          attributes.push(
            `error_code="${escapeAttribute(item.result.error.code)}"`,
          );
        }
        lines.push(`<result ${attributes.join(' ')}>`);
        lines.push(escapeText(item.text));
        lines.push('</result>');
      });
      lines.push('</tool_results>');
      parts.push(lines.join('\n'));
    }

    if (input.recentEntities !== undefined && input.recentEntities !== '') {
      sections.push('recent_entities');
      parts.push(
        `<recent_entities>\n${escapeText(input.recentEntities)}\n</recent_entities>`,
      );
    }

    if (input.focus !== undefined && input.focus !== '') {
      sections.push('conversation_focus');
      parts.push(
        `<conversation_focus>\n${escapeText(input.focus)}\n</conversation_focus>`,
      );
    }

    if (input.history.length > 0) {
      sections.push('history');
      const lines: string[] = ['<history>'];
      for (const turn of input.history) {
        lines.push(`<turn role="${turn.role}">`);
        lines.push(escapeText(turn.content));
        lines.push('</turn>');
      }
      lines.push('</history>');
      parts.push(lines.join('\n'));
    }

    if (input.examples.length > 0) {
      sections.push('examples');
      const lines: string[] = ['<examples>'];
      for (const example of input.examples) {
        lines.push('<example>');
        lines.push(`<input>${escapeText(example.input)}</input>`);
        lines.push(`<output>${escapeText(example.output)}</output>`);
        lines.push('</example>');
      }
      lines.push('</examples>');
      parts.push(lines.join('\n'));
    }

    sections.push('user_message');
    parts.push(
      `<user_message>\n${escapeText(input.message.trim())}\n</user_message>`,
    );

    return { text: parts.join('\n'), sections };
  }
}
