import { Model, Types } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import { SettingsService } from '../core/settings/settings.service';
import {
  SystemSettingModel,
  SystemSettingSchema,
  SystemSettingsCollection,
} from '../core/settings/system-setting.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { DomainEvents } from '../common/constants/domain-events';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import {
  NotificationPrefModel,
  NotificationPrefSchema,
  NotificationPrefsCollection,
} from '../notifications/schemas/notification-pref.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MongoNotificationsRepository } from '../notifications/notifications.repository';
import {
  NotificationModel,
  NotificationSchema,
  NotificationsCollection,
} from '../notifications/schemas/notification.schema';
import {
  ReportModel,
  ReportsCollection,
  ReportSchema,
} from '../reports/report.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  UserModel,
  UsersCollection,
  UserSchema,
} from '../users/schemas/user.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import { ModerationActionsService } from './moderation-actions.service';

const REPORT_PAIRS = [
  ['open', 'in_review'],
  ['open', 'resolved'],
  ['open', 'dismissed'],
  ['in_review', 'resolved'],
  ['in_review', 'dismissed'],
] as const;

const OPPORTUNITY_PAIRS = [
  ['published', 'closed'],
  ['published', 'cancelled'],
  ['in_progress', 'closed'],
  ['in_progress', 'cancelled'],
] as const;

const ACCOUNT_PAIRS = [
  ['active', 'suspended'],
  ['suspended', 'active'],
] as const;

