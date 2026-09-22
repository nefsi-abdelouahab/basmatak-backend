import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { DomainEvents } from '../src/common/constants/domain-events';
import { StatusTransitionService } from '../src/core/status-transitions/status-transition.service';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../src/core/status-transitions/status-histories.schema';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../src/organizations/schemas/organization.schema';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from '../src/submissions/schemas/submission.schema';

const ORG_REGISTER = '/api/v1/auth/register/organization';
const VOLUNTEER_REGISTER = '/api/v1/auth/register/volunteer';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const ORG_SUBMISSIONS = '/api/v1/organizations/me/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const NOTIFICATIONS = '/api/v1/notifications';

describe('submissions e2e (S10 Part A)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let orgId: string;
  let bystanderToken: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    orgToken = await registerVerifiedOrg('s10-org@example.com');
    bystanderToken = await registerVerifiedVolunteer('s10-by@example.com');
    const org = await readOrg('s10-org');
    orgId = String(org._id);
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

  async function readOrg(slug: string) {
    const connection = await createConnection(info.uri).asPromise();
    try {
      const doc = await connection
        .model(OrganizationsCollection, OrganizationSchema)
        .findOne({ slug })
        .lean();
      expect(doc).toBeDefined();
      return doc!;
    } finally {
      await connection.close();
    }
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
          { title: 'Litter picker', requiredCount: 1, requiredSkills: [] },
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

  /** Fresh opportunity + accepted application → returns the participation id. */
  async function makeParticipation(
    orgTokenOwner: string,
    volunteerToken: string,
    title: string,
  ): Promise<{ participationId: string; opportunity: Record<string, any> }> {
    const opportunity = await createOpportunity(orgTokenOwner, title);
    await publishOpportunity(orgTokenOwner, opportunity._id);
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
    const tasks = await request(info.app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .expect(200);
    return {
      participationId: tasks.body.items[0]._id as string,
      opportunity,
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
      })
      .expect(201);
    return response.body.mediaId as string;
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

  describe('6.1 create draft', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s10-a@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S10 Create Draft',
      );
      participationId = pair.participationId;
    });

    it('creates a draft with position-derived deliverables', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/submissions`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(201);
      expect(response.body.status).toBe('draft');
      expect(response.body.deliverables).toHaveLength(1);
      expect(response.body.deliverables[0].title).toBe('Litter picker');
      expect(response.body.consentConfirmed).toBe(false);
      draftId = response.body._id as string;
    });

    it('rejects a second create for the same participation with 409', async () => {
      const response = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/submissions`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(409);
      expect(response.body.code).toBe('SUBMISSION_ALREADY_EXISTS');
    });

    it('treats a foreign participation as not found (404)', async () => {
      await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/000000000000000000000000/submissions`)
        .set('Authorization', `Bearer ${bystanderToken}`)
        .expect(404);
    });

    it('lists own submissions and filters by status', async () => {
      const mine = await request(info.app.getHttpServer())
        .get(`${SUBMISSIONS}/me`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0]._id).toBe(draftId);

      const drafts = await request(info.app.getHttpServer())
        .get(`${SUBMISSIONS}/me?status=draft`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(drafts.body.items).toHaveLength(1);
    });
  });

  describe('6.2 full happy path (draft → submit → inbox → start-review)', () => {
    let volunteerToken: string;
    let participationId: string;
    let opportunity: Record<string, any>;
    let draftId: string;
    let evidenceId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s10-b@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S10 Happy Path',
      );
      participationId = pair.participationId;
      opportunity = pair.opportunity;

      const created = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/submissions`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(201);
      draftId = created.body._id as string;
      evidenceId = await uploadEvidence(volunteerToken);
    });

    it('patches description + evidence, then submits with consent', async () => {
      const patched = await request(info.app.getHttpServer())
        .patch(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ description: 'Picked 12 bags', evidence: [evidenceId] })
        .expect(200);
      expect(patched.body.status).toBe('draft');
      expect(patched.body.description).toBe('Picked 12 bags');
      expect(patched.body.evidence).toHaveLength(1);

      const submitted = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/submit`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ consentConfirmed: true })
        .expect(200);
      expect(submitted.body.status).toBe('submitted');
      expect(submitted.body.consentConfirmed).toBe(true);
    });

    it('appears in the org inbox filtered by status + opportunity', async () => {
      const inbox = await request(info.app.getHttpServer())
        .get(
          `${ORG_SUBMISSIONS}?status=submitted&opportunityId=${opportunity._id}`,
        )
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(inbox.body.items).toHaveLength(1);
      expect(inbox.body.items[0]._id).toBe(draftId);
      expect(inbox.body.items[0].status).toBe('submitted');
    });

    it('emits exactly one submission.submitted notification to the org', async () => {
      await pollUntil(async () => {
        const list = await request(info.app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${orgToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) =>
            n.type === DomainEvents.SubmissionSubmitted &&
            n.payload?.submission?._id === draftId,
        );
      });

      const list = await request(info.app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      const forThis = list.body.items.filter(
        (n: any) =>
          n.type === DomainEvents.SubmissionSubmitted &&
          n.payload?.submission?._id === draftId,
      );
      expect(forThis).toHaveLength(1);
    });

    it('start-review moves it under_review and is idempotent on repeat', async () => {
      const started = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(started.body.status).toBe('under_review');

      const again = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(again.body.status).toBe('under_review');
    });
  });

  describe('6.3 constraint paths', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;
    let evidenceId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s10-c@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S10 Constraints',
      );
      participationId = pair.participationId;
      const created = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/submissions`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(201);
      draftId = created.body._id as string;
      evidenceId = await uploadEvidence(volunteerToken);
    });

    it('foreign volunteer cannot patch (404) and the row stays untouched', async () => {
      await request(info.app.getHttpServer())
        .patch(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${bystanderToken}`)
        .send({ description: 'hacked' })
        .expect(404);

      const detail = await request(info.app.getHttpServer())
        .get(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(detail.body.description).not.toBe('hacked');
    });

    it('submit without consent on image evidence → 400 CONSENT_REQUIRED', async () => {
      await request(info.app.getHttpServer())
        .patch(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          description: 'Has image but no consent',
          evidence: [evidenceId],
        })
        .expect(200);

      const response = await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/submit`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({})
        .expect(400);
      expect(response.body.code).toBe('CONSENT_REQUIRED');

      const reloaded = await request(info.app.getHttpServer())
        .get(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(reloaded.body.status).toBe('draft');
    });

    it('volunteer cannot use the org inbox (403)', async () => {
      await request(info.app.getHttpServer())
        .get(ORG_SUBMISSIONS)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(403);
    });

    it('non-owning org cannot start review (404)', async () => {
      const otherOrgToken = await registerVerifiedOrg('s10-other@example.com');
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .expect(404);
    });
  });

  describe('6.4 resubmission after rejection (rejected → draft)', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;
    let evidenceId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s10-d@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S10 Resubmit',
      );
      participationId = pair.participationId;
      const created = await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${participationId}/submissions`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(201);
      draftId = created.body._id as string;
      evidenceId = await uploadEvidence(volunteerToken);

      await request(info.app.getHttpServer())
        .patch(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ description: 'Work completed', evidence: [evidenceId] })
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/submit`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ consentConfirmed: true })
        .expect(200);
    });

    it('moves to under_review, then Part-B style rejection lets the volunteer reopen the draft', async () => {
      // Org opens the review (submitted → under_review).
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      // Simulate Part B's verdict via the whitelist directly.
      const transitions = info.app.get(StatusTransitionService);
      await transitions.assert({
        entityType: 'submission',
        entityId: draftId,
        from: 'under_review',
        to: 'rejected',
        actor: orgId,
      });
      const connection = await createConnection(info.uri).asPromise();
      try {
        await connection
          .model(SubmissionsCollection, SubmissionSchema)
          .updateOne(
            { _id: new Types.ObjectId(draftId) },
            { $set: { status: 'rejected' } },
          )
          .exec();
      } finally {
        await connection.close();
      }

      // Volunteer edits → rejected→draft with a fresh history row.
      const edited = await request(info.app.getHttpServer())
        .patch(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ description: 'Fixed and resubmitting' })
        .expect(200);
      expect(edited.body.status).toBe('draft');
      expect(edited.body.description).toBe('Fixed and resubmitting');

      const historyConnection = await createConnection(info.uri).asPromise();
      try {
        const history = await historyConnection
          .model(StatusHistoryCollection, StatusHistorySchema)
          .countDocuments({
            entityType: 'submission',
            entityId: new Types.ObjectId(draftId),
            to: 'draft',
          })
          .exec();
        expect(history).toBe(1);
      } finally {
        await historyConnection.close();
      }
    });
  });

  describe('6.5 org scoping across two organizations', () => {
    let otherOrgToken: string;
    let otherOrgId: string;
    let otherVolunteer: string;
    let otherParticipationId: string;

    beforeAll(async () => {
      otherOrgToken = await registerVerifiedOrg('s10-scope-org@example.com');
      otherVolunteer = await registerVerifiedVolunteer(
        's10-scope-v@example.com',
      );
      const otherOrg = await readOrg('s10-scope-org');
      otherOrgId = String(otherOrg._id);
      const pair = await makeParticipation(
        otherOrgToken,
        otherVolunteer,
        'S10 Second Org',
      );
      otherParticipationId = pair.participationId;
    });

    it('each org inbox only ever lists its own submissions', async () => {
      await request(info.app.getHttpServer())
        .post(`${PARTICIPATIONS}/${otherParticipationId}/submissions`)
        .set('Authorization', `Bearer ${otherVolunteer}`)
        .expect(201);

      const inbox = await request(info.app.getHttpServer())
        .get(ORG_SUBMISSIONS)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .expect(200);
      expect(inbox.body.items).toHaveLength(1);
      expect(String(inbox.body.items[0].organizationId)).toBe(otherOrgId);

      const originalOrgInbox = await request(info.app.getHttpServer())
        .get(ORG_SUBMISSIONS)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(originalOrgInbox.body.items.length).toBeGreaterThan(0);
      expect(
        originalOrgInbox.body.items.every(
          (item: any) => String(item.organizationId) === orgId,
        ),
      ).toBe(true);
    });
  });
});
