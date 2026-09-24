import { Model, Types } from 'mongoose';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import {
  ApplicationModel,
  ApplicationSchema,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import { SettingsService } from '../core/settings/settings.service';
import {
  SystemSettingModel,
  SystemSettingSchema,
  SystemSettingsCollection,
} from '../core/settings/system-setting.schema';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationSchema,
  OrganizationVerificationsCollection,
} from '../organizations/schemas/organization-verification.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  ReportModel,
  ReportSchema,
  ReportsCollection,
} from '../reports/report.schema';
import {
  SubmissionModel,
  SubmissionSchema,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  TaskParticipantModel,
  TaskParticipantSchema,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import {
  VerificationModel,
  VerificationSchema,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import {
  VolunteerProfileModel,
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  AdminAnalyticsService,
  median,
  normalizeSeriesDays,
  toDeltaCount,
  toUtcDayKey,
} from './analytics.service';
import { AdminStatsService } from './stats.service';

const DAY_MS = 24 * 3_600_000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

describe('analytics pure helpers', () => {
  it('toDeltaCount returns null deltaPercent when previous is 0', () => {
    expect(toDeltaCount(5, 0)).toEqual({
      current: 5,
      previous: 0,
      deltaPercent: null,
    });
  });

  it('toDeltaCount computes the signed percentage change', () => {
    expect(toDeltaCount(15, 10).deltaPercent).toBe(50);
    expect(toDeltaCount(5, 10).deltaPercent).toBe(-50);
  });

  it('median averages the two middle values on even length', () => {
    expect(median([])).toBeNull();
    expect(median([4])).toBe(4);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('toUtcDayKey buckets in UTC', () => {
    expect(toUtcDayKey(new Date('2026-09-24T23:30:00Z'))).toBe('2026-09-24');
  });

  it('normalizeSeriesDays clamps to 1–90 with a 30-day default', () => {
    expect(normalizeSeriesDays(undefined)).toBe(30);
    expect(normalizeSeriesDays(Number.NaN)).toBe(30);
    expect(normalizeSeriesDays(0)).toBe(1);
    expect(normalizeSeriesDays(91)).toBe(90);
    expect(normalizeSeriesDays(7)).toBe(7);
  });
});

describe('AdminAnalyticsService (Session 8)', () => {
  let handle: MemoryConnectionHandle;
  let service: AdminAnalyticsService;
  let userModel: Model<UserModel>;
  let organizationModel: Model<OrganizationModel>;
  let orgVerificationModel: Model<OrganizationVerificationModel>;
  let opportunityModel: Model<OpportunityModel>;
  let applicationModel: Model<ApplicationModel>;
  let participantModel: Model<TaskParticipantModel>;
  let submissionModel: Model<SubmissionModel>;
  let verificationModel: Model<VerificationModel>;
  let reportModel: Model<ReportModel>;
  let historyModel: Model<StatusHistoryModel>;
  let settings: SettingsService;

  const ALL = [
    UsersCollection,
    OrganizationsCollection,
    OrganizationVerificationsCollection,
    VolunteerProfilesCollection,
    OpportunitiesCollection,
    ApplicationsCollection,
    TaskParticipantsCollection,
    SubmissionsCollection,
    VerificationsCollection,
    ReportsCollection,
    StatusHistoryCollection,
    SystemSettingsCollection,
  ];

  beforeAll(async () => {
    handle = await startMemoryConnection();
    userModel = handle.connection.model(UsersCollection, UserSchema);
    organizationModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    orgVerificationModel = handle.connection.model(
      OrganizationVerificationsCollection,
      OrganizationVerificationSchema,
    );
    opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    applicationModel = handle.connection.model(
      ApplicationsCollection,
      ApplicationSchema,
    );
    participantModel = handle.connection.model(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    submissionModel = handle.connection.model(
      SubmissionsCollection,
      SubmissionSchema,
    );
    verificationModel = handle.connection.model(
      VerificationsCollection,
      VerificationSchema,
    );
    reportModel = handle.connection.model(ReportsCollection, ReportSchema);
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    const volunteerModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    const settingModel = handle.connection.model<SystemSettingModel>(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    settings = new SettingsService(settingModel);
    const stats = new AdminStatsService(
      userModel,
      organizationModel,
      orgVerificationModel,
      volunteerModel,
      opportunityModel,
      submissionModel,
      settings,
    );
    service = new AdminAnalyticsService(
      userModel,
      organizationModel,
      orgVerificationModel,
      opportunityModel,
      applicationModel,
      participantModel,
      submissionModel,
      verificationModel,
      reportModel,
      historyModel,
      settings,
      stats,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    const db = handle.connection.db!;
    for (const collection of ALL) {
      await db.dropCollection(collection).catch(() => undefined);
    }
  });

  async function seedUser(
    role: 'volunteer' | 'organization' | 'admin' = 'volunteer',
    status: 'active' | 'suspended' | 'deleted' = 'active',
    createdAt = daysAgo(10),
  ): Promise<UserModel> {
    return userModel.create({
      email: `${role}-${new Types.ObjectId()}@example.com`,
      passwordHash: 'hash',
      role,
      status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function seedOrg(
    status: 'active' | 'suspended' | 'deleted' = 'active',
    verificationStatus: 'pending' | 'verified' | 'rejected' = 'pending',
    createdAt = daysAgo(10),
  ): Promise<OrganizationModel> {
    const owner = await seedUser('organization', 'active', createdAt);
    return organizationModel.create({
      userId: owner._id,
      slug: `org-${new Types.ObjectId()}`,
      verificationStatus,
      status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function seedOpportunity(
    organizationId: Types.ObjectId,
  ): Promise<OpportunityModel> {
    return opportunityModel.create({
      organizationId,
      slug: `opp-${new Types.ObjectId()}`,
      title: 'T',
      description: 'D',
      status: 'published',
      positions: [],
    });
  }

  async function seedApplication(
    volunteerId: Types.ObjectId,
    organizationId: Types.ObjectId,
    opportunityId: Types.ObjectId,
    createdAt = daysAgo(10),
  ): Promise<ApplicationModel> {
    return applicationModel.create({
      opportunityId,
      positionId: new Types.ObjectId(),
      volunteerId,
      organizationId,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function seedSubmission(
    volunteerId: Types.ObjectId,
    organizationId: Types.ObjectId,
    opportunityId: Types.ObjectId,
    status = 'submitted',
    createdAt = daysAgo(10),
  ): Promise<SubmissionModel> {
    return submissionModel.create({
      participantId: new Types.ObjectId(),
      opportunityId,
      positionId: new Types.ObjectId(),
      organizationId,
      volunteerId,
      deliverables: [],
      consentConfirmed: true,
      evidence: [],
      status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  it('returns zeroed metrics on an empty database', async () => {
    const overview = await service.getOverview(new Date());
    for (const total of Object.values(overview.totals)) {
      expect(total).toEqual({ current: 0, previous: 0, deltaPercent: null });
    }
    expect(overview.activeParticipants).toBe(0);
    expect(overview.verificationReady).toEqual({
      total: 0,
      byOrganization: [],
    });
    expect(overview.gateFreezes).toBe(0);
    expect(overview.medianDecisionHours).toBeNull();
  });

  it('computes deltas over the 30d vs 31–60d windows', async () => {
    await seedUser('volunteer', 'active', daysAgo(10));
    await seedUser('volunteer', 'active', daysAgo(10));
    await seedUser('volunteer', 'active', daysAgo(40));
    await seedUser('volunteer', 'active', daysAgo(70));

    const overview = await service.getOverview(new Date());
    expect(overview.totals.users).toEqual({
      current: 2,
      previous: 1,
      deltaPercent: 100,
    });
    // A 70-day-old row is outside both windows but counts in per-status.
    expect(overview.perStatus.users).toEqual({ active: 4 });
  });

  it('returns null deltaPercent when the previous window is empty', async () => {
    await seedUser('volunteer', 'active', daysAgo(5));
    const overview = await service.getOverview(new Date());
    expect(overview.totals.users).toEqual({
      current: 1,
      previous: 0,
      deltaPercent: null,
    });
  });

  it('counts distinct active participants across the three sources', async () => {
    const org = await seedOrg();
    const opp = await seedOpportunity(org._id as Types.ObjectId);
    const now = new Date();

    // Source 1: recent application.
    const applied = await seedUser();
    await seedApplication(
      applied._id as Types.ObjectId,
      org._id as Types.ObjectId,
      opp._id as Types.ObjectId,
      daysAgo(5),
    );

    // Source 2: participant status change in status_histories.
    const fielded = await seedUser();
    const participant = await participantModel.create({
      opportunityId: opp._id,
      positionId: new Types.ObjectId(),
      applicationId: new Types.ObjectId(),
      organizationId: org._id,
      volunteerId: fielded._id,
      status: 'active',
    });
    await historyModel.create({
      entityType: 'task_participant',
      entityId: participant._id,
      from: 'accepted',
      to: 'active',
      actor: fielded._id,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    });

    // Source 3: recent submission (same volunteer as source 1 stays distinct).
    await seedSubmission(
      applied._id as Types.ObjectId,
      org._id as Types.ObjectId,
      opp._id as Types.ObjectId,
      'submitted',
      daysAgo(2),
    );

    // Stale activity only: excluded.
    const stale = await seedUser('volunteer', 'active', daysAgo(40));
    await seedApplication(
      stale._id as Types.ObjectId,
      org._id as Types.ObjectId,
      opp._id as Types.ObjectId,
      daysAgo(40),
    );

    const overview = await service.getOverview(now);
    expect(overview.activeParticipants).toBe(2);
  });

  it('counts verification-ready submissions by organization', async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const oppA = await seedOpportunity(orgA._id as Types.ObjectId);
    const oppB = await seedOpportunity(orgB._id as Types.ObjectId);
    const volunteer = await seedUser();
    const vid = volunteer._id as Types.ObjectId;

    await seedSubmission(
      vid,
      orgA._id as Types.ObjectId,
      oppA._id as Types.ObjectId,
      'submitted',
    );
    await seedSubmission(
      vid,
      orgA._id as Types.ObjectId,
      oppA._id as Types.ObjectId,
      'under_review',
    );
    await seedSubmission(
      vid,
      orgA._id as Types.ObjectId,
      oppA._id as Types.ObjectId,
      'draft',
    );
    await seedSubmission(
      vid,
      orgB._id as Types.ObjectId,
      oppB._id as Types.ObjectId,
      'under_review',
    );
    await seedSubmission(
      vid,
      orgB._id as Types.ObjectId,
      oppB._id as Types.ObjectId,
      'approved',
    );

    const overview = await service.getOverview(new Date());
    expect(overview.verificationReady.total).toBe(3);
    expect(overview.verificationReady.byOrganization).toHaveLength(2);
  });

  it('reuses the publish-gate freeze rule for gateFreezes', async () => {
    const locked = await seedOrg();
    const oppIds: Types.ObjectId[] = [];
    for (let index = 0; index < 3; index += 1) {
      const opp = await seedOpportunity(locked._id as Types.ObjectId);
      oppIds.push(opp._id as Types.ObjectId);
    }
    const volunteer = await seedUser();
    for (const opportunityId of oppIds) {
      await seedSubmission(
        volunteer._id as Types.ObjectId,
        locked._id as Types.ObjectId,
        opportunityId,
        'submitted',
      );
    }
    const overview = await service.getOverview(new Date());
    expect(overview.gateFreezes).toBe(1);
  });

  it('returns the median verification decision hours over 90d', async () => {
    const org = await seedOrg();
    const opp = await seedOpportunity(org._id as Types.ObjectId);
    const volunteer = await seedUser();
    const now = new Date();
    for (const hours of [10, 20, 30, 40, 50]) {
      const submittedAt = new Date(
        now.getTime() - 10 * DAY_MS - hours * 3_600_000,
      );
      const submission = await seedSubmission(
        volunteer._id as Types.ObjectId,
        org._id as Types.ObjectId,
        opp._id as Types.ObjectId,
        'approved',
        submittedAt,
      );
      await verificationModel.create({
        submissionId: submission._id,
        organizationId: org._id,
        volunteerId: volunteer._id,
        status: 'verified',
        decidedAt: new Date(now.getTime() - 10 * DAY_MS),
        decidedBy: volunteer._id,
      });
    }
    const overview = await service.getOverview(now);
    expect(overview.medianDecisionHours).toBeCloseTo(30, 5);
  });

  it('returns null median when fewer than 5 verifications exist', async () => {
    const org = await seedOrg();
    const opp = await seedOpportunity(org._id as Types.ObjectId);
    const volunteer = await seedUser();
    const submission = await seedSubmission(
      volunteer._id as Types.ObjectId,
      org._id as Types.ObjectId,
      opp._id as Types.ObjectId,
      'approved',
    );
    await verificationModel.create({
      submissionId: submission._id,
      organizationId: org._id,
      volunteerId: volunteer._id,
      status: 'verified',
      decidedAt: new Date(),
      decidedBy: volunteer._id,
    });
    const overview = await service.getOverview(new Date());
    expect(overview.medianDecisionHours).toBeNull();
  });

  it('buckets the series per UTC day across the requested range', async () => {
    const now = new Date();
    const seededAt = daysAgo(2);
    await seedUser('volunteer', 'active', seededAt);

    const series = await service.getSeries(3, now);
    expect(series.days).toBe(3);
    expect(series.points).toHaveLength(3);
    const seededDay = series.points.find(
      (point) => point.date === toUtcDayKey(seededAt),
    );
    expect(seededDay?.signups).toBe(1);
    expect(series.points.reduce((sum, point) => sum + point.signups, 0)).toBe(
      1,
    );
    expect(
      series.points.find((point) => point.date === toUtcDayKey(now))?.signups,
    ).toBe(0);
  });

  it('bounds the series to 1–90 days', async () => {
    const now = new Date();
    await expect(service.getSeries(0, now)).resolves.toMatchObject({ days: 1 });
    await expect(service.getSeries(91, now)).resolves.toMatchObject({
      days: 90,
    });
  });

  it('returns queue totals with the maintenance flag defaulting to false', async () => {
    const org = await seedOrg('suspended');
    await orgVerificationModel.create({
      organizationId: org._id,
      status: 'pending',
      documents: [],
      submittedAt: new Date(),
    });
    const volunteer = await seedUser('volunteer', 'suspended');
    const opp = await seedOpportunity(org._id as Types.ObjectId);
    await seedSubmission(
      volunteer._id as Types.ObjectId,
      org._id as Types.ObjectId,
      opp._id as Types.ObjectId,
      'under_review',
    );
    await reportModel.create({
      reporterId: volunteer._id,
      targetType: 'organization',
      targetId: org._id,
      reason: 'spam',
      status: 'open',
    });
    await reportModel.create({
      reporterId: volunteer._id,
      targetType: 'organization',
      targetId: org._id,
      reason: 'resolved already',
      status: 'resolved',
    });

    const queue = await service.getQueue();
    expect(queue.pendingVerifications).toBe(1);
    expect(queue.openReports).toBe(1);
    expect(queue.underReviewSubmissions).toBe(1);
    expect(queue.suspendedUsers).toBe(1);
    expect(queue.suspendedOrganizations).toBe(1);
    expect(queue.maintenanceMode).toBe(false);
  });

  it('reflects the maintenance flag from system settings', async () => {
    await settings.set('maintenance.enabled', true);
    await expect(service.getQueue()).resolves.toMatchObject({
      maintenanceMode: true,
    });
    await settings.set('maintenance.enabled', false);
    await expect(service.getQueue()).resolves.toMatchObject({
      maintenanceMode: false,
    });
  });
});
