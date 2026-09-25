import { Model } from 'mongoose';
import { validate } from 'class-validator';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { SettingsService } from '../core/settings/settings.service';
import {
  SystemSettingModel,
  SystemSettingsCollection,
  SystemSettingSchema,
} from '../core/settings/system-setting.schema';
import { AdminSettingsService } from './settings.service';
import { SettingsValueDto } from './dto/admin-part-b.dto';

describe('AdminSettingsService (inventory §2.20 settings)', () => {
  let handle: MemoryConnectionHandle;
  let settings: SettingsService;
  let settingModel: Model<SystemSettingModel>;
  let service: AdminSettingsService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    settingModel = handle.connection.model(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    settings = new SettingsService(settingModel);
    service = new AdminSettingsService(settingModel, settings);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(SystemSettingsCollection).deleteMany({});
  });

  it('lists the seeded settings sorted by key', async () => {
    await settings.set('publishGate.maxPendingOpportunities', 3);
    await settings.set('publishGate.enabled', false);

    const rows = await service.list();
    expect(rows.map((r) => r.key)).toEqual([
      'publishGate.enabled',
      'publishGate.maxPendingOpportunities',
    ]);
  });

  it('upserts a known key and the value is immediately served by SettingsService', async () => {
    await service.upsert('publishGate.maxPendingOpportunities', 5);
    const value = await settings.get<number>(
      'publishGate.maxPendingOpportunities',
    );
    expect(value).toBe(5);
    const doc = await handle.connection
      .collection(SystemSettingsCollection)
      .findOne({ key: 'publishGate.maxPendingOpportunities' });
    expect(doc?.value).toBe(5);
  });

  it('updates an existing known key', async () => {
    await service.upsert('publishGate.maxPendingOpportunities', 9);
    await service.upsert('publishGate.maxPendingOpportunities', 2);
    const value = await settings.get<number>(
      'publishGate.maxPendingOpportunities',
    );
    expect(value).toBe(2);
  });

  describe('whitelist surface (400)', () => {
    it('rejects an unknown key', async () => {
      await expect(
        service.upsert('publishGate.maxOrganizationAvatars', 1),
      ).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_SETTING_KEY' });
    });

    it('rejects a non-finite numeric value', async () => {
      await expect(
        service.upsert('publishGate.maxPendingOpportunities', NaN),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_SETTING_VALUE' });
    });
  });

  describe('SettingsValueDto validation (defined-value surface)', () => {
    it('rejects a missing body value', async () => {
      const dto = new SettingsValueDto();
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'value')).toBe(true);
    });

    it('accepts any defined body value (per-key shape is checked by the service)', async () => {
      for (const value of [6, false, 'Basmatak', '']) {
        const dto = new SettingsValueDto();
        (dto as unknown as Record<string, unknown>).value = value;
        expect(await validate(dto)).toHaveLength(0);
      }
    });
  });

  describe('canonical whitelist matrix (16 keys)', () => {
    const valid: Array<[string, unknown]> = [
      ['publishGate.maxPendingOpportunities', 5],
      ['platform.name', 'Basmatak Tatatoua'],
      ['platform.summary', 'National volunteering platform'],
      ['platform.contactEmail', 'contact@example.org'],
      ['platform.contactEmail', ''],
      ['locale.defaultLanguage', 'ar'],
      ['locale.defaultTimezone', 'Africa/Algiers'],
      ['locale.dateFormat', 'YYYY-MM-DD'],
      ['auth.adminSessionDurationDays', 7],
      ['moderation.requireVerifiedEmail', false],
      ['moderation.suspendOnReport', true],
      ['ops.registrationEnabled', false],
      ['ops.publishingEnabled', false],
      ['maintenance.enabled', true],
      ['maintenance.message', 'Upgrading search'],
      ['notifications.digest.enabled', true],
      ['notifications.digest.intervalDays', 10],
    ];
    it.each(valid)('upserts %s', async (key, value) => {
      await service.upsert(key, value);
      expect(await settings.get(key)).toBe(value);
    });

    const invalid: Array<[string, unknown]> = [
      ['publishGate.maxPendingOpportunities', 'lots'],
      ['platform.name', ''],
      ['platform.name', 42],
      ['platform.summary', 'x'.repeat(501)],
      ['platform.contactEmail', 'not-an-email'],
      ['locale.defaultLanguage', 'de'],
      ['locale.defaultTimezone', ''],
      ['locale.dateFormat', 'MM-YYYY'],
      ['auth.adminSessionDurationDays', 0],
      ['auth.adminSessionDurationDays', 1.5],
      ['moderation.requireVerifiedEmail', 'yes'],
      ['ops.registrationEnabled', 1],
      ['maintenance.enabled', 'true'],
      ['maintenance.message', 'x'.repeat(501)],
      ['notifications.digest.enabled', 0],
      ['notifications.digest.intervalDays', 0],
      ['notifications.digest.intervalDays', 7.5],
    ];
    it.each(invalid)('rejects %s=%p', async (key, value) => {
      await expect(service.upsert(key, value)).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_SETTING_VALUE',
      });
      expect(
        await handle.connection
          .collection(SystemSettingsCollection)
          .countDocuments({ key }),
      ).toBe(0);
    });
  });
});
