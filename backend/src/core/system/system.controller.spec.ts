import { SystemController } from './system.controller';
import { MaintenanceService } from '../maintenance/maintenance.service';

describe('SystemController', () => {
  it('returns status, version, uptime and the maintenance state', async () => {
    const maintenance = {
      getState: async () => ({ enabled: true, message: 'Upgrading' }),
    } as unknown as MaintenanceService;
    const controller = new SystemController(maintenance);
    const body = await controller.status();
    expect(body).toEqual({
      status: 'ok',
      version: expect.any(String),
      uptimeSeconds: expect.any(Number),
      maintenance: true,
      message: 'Upgrading',
    });
  });
});
