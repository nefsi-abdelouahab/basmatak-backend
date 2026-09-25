import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { seedAdmin } from '../src/scripts/seed-admin';
import { UsersService } from '../src/users/users.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const LOGIN = '/api/v1/auth/login';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const ORG_EXPERIENCES = '/api/v1/organizations/me/experiences';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const EXPERIENCES_ME = '/api/v1/experiences/me';
const EXPERIENCES = '/api/v1/experiences';
const PUBLIC_PROOF = '/api/v1/verify';
const DASHBOARD = '/api/v1/volunteers/me/dashboard';
const ADMIN_EXPERIENCES = '/api/v1/admin/volunteers';

const ADMIN_EMAIL = 'enrich-root@admin.test';
const ADMIN_PASSWORD = 'AdminStrong123!';
const CODE_PATTERN = new RegExp('^[A-HJ-NP-Z2-9]{8}$');
const EXP_PATTERN = new RegExp('^EXP-[0-9]{6}$');

describe('experience enrichment e2e (Session 15)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let adminToken: string;
  let orgToken: string;
  let orgSlug: string;
  let volunteerToken: string;
  let volunteerUserId: string;
  let volunteerUsername: string;
  let opportunityId: string;
  let legacyOpportunityId: string;
  let verificationCode: string;
  let experienceId: string;
  let legacyExperienceId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });
    await seedAdmin(info.app, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      reset: false,
    });
    const users = info.app.get(UsersService);
    const admin = await users.findByEmail(ADMIN_EMAIL);
    await users.setEmailVerified(admin!._id.toString());
    const login = await request(info.app.getHttpServer())
      .post(LOGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = login.body.accessToken as string;

    orgToken = await registerVerifiedOrg('enrich-org@example.com');
    orgSlug = 'enrich-org';
    volunteerToken = await registerVerifiedVolunteer('enrich-vol@example.com');
    const me = await request(info.app.getHttpServer())
      .get('/api/v1/volunteers/me')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    volunteerUserId = me.body.userId as string;
    volunteerUsername = me.body.username as string;

    // Opportunity with a real configured duration (Session 11 field). The
    // position title carries a comma to prove CSV quoting on the export.
    const opp = await createOpportunity(orgToken, 'Shoreline Sweep', {
      positionTitle: 'Park, Lake Cleanup',
      durationMinutes: 180,
    });
    opportunityId = opp.opportunityId;
    const draftId = await applyAcceptSubmit(
      volunteerToken,
      opportunityId,
      opp.positionId,
    );
    const verified = await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/verify`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        notes: 'Verified on site',
        review: { rating: 5, comment: 'Great work' },
      })
      .expect(200);
    expect(verified.body.status).toBe('approved');

    const mine = await request(info.app.getHttpServer())
      .get(EXPERIENCES_ME)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    experienceId = mine.body.items[0].id as string;
    verificationCode = mine.body.items[0].verificationCode as string;

    // Legacy opportunity predating Session 11 fields: no durationMinutes.
    const legacyOpp = await createOpportunity(orgToken, 'Legacy Cleanup', {
      positionTitle: 'Alley sweep',
    });
    legacyOpportunityId = legacyOpp.opportunityId;
    const legacyDraft = await applyAcceptSubmit(
      volunteerToken,
      legacyOpportunityId,
      legacyOpp.positionId,
    );
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${legacyDraft}/verify`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ notes: 'Legacy approval' })
      .expect(200);
    const mineAfter = await request(info.app.getHttpServer())
      .get(EXPERIENCES_ME)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    legacyExperienceId = mineAfter.body.items
      .map((item: any) => item.id)
      .find((id: string) => id !== experienceId) as string;
    await request(info.app.getHttpServer())
      .patch(`${EXPERIENCES}/${legacyExperienceId}/visibility`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ publicVisibility: 'private' })
      .expect(200);
  }, 120000);

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(endpoint: string, email: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(endpoint)
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

  async function registerVerifiedOrg(email: string): Promise<string> {
    const token = await register(ORG_REGISTER, email);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
    return token;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(VOLUNTEER_REGISTER, email);
    await verifyLatestEmail();
    return token;
  }

  async function createOpportunity(
    token: string,
    title: string,
    opts: { positionTitle: string; durationMinutes?: number },
  ): Promise<{ opportunityId: string; positionId: string }> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        ...(opts.durationMinutes !== undefined
          ? { durationMinutes: opts.durationMinutes }
          : {}),
        positions: [
          {
            title: opts.positionTitle,
            description: 'Collect litter',
            requiredCount: 1,
            requiredSkills: [],
          },
        ],
      });
    expect(response.status).toBe(201);
    const created = response.body;
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${created._id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return {
      opportunityId: created._id as string,
      positionId: created.positions[0]._id as string,
    };
  }

  async function applyAcceptSubmit(
    volToken: string,
    oppId: string,
    positionId: string,
  ): Promise<string> {
    const applied = await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${oppId}/positions/${positionId}/applications`)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(201);
    await request(info.app.getHttpServer())
      .post(`${APPLICATIONS}/${applied.body._id}/accept`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const pending = await request(info.app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(200);
    const candidate = pending.body.items.find(
      (item: any) =>
        String(item.opportunityId) === oppId && item.status === 'accepted',
    );
    expect(candidate).toBeDefined();
    const created = await request(info.app.getHttpServer())
      .post(`${PARTICIPATIONS}/${candidate._id}/submissions`)
      .set('Authorization', `Bearer ${volToken}`)
      .expect(201);
    const draftId = created.body._id as string;
    const upload = await request(info.app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${volToken}`)
      .send({
        filename: 'evidence.png',
        mimeType: 'image/png',
        size: 12_345,
        purpose: 'submission_evidence',
        visibility: 'private',
      })
      .expect(201);
    await request(info.app.getHttpServer())
      .patch(`${SUBMISSIONS}/${draftId}`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({
        description: 'Picked 12 bags',
        evidence: [upload.body.mediaId],
      })
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/submit`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({ consentConfirmed: true })
      .expect(200);
    return draftId;
  }

  it('own list carries org identity, verifiedAt, code, registryId, real duration, and review', async () => {
    const res = await request(info.app.getHttpServer())
      .get(EXPERIENCES_ME)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    expect(res.body.total).toBe(2);
    const row = res.body.items.find((item: any) => item.id === experienceId);
    expect(row).toMatchObject({
      title: 'Park, Lake Cleanup',
      duration: 180,
      publicVisibility: 'public',
      review: { rating: 5, notes: 'Great work' },
    });
    expect(row.registryId).toMatch(EXP_PATTERN);
    expect(row.verificationCode).toMatch(CODE_PATTERN);
    expect(verificationCode).toBe(row.verificationCode);
    expect(row.organization).toMatchObject({ slug: orgSlug });
    expect(typeof row.organization.id).toBe('string');
    expect(new Date(row.verifiedAt).toString()).not.toBe('Invalid Date');
  });

  it('legacy mint falls back to duration 0', async () => {
    const res = await request(info.app.getHttpServer())
      .get(EXPERIENCES_ME)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    const row = res.body.items.find(
      (item: any) => item.id === legacyExperienceId,
    );
    expect(row.duration).toBe(0);
    expect(row.publicVisibility).toBe('private');
  });

  it('own detail returns the enriched payload with evidence', async () => {
    const res = await request(info.app.getHttpServer())
      .get(`${EXPERIENCES}/${experienceId}`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      title: 'Park, Lake Cleanup',
      duration: 180,
      verificationCode,
      review: { rating: 5, notes: 'Great work' },
    });
    expect(res.body.organization).toMatchObject({ slug: orgSlug });
    expect(Array.isArray(res.body.evidence)).toBe(true);
  });

  it('org list filters, totals, and guards', async () => {
    const auth = (token: string) => `Bearer ${token}`;
    const all = await request(info.app.getHttpServer())
      .get(ORG_EXPERIENCES)
      .set('Authorization', auth(orgToken))
      .expect(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items[0].verificationCode).toBeDefined();
    expect(all.body.items[0].publicVisibility).toBeDefined();

    const priv = await request(info.app.getHttpServer())
      .get(`${ORG_EXPERIENCES}?visibility=private`)
      .set('Authorization', auth(orgToken))
      .expect(200);
    expect(priv.body.total).toBe(1);
    expect(priv.body.items[0].id).toBe(legacyExperienceId);

    const byCode = await request(info.app.getHttpServer())
      .get(`${ORG_EXPERIENCES}?q=${verificationCode}`)
      .set('Authorization', auth(orgToken))
      .expect(200);
    expect(byCode.body.total).toBe(1);
    expect(byCode.body.items[0].id).toBe(experienceId);

    const byOpp = await request(info.app.getHttpServer())
      .get(`${ORG_EXPERIENCES}?opportunityId=${opportunityId}`)
      .set('Authorization', auth(orgToken))
      .expect(200);
    expect(byOpp.body.total).toBe(1);

    await request(info.app.getHttpServer())
      .get(`${ORG_EXPERIENCES}?sort=oldest`)
      .set('Authorization', auth(orgToken))
      .expect(200);
    await request(info.app.getHttpServer())
      .get(`${ORG_EXPERIENCES}?sort=bogus`)
      .set('Authorization', auth(orgToken))
      .expect(400);

    await request(info.app.getHttpServer()).get(ORG_EXPERIENCES).expect(401);
    await request(info.app.getHttpServer())
      .get(ORG_EXPERIENCES)
      .set('Authorization', auth(volunteerToken))
      .expect(403);

    const otherOrg = await registerVerifiedOrg('enrich-other@example.com');
    const foreign = await request(info.app.getHttpServer())
      .get(ORG_EXPERIENCES)
      .set('Authorization', auth(otherOrg))
      .expect(200);
    expect(foreign.body.total).toBe(0);
  });

  it('org CSV export streams the filtered set with a header row', async () => {
    const res = await request(info.app.getHttpServer())
      .get(`${ORG_EXPERIENCES}?format=csv`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('org-experiences.csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toContain('registryId');
    expect(lines[0]).toContain('verificationCode');
    expect(lines).toHaveLength(3);
    expect(res.text).toContain('"Park, Lake Cleanup"');
    expect(res.text).toContain(verificationCode);
  });

  it('admin volunteer-experiences read returns real enriched rows', async () => {
    const res = await request(info.app.getHttpServer())
      .get(`${ADMIN_EXPERIENCES}/${volunteerUserId}/experiences`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.total).toBe(2);
    const row = res.body.items.find((item: any) => item.id === experienceId);
    expect(row).toMatchObject({
      duration: 180,
      verificationCode,
      publicVisibility: 'public',
    });
    expect(row.registryId).toMatch(EXP_PATTERN);
    expect(row.organization).toMatchObject({ slug: orgSlug });

    await request(info.app.getHttpServer())
      .get(`${ADMIN_EXPERIENCES}/${volunteerUserId}/experiences`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(403);
    await request(info.app.getHttpServer())
      .get(
        `${ADMIN_EXPERIENCES}/${new Types.ObjectId().toString()}/experiences`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('dashboard carries the latest verified experience', async () => {
    const res = await request(info.app.getHttpServer())
      .get(DASHBOARD)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    expect(res.body.stats).toMatchObject({
      completedTasks: 2,
      verifiedExperiences: 2,
      volunteerHours: 180,
    });
    expect(res.body.latestVerifiedExperience).toMatchObject({
      duration: 0,
      organization: { slug: orgSlug },
    });
    expect(res.body.latestVerifiedExperience.registryId).toMatch(EXP_PATTERN);
  });

  it('public proof and public cards expose the enriched identity', async () => {
    const proof = await request(info.app.getHttpServer())
      .get(`${PUBLIC_PROOF}/${verificationCode}`)
      .expect(200);
    expect(proof.body).toMatchObject({
      title: 'Park, Lake Cleanup',
      duration: 180,
      verificationCode,
      review: { rating: 5, notes: 'Great work' },
    });
    expect(proof.body.organization).toMatchObject({ slug: orgSlug });
    expect(proof.body.registryId).toMatch(EXP_PATTERN);

    const cards = await request(info.app.getHttpServer())
      .get(`/api/v1/volunteers/${volunteerUsername}/experiences`)
      .expect(200);
    expect(cards.body.total).toBe(1);
    expect(cards.body.items[0]).toMatchObject({
      verificationCode,
      organization: { slug: orgSlug },
    });

    const profile = await request(info.app.getHttpServer())
      .get(`/api/v1/volunteers/${volunteerUsername}`)
      .expect(200);
    expect(profile.body.experiences).toHaveLength(1);
    expect(profile.body.experiences[0].organization).toMatchObject({
      slug: orgSlug,
    });
    expect(Array.isArray(profile.body.areasOfContribution)).toBe(true);
  });
});
