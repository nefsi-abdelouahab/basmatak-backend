import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app.logger';
import { redactLogText } from '../../common/logger/log-redaction';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import type {
  AiAgentChatMessage,
  AiAgentErrorCode,
  AiAgentFinishReason,
  AiAgentKnowledgeSource,
  AiAgentLocale,
  AiAgentMode,
  AiAgentSourcesEvent,
} from '../ai-agent.types';
import { QuotaService } from '../budget/quota.service';
import { isProviderQuotaError } from '../budget/quota.types';
import { estimateTokens } from '../budget/token-estimator';
import type { AiAgentConfig } from '../config/ai-agent.config';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type { RetrievalResult } from '../knowledge/retriever';
import {
  createProviderDeadline,
  deadlineError,
  isLlmAbortError,
  isLlmProviderUnavailableError,
  isLlmServerError,
  isLlmTimeoutError,
  LlmInvalidResponseError,
  LlmProviderUnavailableError,
  throwIfDeadlineExceeded,
  waitForProviderDelay,
} from '../llm/provider-errors';
import type { ProviderDeadline } from '../llm/provider-errors';
import type { LlmProvider } from '../llm/provider.interface';
import { LLM_PROVIDER } from '../llm/provider.interface';
import type {
  LlmFinishReason,
  LlmFunctionResultInput,
  LlmScriptedToolCall,
  LlmStreamEvent,
  LlmToolDeclaration,
  LlmTurnInput,
  LlmTurnRequest,
  LlmUsage,
} from '../llm/provider.types';
import { toLlmToolDeclaration } from '../llm/provider.types';
import { PromptBuilder } from '../prompt/prompt-builder';
import { detectPromptLanguage, IntentRouter } from '../router/intent-router';
import type { RouterDecision } from '../router/intent-router';
import type { SseStream } from '../sse/sse-writer';
import { ToolExecutor } from '../tools/tool-executor';
import type {
  ToolDescriptor,
  ToolErrorCode,
  ToolExecutionResult,
  ToolInputSchema,
} from '../tools/tool.types';
import {
  browseSources,
  containsSystemInstructionLeak,
  hasUsableToolData,
  isPrivateDataRequest,
  policyMessage,
  resolveAnswerCaps,
  splitAnswerIntoDeltas,
} from './answer-policy';
import type { AnswerCaps } from './answer-policy';
import {
  buildDataCitationMap,
  buildKnowledgeCitationMap,
  buildRetrievalCitationMap,
  resolveCitations,
} from './citations';
import type { CitableToolResult } from './citations';

/**
 * Session 9 answer pipeline.
 *
 * The controller owns transport, validation, quota reservation/commit, and the
 * final `done` event. This orchestrator owns routing, retrieval, prompt
 * assembly, provider calls, bounded tool rounds, citation validation, and the
 * `status` / `sources` / `token` / in-stream `error` events.
 *
 * Safety properties:
 * - one provider call for knowledge-only turns, at most three calls per turn;
 * - one tool round by default, hard cap two;
 * - one 45-second turn deadline shared by every provider call;
 * - one transient-5xx retry, only before any text or tool call is produced;
 * - no retry for 429, timeout, abort, invalid responses, or after tools;
 * - model output is buffered until the turn finishes so citations can be
 *   validated before any token is emitted;
 * - logs never receive message text, prompts, retrieved text, tool arguments,
 *   tool payloads, or completions.
 */

export const AI_AGENT_MAX_PROVIDER_CALLS = 3;
export const AI_AGENT_MAX_TOOL_ROUNDS = 2;
export const AI_AGENT_TRANSIENT_RETRY_BACKOFF_MS = 250;
export const AI_AGENT_TOTAL_TIMEOUT_MS = 45_000;

const MAX_TOOL_CALLS_PER_ROUND = 3;
const MAX_PROVIDER_TEXT_CHARS = 100_000;

const CITATION_MARKER_PATTERN = /\[[KTD]\d{1,3}(?:\s*[,;]\s*[KTD]\d{1,3})*\]/gi;

export interface AiAgentOrchestratorInput {
  message: string;
  locale: AiAgentLocale;
  history: AiAgentChatMessage[];
  /** Effective mode selected by the controller (may be `retrieval_only`). */
  mode: AiAgentMode;
  stream: SseStream;
  /** Client-cancellation signal. The orchestrator adds its own total deadline. */
  signal: AbortSignal;
}

export interface AiAgentOrchestrationResult {
  mode: AiAgentMode;
  finishReason: AiAgentFinishReason | 'aborted';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
  toolCalls: number;
  toolNames: string[];
  refusal: boolean;
  rateLimited: boolean;
  truncated: boolean;
  errorCode?: AiAgentErrorCode;
  firstTokenAt?: number;
  retryAfterSeconds?: number;
}

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
}

interface AttemptState {
  sawText: boolean;
  sawToolCalls: boolean;
}

interface ProviderCallState {
  calls: number;
  retried: boolean;
}

interface ProviderTurnResult {
  interactionId?: string;
  text: string;
  toolCalls: readonly LlmScriptedToolCall[];
  usage?: LlmUsage;
  finishReason: LlmFinishReason;
}

interface PreparedToolCall {
  callId: string;
  rawName: string;
  arguments: Record<string, unknown>;
  descriptor?: ToolDescriptor;
  failure?: ToolExecutionResult;
}

type ToolRoundReason = 'usable' | 'empty' | 'unavailable';

interface ToolRoundOutcome {
  results: ToolExecutionResult[];
  functionResults: LlmFunctionResultInput[];
  citationResults: CitableToolResult[];
  executedNames: string[];
  toolCalls: number;
  usable: boolean;
  reason: ToolRoundReason;
  aborted: boolean;
}

