import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../../test/utils/memory-connection';
import { SettingsService } from '../settings/settings.service';
import {
  SystemSettingModel,
  SystemSettingsCollection,
  SystemSettingSchema,
} from '../settings/system-setting.schema';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  let handle: MemoryConnectionHandle;
  let settings: SettingsService;
  let service: MaintenanceService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const settingModel = handle.connection.model<SystemSettingModel>(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    settings = new SettingsService(settingModel);
    service = new MaintenanceService(settings);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(SystemSettingsCollection).deleteMany({});
  });

  it('defaults to disabled with an empty message', async () => {
    await expect(service.getState()).resolves.toEqual({
      enabled: false,
      message: '',
    });
    await expect(service.isEnabled()).resolves.toBe(false);
  });

  it('round-trips enabled + message through the canonical keys', async () => {
    await expect(service.setState(true, 'Upgrading search')).resolves.toEqual({
      enabled: true,
      message: 'Upgrading search',
    });
    expect(await settings.get('maintenance.enabled')).toBe(true);
    expect(await settings.get('maintenance.message')).toBe('Upgrading search');
  });

  it('keeps the previous message when toggling without one', async () => {
    await service.setState(true, 'Upgrading search');
    await expect(service.setState(false)).resolves.toEqual({
      enabled: false,
      message: 'Upgrading search',
    });
  });

  it('single-flight: concurrent toggles execute the write exactly once', async () => {
    let writes = 0;
    const stub = {
      get: async () => undefined,
      set: async () => {
        writes += 1;
      },
    };
    const singleFlight = new MaintenanceService(
      stub as unknown as SettingsService,
    );
    const [first, second] = await Promise.all([
      singleFlight.setState(true),
      singleFlight.setState(false),
    ]);
    expect(first).toEqual(second);
    expect(writes).toBe(1);
  });

  it('tolerates non-boolean/non-string stored values', async () => {
    await settings.set('maintenance.enabled', 'yes');
    await settings.set('maintenance.message', 42);
    await expect(service.getState()).resolves.toEqual({
      enabled: false,
      message: '',
    });
  });
});
