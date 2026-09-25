import { createConnection } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const ORG_ACTIVITY = '/api/v1/organizations/me/activity';
const VOLUNTEER_ACTIVITY = '/api/v1/volunteers/me/activity';

describe('activity feed e2e (Session 12)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let volunteerToken: string;
  let bystanderToken: string;
  let secondOrgToken: string;
  let opportunity: Record<string, any>;
  let applicationId: string;
  let submissionId: string;

  const OPP_TITLE = 'S12 River Cleanup';

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    orgToken = await registerVerifiedOrg('s12-org@example.com');
    volunteerToken = await registerVerifiedVolunteer('s12-vol@example.com');
    bystanderToken = await registerVerifiedVolunteer('s12-by@example.com');
    secondOrgToken = await registerVerifiedOrg('s12-org2@example.com');

    opportunity = await createOpportunity(orgToken, OPP_TITLE);
    await publishOpportunity(orgToken, opportunity._id);

    // Second org + opportunity + bystander application: isolation fixture.
    const opp2 = await createOpportunity(secondOrgToken, 'S12 Other Cleanup');
    await publishOpportunity(secondOrgToken, opp2._id);
    await request(info.app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/${opp2._id}/positions/${opp2.positions[0]._id}/applications`,
      )
      .set('Authorization', `Bearer ${bystanderToken}`)
      .expect(201);

    const applied = await request(info.app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/${opportunity._id}/positions/${opportunity.positions[0]._id}/applications`,
      )
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(201);
    applicationId = applied.body._id as string;

    await request(info.app.getHttpServer())
      .post(`${APPLICATIONS}/${applicationId}/start-review`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    await request(info.app.getHttpServer())
      .post(`${APPLICATIONS}/${applicationId}/accept`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    const tasks = await request(info.app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    const participationId = tasks.body.items[0]._id as string;

    const created = await request(info.app.getHttpServer())
      .post(`${PARTICIPATIONS}/${participationId}/submissions`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(201);
    submissionId = created.body._id as string;

    const evidenceId = await uploadEvidence(volunteerToken);
    await request(info.app.getHttpServer())
      .patch(`${SUBMISSIONS}/${submissionId}`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ description: 'Cleared the riverbank', evidence: [evidenceId] })
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${submissionId}/submit`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ consentConfirmed: true })
      .expect(200);

    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${submissionId}/start-review`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${submissionId}/verify`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ notes: 'Verified on arrival' })
      .expect(200);
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

  async function register(email: string, endpoint: string): Promise<string> {
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
    const token = await register(email, ORG_REGISTER);
    await verifyLatestEmail();
    await markVerified(email.split('@')[0]);
    return token;
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(email, VOLUNTEER_REGISTER);
    await verifyLatestEmail();
    return token;
  }

  async function createOpportunity(
    token: string,
    title: string,
  ): Promise<Record<string, any>> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        positions: [
          { title: 'Litter picker', requiredCount: 2, requiredSkills: [] },
        ],
      });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function publishOpportunity(
    token: string,
    opportunityId: string,
  ): Promise<void> {
    await request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function uploadEvidence(token: string): Promise<string> {
    const response = await request(info.app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'evidence.png',
        mimeType: 'image/png',
        size: 12_345,
        purpose: 'submission_evidence',
      })
      .expect(201);
    return response.body.mediaId as string;
  }

  async function pollUntil(
    fn: () => Promise<boolean>,
    attempts = 60,
  ): Promise<void> {
    for (let i = 0; i < attempts; i += 1) {
      if (await fn()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('pollUntil timed out');
  }

  async function readFeed(token: string, route: string, query = '') {
    return request(info.app.getHttpServer())
      .get(`${route}${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  function keyOf(item: any): string {
    return `${item.type}:${item.entity.id}`;
  }

  describe('org feed reflects the full lifecycle exactly once', () => {
    it('contains publish/apply/review/accept/submit/verify items, deduped', async () => {
      await pollUntil(async () => {
        const feed = await readFeed(orgToken, ORG_ACTIVITY);
        return feed.body.total === 7 && feed.body.items.length === 7;
      });
      const feed = await readFeed(orgToken, ORG_ACTIVITY);
      expect(feed.body.limit).toBe(20);
      expect(feed.body.page).toBe(1);
      expect(feed.body.pages).toBe(1);
      expect(feed.body.nextCursor).toBeNull();

      const keys = feed.body.items.map(keyOf);
      expect(new Set(keys).size).toBe(keys.length);
      for (const expected of [
        `opportunity.published:${opportunity._id}`,
        `application.applied:${applicationId}`,
        `application.under_review:${applicationId}`,
        `application.accepted:${applicationId}`,
        `submission.submitted:${submissionId}`,
        `submission.under_review:${submissionId}`,
        `submission.verified:${submissionId}`,
      ]) {
        expect(keys).toContain(expected);
      }

      for (const item of feed.body.items) {
        expect(typeof item.type).toBe('string');
        expect(typeof item.title).toBe('string');
        expect(Number.isNaN(Date.parse(item.ts))).toBe(false);
        expect(typeof item.entity.type).toBe('string');
        expect(typeof item.entity.id).toBe('string');
        expect(typeof item.entity.name).toBe('string');
        expect(typeof item.entity.summary).toBe('string');
      }

      const accepted = feed.body.items.find(
        (item: any) => item.type === 'application.accepted',
      );
      expect(accepted.entity.name).toBe(OPP_TITLE);
      expect(accepted.entity.summary).toContain('Status accepted');
      const verified = feed.body.items.find(
        (item: any) => item.type === 'submission.verified',
      );
      expect(verified.title).toContain('record issued');
      expect(verified.entity.summary).toContain('State verified');
    });
  });

  describe('volunteer feed reflects the journey exactly once', () => {
    it('contains apply/review/accept/submit/verify/start items, deduped', async () => {
      await pollUntil(async () => {
        const feed = await readFeed(volunteerToken, VOLUNTEER_ACTIVITY);
        return feed.body.total === 7 && feed.body.items.length === 7;
      });
      const feed = await readFeed(volunteerToken, VOLUNTEER_ACTIVITY);
      const keys = feed.body.items.map(keyOf);
      expect(new Set(keys).size).toBe(keys.length);
      for (const expected of [
        `application.applied:${applicationId}`,
        `application.under_review:${applicationId}`,
        `application.accepted:${applicationId}`,
        `submission.submitted:${submissionId}`,
        `submission.under_review:${submissionId}`,
        `submission.verified:${submissionId}`,
      ]) {
        expect(keys).toContain(expected);
      }
      const participation = feed.body.items.find((item: any) =>
        item.type.startsWith('participation.'),
      );
      expect(participation).toBeDefined();
      expect(participation.entity.summary).toContain('Status');
    });
  });

  describe('isolation', () => {
    it("a volunteer's feed excludes other orgs' activity", async () => {
      const feed = await readFeed(volunteerToken, VOLUNTEER_ACTIVITY);
      const serialized = JSON.stringify(feed.body.items);
      expect(serialized).not.toContain('S12 Other Cleanup');
    });

    it("an org's feed excludes other orgs' opportunities", async () => {
      const feed = await readFeed(orgToken, ORG_ACTIVITY);
      const serialized = JSON.stringify(feed.body.items);
      expect(serialized).not.toContain('S12 Other Cleanup');
    });

    it('the bystander sees only their own application', async () => {
      await pollUntil(async () => {
        const feed = await readFeed(bystanderToken, VOLUNTEER_ACTIVITY);
        return feed.body.total === 1;
      });
      const feed = await readFeed(bystanderToken, VOLUNTEER_ACTIVITY);
      expect(feed.body.items).toHaveLength(1);
      expect(feed.body.items[0].type).toBe('application.applied');
    });
  });

  describe('pagination and totals', () => {
    it('pages through the volunteer feed without overlap', async () => {
      const first = await readFeed(
        volunteerToken,
        VOLUNTEER_ACTIVITY,
        '?limit=2',
      );
      expect(first.body.total).toBe(7);
      expect(first.body.page).toBe(1);
      expect(first.body.pages).toBe(4);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toBeTruthy();

      const seen = new Set(first.body.items.map(keyOf));
      let cursor = first.body.nextCursor as string;
      for (let page = 2; page <= 4; page += 1) {
        const next = await readFeed(
          volunteerToken,
          VOLUNTEER_ACTIVITY,
          `?limit=2&cursor=${encodeURIComponent(cursor)}`,
        );
        expect(next.body.page).toBe(page);
        for (const item of next.body.items) {
          expect(seen.has(keyOf(item))).toBe(false);
          seen.add(keyOf(item));
        }
        cursor = next.body.nextCursor as string;
        if (page < 4) {
          expect(cursor).toBeTruthy();
        }
      }
      expect(seen.size).toBe(7);
    });

    it('treats a malformed cursor as the first page', async () => {
      const feed = await readFeed(
        volunteerToken,
        VOLUNTEER_ACTIVITY,
        '?limit=2&cursor=malformed!!!',
      );
      expect(feed.body.page).toBe(1);
      expect(feed.body.items).toHaveLength(2);
    });
  });

  describe('authorization', () => {
    it('rejects guests with 401', async () => {
      await request(info.app.getHttpServer()).get(ORG_ACTIVITY).expect(401);
      await request(info.app.getHttpServer())
        .get(VOLUNTEER_ACTIVITY)
        .expect(401);
    });

    it('rejects cross-role callers with 403', async () => {
      await request(info.app.getHttpServer())
        .get(ORG_ACTIVITY)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
      await request(info.app.getHttpServer())
        .get(VOLUNTEER_ACTIVITY)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(403);
    });
  });
});
