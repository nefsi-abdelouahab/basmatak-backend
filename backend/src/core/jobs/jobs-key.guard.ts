import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';

/**
 * Guards `POST /api/v1/internal/jobs/run` with `X-Jobs-Key`, compared in
 * constant time against the `JOBS_KEY` env var (inventory §2.21).
 */
@Injectable()
export class JobsKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = this.config.get<string>('JOBS_KEY');

    if (!secret) {
      throw new BusinessException(
        'JOBS_KEY_MISSING',
        'JOBS_KEY is not configured on the server',
        500,
      );
    }

    const provided = request.header('X-Jobs-Key');
    if (!provided || !this.safeEqual(secret, provided)) {
      throw new BusinessException(
        'UNAUTHORIZED',
        'Invalid or missing X-Jobs-Key header',
        401,
      );
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  }
}
