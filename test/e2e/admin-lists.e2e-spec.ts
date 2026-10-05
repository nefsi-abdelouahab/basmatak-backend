import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../../src/mail/mail.interface';
import { TestMailService } from '../utils/test-mail.service';
import { createTestApp, TestAppHandle } from '../utils/test-db';
import {
  CORE_ADMIN_EMAIL,
  CORE_ADMIN_PASSWORD,
  CORE_LOOP_ENV,
  seedCoreData,
} from '../helpers/seed-utils';

const REGISTER_VOLUNTEER = '/api/v1/auth/register/volunteer';
const REGISTER_ORG = '/api/v1/auth/register/organization';
const LOGIN = '/api/v1/auth/login';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const VOLUNTEERS_ME = '/api/v1/volunteers/me';
const ORGS_ME_VERIFICATION = '/api/v1/organizations/me/verification';
const ORGS_ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const REPORTS = '/api/v1/reports';
const ADMIN_USERS = '/api/v1/admin/users';
const ADMIN_VOLUNTEERS = '/api/v1/admin/volunteers';
const ADMIN_ORGANIZATIONS = '/api/v1/admin/organizations';
const ADMIN_OPPORTUNITIES = '/api/v1/admin/opportunities';
const ADMIN_REPORTS = '/api/v1/admin/reports';
const ADMIN_AUDIT_LOGS = '/api/v1/admin/audit-logs';
const ADMIN_HISTORIES = '/api/v1/admin/status-histories';
const MEDIA_UPLOADS = '/api/v1/media/uploads';

const PASSWORD = 'Password123!';

