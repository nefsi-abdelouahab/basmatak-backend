import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import * as mongoose from 'mongoose';
import { ErrorBody } from '../exceptions/error-body.interface';

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

/**
 * Body-parser rejects malformed or oversized payloads before routing. Those
 * errors are not Nest HttpExceptions, so map them explicitly: a client mistake
 * must not surface as a 500, and the fixed message never echoes body content.
 */
function resolveBodyParserError(exception: unknown): ErrorBody | undefined {
  if (!isRecord(exception)) return undefined;
  switch (exception.type) {
    case 'entity.too.large':
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      };
    case 'entity.parse.failed':
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'INVALID_JSON',
        message: 'Malformed JSON body',
      };
    case 'encoding.unsupported':
      return {
        statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Unsupported request encoding',
      };
    default:
      return undefined;
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const body = this.resolveBody(exception);
    response.status(body.statusCode).json(body);
  }

  private resolveBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      if (isRecord(payload) && typeof payload.code === 'string') {
        return {
          statusCode: status,
          code: payload.code,
          message:
            typeof payload.message === 'string'
              ? payload.message
              : String(payload.message ?? payload.code),
          ...(payload.details !== undefined
            ? { details: payload.details }
            : {}),
        };
      }

      if (typeof payload === 'string') {
        return {
          statusCode: status,
          code: DEFAULT_CODES[status] ?? 'HTTP_ERROR',
          message: payload,
        };
      }

      if (isRecord(payload)) {
        const raw = payload.message;
        const message = Array.isArray(raw)
          ? raw.join('; ')
          : String(raw ?? 'request failed');
        return {
          statusCode: status,
          code:
            typeof payload.code === 'string'
              ? payload.code
              : (DEFAULT_CODES[status] ?? 'HTTP_ERROR'),
          message,
        };
      }
    }

    if (exception instanceof mongoose.Error.CastError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'INVALID_ID',
        message: 'Invalid identifier format',
      };
    }

    const bodyParserError = resolveBodyParserError(exception);
    if (bodyParserError !== undefined) {
      return bodyParserError;
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }
}
