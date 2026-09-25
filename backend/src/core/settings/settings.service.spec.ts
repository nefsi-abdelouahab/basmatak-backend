import { SettingsService } from './settings.service';
import {
  SystemSettingModel,
  SystemSettingsCollection,
  SystemSettingSchema,
} from './system-setting.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../../test/utils/memory-connection';

describe('SettingsService', () => {
  let handle: MemoryConnectionHandle;
  let service: SettingsService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const model = handle.connection.model<SystemSettingModel>(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    service = new SettingsService(model);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(SystemSettingsCollection).deleteMany({});
  });

  it('returns the fallback for a missing key without persisting it', async () => {
    const value = await service.get<number>(
      'publishGate.maxPendingOpportunities',
      3,
    );
    expect(value).toBe(3);
    const count = await handle.connection
      .collection(SystemSettingsCollection)
      .countDocuments();
    expect(count).toBe(0);
  });

  it('upserts a setting and serves it back', async () => {
    await service.set('publishGate.maxPendingOpportunities', 5);
    const value = await service.get<number>(
      'publishGate.maxPendingOpportunities',
    );
    expect(value).toBe(5);

    const doc = await handle.connection
      .collection(SystemSettingsCollection)
      .findOne({ key: 'publishGate.maxPendingOpportunities' });
    expect(doc?.value).toBe(5);
  });

  it('serves a cached value and refreshes after an upsert', async () => {
    await service.set('publishGate.maxPendingOpportunities', 3);
    const first = await service.get<number>(
      'publishGate.maxPendingOpportunities',
    );
    expect(first).toBe(3);

    await service.set('publishGate.maxPendingOpportunities', 8);
    const second = await service.get<number>(
      'publishGate.maxPendingOpportunities',
    );
    expect(second).toBe(8);
  });

  it('ensureDefaults plants publishGate.maxPendingOpportunities = 3', async () => {
    await service.ensureDefaults();
    const value = await service.get<number>(
      'publishGate.maxPendingOpportunities',
    );
    expect(value).toBe(3);
  });

  it('ensureDefaults seeds every canonical key but never overwrites stored values', async () => {
    await service.set('maintenance.enabled', true);
    await service.set('platform.name', 'Custom Name');
    await service.ensureDefaults();
    await service.ensureDefaults();
    expect(await service.get('maintenance.enabled')).toBe(true);
    expect(await service.get('platform.name')).toBe('Custom Name');
    expect(await service.get('ops.publishingEnabled')).toBe(true);
    expect(await service.get('notifications.digest.intervalDays')).toBe(7);
    expect(await service.get('auth.adminSessionDurationDays')).toBe(30);
    const count = await handle.connection
      .collection(SystemSettingsCollection)
      .countDocuments();
    expect(count).toBe(16);
  });
});
