import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../../src/mail/mail.interface';
import { TestMailService } from '../utils/test-mail.service';
import { createTestApp, TestAppHandle } from '../utils/test-db';
import {
  CORE_ADMIN_EMAIL,
  CORE_ADMIN_PASSWORD,
  CORE_JOBS_KEY,
  CORE_LOOP_ENV,
  seedCoreData,
} from '../helpers/seed-utils';
import {
  ReportModel,
  ReportsCollection,
} from '../../src/reports/report.schema';

const REGISTER_VOLUNTEER = '/api/v1/auth/register/volunteer';
const REGISTER_ORG = '/api/v1/auth/register/organization';
const LOGIN = '/api/v1/auth/login';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ORGS_ME_VERIFICATION = '/api/v1/organizations/me/verification';
const ORGS_ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const REPORTS = '/api/v1/reports';
const NOTIFICATIONS = '/api/v1/notifications';
const NOTIFICATION_PREFS = '/api/v1/notifications/preferences';
const ADMIN_USERS = '/api/v1/admin/users';
const ADMIN_ORGANIZATIONS = '/api/v1/admin/organizations';
const ADMIN_OPPORTUNITIES = '/api/v1/admin/opportunities';
const ADMIN_REPORTS = '/api/v1/admin/reports';
const ADMIN_HISTORIES = '/api/v1/admin/status-histories';
const ADMIN_AUDIT_LOGS = '/api/v1/admin/audit-logs';
const ADMIN_SETTINGS = '/api/v1/admin/settings';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const JOBS_RUN = '/api/v1/internal/jobs/run';

const PASSWORD = 'Password123!';

