import { validate } from 'class-validator';
import { AdminOpsController } from './ops.controller';
import { MaintenanceToggleDto } from './dto/admin-part-b.dto';
import { MaintenanceService } from '../core/maintenance/maintenance.service';

describe('AdminOpsController', () => {
  it('delegates the toggle to MaintenanceService and returns the state', async () => {
    const maintenance = {
      setState: async (enabled: boolean, message?: string) => ({
        enabled,
        message: message ?? '',
      }),
    } as unknown as MaintenanceService;
    const controller = new AdminOpsController(maintenance);
    const dto = new MaintenanceToggleDto();
    dto.enabled = true;
    dto.message = 'Upgrading search';
    await expect(controller.toggle(dto)).resolves.toEqual({
      enabled: true,
      message: 'Upgrading search',
    });
  });

  it('toggles off without a message', async () => {
    const maintenance = {
      setState: async (enabled: boolean, message?: string) => ({
        enabled,
        message: message ?? '',
      }),
    } as unknown as MaintenanceService;
    const controller = new AdminOpsController(maintenance);
    const dto = new MaintenanceToggleDto();
    dto.enabled = false;
    await expect(controller.toggle(dto)).resolves.toEqual({
      enabled: false,
      message: '',
    });
  });

  it('rejects a non-boolean enabled and an over-long message', async () => {
    const badEnabled = new MaintenanceToggleDto();
    (badEnabled as unknown as Record<string, unknown>).enabled = 'yes';
    expect(
      (await validate(badEnabled)).some((e) => e.property === 'enabled'),
    ).toBe(true);

    const badMessage = new MaintenanceToggleDto();
    badMessage.enabled = true;
    badMessage.message = 'x'.repeat(501);
    expect(
      (await validate(badMessage)).some((e) => e.property === 'message'),
    ).toBe(true);
  });
});
