import { ExecutionContext } from '@nestjs/common';
import { MaintenanceGuard } from './maintenance.guard';
import { MaintenanceService } from './maintenance.service';

function contextFor(path: string, role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        user: role ? { role } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function guardWith(state: { enabled: boolean; message: string }) {
  const maintenance = {
    getState: async () => state,
  } as unknown as MaintenanceService;
  return new MaintenanceGuard(maintenance);
}

describe('MaintenanceGuard', () => {
  it('passes everything while maintenance is off', async () => {
    const guard = guardWith({ enabled: false, message: '' });
    await expect(
      guard.canActivate(contextFor('/api/v1/opportunities')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('/api/v1/opportunities', 'volunteer')),
    ).resolves.toBe(true);
  });

  it('rejects public reads with 503 while maintenance is on', async () => {
    const guard = guardWith({ enabled: true, message: '' });
    await expect(
      guard.canActivate(contextFor('/api/v1/opportunities')),
    ).rejects.toMatchObject({ status: 503, code: 'MAINTENANCE_MODE' });
  });

  it('rejects authed volunteer writes with 503 while maintenance is on', async () => {
    const guard = guardWith({ enabled: true, message: '' });
    await expect(
      guard.canActivate(contextFor('/api/v1/applications/abc', 'volunteer')),
    ).rejects.toMatchObject({ status: 503, code: 'MAINTENANCE_MODE' });
  });

  it('includes the stored message in neutral copy', async () => {
    const guard = guardWith({ enabled: true, message: 'Upgrading search' });
    await expect(
      guard.canActivate(contextFor('/api/v1/opportunities')),
    ).rejects.toMatchObject({
      status: 503,
      code: 'MAINTENANCE_MODE',
      message: expect.stringContaining('Upgrading search'),
    });
  });

  it('lets admins through while maintenance is on', async () => {
    const guard = guardWith({ enabled: true, message: '' });
    await expect(
      guard.canActivate(
        contextFor('/api/v1/admin/analytics/overview', 'admin'),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('/api/v1/opportunities', 'admin')),
    ).resolves.toBe(true);
  });

  it('keeps the allowlist reachable while maintenance is on', async () => {
    const guard = guardWith({ enabled: true, message: '' });
    for (const path of [
      '/api/v1/health',
      '/api/v1/system/status',
      '/api/v1/internal/jobs/run',
      '/api/v1/admin/settings',
    ]) {
      await expect(guard.canActivate(contextFor(path))).resolves.toBe(true);
    }
  });
});