describe('moderation actions e2e (Session 20)', () => {
  let info: TestAppHandle;
  let app: INestApplication;
  let mail: TestMailService;
  let reportModel: Model<ReportModel>;

  let adminToken: string;
  let reporterToken: string;
  let targetToken: string;
  let targetUserId: string;
  let noticeeToken: string;
  let noticeeUserId: string;
  let orgToken: string;
  let organizationId: string;
  let publishedOpportunityId: string;
  let progressOpportunityId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: CORE_LOOP_ENV,
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    app = info.app;
    reportModel = app.get(getModelToken(ReportsCollection));
    await seedCoreData(app);
    const login = await request(app.getHttpServer())
      .post(LOGIN)
      .send({ email: CORE_ADMIN_EMAIL, password: CORE_ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;

    reporterToken = await registerVolunteer('mod-reporter@example.com');
    targetToken = await registerVolunteer('mod-target@example.com');
    targetUserId = await userIdByEmail('mod-target@example.com');
    noticeeToken = await registerVolunteer('mod-noticee@example.com');
    noticeeUserId = await userIdByEmail('mod-noticee@example.com');

    // Verified organization with two published opportunities.
    const orgReg = await request(app.getHttpServer())
      .post(REGISTER_ORG)
      .send({ email: 'mod-org@example.com', password: PASSWORD })
      .expect(201);
    orgToken = orgReg.body.accessToken as string;
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: mail.latest('verify')!.token })
      .expect(204);
    const upload = await request(app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        filename: 'license.pdf',
        mimeType: 'application/pdf',
        size: 12_345,
        purpose: 'verification_document',
        visibility: 'private',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(ORGS_ME_VERIFICATION)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ documents: [upload.body.mediaId] })
      .expect(201);
    const orgRow = await request(app.getHttpServer())
      .get(`${ADMIN_USERS}?q=mod-org@example.com`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const orgUserId = orgRow.body.items[0]._id as string;
    const orgList = await request(app.getHttpServer())
      .get(ADMIN_ORGANIZATIONS)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    organizationId = (
      orgList.body.items.find(
        (org: any) => String(org.userId) === String(orgUserId),
      ) ?? orgList.body.items[0]
    )._id as string;
    await request(app.getHttpServer())
      .post(`${ADMIN_ORGANIZATIONS}/${organizationId}/verification/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    publishedOpportunityId = await createPublishedOpportunity(
      'Moderation Sweep',
      {},
    );
    progressOpportunityId = await createPublishedOpportunity(
      'Moderation In-Progress',
      {
        startDate: new Date(Date.now() - 60_000).toISOString(),
        applicationDeadline: new Date(
          Date.now() + 7 * 24 * 3600 * 1000,
        ).toISOString(),
      },
    );
    // Drive the second opportunity to in_progress (apply + accept + ticker).
    const detail = await request(app.getHttpServer())
      .get(`${OPPORTUNITIES}/${progressOpportunityId}`)
      .expect(200);
    const positionId = detail.body.positions[0]._id as string;
    const applied = await request(app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/${progressOpportunityId}/positions/${positionId}/applications`,
      )
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${APPLICATIONS}/${applied.body._id}/accept`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(JOBS_RUN)
      .set('X-Jobs-Key', CORE_JOBS_KEY)
      .expect(200);
  }, 180000);

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function registerVolunteer(email: string): Promise<string> {
    const reg = await request(app.getHttpServer())
      .post(REGISTER_VOLUNTEER)
      .send({ email, password: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: mail.latest('verify')!.token })
      .expect(204);
    return reg.body.accessToken as string;
  }

  async function userIdByEmail(email: string): Promise<string> {
    const row = await request(app.getHttpServer())
      .get(`${ADMIN_USERS}?q=${email}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return row.body.items[0]._id as string;
  }

  async function createPublishedOpportunity(
    title: string,
    extra: Record<string, unknown>,
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(ORGS_ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title,
        description: `${title} description`,
        positions: [
          {
            title: 'Cleaner',
            description: 'On-site practical work',
            requiredCount: 1,
            requiredSkills: [],
          },
        ],
        ...extra,
      })
      .expect(201);
    const opportunityId = created.body._id as string;
    await request(app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    return opportunityId;
  }

  /** Direct model seeding keeps the suite under the POST /reports throttle. */
  async function seedReport(
    targetType: 'opportunity' | 'user' | 'organization',
    targetId: string,
  ): Promise<string> {
    const reporterId = await userIdByEmail('mod-reporter@example.com');
    const row = await reportModel.create({
      reporterId: new Types.ObjectId(reporterId),
      targetType,
      targetId: new Types.ObjectId(targetId),
      reason: 'Needs moderation',
    });
    return row._id.toString();
  }

  function resolveReport(
    reportId: string,
    body: Record<string, unknown>,
    token: string = adminToken,
  ): request.Test {
    return request(app.getHttpServer())
      .patch(`${ADMIN_REPORTS}/${reportId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function opportunityStatus(opportunityId: string): Promise<string> {
    const list = await request(app.getHttpServer())
      .get(`${ADMIN_OPPORTUNITIES}?q=Moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = list.body.items.find(
      (item: any) => String(item.opportunity._id) === opportunityId,
    );
    expect(row).toBeDefined();
    return row.opportunity.status as string;
  }

  describe('report filing + atomic unpublish', () => {
    it('volunteer files a report through the public route', async () => {
      const created = await request(app.getHttpServer())
        .post(REPORTS)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          targetType: 'opportunity',
          targetId: publishedOpportunityId,
          reason: 'Inappropriate content',
        })
        .expect(201);
      expect(created.body.status).toBe('open');
    });

    it('resolves the report and closes the opportunity in one transaction', async () => {
      const reportId = await seedReport('opportunity', publishedOpportunityId);
      const response = await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Remove from public listing',
        action: { type: 'unpublish_opportunity' },
      }).expect(200);
      expect(response.body.status).toBe('resolved');
      expect(response.body.resolution).toBe('Remove from public listing');
      expect(await opportunityStatus(publishedOpportunityId)).toBe('closed');

      for (const [entityType, entityId] of [
        ['report', reportId],
        ['opportunity', publishedOpportunityId],
      ]) {
        const histories = await request(app.getHttpServer())
          .get(
            `${ADMIN_HISTORIES}?entityType=${entityType}&entityId=${entityId}`,
          )
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        const latest = histories.body.items[histories.body.items.length - 1];
        expect(latest.reason).toBe('Remove from public listing');
      }
    });

    it('rolls back the resolution when the consequence fails', async () => {
      const reportId = await seedReport('opportunity', publishedOpportunityId);
      const response = await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Second attempt',
        action: { type: 'unpublish_opportunity' },
      }).expect(409);
      expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
      const row = await request(app.getHttpServer())
        .get(`${ADMIN_REPORTS}?status=open`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        row.body.items.some(
          (item: any) => String(item.report._id) === reportId,
        ),
      ).toBe(true);
    });
  });

  describe('force-close from in_progress', () => {
    it('closes the live opportunity with a history row', async () => {
      expect(await opportunityStatus(progressOpportunityId)).toBe(
        'in_progress',
      );
      const reportId = await seedReport('opportunity', progressOpportunityId);
      await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Force close',
        action: { type: 'close_opportunity' },
      }).expect(200);
      expect(await opportunityStatus(progressOpportunityId)).toBe('closed');
    });
  });

  describe('suspend target + auth regression', () => {
    it('suspends the user and blocks their requests', async () => {
      const reportId = await seedReport('user', targetUserId);
      await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Repeated abuse',
        action: { type: 'suspend_target' },
      }).expect(200);
      const blocked = await request(app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${targetToken}`)
        .expect(403);
      expect(blocked.body.code).toBe('ACCOUNT_SUSPENDED');
      // Reinstate for the remaining tests.
      await request(app.getHttpServer())
        .patch(`${ADMIN_USERS}/${targetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);
    });

    it('rejects suspend_target against an opportunity target', async () => {
      const reportId = await seedReport('opportunity', publishedOpportunityId);
      const response = await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Wrong target',
        action: { type: 'suspend_target' },
      }).expect(400);
      expect(response.body.code).toBe('INCOMPATIBLE_MODERATION_ACTION');
    });
  });

  describe('notices', () => {
    it('delivers a composite notice to the recipient', async () => {
      const reportId = await seedReport('organization', organizationId);
      await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Heads up',
        action: {
          type: 'notice',
          payload: { userId: noticeeUserId, message: 'Moderation notice' },
        },
      }).expect(200);
      const list = await request(app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${noticeeToken}`)
        .expect(200);
      const row = list.body.items.find(
        (item: any) => item.payload?.message === 'Moderation notice',
      );
      expect(row).toBeDefined();
      expect(row.type).toBe('admin.notice');
    });

    it('sends a standalone notice and honors the system preference', async () => {
      await request(app.getHttpServer())
        .patch(NOTIFICATION_PREFS)
        .set('Authorization', `Bearer ${noticeeToken}`)
        .send({ prefs: { system: false } })
        .expect(200);
      const muted = await request(app.getHttpServer())
        .post(`${ADMIN_USERS}/${noticeeUserId}/notice`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Muted notice' })
        .expect(201);
      expect(muted.body).toEqual({ delivered: false });

      await request(app.getHttpServer())
        .patch(NOTIFICATION_PREFS)
        .set('Authorization', `Bearer ${noticeeToken}`)
        .send({ prefs: { system: true } })
        .expect(200);
      const delivered = await request(app.getHttpServer())
        .post(`${ADMIN_USERS}/${noticeeUserId}/notice`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Audible notice' })
        .expect(201);
      expect(delivered.body).toEqual({ delivered: true });
      const list = await request(app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${noticeeToken}`)
        .expect(200);
      expect(
        list.body.items.some(
          (item: any) => item.payload?.message === 'Audible notice',
        ),
      ).toBe(true);
      expect(
        list.body.items.some(
          (item: any) => item.payload?.message === 'Muted notice',
        ),
      ).toBe(false);
    });
  });

  describe('suspend-on-report policy default (O1)', () => {
    async function setFlag(value: boolean): Promise<void> {
      await request(app.getHttpServer())
        .put(`${ADMIN_SETTINGS}/moderation.suspendOnReport`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value })
        .expect(200);
    }

    it('suspends user targets by default when the flag is on', async () => {
      await setFlag(true);
      const reportId = await seedReport('user', targetUserId);
      await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Policy default',
      }).expect(200);
      const row = await request(app.getHttpServer())
        .get(`${ADMIN_USERS}?q=mod-target@example.com`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(row.body.items[0].status).toBe('suspended');
      await request(app.getHttpServer())
        .patch(`${ADMIN_USERS}/${targetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);
    });

    it('resolves plainly when the flag is off', async () => {
      await setFlag(false);
      const reportId = await seedReport('user', targetUserId);
      await resolveReport(reportId, {
        status: 'resolved',
        resolution: 'Plain resolution',
      }).expect(200);
      const row = await request(app.getHttpServer())
        .get(`${ADMIN_USERS}?q=mod-target@example.com`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(row.body.items[0].status).toBe('active');
    });
  });

  describe('authorization + audit', () => {
    it('audits the composite resolution', async () => {
      const logs = await request(app.getHttpServer())
        .get(`${ADMIN_AUDIT_LOGS}?entityType=reports`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(logs.body.total).toBeGreaterThanOrEqual(1);
      expect(
        logs.body.items.some((item: any) =>
          String(item.log.path ?? '').includes('/admin/reports/'),
        ),
      ).toBe(true);
    });

    // Last: guard-rejected calls run no interceptor work, so nothing is
    // in flight when afterAll closes the app (the audit interceptor writes
    // fire-and-forget after the response).
    it('rejects non-admin callers on both routes', async () => {
      const reportId = await seedReport('user', targetUserId);
      await resolveReport(
        reportId,
        { status: 'resolved', resolution: 'Nope' },
        reporterToken,
      ).expect(403);
      await request(app.getHttpServer())
        .patch(`${ADMIN_REPORTS}/${reportId}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`${ADMIN_USERS}/${noticeeUserId}/notice`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ message: 'Nope' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${ADMIN_USERS}/${noticeeUserId}/notice`)
        .send({ message: 'Nope' })
        .expect(401);
    });
  });
});
