import { randomUUID } from 'crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';
import { BusinessException } from '../common/exceptions/business.exception';
import {
  AI_AGENT_CONFIG,
  MAX_HISTORY_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
} from './ai-agent.constants';
import {
  AiAgentErrorCode,
  AiAgentFinishReason,
  AiAgentMode,
  AiAgentStatusResponse,
  AiAgentUsage,
} from './ai-agent.types';
import { QuotaService } from './budget/quota.service';
import { QuotaReservationDenied } from './budget/quota.types';
import { estimateMessagesTokens } from './budget/token-estimator';
import { AiAgentConfig } from './config/ai-agent.config';
import { ChatDto } from './dto/chat.dto';
import { KnowledgeService } from './knowledge/knowledge.service';
import {
  AiAgentOrchestrationResult,
  AiAgentOrchestrator,
} from './orchestrator/ai-agent.orchestrator';
import {
  policyMessage,
  resolveEffectiveMode,
} from './orchestrator/answer-policy';
import { detectPromptLanguage } from './router/intent-router';
import { SseStream, SseWriter } from './sse/sse-writer';
import { UsageMeterService } from './usage/usage-meter.service';

const RATE_LIMITED_MESSAGE =
  'Too many assistant requests. Please try again later.';
const BUSY_MESSAGE = 'The assistant is busy. Please retry shortly.';
const QUOTA_EXHAUSTED_MESSAGE =
  'The assistant has reached its free usage limit. You can still browse opportunities and organizations.';

interface FinalizeInput {
  mode: AiAgentMode;
  finishReason: AiAgentFinishReason | 'aborted';
  inputTokens?: number;
  outputTokens?: number;
  estimated?: boolean;
  rateLimited?: boolean;
  refusal?: boolean;
  toolCalls?: number;
  toolNames?: string[];
  truncated?: boolean;
  errorCode?: AiAgentErrorCode;
}

/**
 * Public chat transport.
 *
 * The controller owns validation, the kill switch, effective-mode selection,
 * quota reservation/commit/release, the SSE lifecycle, and request logging.
 * `AiAgentOrchestrator` owns routing, retrieval, provider/tool calls, citation
 * validation, and the `status` / `sources` / `token` / in-stream `error`
 * events. The controller always writes `meta` first and the final `done` (or no
 * `done` after an abort/error).
 */
