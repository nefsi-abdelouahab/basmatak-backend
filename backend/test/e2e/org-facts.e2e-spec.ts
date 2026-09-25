import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as request from 'supertest';
import {
  AuditLogModel,
  AuditLogsCollection,
} from '../../src/core/audit/audit-log.schema';
import {
  StatusHistoryCollection,
  StatusHistoryModel,
} from '../../src/core/status-transitions/status-histories.schema';
import {
  LocationsCollection,
  LocationModel,
} from '../../src/locations/schemas/location.schema';
import { MAIL_SERVICE } from '../../src/mail/mail.interface';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../../src/opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../src/organizations/schemas/organization.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../../src/skills/schemas/skill-category.schema';
import { createTestApp, TestAppHandle } from '../utils/test-db';
import { TestMailService } from '../utils/test-mail.service';
import { CORE_LOOP_ENV, seedCoreData } from '../helpers/seed-utils';

const REGISTER_ORG = '/api/v1/auth/register/organization';
const REGISTER_VOLUNTEER = '/api/v1/auth/register/volunteer';
const REFRESH = '/api/v1/auth/refresh';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ORGS_ME = '/api/v1/organizations/me';
const ORGS_COMPLETION = '/api/v1/organizations/me/profile-completion';
const MEDIA_UPLOADS = '/api/v1/media/uploads';

const PASSWORD = 'Password123!';

