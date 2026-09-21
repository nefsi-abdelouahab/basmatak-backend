import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Business error carrying an UPPER_SNAKE code (inventory §0).
 * The global HttpExceptionFilter serializes it as
 * `{ statusCode, code, message, details? }`.
 */
export class BusinessException extends HttpException {
  constructor(
    readonly code: string,
    message?: string,
    status: HttpStatus | number = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    const body: Record<string, unknown> = {
      statusCode: status,
      code,
      message: message ?? code,
    };
    if (details !== undefined) {
      body.details = details;
    }
    super(body, status);
  }
}
