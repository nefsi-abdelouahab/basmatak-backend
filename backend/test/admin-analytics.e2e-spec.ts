import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import * as request from 'supertest';
import { TestAppHandle, createTestApp } from './utils/test-db';
import { SettingsService } from '../src/core/settings/settings.service';
import {
  OrganizationVerificationModel,
  OrganizationVerificationsCollection,
} from '../src/organizations/schemas/organization-verification.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../src/organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../src/opportunities/schemas/opportunity.schema';
import { ReportModel, ReportsCollection } from '../src/reports/report.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../src/submissions/schemas/submission.schema';
import { UserModel, UsersCollection } from '../src/users/schemas/user.schema';
import { UsersService } from '../src/users/users.service';

const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const LOGIN = '/api/v1/auth/login';
const OVERVIEW = '/api/v1/admin/analytics/overview';
const SERIES = '/api/v1/admin/analytics/series';
const QUEUE = '/api/v1/admin/analytics/queue';
const ADMIN_EMAIL = 'analytics-root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';

const DAY_MS = 24 * 3_600_000;

describe('admin analytics e2e (Session 8)', () => {
  let info: TestAppHandle;
  let adminToken: string;
  let volunteerToken: string;
  let userModel: Model<UserModel>;
  let organizationModel: Model<OrganizationModel>;
  let orgVerificationModel: Model<OrganizationVerificationModel>;
  let opportunityModel: Model<OpportunityModel>;
  let submissionModel: Model<SubmissionModel>;
  let reportModel: Model<ReportModel>;
  let settings: SettingsService;

  beforeAll(async () => {
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
    });
    const app = info.app;
    userModel = app.get(getModelToken(UsersCollection));
    organizationModel = app.get(getModelToken(OrganizationsCollection));
    orgVerificationModel = app.get(
      getModelToken(OrganizationVerificationsCollection),
    );
    opportunityModel = app.get(getModelToken(OpportunitiesCollection));
    submissionModel = app.get(getModelToken(SubmissionsCollection));
    reportModel = app.get(getModelToken(ReportsCollection));
    settings = app.get(SettingsService);

    const users = app.get(UsersService);
    await users.create({
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    const login = await request(app.getHttpServer())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;

    const volunteerEmail = `analytics-vol-${Date.now()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post(VOLUNTEER_REGISTER)
      .send({ email: volunteerEmail, password: 'Password123!' })
      .expect(201);
    volunteerToken = registered.body.accessToken as string;

    // Backdated user (previous-period delta source).
    const old = new Date(Date.now() - 40 * DAY_MS);
    await userModel.create({
      email: `analytics-old-${Date.now()}@example.com`,
      passwordHash: 'hash',
      role: 'volunteer',
      status: 'active',
      createdAt: old,
      updatedAt: old,
    });

    // Pending verification row (queue source).
    const owner = await userModel.create({
      email: `analytics-org-${Date.now()}@example.com`,
      passwordHash: 'hash',
      role: 'organization',
      status: 'active',
    });
    const org = await organizationModel.create({
      userId: owner._id,
      slug: `analytics-org-${Date.now()}`,
      verificationStatus: 'pending',
      status: 'active',
    });
    await orgVerificationModel.create({
      organizationId: org._id,
      status: 'pending',
      documents: [],
      submittedAt: new Date(),
    });

    // Under-review submission + open report (queue sources).
    const opp = await opportunityModel.create({
      organizationId: org._id,
      slug: `analytics-opp-${Date.now()}`,
      title: 'T',
      description: 'D',
      status: 'published',
      positions: [],
    });
    const volunteer = await userModel.create({
      email: `analytics-sub-${Date.now()}@example.com`,
      passwordHash: 'hash',
      role: 'volunteer',
      status: 'active',
    });
    await submissionModel.create({
      participantId: new Types.ObjectId(),
      opportunityId: opp._id,
      positionId: new Types.ObjectId(),
      organizationId: org._id,
      volunteerId: volunteer._id,
      deliverables: [],
      consentConfirmed: true,
      evidence: [],
      status: 'under_review',
    });
    await reportModel.create({
      reporterId: volunteer._id,
      targetType: 'organization',
      targetId: org._id,
      reason: 'spam',
      status: 'open',
    });
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  it('overview returns delta-shaped totals from real data', async () => {
    const response = await request(info.app.getHttpServer())
      .get(OVERVIEW)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const users = response.body.totals.users as {
      current: number;
      previous: number;
      deltaPercent: number | null;
    };
    expect(users.current).toBeGreaterThanOrEqual(2);
    expect(users.previous).toBe(1);
    expect(users.deltaPercent).toBeGreaterThan(0);
    expect(response.body.activeParticipants).toBeGreaterThanOrEqual(0);
    expect(response.body.verificationReady.total).toBeGreaterThanOrEqual(1);
    expect(response.body.gateFreezes).toBeGreaterThanOrEqual(0);
    expect(response.body.medianDecisionHours).toBeNull();
    expect(response.body.perStatus.users.active).toBeGreaterThanOrEqual(3);
  });

  it('series covers the requested range with UTC day keys', async () => {
    const response = await request(info.app.getHttpServer())
      .get(`${SERIES}?days=7`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.days).toBe(7);
    expect(response.body.points).toHaveLength(7);
    for (const point of response.body.points) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(point.signups).toBeGreaterThanOrEqual(0);
    }
    const total = response.body.points.reduce(
      (sum: number, point: { signups: number }) => sum + point.signups,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it('series defaults to 30 days and rejects out-of-range values', async () => {
    const fallback = await request(info.app.getHttpServer())
      .get(SERIES)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(fallback.body.days).toBe(30);
    expect(fallback.body.points).toHaveLength(30);

    await request(info.app.getHttpServer())
      .get(`${SERIES}?days=0`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(info.app.getHttpServer())
      .get(`${SERIES}?days=91`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('queue reflects pending verifications, open reports and review work', async () => {
    const response = await request(info.app.getHttpServer())
      .get(QUEUE)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.pendingVerifications).toBeGreaterThanOrEqual(1);
    expect(response.body.openReports).toBeGreaterThanOrEqual(1);
    expect(response.body.underReviewSubmissions).toBeGreaterThanOrEqual(1);
    expect(response.body.maintenanceMode).toBe(false);

    await settings.set('maintenance.enabled', true);
    const flagged = await request(info.app.getHttpServer())
      .get(QUEUE)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(flagged.body.maintenanceMode).toBe(true);
    await settings.set('maintenance.enabled', false);
  });

  it('rejects non-admin callers on every analytics route', async () => {
    for (const route of [OVERVIEW, SERIES, QUEUE]) {
      await request(info.app.getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
      await request(info.app.getHttpServer()).get(route).expect(401);
    }
  });
});
