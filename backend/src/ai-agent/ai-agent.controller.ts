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
import { AiAgentStatusResponse } from './ai-agent.types';
import { AiAgentConfig } from './config/ai-agent.config';
import { ChatDto } from './dto/chat.dto';
import { MockProvider } from './llm/mock.provider';
import { SseWriter } from './sse/sse-writer';

@ApiTags('ai-agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    private readonly sse: SseWriter,
    private readonly mockProvider: MockProvider,
  ) {}

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Public AI assistant status and limits' })
  getStatus(): AiAgentStatusResponse {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
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
    // Kill switch runs before any SSE header is written, so a disabled request
    // still receives the normal JSON error envelope.
    if (!this.config.enabled) {
      throw new BusinessException(
        'AI_AGENT_DISABLED',
        'The assistant is temporarily unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const conversationId = randomUUID();
    const stream = this.sse.start(response);
    const abortController = new AbortController();

    const onAbort = (): void => {
      stream.abort();
      abortController.abort();
    };
    const onResponseClose = (): void => onAbort();

    response.on('close', onResponseClose);
    request.on('aborted', onAbort);

    try {
      const metaWritten = stream.event('meta', {
        conversationId,
        locale: dto.locale,
        mode: this.config.mode,
      });
      if (!metaWritten) {
        abortController.abort();
        return;
      }

      for await (const delta of this.mockProvider.streamAnswer(
        { locale: dto.locale },
        abortController.signal,
      )) {
        if (abortController.signal.aborted || stream.isClosed) break;
        stream.event('token', { delta });
      }

      if (!abortController.signal.aborted && !stream.isClosed) {
        stream.event('done', { finishReason: 'stop' });
      }
    } catch {
      // After the first byte, failures must stay inside the SSE contract.
      if (!abortController.signal.aborted && !stream.isClosed) {
        stream.event('error', {
          code: 'AI_AGENT_INTERNAL_ERROR',
          message: 'The assistant could not complete the response.',
        });
      }
    } finally {
      response.off('close', onResponseClose);
      request.off('aborted', onAbort);
      stream.end();
    }
  }
}