describe('admin lists e2e (Session 10)', () => {
  let info: TestAppHandle;
  let app: INestApplication;
  let mail: TestMailService;

  let adminToken: string;
  let adminUserId: string;
  let volunteerToken: string;
  let volunteerUserId: string;
  let orgToken: string;
  let organizationId: string;
  let opportunityId: string;
  let verificationRowId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: CORE_LOOP_ENV,
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    app = info.app;
    await seedCoreData(app);
    const login = await request(app.getHttpServer())
      .post(LOGIN)
      .send({ email: CORE_ADMIN_EMAIL, password: CORE_ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;

    const adminRow = await request(app.getHttpServer())
      .get(`${ADMIN_USERS}?q=root@admin.test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    adminUserId = adminRow.body.items[0]._id as string;

    // Volunteer with profile + skill.
    const volReg = await request(app.getHttpServer())
      .post(REGISTER_VOLUNTEER)
      .send({ email: 'adm-vol@example.com', password: PASSWORD })
      .expect(201);
    volunteerToken = volReg.body.accessToken as string;
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: mail.latest('verify')!.token })
      .expect(204);
    await request(app.getHttpServer())
      .patch(VOLUNTEERS_ME)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ firstName: 'Adm', lastName: 'Vol' })
      .expect(200);
    const skillList = await request(app.getHttpServer())
      .get('/api/v1/skills')
      .expect(200);
    const skillId = skillList.body[0]._id as string;
    await request(app.getHttpServer())
      .post(`${VOLUNTEERS_ME}/skills`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ skillId, level: 3, isPrimary: true })
      .expect(201);
    const volRow = await request(app.getHttpServer())
      .get(`${ADMIN_USERS}?q=adm-vol@example.com`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    volunteerUserId = volRow.body.items[0]._id as string;

    // Organization with a pending verification dossier.
    const orgReg = await request(app.getHttpServer())
      .post(REGISTER_ORG)
      .send({ email: 'adm-org@example.com', password: PASSWORD })
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
    const submitted = await request(app.getHttpServer())
      .post(ORGS_ME_VERIFICATION)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ documents: [upload.body.mediaId] })
      .expect(201);
    verificationRowId = submitted.body._id as string;
    const orgRow = await request(app.getHttpServer())
      .get(`${ADMIN_USERS}?q=adm-org@example.com`)
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

    // Approve + publish one opportunity for the admin opportunity list.
    await request(app.getHttpServer())
      .post(`${ADMIN_ORGANIZATIONS}/${organizationId}/verification/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const created = await request(app.getHttpServer())
      .post(ORGS_ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Admin List Sweep',
        description: 'Admin List Sweep description',
        positions: [
          {
            title: 'Cleaner',
            description: 'On-site practical work',
            requiredCount: 2,
            requiredSkills: [],
          },
        ],
      })
      .expect(201);
    opportunityId = created.body._id as string;
    await request(app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
  }, 120000);

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  function admin(path: string): request.Test {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  describe('users list', () => {
    it('returns filtered totals with the counted-page shape', async () => {
      const response = await admin(
        `${ADMIN_USERS}?q=adm-vol@example.com`,
      ).expect(200);
      expect(response.body.total).toBe(1);
      expect(response.body.page).toBe(1);
      expect(response.body.pages).toBe(1);
      expect(response.body.items[0].email).toBe('adm-vol@example.com');
      expect(response.body.items[0].passwordHash).toBeUndefined();
    });

    it('sorts oldest-first and rejects unknown sort tokens', async () => {
      const oldest = await admin(`${ADMIN_USERS}?sort=oldest`).expect(200);
      const ids = oldest.body.items.map((row: any) => row._id);
      expect(ids).toEqual([...ids].sort());
      await admin(`${ADMIN_USERS}?sort=popular`).expect(400);
    });

    it('streams CSV with a header row and the same rows', async () => {
      const response = await admin(`${ADMIN_USERS}?format=csv`).expect(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('admin-users-');
      const lines = (response.text as string).trim().split('\n');
      expect(lines[0]).toBe(
        'id,email,phone,role,status,lastActivityAt,createdAt',
      );
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('user status with reason + histories read', () => {
    it('suspends with reason/notes visible in status-histories', async () => {
      await request(app.getHttpServer())
        .patch(`${ADMIN_USERS}/${volunteerUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'suspended', reason: 'Spam', notes: 'Three reports' })
        .expect(200);
      const histories = await admin(
        `${ADMIN_HISTORIES}?entityType=user&entityId=${volunteerUserId}`,
      ).expect(200);
      expect(histories.body.total).toBeGreaterThanOrEqual(1);
      const latest = histories.body.items[histories.body.items.length - 1];
      expect(latest).toMatchObject({
        from: 'active',
        to: 'suspended',
        reason: 'Spam',
        notes: 'Three reports',
      });
      // Reinstate for the remaining tests.
      await request(app.getHttpServer())
        .patch(`${ADMIN_USERS}/${volunteerUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);
    });

    it('requires both history params', async () => {
      await admin(`${ADMIN_HISTORIES}?entityType=user`).expect(400);
      await admin(
        `${ADMIN_HISTORIES}?entityType=user&entityId=not-an-id`,
      ).expect(400);
    });
  });

  describe('volunteers list + experiences seam', () => {
    it('joins skills and filters by q', async () => {
      const response = await admin(`${ADMIN_VOLUNTEERS}?q=adm-vol`).expect(200);
      expect(response.body.total).toBe(1);
      const row = response.body.items[0];
      expect(row.profile.username).toBe('adm-vol');
      expect(row.skillNames.length).toBeGreaterThanOrEqual(1);
      expect(row.user.email).toBe('adm-vol@example.com');
    });

    it('streams volunteer CSV', async () => {
      const response = await admin(`${ADMIN_VOLUNTEERS}?format=csv`).expect(
        200,
      );
      expect(response.headers['content-type']).toContain('text/csv');
      expect((response.text as string).split('\n')[0]).toContain(
        'profileId,username',
      );
    });

    it('returns the inert empty page for a known volunteer, 404 otherwise', async () => {
      const known = await admin(
        `${ADMIN_VOLUNTEERS}/${volunteerUserId}/experiences`,
      ).expect(200);
      expect(known.body).toMatchObject({ items: [], total: 0 });
      await admin(
        `${ADMIN_VOLUNTEERS}/507f1f77bcf86cd799439099/experiences`,
      ).expect(404);
    });
  });

  describe('organizations + verification triage', () => {
    it('assigns a dossier to an admin and filters by assignee', async () => {
      await request(app.getHttpServer())
        .patch(
          `${ADMIN_ORGANIZATIONS}/verifications/${verificationRowId}/assign`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: adminUserId })
        .expect(200);
      const filtered = await admin(
        `${ADMIN_ORGANIZATIONS}/verifications?status=verified&assignedAdminId=${adminUserId}`,
      ).expect(200);
      expect(filtered.body.total).toBeGreaterThanOrEqual(1);
      await request(app.getHttpServer())
        .patch(
          `${ADMIN_ORGANIZATIONS}/verifications/${verificationRowId}/assign`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: volunteerUserId })
        .expect(400);
    });

    it('reads the latest dossier and streams verification CSV', async () => {
      const latest = await admin(
        `${ADMIN_ORGANIZATIONS}/${organizationId}/verification/latest`,
      ).expect(200);
      expect(String(latest.body._id)).toBe(String(verificationRowId));
      const csv = await admin(
        `${ADMIN_ORGANIZATIONS}/verifications?format=csv`,
      ).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect((csv.text as string).split('\n')[0]).toContain('rowId,orgId');
    });
  });

  describe('opportunities list', () => {
    it('returns enriched rows with counts and filters by q', async () => {
      const response = await admin(
        `${ADMIN_OPPORTUNITIES}?q=Admin List Sweep`,
      ).expect(200);
      expect(response.body.total).toBe(1);
      const row = response.body.items[0];
      expect(row.opportunity.title).toBe('Admin List Sweep');
      expect(row.capacity).toBe(2);
      expect(row.applicationCount).toBe(0);
      expect(row.organizationName).toBeDefined();
    });

    it('streams opportunity CSV', async () => {
      const response = await admin(`${ADMIN_OPPORTUNITIES}?format=csv`).expect(
        200,
      );
      expect(response.headers['content-type']).toContain('text/csv');
      expect((response.text as string).split('\n')[0]).toContain(
        'id,slug,title',
      );
    });
  });

  describe('opportunity verification status', () => {
    it('returns an empty roster before anyone is accepted', async () => {
      const response = await admin(
        `${ADMIN_OPPORTUNITIES}/${opportunityId}/verification-status`,
      ).expect(200);
      expect(response.body).toEqual({ items: [] });
    });

    it('404s for an unknown opportunity', async () => {
      await admin(
        `${ADMIN_OPPORTUNITIES}/507f1f77bcf86cd799439099/verification-status`,
      ).expect(404);
    });

    it('volunteer gets 403 on the verification-status read', async () => {
      await request(app.getHttpServer())
        .get(`${ADMIN_OPPORTUNITIES}/${opportunityId}/verification-status`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
    });
  });

  describe('reports triage', () => {
    let reportId: string;

    it('volunteer files a titled high-priority report', async () => {
      const created = await request(app.getHttpServer())
        .post(REPORTS)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          targetType: 'organization',
          targetId: organizationId,
          reason: 'Fake listing',
          title: 'Suspicious org',
          priority: 'high',
        })
        .expect(201);
      reportId = created.body._id as string;
      expect(created.body.priority).toBe('high');
      expect(created.body.title).toBe('Suspicious org');
    });

    it('admin triages by priority with joined summaries', async () => {
      const response = await admin(
        `${ADMIN_REPORTS}?priority=high&sort=priority`,
      ).expect(200);
      expect(response.body.total).toBeGreaterThanOrEqual(1);
      const row = response.body.items.find(
        (item: any) => String(item.report._id) === String(reportId),
      );
      expect(row).toBeDefined();
      expect(row.reporterSummary.name).toBeDefined();
      expect(row.targetSummary).toMatchObject({ type: 'organization' });
    });

    it('assigns the report and streams report CSV', async () => {
      await request(app.getHttpServer())
        .patch(`${ADMIN_REPORTS}/${reportId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedAdminId: adminUserId })
        .expect(200);
      const filtered = await admin(
        `${ADMIN_REPORTS}?assignedAdminId=${adminUserId}`,
      ).expect(200);
      expect(filtered.body.total).toBeGreaterThanOrEqual(1);
      const csv = await admin(`${ADMIN_REPORTS}?format=csv`).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect((csv.text as string).split('\n')[0]).toContain(
        'id,title,targetType',
      );
    });
  });

  describe('audit logs', () => {
    it('embeds actor names and filters by q', async () => {
      const response = await admin(ADMIN_AUDIT_LOGS).expect(200);
      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(response.body.items[0].actorName).toBeDefined();
      const filtered = await admin(`${ADMIN_AUDIT_LOGS}?q=admin`).expect(200);
      expect(filtered.body.total).toBeGreaterThanOrEqual(1);
      const csv = await admin(`${ADMIN_AUDIT_LOGS}?format=csv`).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect((csv.text as string).split('\n')[0]).toContain('actorName');
    });
  });

  describe('authorization', () => {
    const paths = [
      ADMIN_USERS,
      ADMIN_VOLUNTEERS,
      ADMIN_ORGANIZATIONS,
      `${ADMIN_ORGANIZATIONS}/verifications`,
      ADMIN_OPPORTUNITIES,
      ADMIN_REPORTS,
      ADMIN_AUDIT_LOGS,
      ADMIN_HISTORIES,
    ];

    it.each(paths)('volunteer gets 403 on %s', async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
    });

    it('volunteer gets 403 on assign + histories + experiences', async () => {
      await request(app.getHttpServer())
        .patch(
          `${ADMIN_ORGANIZATIONS}/verifications/${verificationRowId}/assign`,
        )
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ assignedAdminId: adminUserId })
        .expect(403);
      await request(app.getHttpServer())
        .get(`${ADMIN_HISTORIES}?entityType=user&entityId=${volunteerUserId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
    });

    it('guest gets 401 on admin lists', async () => {
      await request(app.getHttpServer()).get(ADMIN_USERS).expect(401);
    });
  });
});
