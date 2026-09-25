import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { KNOWN_SETTING_KEYS } from '../../src/admin/settings.service';
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
const AUTH_ME = '/api/v1/auth/me';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const FEED = '/api/v1/opportunities';
const ORGS_ME_VERIFICATION = '/api/v1/organizations/me/verification';
const ORGS_ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const ADMIN_SETTINGS = '/api/v1/admin/settings';
const ADMIN_OPS_MAINTENANCE = '/api/v1/admin/ops/maintenance';
const ADMIN_ANALYTICS_QUEUE = '/api/v1/admin/analytics/queue';
const ADMIN_USERS = '/api/v1/admin/users';
const ADMIN_ORGANIZATIONS = '/api/v1/admin/organizations';
const SYSTEM_STATUS = '/api/v1/system/status';
const HEALTH = '/api/v1/health';
const MEDIA_UPLOADS = '/api/v1/media/uploads';

const PASSWORD = 'Password123!';

describe('settings expansion e2e (Session 13)', () => {
  let info: TestAppHandle;
  let app: INestApplication;
  let mail: TestMailService;

  let adminToken: string;
  let volunteerToken: string;
  let orgToken: string;
  let organizationId: string;
  let draftId: string;

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

    const volReg = await request(app.getHttpServer())
      .post(REGISTER_VOLUNTEER)
      .send({ email: 'set-vol@example.com', password: PASSWORD })
      .expect(201);
    volunteerToken = volReg.body.accessToken as string;
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: mail.latest('verify')!.token })
      .expect(204);

    const orgReg = await request(app.getHttpServer())
      .post(REGISTER_ORG)
      .send({ email: 'set-org@example.com', password: PASSWORD })
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
      .get(`${ADMIN_USERS}?q=set-org@example.com`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const orgUserId = orgRow.body.items[0]._id as string;
    const orgList = await request(app.getHttpServer())
      .get(ADMIN_ORGANIZATIONS)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const orgEntry = (orgList.body.items as any[]).find(
      (item) => String(item.userId) === String(orgUserId),
    );
    organizationId = (orgEntry ?? orgList.body.items[0])._id as string;
    await request(app.getHttpServer())
      .post(`${ADMIN_ORGANIZATIONS}/${organizationId}/verification/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const draft = await request(app.getHttpServer())
      .post(ORGS_ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Settings Draft',
        description: 'Settings draft description',
        positions: [
          {
            title: 'Helper',
            description: 'On-site help',
            requiredCount: 1,
            requiredSkills: [],
          },
        ],
      })
      .expect(201);
    draftId = draft.body._id as string;
  }, 120_000);

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function putSetting(key: string, value: unknown) {
    return request(app.getHttpServer())
      .put(`${ADMIN_SETTINGS}/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value });
  }

  describe('5.1 settings round-trip', () => {
    it('lists the 16 seeded canonical keys after boot', async () => {
      const res = await request(app.getHttpServer())
        .get(ADMIN_SETTINGS)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const keys = (res.body as any[]).map((row) => row.key);
      for (const key of KNOWN_SETTING_KEYS) {
        expect(keys).toContain(key);
      }
    });

    it('upserts each key family and reads it back immediately', async () => {
      const cases: Array<[string, unknown]> = [
        ['platform.name', 'Basmatak Test'],
        ['platform.summary', 'Test summary'],
        ['platform.contactEmail', 'contact@example.org'],
        ['locale.defaultLanguage', 'ar'],
        ['locale.defaultTimezone', 'Africa/Algiers'],
        ['locale.dateFormat', 'YYYY-MM-DD'],
        ['auth.adminSessionDurationDays', 7],
        ['moderation.requireVerifiedEmail', true],
        ['moderation.suspendOnReport', true],
        ['ops.registrationEnabled', true],
        ['ops.publishingEnabled', true],
        ['maintenance.enabled', false],
        ['maintenance.message', ''],
        ['notifications.digest.enabled', true],
        ['notifications.digest.intervalDays', 10],
        ['publishGate.maxPendingOpportunities', 3],
      ];
      for (const [key, value] of cases) {
        const upsert = await putSetting(key, value);
        expect(upsert.status).toBe(200);
        expect(upsert.body.key).toBe(key);
        expect(upsert.body.value).toBe(value);
      }
      const listed = await request(app.getHttpServer())
        .get(ADMIN_SETTINGS)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const byKey = new Map(
        (listed.body as any[]).map((row) => [row.key, row.value]),
      );
      expect(byKey.get('locale.defaultLanguage')).toBe('ar');
      expect(byKey.get('notifications.digest.intervalDays')).toBe(10);
      // Restore the defaults the later suites assume.
      await putSetting('locale.defaultLanguage', 'fr');
      await putSetting('notifications.digest.enabled', false);
      await putSetting('notifications.digest.intervalDays', 7);
      await putSetting('auth.adminSessionDurationDays', 30);
      await putSetting('moderation.suspendOnReport', false);
      await putSetting('platform.name', 'Basmatak Tatatoua');
    });

    it('rejects unknown keys and wrong shapes with 400', async () => {
      await putSetting('platform.unknown', 'x').then((res) => {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('UNKNOWN_SETTING_KEY');
      });
      await putSetting('maintenance.enabled', 'yes').then((res) => {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_SETTING_VALUE');
      });
      await putSetting('locale.defaultLanguage', 'de').then((res) => {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_SETTING_VALUE');
      });
    });

    it('forbids non-admin settings access', async () => {
      await request(app.getHttpServer())
        .get(ADMIN_SETTINGS)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`${ADMIN_SETTINGS}/platform.name`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ value: 'Hacked' })
        .expect(403);
    });
  });

  describe('ops toggle auth', () => {
    it('forbids non-admin toggles and rejects invalid bodies', async () => {
      await request(app.getHttpServer())
        .post(ADMIN_OPS_MAINTENANCE)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ enabled: true })
        .expect(403);
      await request(app.getHttpServer())
        .post(ADMIN_OPS_MAINTENANCE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: 'yes' })
        .expect(400);
    });
  });

  describe('5.2 maintenance matrix', () => {
    it('public status reports healthy defaults', async () => {
      const res = await request(app.getHttpServer())
        .get(SYSTEM_STATUS)
        .expect(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.version).toBe('string');
      expect(res.body.maintenance).toBe(false);
    });

    it('maintenance on: guests and volunteers 503, admin/status/health/queue fine', async () => {
      await request(app.getHttpServer())
        .post(ADMIN_OPS_MAINTENANCE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true, message: 'Upgrading search' })
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({
            enabled: true,
            message: 'Upgrading search',
          });
        });

      await request(app.getHttpServer())
        .get(FEED)
        .expect(503)
        .then((res) => {
          expect(res.body.code).toBe('MAINTENANCE_MODE');
          expect(String(res.body.message)).toContain('Upgrading search');
        });
      await request(app.getHttpServer())
        .get(AUTH_ME)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(503)
        .then((res) => {
          expect(res.body.code).toBe('MAINTENANCE_MODE');
        });

      await request(app.getHttpServer())
        .get(ADMIN_SETTINGS)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(SYSTEM_STATUS)
        .expect(200)
        .then((res) => {
          expect(res.body.maintenance).toBe(true);
          expect(res.body.message).toBe('Upgrading search');
        });
      await request(app.getHttpServer()).get(HEALTH).expect(200);
      await request(app.getHttpServer())
        .get(ADMIN_ANALYTICS_QUEUE)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body.maintenanceMode).toBe(true);
        });
    });

    it('maintenance off: traffic flows again without a restart', async () => {
      await request(app.getHttpServer())
        .post(ADMIN_OPS_MAINTENANCE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false })
        .expect(200);
      await request(app.getHttpServer()).get(FEED).expect(200);
      await request(app.getHttpServer())
        .get(AUTH_ME)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
    });
  });

  describe('5.3 kill-switches', () => {
    it('registration off rejects with 403 and creates no user', async () => {
      await putSetting('ops.registrationEnabled', false).then((res) => {
        expect(res.status).toBe(200);
      });
      await request(app.getHttpServer())
        .post(REGISTER_VOLUNTEER)
        .send({ email: 'blocked@example.com', password: PASSWORD })
        .expect(403)
        .then((res) => {
          expect(res.body.code).toBe('REGISTRATION_DISABLED');
        });
      await request(app.getHttpServer())
        .get(`${ADMIN_USERS}?q=blocked@example.com`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body.items).toHaveLength(0);
        });
      await putSetting('ops.registrationEnabled', true).then((res) => {
        expect(res.status).toBe(200);
      });
      await request(app.getHttpServer())
        .post(REGISTER_VOLUNTEER)
        .send({ email: 'blocked@example.com', password: PASSWORD })
        .expect(201);
    });

    it('publishing off rejects with 403 and keeps the draft', async () => {
      await putSetting('ops.publishingEnabled', false).then((res) => {
        expect(res.status).toBe(200);
      });
      await request(app.getHttpServer())
        .post(`${OPPORTUNITIES}/${draftId}/publish`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(403)
        .then((res) => {
          expect(res.body.code).toBe('PUBLISHING_DISABLED');
        });
      await request(app.getHttpServer())
        .get(ORGS_ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200)
        .then((res) => {
          const row = (res.body.items as any[]).find(
            (item) => String(item._id) === String(draftId),
          );
          expect(row.status).toBe('draft');
        });
      await putSetting('ops.publishingEnabled', true).then((res) => {
        expect(res.status).toBe(200);
      });
      await request(app.getHttpServer())
        .post(`${OPPORTUNITIES}/${draftId}/publish`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200)
        .then((res) => {
          expect(res.body.status).toBe('published');
        });
    });
  });
});
