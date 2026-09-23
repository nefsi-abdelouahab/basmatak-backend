import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';

/**
 * Guards `POST /api/v1/internal/jobs/run` with `X-Jobs-Key`, compared in
 * constant time against the `JOBS_KEY` env var (inventory §2.21). Both sides
 * are SHA-256-hashed first so the comparison is always over equal-length
 * digests and leaks neither key content nor key length (S19 hardening).
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

    const raw = request.header('X-Jobs-Key');
    const provided = Array.isArray(raw) ? raw.join(',') : raw;
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
    const aBuf = createHash('sha256').update(a, 'utf8').digest();
    const bBuf = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(aBuf, bBuf);
  }
}
