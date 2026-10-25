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
import {
  isProviderQuotaError,
  QuotaReservationDenied,
} from './budget/quota.types';
import {
  estimateMessagesTokens,
  estimateTokens,
} from './budget/token-estimator';
import { AiAgentConfig } from './config/ai-agent.config';
import { ChatDto } from './dto/chat.dto';
import { MockProvider } from './llm/mock.provider';
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
  errorCode?: AiAgentErrorCode;
}

@ApiTags('ai-agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    private readonly sse: SseWriter,
    private readonly mockProvider: MockProvider,
    private readonly quota: QuotaService,
    private readonly usage: UsageMeterService,
  ) {}

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Public AI assistant status and limits' })
  getStatus(): AiAgentStatusResponse {
    return {
      enabled: this.config.enabled,
      mode: this.quota.getMode(),
      knowledge: { files: 0, chunks: 0 },
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
  @ApiOperation({ summary: 'Stream a mock assistant answer over SSE' })
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
        toolNames: [],
        inputTokens: usedInputTokens,
        outputTokens: usedOutputTokens,
        totalTokens,
        estimated: input.estimated === true,
        firstTokenMs:
          firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
        latencyMs,
        finishReason: input.finishReason,
        errorCode: input.errorCode,
      });

      if (input.finishReason === 'stop') {
        this.usage.logQuotaThreshold(this.quota.getUtilization(now), now);
      }
    };

    // Validation already ran in the global pipe. The kill switch is checked
    // before any quota state or SSE headers are touched.
    if (!this.config.enabled) {
      finalize({
        mode: this.quota.getMode(),
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

    if (!reservation.allowed) {
      response.setHeader('Retry-After', String(reservation.retryAfterSeconds));
      finalize({
        mode: reservation.mode,
        finishReason: 'error',
        rateLimited: true,
        errorCode: reservation.code,
      });
      throw this.quotaException(reservation);
    }

    const reservationId = reservation.reservationId;
    let stream: SseStream | undefined;
    let abortController: AbortController | undefined;
    let mode = this.quota.getMode();
    let outputText = '';
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

      // Read the mode after the reservation so the meta event reflects the
      // current budget state (the request itself may cross a threshold).
      mode = this.quota.getMode();
      outcome = { mode, finishReason: 'aborted' };

      const metaWritten = stream.event('meta', {
        conversationId,
        locale: dto.locale,
        mode,
      });
      if (!metaWritten) {
        abortController.abort();
        return;
      }

      for await (const delta of this.mockProvider.streamAnswer(
        { locale: dto.locale },
        signal,
      )) {
        if (signal.aborted || stream.isClosed) break;
        if (firstTokenAt === undefined) firstTokenAt = Date.now();
        outputText += delta;
        if (!stream.event('token', { delta })) {
          abortController.abort();
          break;
        }
      }

      if (signal.aborted || stream.isClosed) {
        outcome = { mode, finishReason: 'aborted' };
        return;
      }

      const outputTokens = estimateTokens(outputText).tokens;
      const actualUsage: AiAgentUsage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimated: true,
      };
      const commit = this.quota.commit(reservationId, actualUsage, Date.now());

      if (!commit.committed) {
        outcome = {
          mode,
          finishReason: 'error',
          errorCode: 'AI_AGENT_INTERNAL_ERROR',
        };
        stream.event('error', {
          code: 'AI_AGENT_INTERNAL_ERROR',
          message: 'The assistant could not complete the response.',
        });
        return;
      }

      stream.event('done', {
        finishReason: 'stop',
        usage: actualUsage,
      });
      outcome = {
        mode,
        finishReason: 'stop',
        inputTokens,
        outputTokens,
        estimated: true,
      };
    } catch (error) {
      if (isProviderQuotaError(error)) {
        const cooldown = this.quota.markProviderQuotaExhausted(
          {
            window: error.window,
            retryAfterSeconds: error.retryAfterSeconds,
          },
          Date.now(),
        );
        mode = this.quota.getMode();
        outcome = {
          mode,
          finishReason: 'error',
          rateLimited: true,
          errorCode: 'AI_AGENT_QUOTA_EXHAUSTED',
        };

        if (!stream) {
          throw new BusinessException(
            'AI_AGENT_QUOTA_EXHAUSTED',
            QUOTA_EXHAUSTED_MESSAGE,
            HttpStatus.TOO_MANY_REQUESTS,
            { retryAfterSeconds: cooldown.retryAfterSeconds },
          );
        }

        if (!abortController?.signal.aborted && !stream.isClosed) {
          stream.event('error', {
            code: 'AI_AGENT_QUOTA_EXHAUSTED',
            message: QUOTA_EXHAUSTED_MESSAGE,
            ...(cooldown.retryAfterSeconds !== undefined
              ? { retryAfterSeconds: cooldown.retryAfterSeconds }
              : {}),
          });
        }
      } else if (abortController?.signal.aborted || stream?.isClosed) {
        outcome = { mode, finishReason: 'aborted' };
      } else {
        mode = this.quota.getMode();
        outcome = {
          mode,
          finishReason: 'error',
          errorCode: 'AI_AGENT_INTERNAL_ERROR',
        };

        if (!stream) {
          throw new BusinessException(
            'AI_AGENT_INTERNAL_ERROR',
            'The assistant could not complete the response.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        stream.event('error', {
          code: 'AI_AGENT_INTERNAL_ERROR',
          message: 'The assistant could not complete the response.',
        });
      }
    } finally {
      removeListeners?.();
      // Commit already released the slot on success; release is a no-op then.
      // On every other path this releases the slot exactly once.
      this.quota.release(reservationId, Date.now());
      finalize(outcome);
      stream?.end();
    }
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
