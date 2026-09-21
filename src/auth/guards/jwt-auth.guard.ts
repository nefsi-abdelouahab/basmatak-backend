import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { BusinessException } from '../../common/exceptions/business.exception';
import { IS_PUBLIC_KEY } from '../../common/decorators/auth.decorators';

/**
 * Global access guard. Replaces S1's AuthPlaceholderGuard: signed JWT in
 * `Authorization: Bearer`, `@Public` routes skip authentication, everything
 * else requires a valid token (401 otherwise) so `req.user` is populated
 * before SuspendedGuard / EmailVerifiedGuard / RolesGuard run.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override handleRequest(err: any, user: any): any {
    if (err || !user) {
      throw new BusinessException(
        'UNAUTHORIZED',
        'Missing or invalid access token',
        401,
      );
    }
    return user;
  }
}
