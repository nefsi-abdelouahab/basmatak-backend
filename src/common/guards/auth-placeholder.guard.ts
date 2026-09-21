import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AccountToken } from '../interfaces/account-token.interface';

/**
 * Seam: injects a deterministic `req.token` placeholder so guards, decorators
 * and controllers work before Session 2 wires the real JWT strategy.
 * Session 2 replaces this guard with the JwtAuthGuard.
 */
@Injectable()
export class AuthPlaceholderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ token?: AccountToken; originalTokenValue?: unknown }>();
    request.token ??= {
      sub: '000000000000000000000000',
      role: 'volunteer',
      sessionId: 'placeholder-session',
      status: 'active',
    };
    return true;
  }
}
