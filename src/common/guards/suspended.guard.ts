import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import { AccountToken } from '../interfaces/account-token.interface';

/**
 * Rejects requests from accounts whose `users.status` is `suspended`
 * (or `deleted`); allows `active`. Applied globally in this session.
 */
@Injectable()
export class SuspendedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ token?: AccountToken }>();
    const token = request.token;

    if (!token || !token.status || token.status === 'active') {
      return true;
    }
    if (token.status === 'suspended') {
      throw new BusinessException(
        'ACCOUNT_SUSPENDED',
        'Account is suspended',
        403,
      );
    }
    throw new BusinessException(
      'ACCOUNT_INACCESSIBLE',
      'Account is not accessible',
      403,
    );
  }
}
