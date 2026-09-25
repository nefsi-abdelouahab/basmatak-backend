import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { BusinessException } from '../../common/exceptions/business.exception';
import { IS_PUBLIC_KEY } from '../../common/decorators/auth.decorators';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import { SettingsService } from '../../core/settings/settings.service';
import { UsersService } from '../../users/users.service';

/**
 * EMAIL_VERIFICATION_REQUIRED gate (design D3): when the env flag is true, an
 * authenticated account whose `emailVerifiedAt` is unset is blocked with
 * `EMAIL_NOT_VERIFIED`. The `moderation.requireVerifiedEmail` setting
 * (default true, settings-expansion) can relax the gate at runtime without a
 * restart; it never tightens it beyond the env flag. It runs for every
 * non-public route, so later sessions' publish/apply/submit routes inherit
 * the gate without extra wiring. No such routes exist yet; behavior is pinned
 * by unit test + the gate probe route.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const required =
      String(this.config.get('EMAIL_VERIFICATION_REQUIRED')).toLowerCase() ===
      'true';
    if (!required) {
      return true;
    }
    const flag = await this.settings.get<boolean>(
      'moderation.requireVerifiedEmail',
      true,
    );
    if (flag === false) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AccountToken }>();
    const account = request.user;
    if (!account) {
      return true; // JwtAuthGuard already rejected missing tokens before us.
    }
    const user = await this.users.findById(account.sub);
    if (!user || !user.emailVerifiedAt) {
      throw new BusinessException(
        'EMAIL_NOT_VERIFIED',
        'Email verification is required to access this resource',
        403,
      );
    }
    return true;
  }
}