interface EmitOptions {
  refusal: boolean;
  truncated: boolean;
  toolCalls: number;
  toolNames: string[];
}

function zeroUsage(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, estimated: false };
}

function estimateTextTokens(text: string): number {
  return estimateTokens(text, { overheadTokens: 0 }).tokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function emptyRetrieval(): RetrievalResult {
  return {
    chunks: [],
    totalChars: 0,
    estimatedTokens: 0,
    truncated: false,
    reason: 'NO_MATCH',
  };
}

function uniqueNames(names: readonly string[]): string[] {
  return [...new Set(names)];
}

/**
 * The prompt builder includes a `<system_rules>` section and also exposes the
 * same rules as `prompt.system`. Providers receive the rules once through the
 * system-instruction channel, so the duplicate leading section is removed from
 * the user input.
 */
export function stripLeadingSystemSection(text: string): string {
  const source = typeof text === 'string' ? text : '';
  if (!source.startsWith('<system_rules>')) return source;
  const end = source.indexOf('</system_rules>');
  if (end === -1) return source;
  return source.slice(end + '</system_rules>'.length).replace(/^\s+/, '');
}

function remainingMs(deadlineStartedAt: number): number {
  return Math.max(
    1,
    AI_AGENT_TOTAL_TIMEOUT_MS - (Date.now() - deadlineStartedAt),
  );
}

function failureResult(
  tool: string,
  code: ToolErrorCode,
  message: string,
): ToolExecutionResult {
  return {
    ok: false,
    tool: tool === '' ? 'unknown_tool' : tool,
    error: { code, message },
    meta: { charCount: 0, truncated: false },
  };
}

/**
 * Validate model-supplied arguments against the declared strict schema before
 * a handler is ever invoked. Messages are intentionally generic: a rejected
 * call must not echo model text back through an error path.
 */
export function validateToolArguments(
  schema: ToolInputSchema,
  args: unknown,
): string | undefined {
  if (!isRecord(args)) return 'Arguments must be an object.';

  const allowed = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) return 'Unknown argument.';
  }

  for (const required of schema.required ?? []) {
    if (args[required] === undefined) return 'Missing required argument.';
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    const value = args[key];
    if (value === undefined) continue;

    switch (property.type) {
      case 'string': {
        if (typeof value !== 'string') return 'Invalid argument value.';
        if (
          property.minLength !== undefined &&
          value.length < property.minLength
        ) {
          return 'Invalid argument value.';
        }
        if (
          property.maxLength !== undefined &&
          value.length > property.maxLength
        ) {
          return 'Invalid argument value.';
        }
        if (
          property.enum !== undefined &&
          !(property.enum as readonly string[]).includes(value)
        ) {
          return 'Invalid argument value.';
        }
        break;
      }
      case 'integer': {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return 'Invalid argument value.';
        }
        if (property.minimum !== undefined && value < property.minimum) {
          return 'Invalid argument value.';
        }
        if (property.maximum !== undefined && value > property.maximum) {
          return 'Invalid argument value.';
        }
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') return 'Invalid argument value.';
        break;
      }
      default:
        return 'Invalid argument value.';
    }
  }

  return undefined;
}

