import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessException } from '../exceptions/business.exception';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { AccountToken, UserRole } from '../interfaces/account-token.interface';

/**
 * Enforces role claims (from `req.token.role`). Routes with no `@Roles`
 * metadata and routes marked `@Public` always pass. The role claim is
 * injected by Session 2's JWT strategy; placeholder for now.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ token?: AccountToken }>();
    const role = request.token?.role;
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
