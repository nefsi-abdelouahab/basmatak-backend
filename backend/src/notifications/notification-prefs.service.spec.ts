import { Model, Types } from 'mongoose';
import { SettingsService } from '../core/settings/settings.service';
import {
  SystemSettingModel,
  SystemSettingsCollection,
  SystemSettingSchema,
} from '../core/settings/system-setting.schema';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import { DomainEvents } from '../common/constants/domain-events';
import { MongoNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import {
  DIGEST_ENABLED_KEY,
  DIGEST_INTERVAL_DAYS_KEY,
  NotificationPrefsService,
} from './notification-prefs.service';
import {
  NotificationPrefModel,
  NotificationPrefsCollection,
  NotificationPrefSchema,
} from './schemas/notification-pref.schema';
import {
  NotificationModel,
  NotificationsCollection,
  NotificationSchema,
} from './schemas/notification.schema';

const ALL_DEFAULTS = {
  applicationUpdates: true,
  reviews: true,
  verification: true,
  system: true,
  digest: true,
  recordIssued: true,
};

describe('NotificationPrefsService (S3)', () => {
  let handle: MemoryConnectionHandle;
  let prefModel: Model<NotificationPrefModel>;
  let settingModel: Model<SystemSettingModel>;
  let settings: SettingsService;
  let service: NotificationPrefsService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    prefModel = handle.connection.model<NotificationPrefModel>(
      NotificationPrefsCollection,
      NotificationPrefSchema,
    );
    settingModel = handle.connection.model<SystemSettingModel>(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    await prefModel.init();
    settings = new SettingsService(settingModel);
    service = new NotificationPrefsService(prefModel, settings);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await prefModel.deleteMany({});
    await settingModel.deleteMany({});
  });

  describe('5.1 get-or-create', () => {
    it('lazily creates a row with all six defaults on first read', async () => {
      const userId = new Types.ObjectId().toString();
      const prefs = await service.getOwn(userId);

      expect(prefs).toEqual(ALL_DEFAULTS);
      const row = await prefModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .lean()
        .exec();
      expect(row?.prefs).toEqual(ALL_DEFAULTS);
    });

    it('returns the stored values once a row exists (not defaults)', async () => {
      const userId = new Types.ObjectId().toString();
      await service.patchOwn(userId, {
        reviews: false,
        recordIssued: false,
      });

      const prefs = await service.getOwn(userId);
      expect(prefs).toEqual({
        ...ALL_DEFAULTS,
        reviews: false,
        recordIssued: false,
      });
    });

    it('swallows a concurrent duplicate-key create and returns defaults', async () => {
      const userId = new Types.ObjectId().toString();
      const spy = jest.spyOn(prefModel, 'create').mockRejectedValueOnce({
        code: 11000,
        name: 'MongoServerError',
      } as never);

      const prefs = await service.getOwn(userId);
      spy.mockRestore();

      expect(prefs).toEqual(ALL_DEFAULTS);
      const row = await prefModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .lean()
        .exec();
      expect(row).toBeNull();
    });

    it('concurrent first reads converge on exactly one row (unique userId index)', async () => {
      const userId = new Types.ObjectId().toString();
      await Promise.all([service.getOwn(userId), service.getOwn(userId)]);

      const count = await prefModel
        .countDocuments({ userId: new Types.ObjectId(userId) })
        .exec();
      expect(count).toBe(1);
    });
  });

  describe('5.1 patchOwn', () => {
    it('merges only the provided keys and returns the full merged prefs', async () => {
      const userId = new Types.ObjectId().toString();
      const merged = await service.patchOwn(userId, {
        verification: false,
        digest: false,
      });

      expect(merged).toEqual({
        ...ALL_DEFAULTS,
        verification: false,
        digest: false,
      });
      const row = await prefModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .lean()
        .exec();
      expect(row?.prefs).toEqual({
        ...ALL_DEFAULTS,
        verification: false,
        digest: false,
      });
    });

    it('creates the row lazily then merges (get-or-create then patch)', async () => {
      const userId = new Types.ObjectId().toString();
      const merged = await service.patchOwn(userId, { system: false });

      expect(merged).toEqual({ ...ALL_DEFAULTS, system: false });
      const row = await prefModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .lean()
        .exec();
      expect(row).toBeDefined();
      expect(row?.prefs.system).toBe(false);
      expect(row?.prefs.applicationUpdates).toBe(true);
    });

    it('an empty patch returns the stored prefs unchanged', async () => {
      const userId = new Types.ObjectId().toString();
      await service.patchOwn(userId, { digest: false });
      const merged = await service.patchOwn(userId, {});

      expect(merged).toEqual({ ...ALL_DEFAULTS, digest: false });
    });
  });

  describe('5.2 prefsForType mapping', () => {
    it('maps every application/participation event to applicationUpdates', () => {
      for (const event of [
        DomainEvents.ApplicationCreated,
        DomainEvents.ApplicationAccepted,
        DomainEvents.ApplicationRejected,
        DomainEvents.ApplicationWithdrawn,
        DomainEvents.ParticipationRemoved,
        DomainEvents.ParticipationWithdrawn,
        DomainEvents.OpportunityCancelled,
        DomainEvents.OpportunityStarted,
      ]) {
        expect(service.prefsForType(event)).toBe('applicationUpdates');
      }
    });

    it('maps every verification and submission event to verification', () => {
      for (const event of [
        DomainEvents.OrgVerificationUpdated,
        DomainEvents.SubmissionSubmitted,
        DomainEvents.SubmissionVerified,
        DomainEvents.SubmissionRejected,
      ]) {
        expect(service.prefsForType(event)).toBe('verification');
      }
    });

    it('maps publish-gate.locked to system', () => {
      expect(service.prefsForType(DomainEvents.PublishGateLocked)).toBe(
        'system',
      );
    });

    it('defaults an unknown event to applicationUpdates', () => {
      expect(service.prefsForType('future.unmapped.event')).toBe(
        'applicationUpdates',
      );
    });
  });

  describe('4.1 digest setting provider (flag-only)', () => {
    function freshService(): NotificationPrefsService {
      return new NotificationPrefsService(
        prefModel,
        new SettingsService(settingModel),
      );
    }

    it('isDigestEnabled defaults false and tolerates non-boolean stored values', async () => {
      expect(await freshService().isDigestEnabled()).toBe(false);

      await settings.set(DIGEST_ENABLED_KEY, 'yes');
      expect(await freshService().isDigestEnabled()).toBe(false);

      await settings.set(DIGEST_ENABLED_KEY, true);
      expect(await freshService().isDigestEnabled()).toBe(true);
    });

    it('digestIntervalDays defaults 7 and tolerates non-numeric stored values', async () => {
      expect(await freshService().digestIntervalDays()).toBe(7);

      await settings.set(DIGEST_INTERVAL_DAYS_KEY, '4');
      expect(await freshService().digestIntervalDays()).toBe(7);

      await settings.set(DIGEST_INTERVAL_DAYS_KEY, 10);
      expect(await freshService().digestIntervalDays()).toBe(10);
    });

    it('ensureDigestSettings seeds both keys idempotently when absent', async () => {
      await freshService().ensureDigestSettings();
      await freshService().ensureDigestSettings();

      expect(await freshService().isDigestEnabled()).toBe(false);
      expect(await freshService().digestIntervalDays()).toBe(7);
      const rows = await settingModel
        .find({ key: /^notifications\.digest\./ })
        .lean()
        .exec();
      expect(rows).toHaveLength(2);
    });

    it('ensureDigestSettings does not overwrite an existing value', async () => {
      await settings.set(DIGEST_ENABLED_KEY, true);
      await freshService().ensureDigestSettings();

      expect(await freshService().isDigestEnabled()).toBe(true);
    });
  });
});