describe('org facts e2e (Session 14)', () => {
  let info: TestAppHandle;
  let app: INestApplication;
  let mail: TestMailService;

  let orgToken: string;
  let orgRefreshToken: string;
  let orgSlug: string;
  let organizationId: string;
  let wilayaCode: string;
  let municipalityCode: string;
  let categoryId: string;

  let orgs: Model<OrganizationModel>;
  let opportunities: Model<OpportunityModel>;
  let audits: Model<AuditLogModel>;
  let histories: Model<StatusHistoryModel>;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: CORE_LOOP_ENV,
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    app = info.app;
    await seedCoreData(app);

    orgs = app.get(getModelToken(OrganizationsCollection));
    opportunities = app.get(getModelToken(OpportunitiesCollection));
    audits = app.get(getModelToken(AuditLogsCollection));
    histories = app.get(getModelToken(StatusHistoryCollection));

    const locations: Model<LocationModel> = app.get(
      getModelToken(LocationsCollection),
    );
    const wilaya = await locations.findOne({ type: 'wilaya' }).exec();
    const municipality = await locations
      .findOne({ type: 'municipality', parentCode: wilaya!.code })
      .exec();
    wilayaCode = wilaya!.code;
    municipalityCode = municipality!.code;

    const categories: Model<SkillCategoryModel> = app.get(
      getModelToken(SkillCategoriesCollection),
    );
    categoryId = (await categories.findOne({}).exec())!._id.toString();

    const orgReg = await request(app.getHttpServer())
      .post(REGISTER_ORG)
      .send({ email: 'facts-org@example.com', password: PASSWORD })
      .expect(201);
    orgToken = orgReg.body.accessToken as string;
    orgRefreshToken = orgReg.body.refreshToken as string;
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: mail.latest('verify')!.token })
      .expect(204);

    const me = await request(app.getHttpServer())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    orgSlug = me.body.slug as string;
    organizationId = me.body._id as string;
  });

  afterAll(async () => {
    await info.close();
  });

  it('PATCHes the full fact sheet and reflects it on /me', async () => {
    const res = await request(app.getHttpServer())
      .patch(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        nameFr: 'Association El-Amel',
        description: 'Volunteer charity',
        type: 'Association',
        registrationNumber: 'REG-2024-001',
        location: {
          wilayaId: wilayaCode,
          municipalityId: municipalityCode,
          address: 'Rue Didouche Mourad',
        },
        website: 'https://el-amel.example.org',
        foundedYear: 2018,
        contact: {
          email: 'contact@el-amel.example.org',
          phone: '+213555123456',
        },
        focusDisciplines: [categoryId],
        operatingScope: 'Algiers and surroundings',
        publicProfile: { enabled: true },
      })
      .expect(200);
    expect(res.body.type).toBe('Association');
    expect(res.body.location.wilayaId).toBe(wilayaCode);
    expect(res.body.website).toBe('https://el-amel.example.org');
    expect(res.body.focusDisciplines.map(String)).toEqual([categoryId]);
  });

  it('rejects a malformed website, unknown location, and protected keys', async () => {
    await request(app.getHttpServer())
      .patch(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ website: 'not-a-url' })
      .expect(400);
    const badLocation = await request(app.getHttpServer())
      .patch(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ location: { wilayaId: '99' } })
      .expect(400);
    expect(badLocation.body.code).toBe('INVALID_LOCATION');
    await request(app.getHttpServer())
      .patch(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ slug: 'hacked', verificationStatus: 'verified' })
      .expect(400);
  });

  it('serves the profile-completion checklist', async () => {
    const res = await request(app.getHttpServer())
      .get(ORGS_COMPLETION)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    // 10 of 11 keys filled (cover missing) → 91%.
    expect(res.body).toEqual({
      percent: 91,
      missing: ['coverMediaId'],
      complete: false,
    });
  });

  it('attaches and detaches the annual report (organization_document only)', async () => {
    const upload = await request(app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        filename: 'report-2025.pdf',
        mimeType: 'application/pdf',
        size: 45_000,
        purpose: 'organization_document',
        visibility: 'private',
      })
      .expect(201);
    const attached = await request(app.getHttpServer())
      .patch(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ annualReportMediaId: upload.body.mediaId })
      .expect(200);
    expect(String(attached.body.annualReportMediaId)).toBe(upload.body.mediaId);
    const detached = await request(app.getHttpServer())
      .patch(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ annualReportMediaId: null })
      .expect(200);
    expect(detached.body.annualReportMediaId ?? null).toBeNull();
  });

  it('publishes the extended public payload with zeroed aggregates', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}`)
      .expect(404);
    await orgs
      .updateOne(
        { _id: organizationId },
        { $set: { verificationStatus: 'verified' } },
      )
      .exec();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}`)
      .expect(200);
    expect(res.body.type).toBe('Association');
    expect(res.body.location.wilayaId).toBe(wilayaCode);
    expect(res.body.website).toBe('https://el-amel.example.org');
    expect(res.body.registryId).toMatch(/^ORG-/);
    expect(res.body.aggregates).toEqual({
      volunteers: 0,
      initiativesActive: 0,
      initiativesCompleted: 0,
      verifiedHours: 0,
      responseRate: 0,
      perDomain: [],
      activeSince: 2018,
    });
  });

  it('filters the public opportunities archive by status', async () => {
    const orgId = organizationId;
    await opportunities.create({
      organizationId: orgId,
      slug: 'facts-live',
      title: 'Live initiative',
      description: 'Description',
      status: 'published',
    });
    await opportunities.create({
      organizationId: orgId,
      slug: 'facts-done',
      title: 'Done initiative',
      description: 'Description',
      status: 'completed',
    });
    const dump = await opportunities
      .find({ slug: { $in: ['facts-live', 'facts-done'] } })
      .sort({ slug: 1 })
      .lean()
      .exec();
    expect(dump.map((d) => ({ slug: d.slug, status: d.status }))).toEqual([
      { slug: 'facts-done', status: 'completed' },
      { slug: 'facts-live', status: 'published' },
    ]);

    const byDefault = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}/opportunities`)
      .expect(200);
    expect(byDefault.body.map((row: { slug: string }) => row.slug)).toEqual([
      'facts-live',
    ]);
    const completed = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}/opportunities`)
      .query({ status: 'completed' })
      .expect(200);
    expect(completed.body.map((row: { slug: string }) => row.slug)).toEqual([
      'facts-done',
    ]);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}/opportunities?status=draft`)
      .expect(400);
  });

  it('isolates volunteers from org-only routes', async () => {
    const volReg = await request(app.getHttpServer())
      .post(REGISTER_VOLUNTEER)
      .send({ email: 'facts-vol@example.com', password: PASSWORD })
      .expect(201);
    const volToken = volReg.body.accessToken as string;
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: mail.latest('verify')!.token })
      .expect(204);
    await request(app.getHttpServer())
      .get(ORGS_ME)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(ORGS_COMPLETION)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(ORGS_ME)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(404);
  });

  it('deletes the account: hides the org, kills refresh, audits', async () => {
    await request(app.getHttpServer())
      .delete(ORGS_ME)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgSlug}`)
      .expect(404);
    const refresh = await request(app.getHttpServer())
      .post(REFRESH)
      .send({ refreshToken: orgRefreshToken })
      .expect(401);
    expect(refresh.body.code).toBe('INVALID_REFRESH_TOKEN');

    const audit = await audits
      .findOne({ path: ORGS_ME, method: 'DELETE' })
      .lean()
      .exec();
    expect(audit).not.toBeNull();
    const history = await histories
      .findOne({ entityType: 'organization', to: 'deleted' })
      .lean()
      .exec();
    expect(history).not.toBeNull();
    expect(String(history!.entityId)).toBe(organizationId);
  });
});