function extractSnippet(text: string, maxChars: number): string {
  const cleaned = String(text ?? '')
    .replace(CITATION_MARKER_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;

  const cut = cleaned.slice(0, maxChars);
  const boundary = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  const base =
    boundary > Math.floor(maxChars * 0.6) ? cut.slice(0, boundary) : cut;
  return `${base.trimEnd()}…`;
}

@Injectable()
export class AiAgentOrchestrator {
  private readonly logger: AppLogger;

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    private readonly router: IntentRouter,
    private readonly knowledge: KnowledgeService,
    private readonly promptBuilder: PromptBuilder,
    private readonly toolExecutor: ToolExecutor,
    private readonly quota: QuotaService,
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Optional() logger?: AppLogger,
  ) {
    this.logger = logger ?? new AppLogger('AiAgentOrchestrator');
  }

  async run(
    input: AiAgentOrchestratorInput,
  ): Promise<AiAgentOrchestrationResult> {
    const deadlineStartedAt = Date.now();
    const deadline = createProviderDeadline(
      input.signal,
      AI_AGENT_TOTAL_TIMEOUT_MS,
    );
    const caps = resolveAnswerCaps(input.mode, this.config.limits);
    const language = detectPromptLanguage(input.message, input.locale);

    try {
      // The private-data guard runs before routing and before any provider
      // call so account/contact/application data can never reach the model.
      if (isPrivateDataRequest(input.message)) {
        return this.emitPolicyAnswer(
          input,
          policyMessage('privateData', language),
          { knowledge: [], data: [] },
          true,
        );
      }

      // Exhausted mode is a fixed local answer. It never retrieves and never
      // calls a provider, even when the corpus has matching content.
      if (input.mode === 'exhausted') {
        return this.emitPolicyAnswer(
          input,
          policyMessage('quotaExhausted', language),
          { knowledge: [], data: browseSources(language) },
          true,
        );
      }

      const decision = this.router.route(input.message, input.locale);

      // Greetings, thanks, capability questions, and clarifications are
      // deterministic and citation-exempt.
      if (decision.action === 'direct_reply') {
        return this.emitPolicyAnswer(
          input,
          decision.directReply ?? policyMessage('notFound', language),
          { knowledge: [], data: [] },
          decision.intent === 'clarify' || decision.intent === 'off_topic',
        );
      }

      if (input.mode === 'retrieval_only') {
        return this.runRetrievalOnly(input, decision, caps, language);
      }

      // Defensive fallback: an unknown non-provider mode must not call out.
      if (!caps.providerEnabled) {
        return this.emitPolicyAnswer(
          input,
          policyMessage('quotaExhausted', language),
          { knowledge: [], data: browseSources(language) },
          true,
        );
      }

      // In knowledge-only mode a live-data question cannot be answered from
      // tools. Return a clear limitation plus browse links instead of letting
      // the model speculate or cite a weak knowledge match.
      if (input.mode === 'knowledge_only' && decision.intent === 'live_data') {
        return this.emitPolicyAnswer(
          input,
          policyMessage('knowledgeOnlyLive', language),
          { knowledge: [], data: browseSources(language) },
          false,
        );
      }

      return await this.runProviderAnswer(
        input,
        decision,
        caps,
        language,
        deadline,
        deadlineStartedAt,
      );
    } catch (error) {
      return this.handleUnexpectedFailure(input, language, deadline, error);
    } finally {
      deadline.dispose();
    }
  }

  private async runProviderAnswer(
    input: AiAgentOrchestratorInput,
    decision: RouterDecision,
    caps: AnswerCaps,
    language: ReturnType<typeof detectPromptLanguage>,
    deadline: ProviderDeadline,
    deadlineStartedAt: number,
  ): Promise<AiAgentOrchestrationResult> {
    if (!this.writeStatus(input.stream, 'searching')) {
      return this.abortedResult(input.mode, [], 0);
    }

    const retrieval = this.retrieveKnowledge(decision, caps.knowledgeChunks);

    if (
      input.mode === 'knowledge_only' &&
      decision.intent !== 'knowledge_only' &&
      retrieval.chunks.length === 0
    ) {
      return this.emitPolicyAnswer(
        input,
        policyMessage('knowledgeOnlyLive', language),
        { knowledge: [], data: browseSources(language) },
        false,
      );
    }

    const toolsAllowed =
      caps.toolsEnabled && caps.maxToolRounds > 0 && decision.tools.length > 0;
    const history =
      caps.historyMessages > 0
        ? input.history.slice(-caps.historyMessages)
        : [];

    const promptResult = this.promptBuilder.build({
      message: input.message,
      locale: input.locale,
      responseLanguage: decision.language,
      history,
      knowledge: retrieval,
      tools: toolsAllowed ? decision.tools : [],
      mode: input.mode,
      intent: decision.intent,
    });

    if (!promptResult.ok) {
      this.emitError(
        input.stream,
        'AI_AGENT_INVALID_INPUT',
        policyMessage('messageTooLong', language),
      );
      return this.makeResult({
        mode: input.mode,
        finishReason: 'error',
        errorCode: 'AI_AGENT_INVALID_INPUT',
      });
    }

    const prompt = promptResult.prompt;
    const knowledgeCitations = buildKnowledgeCitationMap(
      prompt.citations,
      language,
    );
    const knowledgeIds = Object.keys(knowledgeCitations);
    const declarations: LlmToolDeclaration[] = toolsAllowed
      ? decision.tools.map(toLlmToolDeclaration)
      : [];
    const declaredTools = new Map(
      toolsAllowed ? decision.tools.map((tool) => [tool.name, tool]) : [],
    );

    let currentInput: LlmTurnInput = stripLeadingSystemSection(prompt.text);
    let estimatedInputTokens = prompt.estimatedInputTokens;
    let currentTools: LlmToolDeclaration[] | undefined =
      declarations.length > 0 ? declarations : undefined;
    let knowledgeInContext = true;
    let interactionId: string | undefined;
    let toolRounds = 0;
    let toolCallCount = 0;
    const executedNames: string[] = [];
    const citableResults: CitableToolResult[] = [];
    const callState: ProviderCallState = { calls: 0, retried: false };
    const totals: UsageTotals = {
      inputTokens: 0,
      outputTokens: 0,
      estimated: false,
    };
    let finalTurn: ProviderTurnResult | undefined;
    let exhaustedRounds = false;

    try {
      while (finalTurn === undefined) {
        if (callState.calls >= AI_AGENT_MAX_PROVIDER_CALLS) {
          exhaustedRounds = true;
          break;
        }
        if (deadline.signal.aborted) {
          throw deadlineError(deadline);
        }

        const request: LlmTurnRequest = {
          systemInstruction: prompt.system,
          input: currentInput,
          ...(currentTools !== undefined ? { tools: currentTools } : {}),
          ...(interactionId !== undefined
            ? { previousInteractionId: interactionId }
            : {}),
          maxOutputTokens: caps.maxOutputTokens,
          timeoutMs: remainingMs(deadlineStartedAt),
          locale: input.locale,
        };

        const attempt: AttemptState = {
          sawText: false,
          sawToolCalls: false,
        };
        const turn = await this.callProviderWithRetry(
          request,
          deadline,
          callState,
          attempt,
          input.signal,
        );

        if (turn.interactionId !== undefined) {
          interactionId = turn.interactionId;
        }
        this.addTurnUsage(totals, turn, estimatedInputTokens);

        if (turn.finishReason === 'tool_calls' && turn.toolCalls.length > 0) {
          // One round by default; two only when configured and the hard cap
          // and provider-call budget both allow it.
          if (
            !toolsAllowed ||
            toolRounds >= caps.maxToolRounds ||
            toolRounds >= AI_AGENT_MAX_TOOL_ROUNDS
          ) {
            exhaustedRounds = true;
            break;
          }

          toolRounds += 1;
          const round = await this.executeToolRound(
            turn.toolCalls,
            declaredTools,
            caps,
            input.stream,
            citableResults.length,
          );
          if (round.aborted) {
            return this.abortedResult(input.mode, executedNames, toolCallCount);
          }

          toolCallCount += round.toolCalls;
          executedNames.push(...round.executedNames);
          citableResults.push(...round.citationResults);

          if (!round.usable) {
            // No usable public data: answer "not found"/"unavailable" now.
            // There is deliberately no extra provider call and no retry.
            const empty = round.reason === 'empty';
            return this.emitPolicyAnswer(
              input,
              policyMessage(empty ? 'notFound' : 'toolUnavailable', language),
              { knowledge: [], data: browseSources(language) },
              true,
              {
                toolCalls: toolCallCount,
                toolNames: uniqueNames(executedNames),
                usage: totals,
              },
            );
          }

          if (callState.calls >= AI_AGENT_MAX_PROVIDER_CALLS) {
            exhaustedRounds = true;
            break;
          }

          const canCallMoreTools =
            toolsAllowed &&
            toolRounds < caps.maxToolRounds &&
            toolRounds < AI_AGENT_MAX_TOOL_ROUNDS &&
            callState.calls + 1 < AI_AGENT_MAX_PROVIDER_CALLS;

          // Without a server-side interaction id the follow-up request only
          // contains function results, so the original knowledge chunks are no
          // longer in the model's context. Drop them from both the instruction
          // and the citation map to avoid validating citations the model could
          // not have grounded in the follow-up turn.
          if (interactionId === undefined) {
            knowledgeInContext = false;
          }

          const instruction = this.buildFollowUpInstruction(
            citableResults,
            knowledgeInContext ? knowledgeIds : [],
            canCallMoreTools,
          );
          currentInput = [
            ...round.functionResults,
            { type: 'text', text: instruction },
          ];
          estimatedInputTokens = estimateTextTokens(
            `${JSON.stringify(round.functionResults)}\n${instruction}`,
          );
          currentTools =
            canCallMoreTools && declarations.length > 0
              ? declarations
              : undefined;
          continue;
        }

        finalTurn = turn;
      }
    } catch (error) {
      return this.handleProviderFailure({
        error,
        input,
        language,
        deadline,
        callState,
        executedNames,
        toolCallCount,
        totals,
      });
    }

    if (finalTurn === undefined) {
      // The round/call caps were reached before the model produced a final
      // answer. Surface a safe local refusal rather than leaking a tool-call
      // preamble or making a fourth provider call.
      return this.emitPolicyAnswer(
        input,
        policyMessage(
          exhaustedRounds ? 'toolUnavailable' : 'internalError',
          language,
        ),
        { knowledge: [], data: browseSources(language) },
        true,
        {
          toolCalls: toolCallCount,
          toolNames: uniqueNames(executedNames),
          usage: totals,
        },
      );
    }

    const answerText = finalTurn.text.trim();
    if (answerText === '') {
      return this.emitPolicyAnswer(
        input,
        policyMessage('toolUnavailable', language),
        { knowledge: [], data: browseSources(language) },
        true,
        {
          toolCalls: toolCallCount,
          toolNames: uniqueNames(executedNames),
          usage: totals,
        },
      );
    }

    const resolved = resolveCitations(answerText, {
      knowledge: knowledgeInContext ? knowledgeCitations : {},
      data: buildDataCitationMap(citableResults, language),
    });
    const plainAnswer = resolved.text
      .replace(CITATION_MARKER_PATTERN, '')
      .trim();

    // A partial MAX_TOKENS answer without a single valid citation, or an answer
    // that reproduces the private system rules (which themselves contain
    // literal `[K1]` markers, so citations alone cannot catch a prompt echo),
    // is replaced by a complete, citation-free refusal.
    if (
      !resolved.hasValidCitations ||
      plainAnswer === '' ||
      containsSystemInstructionLeak(plainAnswer)
    ) {
      return this.emitPolicyAnswer(
        input,
        policyMessage('ungrounded', language),
        { knowledge: [], data: browseSources(language) },
        true,
        {
          toolCalls: toolCallCount,
          toolNames: uniqueNames(executedNames),
          usage: totals,
        },
      );
    }

    const truncated = finalTurn.finishReason === 'length';
    const sources: AiAgentSourcesEvent = {
      knowledge: resolved.knowledge,
      data: resolved.data,
    };

    if (!this.emitSources(input.stream, sources)) {
      return this.abortedResult(
        input.mode,
        uniqueNames(executedNames),
        toolCallCount,
      );
    }

    return this.emitAnswer(
      input,
      resolved.text,
      input.mode,
      totals,
      {
        refusal: false,
        truncated,
        toolCalls: toolCallCount,
        toolNames: uniqueNames(executedNames),
      },
      {
        finishReason: truncated ? 'length' : 'stop',
      },
    );
  }

  private runRetrievalOnly(
    input: AiAgentOrchestratorInput,
    decision: RouterDecision,
    caps: AnswerCaps,
    language: ReturnType<typeof detectPromptLanguage>,
  ): AiAgentOrchestrationResult {
    if (decision.intent === 'live_data') {
      return this.emitPolicyAnswer(
        input,
        policyMessage('retrievalOnlyLive', language),
        { knowledge: [], data: browseSources(language) },
        false,
      );
    }

    if (!this.writeStatus(input.stream, 'searching')) {
      return this.abortedResult(input.mode, [], 0);
    }

    const retrieval = this.retrieveKnowledge(decision, caps.knowledgeChunks);
    const chunks = retrieval.chunks.slice(0, 2);

    if (chunks.length === 0) {
      return this.emitPolicyAnswer(
        input,
        policyMessage('notFound', language),
        { knowledge: [], data: browseSources(language) },
        true,
      );
    }

    const citationMap = buildRetrievalCitationMap(chunks, language);
    const knowledge: AiAgentKnowledgeSource[] = chunks.flatMap(
      (_chunk, index) => {
        const source = citationMap[`K${index + 1}`];
        return source === undefined ? [] : [source];
      },
    );

    const lines = [policyMessage('retrievalIntro', language)];
    chunks.forEach((chunk, index) => {
      lines.push(`- ${extractSnippet(chunk.text, 280)} [K${index + 1}]`);
    });

    const sources: AiAgentSourcesEvent = { knowledge, data: [] };
    if (decision.intent === 'mixed') {
      lines.push('', policyMessage('retrievalOnlyLive', language));
      sources.data = browseSources(language);
    }

    if (!this.emitSources(input.stream, sources)) {
      return this.abortedResult(input.mode, [], 0);
    }

    return this.emitAnswer(
      input,
      lines.join('\n'),
      input.mode,
      zeroUsage(),
      {
        refusal: false,
        truncated: false,
        toolCalls: 0,
        toolNames: [],
      },
      { finishReason: 'stop' },
    );
  }

  private retrieveKnowledge(
    decision: RouterDecision,
    topK: number,
  ): RetrievalResult {
    if (topK <= 0) return emptyRetrieval();
    if (decision.intent !== 'knowledge_only' && decision.intent !== 'mixed') {
      return emptyRetrieval();
    }

    try {
      return this.knowledge.search(decision.knowledgeQuery, decision.language, {
        topK,
      });
    } catch (error) {
      // Retrieval failure means no grounding; it must not crash the turn, but
      // the real cause must still be visible in the operational log.
      this.logFailure('ai_agent_retrieval_failure', error);
      return emptyRetrieval();
    }
  }

  private async executeToolRound(
    calls: readonly LlmScriptedToolCall[],
    declaredTools: ReadonlyMap<string, ToolDescriptor>,
    caps: AnswerCaps,
    stream: SseStream,
    citationOffset: number,
  ): Promise<ToolRoundOutcome> {
    const maxCalls = Math.min(
      MAX_TOOL_CALLS_PER_ROUND,
      Math.max(0, caps.maxToolCalls),
    );
    const prepared = calls.map((call, index) =>
      this.prepareToolCall(call, index, declaredTools, maxCalls),
    );
    const valid = prepared.filter(
      (call): call is PreparedToolCall & { descriptor: ToolDescriptor } =>
        call.descriptor !== undefined,
    );

    for (const call of valid) {
      if (!this.writeStatus(stream, 'tool', call.descriptor.name)) {
        return {
          results: [],
          functionResults: [],
          citationResults: [],
          executedNames: [],
          toolCalls: 0,
          usable: false,
          reason: 'unavailable',
          aborted: true,
        };
      }
    }

    let batchResults: ToolExecutionResult[] = [];
    if (valid.length > 0) {
      try {
        const batch = await this.toolExecutor.executeMany(
          valid.map((call) => ({
            name: call.descriptor.name,
            arguments: call.arguments,
          })),
        );
        batchResults = batch.results;
      } catch (error) {
        this.logFailure('ai_agent_tool_failure', error);
        batchResults = valid.map((call) =>
          failureResult(
            call.descriptor.name,
            'UNAVAILABLE',
            'Tool is temporarily unavailable.',
          ),
        );
      }
    }

    const results: ToolExecutionResult[] = [];
    const functionResults: LlmFunctionResultInput[] = [];
    const citationResults: CitableToolResult[] = [];
    let batchIndex = 0;
    let knownExecutions = 0;
    let knownSuccesses = 0;
    let knownFailures = 0;

    for (const call of prepared) {
      let result: ToolExecutionResult;
      if (call.failure !== undefined) {
        result = call.failure;
      } else {
        result =
          batchResults[batchIndex] ??
          failureResult(
            call.descriptor?.name ?? call.rawName,
            'UNAVAILABLE',
            'Tool is temporarily unavailable.',
          );
        batchIndex += 1;
        knownExecutions += 1;
        if (result.ok) knownSuccesses += 1;
        else knownFailures += 1;
      }

      results.push(result);
      const citationId = `T${citationOffset + results.length}`;
      citationResults.push({ citationId, result });
      functionResults.push({
        type: 'function_result',
        callId: call.callId,
        name: call.descriptor?.name ?? call.rawName,
        result: result.ok
          ? { ok: true, data: result.data }
          : { ok: false, error: result.error },
        isError: !result.ok,
      });
    }

    const usable = results.some(
      (result) => result.ok && hasUsableToolData(result.data),
    );
    const reason: ToolRoundReason = usable
      ? 'usable'
      : knownExecutions > 0 &&
          knownFailures === 0 &&
          knownSuccesses === knownExecutions
        ? 'empty'
        : 'unavailable';

    return {
      results,
      functionResults,
      citationResults,
      executedNames: valid.map((call) => call.descriptor.name),
      toolCalls: valid.length,
      usable,
      reason,
      aborted: false,
    };
  }

  private prepareToolCall(
    call: LlmScriptedToolCall,
    index: number,
    declaredTools: ReadonlyMap<string, ToolDescriptor>,
    maxCalls: number,
  ): PreparedToolCall {
    const rawName = typeof call.name === 'string' ? call.name.slice(0, 64) : '';
    const callId =
      typeof call.callId === 'string' && call.callId.trim() !== ''
        ? call.callId.slice(0, 200)
        : `call_${index + 1}`;
    const args: unknown = call.arguments;

    if (index >= maxCalls) {
      return {
        callId,
        rawName,
        arguments: {},
        failure: failureResult(
          rawName,
          'UNAVAILABLE',
          'The tool call limit for this turn was reached.',
        ),
      };
    }

    const descriptor = declaredTools.get(rawName);
    if (descriptor === undefined) {
      return {
        callId,
        rawName,
        arguments: {},
        failure: failureResult(
          rawName,
          'TOOL_NOT_FOUND',
          'Unknown or unavailable tool.',
        ),
      };
    }

    if (!isRecord(args)) {
      return {
        callId,
        rawName,
        arguments: {},
        failure: failureResult(
          descriptor.name,
          'INVALID_ARGUMENT',
          'Arguments must be an object.',
        ),
      };
    }

    const argumentError = validateToolArguments(descriptor.inputSchema, args);
    if (argumentError !== undefined) {
      return {
        callId,
        rawName,
        arguments: {},
        failure: failureResult(
          descriptor.name,
          'INVALID_ARGUMENT',
          argumentError,
        ),
      };
    }

    return {
      callId,
      rawName,
      arguments: args,
      descriptor,
    };
  }

  private buildFollowUpInstruction(
    citableResults: readonly CitableToolResult[],
    knowledgeIds: readonly string[],
    canCallMoreTools: boolean,
  ): string {
    const lines = [
      'The function results above are the only tool evidence for this turn.',
      'Use only the citation IDs listed below. Do not invent, renumber, or convert IDs.',
      knowledgeIds.length > 0
        ? `Knowledge citations available: ${knowledgeIds.join(', ')}.`
        : 'No knowledge citations are available in this follow-up.',
    ];

    for (const item of citableResults) {
      lines.push(
        `${item.citationId} = ${item.result.tool} (${
          item.result.ok ? 'success' : 'error'
        }).`,
      );
    }

    lines.push(
      'Cite a fact from a successful tool result with its [T#]. Never cite a result marked error.',
    );
    lines.push(
      canCallMoreTools
        ? 'Call another tool only if a required public detail is still missing.'
        : 'This is the final answer turn; do not call tools.',
    );
    return lines.join('\n');
  }

  private async callProviderWithRetry(
    request: LlmTurnRequest,
    deadline: ProviderDeadline,
    state: ProviderCallState,
    attempt: AttemptState,
    callerSignal: AbortSignal,
  ): Promise<ProviderTurnResult> {
    for (;;) {
      if (state.calls >= AI_AGENT_MAX_PROVIDER_CALLS) {
        throw new LlmProviderUnavailableError();
      }
      state.calls += 1;

      try {
        return await this.consumeProviderTurn(request, deadline, attempt);
      } catch (error) {
        const retryable =
          isLlmServerError(error) &&
          !state.retried &&
          state.calls < AI_AGENT_MAX_PROVIDER_CALLS &&
          !attempt.sawText &&
          !attempt.sawToolCalls &&
          !deadline.signal.aborted &&
          !callerSignal.aborted;

        if (!retryable) throw error;

        state.retried = true;
        attempt.sawText = false;
        attempt.sawToolCalls = false;
        await waitForProviderDelay(
          AI_AGENT_TRANSIENT_RETRY_BACKOFF_MS,
          deadline,
        );
      }
    }
  }

  private async consumeProviderTurn(
    request: LlmTurnRequest,
    deadline: ProviderDeadline,
    attempt: AttemptState,
  ): Promise<ProviderTurnResult> {
    throwIfDeadlineExceeded(deadline);

    let interactionId: string | undefined;
    let text = '';
    let usage: LlmUsage | undefined;
    let finish: Extract<LlmStreamEvent, { type: 'finish' }> | undefined;
    const toolCalls: LlmScriptedToolCall[] = [];

    for await (const event of this.provider.streamTurn(
      request,
      deadline.signal,
    )) {
      if (deadline.signal.aborted) throw deadlineError(deadline);

      switch (event.type) {
        case 'interaction':
          interactionId = event.interactionId;
          break;
        case 'text':
          if (text.length < MAX_PROVIDER_TEXT_CHARS) {
            text += event.delta.slice(0, MAX_PROVIDER_TEXT_CHARS - text.length);
          }
          attempt.sawText = true;
          break;
        case 'tool_call':
          toolCalls.push({
            callId: event.callId,
            name: event.name,
            arguments: event.arguments,
          });
          attempt.sawToolCalls = true;
          break;
        case 'usage':
          usage = event.usage;
          break;
        case 'finish':
          finish = event;
          break;
      }

      if (finish !== undefined) break;
    }

    if (finish === undefined) throw new LlmInvalidResponseError();
    if (finish.finishReason === 'error') {
      throw new LlmProviderUnavailableError();
    }
    if (finish.finishReason === 'tool_calls' && toolCalls.length === 0) {
      throw new LlmInvalidResponseError();
    }

    return {
      ...(finish.interactionId !== undefined
        ? { interactionId: finish.interactionId }
        : interactionId !== undefined
          ? { interactionId }
          : {}),
      text,
      toolCalls,
      usage: finish.usage ?? usage,
      finishReason: finish.finishReason,
    };
  }

  private addTurnUsage(
    totals: UsageTotals,
    turn: ProviderTurnResult,
    estimatedInputTokens: number,
  ): void {
    const usage = turn.usage;
    const estimatedOutput = estimateTextTokens(turn.text);

    let input: number | undefined;
    let output: number | undefined;
    if (usage !== undefined) {
      if (
        typeof usage.inputTokens === 'number' &&
        Number.isFinite(usage.inputTokens)
      ) {
        input = Math.max(0, Math.trunc(usage.inputTokens));
      }
      if (
        typeof usage.outputTokens === 'number' &&
        Number.isFinite(usage.outputTokens)
      ) {
        output = Math.max(0, Math.trunc(usage.outputTokens));
      }
    }

    if (input === undefined) {
      input = Math.max(0, Math.trunc(estimatedInputTokens));
      totals.estimated = true;
    }
    if (output === undefined) {
      output = estimatedOutput;
      totals.estimated = true;
    }

    totals.inputTokens += input;
    totals.outputTokens += output;
  }

  private handleProviderFailure(context: {
    error: unknown;
    input: AiAgentOrchestratorInput;
    language: ReturnType<typeof detectPromptLanguage>;
    deadline: ProviderDeadline;
    callState: ProviderCallState;
    executedNames: readonly string[];
    toolCallCount: number;
    totals: UsageTotals;
  }): AiAgentOrchestrationResult {
    const {
      error,
      input,
      language,
      deadline,
      executedNames,
      toolCallCount,
      totals,
    } = context;

    // Client cancellation is a normal stopped outcome, never an error event.
    if (input.signal.aborted || deadline.isCallerAborted()) {
      return this.abortedResult(
        input.mode,
        uniqueNames(executedNames),
        toolCallCount,
      );
    }

    this.logFailure('ai_agent_provider_failure', error);

    // A provider abort caused by the orchestrator's total deadline is a
    // timeout, not a user cancellation.
    if (isLlmAbortError(error)) {
      if (deadline.isTimedOut()) {
        this.emitError(
          input.stream,
          'AI_AGENT_TIMEOUT',
          policyMessage('timeout', language),
        );
        return this.makeResult({
          mode: input.mode,
          finishReason: 'error',
          errorCode: 'AI_AGENT_TIMEOUT',
          inputTokens: totals.inputTokens,
          outputTokens: totals.outputTokens,
          estimated: totals.estimated,
          toolCalls: toolCallCount,
          toolNames: uniqueNames(executedNames),
        });
      }
      return this.abortedResult(
        input.mode,
        uniqueNames(executedNames),
        toolCallCount,
      );
    }

    if (isProviderQuotaError(error)) {
      const cooldown = this.quotaSafeMarkExhausted(
        error.window,
        error.retryAfterSeconds,
      );
      const mode = this.quotaMode(input.mode);
      this.emitError(
        input.stream,
        'AI_AGENT_QUOTA_EXHAUSTED',
        policyMessage('quotaExhausted', language),
        cooldown.retryAfterSeconds,
      );
      return this.makeResult({
        mode,
        finishReason: 'error',
        errorCode: 'AI_AGENT_QUOTA_EXHAUSTED',
        rateLimited: true,
        retryAfterSeconds: cooldown.retryAfterSeconds,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        estimated: totals.estimated,
        toolCalls: toolCallCount,
        toolNames: uniqueNames(executedNames),
      });
    }

    if (isLlmTimeoutError(error) || deadline.isTimedOut()) {
      this.emitError(
        input.stream,
        'AI_AGENT_TIMEOUT',
        policyMessage('timeout', language),
      );
      return this.makeResult({
        mode: input.mode,
        finishReason: 'error',
        errorCode: 'AI_AGENT_TIMEOUT',
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        estimated: totals.estimated,
        toolCalls: toolCallCount,
        toolNames: uniqueNames(executedNames),
      });
    }

    if (isLlmProviderUnavailableError(error)) {
      this.emitError(
        input.stream,
        'AI_AGENT_PROVIDER_UNAVAILABLE',
        policyMessage('providerUnavailable', language),
      );
      return this.makeResult({
        mode: input.mode,
        finishReason: 'error',
        errorCode: 'AI_AGENT_PROVIDER_UNAVAILABLE',
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        estimated: totals.estimated,
        toolCalls: toolCallCount,
        toolNames: uniqueNames(executedNames),
      });
    }

    this.emitError(
      input.stream,
      'AI_AGENT_INTERNAL_ERROR',
      policyMessage('internalError', language),
    );
    return this.makeResult({
      mode: input.mode,
      finishReason: 'error',
      errorCode: 'AI_AGENT_INTERNAL_ERROR',
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      estimated: totals.estimated,
      toolCalls: toolCallCount,
      toolNames: uniqueNames(executedNames),
    });
  }

  private handleUnexpectedFailure(
    input: AiAgentOrchestratorInput,
    language: ReturnType<typeof detectPromptLanguage>,
    deadline: ProviderDeadline,
    error: unknown,
  ): AiAgentOrchestrationResult {
    if (input.signal.aborted || input.stream.isClosed) {
      return this.abortedResult(input.mode, [], 0);
    }

    this.logFailure('ai_agent_unexpected_failure', error);

    if (deadline.isTimedOut()) {
      this.emitError(
        input.stream,
        'AI_AGENT_TIMEOUT',
        policyMessage('timeout', language),
      );
      return this.makeResult({
        mode: input.mode,
        finishReason: 'error',
        errorCode: 'AI_AGENT_TIMEOUT',
      });
    }

    this.emitError(
      input.stream,
      'AI_AGENT_INTERNAL_ERROR',
      policyMessage('internalError', language),
    );
    return this.makeResult({
      mode: input.mode,
      finishReason: 'error',
      errorCode: 'AI_AGENT_INTERNAL_ERROR',
    });
  }

  private emitPolicyAnswer(
    input: AiAgentOrchestratorInput,
    text: string,
    sources: AiAgentSourcesEvent,
    refusal: boolean,
    extra?: {
      toolCalls?: number;
      toolNames?: string[];
      usage?: UsageTotals;
      truncated?: boolean;
      finishReason?: AiAgentFinishReason;
    },
  ): AiAgentOrchestrationResult {
    const toolNames = extra?.toolNames ?? [];
    const toolCalls = extra?.toolCalls ?? 0;

    if (!this.emitSources(input.stream, sources)) {
      return this.abortedResult(input.mode, toolNames, toolCalls);
    }

    return this.emitAnswer(
      input,
      text,
      input.mode,
      extra?.usage ?? zeroUsage(),
      {
        refusal,
        truncated: extra?.truncated ?? false,
        toolCalls,
        toolNames,
      },
      { finishReason: extra?.finishReason ?? 'stop' },
    );
  }

  private emitAnswer(
    input: AiAgentOrchestratorInput,
    text: string,
    mode: AiAgentMode,
    totals: UsageTotals,
    options: EmitOptions,
    final: { finishReason: AiAgentFinishReason },
  ): AiAgentOrchestrationResult {
    let firstTokenAt: number | undefined;

    for (const delta of splitAnswerIntoDeltas(text)) {
      if (input.stream.isClosed) {
        return this.abortedResult(mode, options.toolNames, options.toolCalls);
      }
      if (!input.stream.event('token', { delta })) {
        return this.abortedResult(mode, options.toolNames, options.toolCalls);
      }
      if (firstTokenAt === undefined) firstTokenAt = Date.now();
    }

    return this.makeResult({
      mode,
      finishReason: final.finishReason,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      estimated: totals.estimated,
      toolCalls: options.toolCalls,
      toolNames: options.toolNames,
      refusal: options.refusal,
      truncated: options.truncated,
      ...(firstTokenAt !== undefined ? { firstTokenAt } : {}),
    });
  }

  private emitSources(
    stream: SseStream,
    sources: AiAgentSourcesEvent,
  ): boolean {
    if (sources.knowledge.length === 0 && sources.data.length === 0) {
      return true;
    }
    if (stream.isClosed) return false;
    return stream.event('sources', sources);
  }

  private writeStatus(
    stream: SseStream,
    state: 'searching' | 'thinking' | 'answering' | 'tool',
    tool?: string,
  ): boolean {
    if (stream.isClosed) return false;
    return stream.event('status', {
      state,
      ...(tool !== undefined ? { tool } : {}),
    });
  }

  private emitError(
    stream: SseStream,
    code: AiAgentErrorCode,
    message: string,
    retryAfterSeconds?: number,
  ): void {
    if (stream.isClosed) return;
    stream.event('error', {
      code,
      message,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    });
  }

  private quotaSafeMarkExhausted(
    window: 'minute' | 'day' | undefined,
    retryAfterSeconds: number | undefined,
  ): { retryAfterSeconds?: number } {
    try {
      return this.quota.markProviderQuotaExhausted(
        {
          ...(window !== undefined ? { window } : {}),
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        },
        Date.now(),
      );
    } catch {
      return {};
    }
  }

  private quotaMode(fallback: AiAgentMode): AiAgentMode {
    try {
      return this.quota.getMode();
    } catch {
      return fallback;
    }
  }

  /**
   * Write the real failure to the operational log while the user-facing
   * answer stays a fixed, safe policy message. Error messages and stacks are
   * redacted because database/HTTP errors can echo connection strings or
   * credentials. Message text, prompts, tool payloads, and completions are
   * never included here.
   */
  private logFailure(event: string, error: unknown): void {
    try {
      const record: Record<string, unknown> = {
        event,
        provider: this.config.provider,
        model: this.config.model,
        errorName: error instanceof Error ? error.name : typeof error,
      };

      if (isProviderQuotaError(error)) {
        record.status = 429;
        record.quotaWindow = error.window;
        if (error.retryAfterSeconds !== undefined) {
          record.retryAfterSeconds = error.retryAfterSeconds;
        }
      } else {
        const status = (error as { status?: unknown } | null)?.status;
        if (typeof status === 'number' && Number.isInteger(status)) {
          record.status = status;
        }
      }

      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && code.trim() !== '') {
        record.errorCode = code.trim();
      }

      if (error instanceof Error) {
        const message = redactLogText(error.message);
        if (message !== undefined) record.message = message;
        const stack = redactLogText(error.stack, 2000);
        if (stack !== undefined) record.stack = stack;
      }

      this.logger.error(JSON.stringify(record));
    } catch {
      // Logging must never break the request path.
    }
  }

  private abortedResult(
    mode: AiAgentMode,
    toolNames: string[],
    toolCalls: number,
  ): AiAgentOrchestrationResult {
    return this.makeResult({
      mode,
      finishReason: 'aborted',
      toolCalls,
      toolNames,
    });
  }

  private makeResult(
    partial: Partial<AiAgentOrchestrationResult> &
      Pick<AiAgentOrchestrationResult, 'mode' | 'finishReason'>,
  ): AiAgentOrchestrationResult {
    const inputTokens = partial.inputTokens ?? 0;
    const outputTokens = partial.outputTokens ?? 0;
    return {
      mode: partial.mode,
      finishReason: partial.finishReason,
      inputTokens,
      outputTokens,
      totalTokens: partial.totalTokens ?? inputTokens + outputTokens,
      estimated: partial.estimated ?? false,
      toolCalls: partial.toolCalls ?? 0,
      toolNames: partial.toolNames ?? [],
      refusal: partial.refusal ?? false,
      rateLimited: partial.rateLimited ?? false,
      truncated: partial.truncated ?? false,
      ...(partial.errorCode !== undefined
        ? { errorCode: partial.errorCode }
        : {}),
      ...(partial.firstTokenAt !== undefined
        ? { firstTokenAt: partial.firstTokenAt }
        : {}),
      ...(partial.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: partial.retryAfterSeconds }
        : {}),
    };
  }
}
