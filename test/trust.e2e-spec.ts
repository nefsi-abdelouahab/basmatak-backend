import { createConnection } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { DomainEvents } from '../src/common/constants/domain-events';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../src/opportunities/schemas/opportunity.schema';
import { ReviewsCollection, ReviewSchema } from '../src/reviews/review.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const NOTIFICATIONS = '/api/v1/notifications';
const REVIEWS_VOLUNTEER = '/api/v1/volunteers/me/reviews';
const REVIEWS_ORG = '/api/v1/organizations/me/reviews';
const PUBLISH_GATE = '/api/v1/organizations/me/publish-gate';
const JOBS_RUN = '/api/v1/internal/jobs/run';
const JOBS_KEY = process.env.JOBS_KEY ?? 'test-jobs-key';

describe('trust e2e (S12 review routes + publish gate + reliability)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let orgSlug: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    orgToken = await registerVerifiedOrg('s12-org@example.com');
    orgSlug = 's12-org';
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
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, any>> {
    const response = await request(info.app.getHttpServer())
      .post(ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: `${title} description`,
        positions: [
          {
            title: 'Litter picker',
            description: 'Collect litter',
            requiredCount: 1,
            requiredSkills: [],
          },
        ],
        ...overrides,
      });
    expect(response.status).toBe(201);
    return response.body;
  }

  function publishOpportunity(
    token: string,
    opportunityId: string,
  ): request.Test {
    return request(info.app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function makeParticipation(
    orgTokenOwner: string,
    volunteerToken: string,
    title: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ participationId: string; opportunityId: string }> {
    const opportunity = await createOpportunity(
      orgTokenOwner,
      title,
      overrides,
    );
    const published = await publishOpportunity(orgTokenOwner, opportunity._id);
    expect(published.status).toBe(200);
    const applied = await request(info.app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/${opportunity._id}/positions/${opportunity.positions[0]._id}/applications`,
      )
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(201);
    await request(info.app.getHttpServer())
      .post(`${APPLICATIONS}/${applied.body._id}/accept`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .expect(200);
    const pending = await request(info.app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    const candidates = pending.body.items.filter(
      (item: any) =>
        String(item.opportunityId) === opportunity._id &&
        item.status === 'accepted',
    );
    expect(candidates).toHaveLength(1);
    return {
      participationId: candidates[0]._id as string,
      opportunityId: opportunity._id as string,
    };
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
        visibility: 'private',
      })
      .expect(201);
    return response.body.mediaId as string;
  }

  async function createAndSubmitSubmission(
    volunteerToken: string,
    participationId: string,
  ): Promise<{ draftId: string }> {
    const created = await request(info.app.getHttpServer())
      .post(`${PARTICIPATIONS}/${participationId}/submissions`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(201);
    const draftId = created.body._id as string;
    const evidenceId = await uploadEvidence(volunteerToken);
    await request(info.app.getHttpServer())
      .patch(`${SUBMISSIONS}/${draftId}`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ description: 'Picked 12 bags', evidence: [evidenceId] })
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/submit`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ consentConfirmed: true })
      .expect(200);
    return { draftId };
  }

  async function verifySubmission(
    orgTokenOwner: string,
    draftId: string,
  ): Promise<void> {
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/start-review`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .expect(200);
    await request(info.app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/verify`)
      .set('Authorization', `Bearer ${orgTokenOwner}`)
      .send({})
      .expect(200);
  }

  async function pollUntil(
    fn: () => Promise<boolean>,
    attempts = 40,
  ): Promise<void> {
    for (let i = 0; i < attempts; i += 1) {
      if (await fn()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('pollUntil timed out');
  }

  async function readDoc<T>(
    collection: string,
    schema: any,
    filter: Record<string, unknown>,
  ): Promise<T | null> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      return (await connection
        .model(collection, schema)
        .findOne(filter)
        .lean()) as T;
    } finally {
      await connection.close();
    }
  }

  describe('12.1 review write + 409 duplicate + both lists', () => {
    let volunteerToken: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s12-a@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S12 Review',
      );
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        pair.participationId,
      );
      draftId = submitted.draftId;
      await verifySubmission(orgToken, draftId);
    });

    it('writes a review for the approved submission', async () => {
      const written = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ rating: 5, comment: 'Great work' })
        .expect(201);
      expect(written.body.rating).toBe(5);
      expect(written.body.comment).toBe('Great work');
    });

    it('rejects a duplicate review with 409 REVIEW_ALREADY_EXISTS', async () => {
      const duplicate = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ rating: 3 })
        .expect(409);
      expect(duplicate.body.code).toBe('REVIEW_ALREADY_EXISTS');
      const reviews = await readDoc<any>(ReviewsCollection, ReviewSchema, {});
      expect(String(reviews!._id)).toBeDefined();
    });

    it('blocks a non-approved submission review (409 REVIEW_NOT_ALLOWED)', async () => {
      const bystander = await registerVerifiedVolunteer('s12-b@example.com');
      const pair = await makeParticipation(
        orgToken,
        bystander,
        'S12 Not Approved',
      );
      const pendingDraft = await createAndSubmitSubmission(
        bystander,
        pair.participationId,
      );
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${pendingDraft.draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      const rejected = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${pendingDraft.draftId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'Needs more evidence' })
        .expect(200);
      expect(rejected.body.status).toBe('rejected');
      const blocked = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${pendingDraft.draftId}/review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ rating: 4 })
        .expect(409);
      expect(blocked.body.code).toBe('REVIEW_NOT_ALLOWED');
    });

    it('lets a foreign organization attempt get 404 SUBMISSION_NOT_FOUND', async () => {
      const otherOrgToken = await registerVerifiedOrg('s12-other@example.com');
      const response = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/review`)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .send({ rating: 2 })
        .expect(404);
      expect(response.body.code).toBe('SUBMISSION_NOT_FOUND');
    });

    it('lists received reviews for the volunteer and given reviews for the org', async () => {
      const received = await request(info.app.getHttpServer())
        .get(REVIEWS_VOLUNTEER)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(received.body.items).toHaveLength(1);
      expect(received.body.items[0].rating).toBe(5);
      expect(received.body.items[0].organization.slug).toBe(orgSlug);

      const given = await request(info.app.getHttpServer())
        .get(REVIEWS_ORG)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(given.body.items).toHaveLength(1);
      expect(given.body.items[0].rating).toBe(5);
      expect(given.body.items[0].submission.opportunityId).toBeDefined();
      expect(given.body.items[0].volunteer.username).toBe('s12-a');
    });
  });

  describe('12.2 publish gate locks at 3 pending opportunities', () => {
    const pendingDrafts: string[] = [];
    let spike: Record<string, any>;

    beforeAll(async () => {
      for (const [index, title] of [
        'S12 Pending A',
        'S12 Pending B',
        'S12 Pending C',
      ].entries()) {
        const volunteerToken = await registerVerifiedVolunteer(
          `s12-gate-${index}@example.com`,
        );
        const pair = await makeParticipation(orgToken, volunteerToken, title);
        const submitted = await createAndSubmitSubmission(
          volunteerToken,
          pair.participationId,
        );
        pendingDrafts.push(submitted.draftId);
      }
      spike = await createOpportunity(orgToken, 'S12 Spike');
    });

    it('reports locked with 3 pending opportunities and the new publish is blocked', async () => {
      const status = await request(info.app.getHttpServer())
        .get(PUBLISH_GATE)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(status.body.locked).toBe(true);
      expect(status.body.pendingCount).toBe(3);
      expect(status.body.threshold).toBe(3);
      expect(status.body.pendingOpportunities).toHaveLength(3);
      expect(status.body.pendingOpportunities[0].slug).toBeDefined();
      expect(status.body.pendingOpportunities[0].title).toBeDefined();

      const blocked = await publishOpportunity(orgToken, spike._id).expect(409);
      expect(blocked.body.code).toBe('PUBLISH_GATE_LOCKED');
    });

    it('emits a publish-gate.locked notification to the org owner', async () => {
      await pollUntil(async () => {
        const list = await request(info.app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${orgToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) => n.type === DomainEvents.PublishGateLocked,
        );
      });
      const list = await request(info.app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      const matches = list.body.items.filter(
        (n: any) => n.type === DomainEvents.PublishGateLocked,
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(String(matches[0].payload.organizationId)).toBeTruthy();
    });

    it('deciding a whole pending opportunity unlocks the gate and publish recovers', async () => {
      await verifySubmission(orgToken, pendingDrafts[0]);
      const status = await request(info.app.getHttpServer())
        .get(PUBLISH_GATE)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(status.body.locked).toBe(false);
      expect(status.body.pendingCount).toBe(2);

      await publishOpportunity(orgToken, spike._id).expect(200);
    });
  });

  describe('12.3 public reliability read', () => {
    it('returns the cached reliability for a verified + active org', async () => {
      await pollUntil(async () => {
        const response = await request(info.app.getHttpServer())
          .get(`/api/v1/organizations/${orgSlug}/reliability`)
          .expect(200);
        return Boolean(response.body.lastRefreshedAt);
      });
      const reliability = await request(info.app.getHttpServer())
        .get(`/api/v1/organizations/${orgSlug}/reliability`)
        .expect(200);
      expect(reliability.body.lastRefreshedAt).toBeDefined();
      expect(reliability.body.responseRate).toBeDefined();
      expect(reliability.body.decidedRatio).toBeDefined();
      expect(reliability.body.anomaly).toBeDefined();
    });

    it('exposes median hours once verification rows exist', async () => {
      const reliability = await request(info.app.getHttpServer())
        .get(`/api/v1/organizations/${orgSlug}/reliability`)
        .expect(200);
      expect(reliability.body.medianDecisionHours).toBeDefined();
      expect(reliability.body.medianDecisionHours).toBeGreaterThanOrEqual(0);
    });

    it('404s for an absent org and for a non-verified org', async () => {
      await request(info.app.getHttpServer())
        .get('/api/v1/organizations/nope-org/reliability')
        .expect(404);
      await register('s12-pending@example.com', ORG_REGISTER);
      await verifyLatestEmail();
      await request(info.app.getHttpServer())
        .get('/api/v1/organizations/s12-pending/reliability')
        .expect(404)
        .then((response) => {
          expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
        });
    });
  });

  describe('12.4 opportunity.started ticker still notifies participants', () => {
    let volunteerToken: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s12-c@example.com');
    });

    it('notifies the volunteer when the start ticker fires', async () => {
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S12 Start',
        {
          startDate: new Date(Date.now() - 60_000).toISOString(),
        },
      );
      const opportunity = await readDoc<any>(
        OpportunitiesCollection,
        OpportunitySchema,
        { _id: pair.opportunityId },
      );
      expect(opportunity!.status).toBe('published');

      await request(info.app.getHttpServer())
        .post(JOBS_RUN)
        .set('X-Jobs-Key', JOBS_KEY)
        .expect(200);

      await pollUntil(async () => {
        const list = await request(info.app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) => n.type === DomainEvents.OpportunityStarted,
        );
      });

      const moved = await readDoc<any>(
        OpportunitiesCollection,
        OpportunitySchema,
        { _id: pair.opportunityId },
      );
      expect(moved!.status).toBe('in_progress');
    });
  });
});