describe('createForRecipientIfEnabled gating (S3, task 5.3)', () => {
  let handle: MemoryConnectionHandle;
  let notificationModel: Model<NotificationModel>;
  let service: NotificationsService;
  let prefs: NotificationPrefsService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    notificationModel = handle.connection.model<NotificationModel>(
      NotificationsCollection,
      NotificationSchema,
    );
    const prefModel = handle.connection.model<NotificationPrefModel>(
      NotificationPrefsCollection,
      NotificationPrefSchema,
    );
    await notificationModel.init();
    await prefModel.init();
    const settings = new SettingsService(
      handle.connection.model<SystemSettingModel>(
        SystemSettingsCollection,
        SystemSettingSchema,
      ),
    );
    prefs = new NotificationPrefsService(prefModel, settings);
    const repository = new MongoNotificationsRepository(notificationModel);
    service = new NotificationsService(notificationModel, repository, prefs);
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await notificationModel.deleteMany({});
  });

  it('creates a notification when no prefs row exists (defaults-on)', async () => {
    const recipient = new Types.ObjectId().toString();
    await service.createForRecipientIfEnabled(
      recipient,
      DomainEvents.ApplicationAccepted,
      { application: { _id: new Types.ObjectId(), volunteerId: recipient } },
    );

    expect(
      await notificationModel
        .countDocuments({ userId: new Types.ObjectId(recipient) })
        .exec(),
    ).toBe(1);
  });

  it('skips the write when the mapped pref type is disabled', async () => {
    const recipient = new Types.ObjectId().toString();
    await prefs.patchOwn(recipient, { verification: false });

    await service.createForRecipientIfEnabled(
      recipient,
      DomainEvents.SubmissionVerified,
      { submission: { _id: new Types.ObjectId(), volunteerId: recipient } },
    );

    expect(
      await notificationModel
        .countDocuments({ userId: new Types.ObjectId(recipient) })
        .exec(),
    ).toBe(0);
  });

  it('creates the notification when the mapped pref type is enabled', async () => {
    const recipient = new Types.ObjectId().toString();
    await prefs.patchOwn(recipient, { verification: false });
    await prefs.patchOwn(recipient, { verification: true });

    await service.createForRecipientIfEnabled(
      recipient,
      DomainEvents.SubmissionVerified,
      { submission: { _id: new Types.ObjectId(), volunteerId: recipient } },
    );

    expect(
      await notificationModel
        .countDocuments({ userId: new Types.ObjectId(recipient) })
        .exec(),
    ).toBe(1);
  });

  it('createInSession is unaffected by prefs (transactional path ungated)', async () => {
    const recipient = new Types.ObjectId().toString();
    await prefs.patchOwn(recipient, { applicationUpdates: false });

    const session = await handle.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await service.createInSession(
          {
            recipientId: new Types.ObjectId(recipient),
            type: DomainEvents.ApplicationAccepted,
            payload: { applicationId: new Types.ObjectId().toString() },
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }

    expect(
      await notificationModel
        .countDocuments({ userId: new Types.ObjectId(recipient) })
        .exec(),
    ).toBe(1);
  });
});
