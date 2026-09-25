import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import { MaintenanceService } from './maintenance.service';

/**
 * Runtime maintenance gate (settings-expansion, Session 13). While canonical
 * `maintenance.enabled` is true, every non-admin request outside the
 * allowlist is rejected `503 MAINTENANCE_MODE` with neutral copy. Allowlist:
 * `GET /health`, `GET /system/status`, `/internal/*`, `/admin/*` (admins keep
 * working during maintenance). Registered after `RolesGuard` so the admin
 * identity is already resolved.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly maintenance: MaintenanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ path?: string; url?: string; user?: AccountToken }>();
    const path = request.path ?? request.url ?? '';
    if (
      path === '/api/v1/health' ||
      path === '/api/v1/system/status' ||
      path.startsWith('/api/v1/internal') ||
      path.startsWith('/api/v1/admin')
    ) {
      return true;
    }
    if (request.user?.role === 'admin') {
      return true;
    }
    const state = await this.maintenance.getState();
    if (!state.enabled) {
      return true;
    }
    const message = state.message
      ? `The platform is temporarily under maintenance: ${state.message}`
      : 'The platform is temporarily under maintenance. Please try again later.';
    throw new BusinessException('MAINTENANCE_MODE', message, 503);
  }
}