describe('ModerationActionsService (Session 20)', () => {
  let handle: MemoryConnectionHandle;
  let reportModel: Model<ReportModel>;
  let opportunityModel: Model<OpportunityModel>;
  let userModel: Model<UserModel>;
  let organizationModel: Model<OrganizationModel>;
  let historyModel: Model<StatusHistoryModel>;
  let notificationModel: Model<NotificationModel>;
  let settingModel: Model<SystemSettingModel>;
  let service: ModerationActionsService;
  let prefs: NotificationPrefsService;
  let settings: SettingsService;

  const admin: AccountToken = {
    sub: new Types.ObjectId().toString(),
    role: 'admin',
    sessionId: new Types.ObjectId().toString(),
  };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    reportModel = handle.connection.model(ReportsCollection, ReportSchema);
    opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    userModel = handle.connection.model<UserModel>(UsersCollection, UserSchema);
    organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    notificationModel = handle.connection.model(
      NotificationsCollection,
      NotificationSchema,
    );
    const prefModel = handle.connection.model<NotificationPrefModel>(
      NotificationPrefsCollection,
      NotificationPrefSchema,
    );
    settingModel = handle.connection.model<SystemSettingModel>(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    const registry = new StatusTransitionRegistry();
    registry.register('report', REPORT_PAIRS);
    registry.register('opportunity', OPPORTUNITY_PAIRS);
    registry.register('user', ACCOUNT_PAIRS);
    registry.register('organization', ACCOUNT_PAIRS);
    const transitions = new StatusTransitionService(historyModel, registry);
    settings = new SettingsService(settingModel);
    prefs = new NotificationPrefsService(prefModel, settings);
    const repository = new MongoNotificationsRepository(notificationModel);
    const notifications = new NotificationsService(
      notificationModel,
      repository,
      prefs,
    );
    service = new ModerationActionsService(
      handle.connection,
      reportModel,
      opportunityModel,
      userModel,
      organizationModel,
      transitions,
      notifications,
      prefs,
      settings,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    for (const collection of [
      ReportsCollection,
      OpportunitiesCollection,
      UsersCollection,
      OrganizationsCollection,
      StatusHistoryCollection,
      NotificationsCollection,
      NotificationPrefsCollection,
      SystemSettingsCollection,
    ]) {
      await handle.connection.collection(collection).deleteMany({});
    }
  });

  async function seedUser(
    role: 'volunteer' | 'organization' | 'admin' = 'volunteer',
    status: 'active' | 'suspended' | 'deleted' = 'active',
  ) {
    return userModel.create({
      email: `${new Types.ObjectId().toString()}@test.example`,
      passwordHash: 'hash',
      role,
      status,
    });
  }

  async function seedOpportunity(status = 'published') {
    const owner = await seedUser('organization');
    const org = await organizationModel.create({
      userId: owner._id,
      slug: `org-${new Types.ObjectId().toString()}`,
      status: 'active',
    });
    void org;
    return opportunityModel.create({
      organizationId: owner._id,
      slug: `opp-${new Types.ObjectId().toString()}`,
      title: 'Moderated opportunity',
      description: 'Description',
      status,
      positions: [],
    });
  }

  async function seedReport(
    targetType: 'opportunity' | 'user' | 'organization',
    targetId: Types.ObjectId,
    status: 'open' | 'in_review' = 'open',
  ) {
    const reporter = await seedUser();
    return reportModel.create({
      reporterId: reporter._id,
      targetType,
      targetId,
      reason: 'Needs moderation',
      status,
    });
  }

  describe('action-target compatibility', () => {
    it('rejects suspend_target against an opportunity target with 400 and no writes', async () => {
      const opportunity = await seedOpportunity();
      const report = await seedReport('opportunity', opportunity._id);
      await expect(
        service.resolveWithAction(admin, report._id.toString(), {
          status: 'resolved',
          resolution: 'Spam',
          action: { type: 'suspend_target' },
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'INCOMPATIBLE_MODERATION_ACTION',
      });
      expect((await reportModel.findById(report._id).exec())?.status).toBe(
        'open',
      );
      expect(await historyModel.countDocuments({}).exec()).toBe(0);
    });

    it('rejects unpublish_opportunity against a user target with 400', async () => {
      const target = await seedUser();
      const report = await seedReport('user', target._id);
      await expect(
        service.resolveWithAction(admin, report._id.toString(), {
          status: 'resolved',
          resolution: 'Listed',
          action: { type: 'unpublish_opportunity' },
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'INCOMPATIBLE_MODERATION_ACTION',
      });
    });

    it('requires resolved status when an action is present', async () => {
      const opportunity = await seedOpportunity();
      const report = await seedReport('opportunity', opportunity._id);
      await expect(
        service.resolveWithAction(admin, report._id.toString(), {
          status: 'in_review',
          action: { type: 'close_opportunity' },
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'MODERATION_ACTION_REQUIRES_RESOLVED',
      });
    });

    it('requires a resolution reason when an action is present', async () => {
      const opportunity = await seedOpportunity();
      const report = await seedReport('opportunity', opportunity._id);
      await expect(
        service.resolveWithAction(admin, report._id.toString(), {
          status: 'resolved',
          action: { type: 'close_opportunity' },
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'MODERATION_RESOLUTION_REQUIRED',
      });
    });
  });

  describe('atomic unpublish', () => {
    it('resolves the report and closes the opportunity with history rows', async () => {
      const opportunity = await seedOpportunity('published');
      const report = await seedReport('opportunity', opportunity._id);
      const updated = await service.resolveWithAction(
        admin,
        report._id.toString(),
        {
          status: 'resolved',
          resolution: 'Remove from public listing',
          action: { type: 'unpublish_opportunity' },
        },
      );
      expect(updated.status).toBe('resolved');
      expect(updated.resolution).toBe('Remove from public listing');
      expect(
        (await opportunityModel.findById(opportunity._id).exec())?.status,
      ).toBe('closed');
      const histories = await historyModel.find({}).lean().exec();
      expect(histories).toHaveLength(2);
      expect(
        histories.every((h) => h.reason === 'Remove from public listing'),
      ).toBe(true);
    });

    it('rolls back the resolution when the consequence fails', async () => {
      const opportunity = await seedOpportunity('closed');
      const report = await seedReport('opportunity', opportunity._id);
      await expect(
        service.resolveWithAction(admin, report._id.toString(), {
          status: 'resolved',
          resolution: 'Remove from public listing',
          action: { type: 'unpublish_opportunity' },
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await reportModel.findById(report._id).exec())?.status).toBe(
        'open',
      );
      expect(await historyModel.countDocuments({}).exec()).toBe(0);
    });

    it('force-closes an in_progress opportunity via close_opportunity', async () => {
      const opportunity = await seedOpportunity('in_progress');
      const report = await seedReport('opportunity', opportunity._id);
      await service.resolveWithAction(admin, report._id.toString(), {
        status: 'resolved',
        resolution: 'Force close',
        action: { type: 'close_opportunity' },
      });
      expect(
        (await opportunityModel.findById(opportunity._id).exec())?.status,
      ).toBe('closed');
    });
  });

  describe('suspend_target', () => {
    it('suspends a user target with the resolution as reason', async () => {
      const target = await seedUser('volunteer', 'active');
      const report = await seedReport('user', target._id);
      await service.resolveWithAction(admin, report._id.toString(), {
        status: 'resolved',
        resolution: 'Repeated abuse',
        action: { type: 'suspend_target' },
      });
      expect((await userModel.findById(target._id).exec())?.status).toBe(
        'suspended',
      );
      const history = await historyModel
        .findOne({ entityType: 'user' })
        .lean()
        .exec();
      expect(history).toMatchObject({
        from: 'active',
        to: 'suspended',
        reason: 'Repeated abuse',
      });
    });

    it('suspends an organization target', async () => {
      const owner = await seedUser('organization');
      const org = await organizationModel.create({
        userId: owner._id,
        slug: `org-${new Types.ObjectId().toString()}`,
        status: 'active',
      });
      const report = await seedReport('organization', org._id);
      await service.resolveWithAction(admin, report._id.toString(), {
        status: 'resolved',
        resolution: 'Policy violation',
        action: { type: 'suspend_target' },
      });
      expect((await organizationModel.findById(org._id).exec())?.status).toBe(
        'suspended',
      );
    });
  });

  describe('policy-default suspension (O1)', () => {
    it('suspends user targets by default when the flag is on', async () => {
      await settings.set('moderation.suspendOnReport', true);
      const target = await seedUser('volunteer', 'active');
      const report = await seedReport('user', target._id);
      await service.resolveWithAction(admin, report._id.toString(), {
        status: 'resolved',
        resolution: 'Policy default',
      });
      expect((await userModel.findById(target._id).exec())?.status).toBe(
        'suspended',
      );
    });

    it('resolves plainly when the flag is off', async () => {
      await settings.set('moderation.suspendOnReport', false);
      const target = await seedUser('volunteer', 'active');
      const report = await seedReport('user', target._id);
      const updated = await service.resolveWithAction(
        admin,
        report._id.toString(),
        { status: 'resolved', resolution: 'Plain resolution' },
      );
      expect(updated.status).toBe('resolved');
      expect((await userModel.findById(target._id).exec())?.status).toBe(
        'active',
      );
    });
  });

  describe('notice delivery', () => {
    it('delivers a composite notice inside the transaction', async () => {
      const noticee = await seedUser();
      const target = await seedUser();
      const report = await seedReport('user', target._id);
      await service.resolveWithAction(admin, report._id.toString(), {
        status: 'resolved',
        resolution: 'Heads up',
        action: {
          type: 'notice',
          payload: { userId: noticee._id.toString(), message: 'Hello' },
        },
      });
      const rows = await notificationModel
        .find({ userId: noticee._id })
        .lean()
        .exec();
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe(DomainEvents.AdminNotice);
      expect(rows[0].payload).toMatchObject({ message: 'Hello' });
    });

    it('suppresses the notice when the system pref is off but still resolves', async () => {
      const noticee = await seedUser();
      await prefs.patchOwn(noticee._id.toString(), { system: false });
      const target = await seedUser();
      const report = await seedReport('user', target._id);
      const updated = await service.resolveWithAction(
        admin,
        report._id.toString(),
        {
          status: 'resolved',
          resolution: 'Quiet resolution',
          action: {
            type: 'notice',
            payload: { userId: noticee._id.toString(), message: 'Hello' },
          },
        },
      );
      expect(updated.status).toBe('resolved');
      expect(
        await notificationModel.countDocuments({ userId: noticee._id }).exec(),
      ).toBe(0);
    });

    it('keeps distinct notices as distinct rows', async () => {
      const noticee = await seedUser();
      await service.sendNotice(noticee._id.toString(), 'First');
      await service.sendNotice(noticee._id.toString(), 'Second');
      expect(
        await notificationModel.countDocuments({ userId: noticee._id }).exec(),
      ).toBe(2);
    });

    it('standalone notice reports suppression without error', async () => {
      const noticee = await seedUser();
      await prefs.patchOwn(noticee._id.toString(), { system: false });
      await expect(
        service.sendNotice(noticee._id.toString(), 'Muted'),
      ).resolves.toEqual({ delivered: false });
      expect(
        await notificationModel.countDocuments({ userId: noticee._id }).exec(),
      ).toBe(0);
    });
  });
});