@ApiTags('ai-agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    private readonly sse: SseWriter,
    private readonly orchestrator: AiAgentOrchestrator,
    private readonly quota: QuotaService,
    private readonly usage: UsageMeterService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Public AI assistant status and limits' })
  getStatus(): AiAgentStatusResponse {
    return {
      enabled: this.config.enabled,
      mode: this.effectiveMode(this.quota.getMode()),
      knowledge: this.knowledge.getCounts(),
      limits: {
        messageChars: MAX_MESSAGE_CHARS,
        historyMessages: MAX_HISTORY_MESSAGES,
        historyChars: MAX_HISTORY_CHARS,
      },
    };
  }

  @Post('chat')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Stream a grounded assistant answer over SSE' })
  async chat(
    @Body() dto: ChatDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const startedAt = Date.now();
    const conversationId = randomUUID();
    const history = dto.history ?? [];
    const messageChars = dto.message.length;
    const historyMessages = history.length;
    const historyChars = history.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    const inputTokens = estimateMessagesTokens([
      dto.message,
      ...history.map((message) => message.content),
    ]).tokens;

    let firstTokenAt: number | undefined;
    let finalized = false;

    const finalize = (input: FinalizeInput): void => {
      if (finalized) return;
      finalized = true;

      const now = Date.now();
      const usedInputTokens = input.inputTokens ?? 0;
      const usedOutputTokens = input.outputTokens ?? 0;
      const totalTokens = usedInputTokens + usedOutputTokens;
      const latencyMs = now - startedAt;

      this.usage.record(
        {
          latencyMs,
          inputTokens: usedInputTokens,
          outputTokens: usedOutputTokens,
          toolCalls: input.toolCalls ?? 0,
          refusal: input.refusal === true,
          rateLimited: input.rateLimited === true,
        },
        now,
      );
      this.usage.logRequest({
        requestId: conversationId,
        mode: input.mode,
        provider: this.config.provider,
        locale: dto.locale,
        messageChars,
        historyMessages,
        historyChars,
        toolNames: input.toolNames ?? [],
        inputTokens: usedInputTokens,
        outputTokens: usedOutputTokens,
        totalTokens,
        estimated: input.estimated === true,
        firstTokenMs:
          firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
        latencyMs,
        finishReason: input.finishReason,
        ...(input.truncated === true ? { truncated: true } : {}),
        ...(input.errorCode !== undefined
          ? { errorCode: input.errorCode }
          : {}),
      });

      if (input.finishReason === 'stop') {
        this.usage.logQuotaThreshold(this.quota.getUtilization(now), now);
      }
    };

    // Validation already ran in the global pipe. The kill switch is checked
    // before any quota state or SSE headers are touched.
    if (!this.config.enabled) {
      finalize({
        mode: this.effectiveMode(this.quota.getMode()),
        finishReason: 'error',
        errorCode: 'AI_AGENT_DISABLED',
      });
      throw new BusinessException(
        'AI_AGENT_DISABLED',
        'The assistant is temporarily unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const reservation = this.quota.reserve(
      {
        ip: this.clientIp(request),
        estimatedInputTokens: inputTokens,
        maxOutputTokens: this.config.limits.maxOutputTokens,
      },
      startedAt,
    );

    let reservationId: string | undefined;
    let degraded = false;
    let mode: AiAgentMode;

    if (!reservation.allowed) {
      // Hard transport denials and provider cooldowns stay pre-stream JSON.
      const canDegrade =
        reservation.reason === 'mode' || reservation.reason === 'token_budget';
      if (!canDegrade) {
        response.setHeader(
          'Retry-After',
          String(reservation.retryAfterSeconds),
        );
        finalize({
          mode: this.effectiveMode(reservation.mode),
          finishReason: 'error',
          rateLimited: true,
          errorCode: reservation.code,
        });
        throw this.quotaException(reservation);
      }

      // A mode/token denial may still be answered locally from the knowledge
      // corpus. This path deliberately holds no reservation: retrieval-only
      // answers cost no provider tokens, and exhausted answers are fixed text.
      degraded = true;
      mode = resolveEffectiveMode(
        'exhausted',
        this.config.limits.retrievalFallback,
      );
    } else {
      reservationId = reservation.reservationId;
      // Read the mode after reserving so `meta` reflects the current budget.
      mode = this.effectiveMode(this.quota.getMode());
    }

    let stream: SseStream | undefined;
    let abortController: AbortController | undefined;
    let outcome: FinalizeInput = { mode, finishReason: 'aborted' };
    let removeListeners: (() => void) | undefined;

    try {
      stream = this.sse.start(response);
      const activeStream = stream;
      abortController = new AbortController();
      const signal = abortController.signal;

      const onAbort = (): void => {
        activeStream.abort();
        abortController?.abort();
      };
      const onResponseClose = (): void => onAbort();

      response.on('close', onResponseClose);
      request.on('aborted', onAbort);
      removeListeners = (): void => {
        response.off('close', onResponseClose);
        request.off('aborted', onAbort);
      };

      const metaWritten = stream.event('meta', {
        conversationId,
        locale: dto.locale,
        mode,
      });
      if (!metaWritten) {
        abortController.abort();
        return;
      }

      const result = await this.orchestrator.run({
        message: dto.message,
        locale: dto.locale,
        history,
        mode,
        stream,
        signal,
      });
      firstTokenAt = result.firstTokenAt;
      outcome = this.outcomeFromResult(result);

      if (
        result.finishReason === 'aborted' ||
        signal.aborted ||
        stream.isClosed
      ) {
        outcome = {
          ...outcome,
          mode: result.mode,
          finishReason: 'aborted',
        };
        return;
      }

      const actualUsage: AiAgentUsage = {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens,
        estimated: result.estimated,
      };

      let committed = true;
      if (!degraded && reservationId !== undefined) {
        committed = this.quota.commit(
          reservationId,
          actualUsage,
          Date.now(),
        ).committed;
      }

      if (result.finishReason === 'error') {
        // The orchestrator already emitted a localized in-stream `error`. Any
        // real provider usage from earlier calls in the turn is still charged.
        return;
      }

      if (!committed) {
        outcome = {
          mode: result.mode,
          finishReason: 'error',
          errorCode: 'AI_AGENT_INTERNAL_ERROR',
        };
        if (!stream.isClosed) {
          stream.event('error', {
            code: 'AI_AGENT_INTERNAL_ERROR',
            message: policyMessage(
              'internalError',
              detectPromptLanguage(dto.message, dto.locale),
            ),
          });
        }
        return;
      }

      if (!stream.isClosed) {
        stream.event('done', {
          finishReason: result.finishReason,
          ...(result.truncated ? { truncated: true } : {}),
          usage: actualUsage,
        });
      }
    } catch {
      // The orchestrator converts known failures into results. This is the last
      // line of defence for an unexpected controller-side failure.
      mode = this.effectiveMode(this.quota.getMode());
      if (abortController?.signal.aborted || stream?.isClosed) {
        outcome = { mode, finishReason: 'aborted' };
      } else {
        outcome = {
          mode,
          finishReason: 'error',
          errorCode: 'AI_AGENT_INTERNAL_ERROR',
        };
        if (stream) {
          stream.event('error', {
            code: 'AI_AGENT_INTERNAL_ERROR',
            message: policyMessage(
              'internalError',
              detectPromptLanguage(dto.message, dto.locale),
            ),
          });
        }
      }
    } finally {
      removeListeners?.();
      // Commit already released the slot on success; release is a no-op then.
      // On every other path this releases the slot exactly once.
      if (reservationId !== undefined) {
        this.quota.release(reservationId, Date.now());
      }
      finalize(outcome);
      stream?.end();
    }
  }

  private effectiveMode(mode: AiAgentMode): AiAgentMode {
    return resolveEffectiveMode(mode, this.config.limits.retrievalFallback);
  }

  private outcomeFromResult(result: AiAgentOrchestrationResult): FinalizeInput {
    return {
      mode: this.effectiveMode(result.mode),
      finishReason: result.finishReason,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimated: result.estimated,
      rateLimited: result.rateLimited,
      refusal: result.refusal,
      toolCalls: result.toolCalls,
      toolNames: result.toolNames,
      truncated: result.truncated,
      ...(result.errorCode !== undefined
        ? { errorCode: result.errorCode }
        : {}),
    };
  }

  private clientIp(request: Request): string {
    return (
      request.ip?.trim() || request.socket?.remoteAddress?.trim() || 'unknown'
    );
  }

  private quotaException(denial: QuotaReservationDenied): BusinessException {
    const message =
      denial.code === 'RATE_LIMITED'
        ? RATE_LIMITED_MESSAGE
        : denial.code === 'AI_AGENT_BUSY'
          ? BUSY_MESSAGE
          : QUOTA_EXHAUSTED_MESSAGE;

    return new BusinessException(
      denial.code,
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      {
        retryAfterSeconds: denial.retryAfterSeconds,
        reason: denial.reason,
      },
    );
  }
}
