import { createConnection } from 'mongoose';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationSchema,
} from '../src/organizations/schemas/organization-verification.schema';
import * as request from 'supertest';

const ORGS = '/api/v1/organizations';
const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';

describe('organizations e2e (public pages + verification documents)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function registerOrg(email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(ORG_REGISTER)
      .send({ email, password: 'Password123!' });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const record = mail.latest('verify')!;
    expect(record).toBeDefined();
    await request(info.app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: record.token })
      .expect(204);
  }

  /** Admin approval ships in S15; tests flip the flag directly to reach `verified`. */
  async function markVerified(slug: string): Promise<void> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .updateOne({ slug }, { $set: { verificationStatus: 'verified' } })
        .exec();
    } finally {
      await connection.close();
    }
  }

  describe('registration seam', () => {
    it('creates a pending organizations row (slug from email local part)', async () => {
      const token = await registerOrg('alpha-org@example.com');
      const me = await request(info.app.getHttpServer())
        .get(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.slug).toBe('alpha-org');
      expect(me.body.verificationStatus).toBe('pending');
    });

    it('resolves slug collisions between accounts sharing a local part', async () => {
      const first = await registerOrg('ceo@example.com');
      const second = await registerOrg('ceo@example.net');

      const a = await request(info.app.getHttpServer())
        .get(`${ORGS}/me`)
        .set('Authorization', `Bearer ${first}`)
        .expect(200);
      expect(a.body.slug).toBe('ceo');

      const b = await request(info.app.getHttpServer())
        .get(`${ORGS}/me`)
        .set('Authorization', `Bearer ${second}`)
        .expect(200);
      expect(b.body.slug).toBe('ceo-1');
    });
  });

  describe('own organization (/me)', () => {
    let token: string;

    beforeAll(async () => {
      token = await registerOrg('first@example.com');
    });

    it('reads the caller organization', async () => {
      const response = await request(info.app.getHttpServer())
        .get(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.slug).toBe('first');
      expect(response.body.verificationStatus).toBe('pending');
      expect(response.body.status).toBe('active');
    });

    it('patches name/description/logo but never slug or verificationStatus', async () => {
      const logoUpload = await request(info.app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'logo.png',
          mimeType: 'image/png',
          size: 42000,
          purpose: 'organization_logo',
        })
        .expect(201);
      const logoMediaId = logoUpload.body.mediaId as string;

      await request(info.app.getHttpServer())
        .patch(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nameAr: 'الجمعية',
          nameFr: "L'association",
          description: 'Water wells and education',
          logoMediaId,
        })
        .expect(200);

      const me = await request(info.app.getHttpServer())
        .get(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.nameAr).toBe('الجمعية');
      expect(me.body.logoMediaId).toBe(logoMediaId);

      await request(info.app.getHttpServer())
        .patch(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'rolled-by-me' })
        .expect(400);
      await request(info.app.getHttpServer())
        .patch(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .send({ verificationStatus: 'verified' })
        .expect(400);
    });

    it('rejects a logo that is absent, foreign, or wrong-purpose (F9)', async () => {
      await request(info.app.getHttpServer())
        .patch(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .send({ logoMediaId: '507f1f77bcf86cd799439011' })
        .expect(404);
      const foreignOwner = await registerOrg('rival@example.com');
      const foreign = await request(info.app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${foreignOwner}`)
        .send({
          filename: 'org-logo.png',
          mimeType: 'image/png',
          size: 42000,
          purpose: 'organization_logo',
        })
        .expect(201);
      await request(info.app.getHttpServer())
        .patch(`${ORGS}/me`)
        .set('Authorization', `Bearer ${token}`)
        .send({ logoMediaId: foreign.body.mediaId })
        .expect(404);
    });

    it('returns 401 for anonymous and 404 for a volunteer (no org row)', async () => {
      await request(info.app.getHttpServer()).get(`${ORGS}/me`).expect(401);

      const registered = await request(info.app.getHttpServer())
        .post(VOLUNTEER_REGISTER)
        .send({ email: 'vol-alpha@example.com', password: 'Password123!' })
        .expect(201);
      const response = await request(info.app.getHttpServer())
        .get(`${ORGS}/me`)
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    });
  });

  describe('verification documents', () => {
    let token: string;

    beforeAll(async () => {
      token = await registerOrg('documents@example.com');
    });

    it('rejects a submission while the email is unverified (A10, env-off)', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: ['507f1f77bcf86cd799439011'] })
        .expect(403);
      expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('accepts submission after email verification and reports pending', async () => {
      await verifyLatestEmail();

      const upload = await request(info.app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'license.pdf',
          mimeType: 'application/pdf',
          size: 42000,
          purpose: 'verification_document',
        })
        .expect(201);
      const document = upload.body.mediaId as string;

      const submitted = await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: [document] })
        .expect(201);
      expect(submitted.body.status).toBe('pending');

      const status = await request(info.app.getHttpServer())
        .get(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(status.body.verificationStatus).toBe('pending');
      expect(status.body.latest).toMatchObject({
        status: 'pending',
        documents: [document],
      });
    });

    it('rejects an absent, foreign, or wrong-purpose document (F9)', async () => {
      const wrongPurpose = await request(info.app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'logo.png',
          mimeType: 'image/png',
          size: 42000,
          purpose: 'organization_logo',
        })
        .expect(201);

      const absent = await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: ['507f1f77bcf86cd799439011'] })
        .expect(404);
      expect(absent.body.code).toBe('MEDIA_NOT_FOUND');

      const wrongPurposeRes = await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: [wrongPurpose.body.mediaId] })
        .expect(409);
      expect(wrongPurposeRes.body.code).toBe('MEDIA_PURPOSE_MISMATCH');
    });

    it('validates documents as ObjectId list (min 1)', async () => {
      await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: ['not-an-object-id'] })
        .expect(400);
      await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: [] })
        .expect(400);
    });

    it('resubmission from rejected goes back to pending and writes history', async () => {
      const connection = await createConnection(info.uri).asPromise();
      try {
        const orgModel = connection.model(
          OrganizationsCollection,
          OrganizationSchema,
        );
        const verificationModel = connection.model(
          OrganizationVerificationsCollection,
          OrganizationVerificationSchema,
        );
        const org = await orgModel.findOne({ slug: 'documents' }).exec();
        await verificationModel
          .updateMany(
            { organizationId: org!._id },
            { $set: { status: 'rejected', rejectionReason: 'blurry scan' } },
          )
          .exec();
        await orgModel
          .updateOne(
            { _id: org!._id },
            { $set: { verificationStatus: 'rejected' } },
          )
          .exec();
      } finally {
        await connection.close();
      }

      const upload = await request(info.app.getHttpServer())
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'license-v2.pdf',
          mimeType: 'application/pdf',
          size: 42000,
          purpose: 'verification_document',
        })
        .expect(201);
      const document = upload.body.mediaId as string;

      const resubmitted = await request(info.app.getHttpServer())
        .post(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send({ documents: [document] })
        .expect(201);
      expect(resubmitted.body.status).toBe('pending');

      const status = await request(info.app.getHttpServer())
        .get(`${ORGS}/me/verification`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(status.body.verificationStatus).toBe('pending');
    });
  });

  describe('public reads (verified + active only)', () => {
    const slug = 'alpha-org';

    it('404s and stays hidden while pending', async () => {
      await request(info.app.getHttpServer())
        .get(`${ORGS}/${slug}`)
        .expect(404);
      await request(info.app.getHttpServer())
        .get(`${ORGS}/${slug}/opportunities`)
        .expect(404);
      const list = await request(info.app.getHttpServer())
        .get(`${ORGS}`)
        .expect(200);
      expect(list.body).toEqual([]);
    });

    it('serves the profile and empty opportunities once verified and active', async () => {
      await markVerified(slug);

      const profile = await request(info.app.getHttpServer())
        .get(`${ORGS}/${slug}`)
        .expect(200);
      expect(profile.body.slug).toBe(slug);
      expect(profile.body.verificationStatus).toBe('verified');

      const opportunities = await request(info.app.getHttpServer())
        .get(`${ORGS}/${slug}/opportunities`)
        .expect(200);
      expect(opportunities.body).toEqual([]);

      const list = await request(info.app.getHttpServer())
        .get(`${ORGS}`)
        .expect(200);
      expect(list.body.some((org: { slug: string }) => org.slug === slug)).toBe(
        true,
      );
    });
  });
});
