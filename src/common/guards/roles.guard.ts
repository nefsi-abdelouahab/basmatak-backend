import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessException } from '../exceptions/business.exception';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { AccountToken, UserRole } from '../interfaces/account-token.interface';

/**
 * Enforces role claims from `req.user.role` (set by the JWT strategy).
 * Routes with no `@Roles` metadata and routes marked `@Public` always pass.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || !requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AccountToken }>();
    const role = request.user?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new BusinessException(
        'FORBIDDEN',
        'Insufficient role for this operation',
        403,
      );
    }
    return true;
  }
}
