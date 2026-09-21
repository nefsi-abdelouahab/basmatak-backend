import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import { AccountToken } from '../interfaces/account-token.interface';
import { UsersService } from '../../users/users.service';

interface SuspendedRequest {
  user?: AccountToken;
}

/**
 * Rejects requests from accounts whose `users.status` is `suspended`
 * (or `deleted`); allows `active`. Reads the live account via `sub`
 * (design D3) so a status change applies within one request. Runs after
 * JwtAuthGuard, so `req.user` is only present for authenticated callers.
 */
@Injectable()
export class SuspendedGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SuspendedRequest>();
    const account = request.user;
    if (!account?.sub) {
      return true;
    }
    const user = await this.users.findById(account.sub);
    if (!user || user.status === 'deleted') {
      throw new BusinessException(
        'ACCOUNT_INACCESSIBLE',
        'Account is not accessible',
        403,
      );
    }
    if (user.status === 'suspended') {
      throw new BusinessException(
        'ACCOUNT_SUSPENDED',
        'Account is suspended',
        403,
      );
    }
    return true;
  }
}
