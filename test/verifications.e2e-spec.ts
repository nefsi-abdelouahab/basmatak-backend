import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { TestMailService } from './utils/test-mail.service';
import { createTestApp, TestAppHandle } from './utils/test-db';
import { MAIL_SERVICE } from '../src/mail/mail.interface';
import { DomainEvents } from '../src/common/constants/domain-events';
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
import {
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../src/participations/schemas/task-participant.schema';
import {
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../src/volunteers/schemas/volunteer-profile.schema';
import {
  VerificationsCollection,
  VerificationSchema,
} from '../src/verifications/schemas/verification.schema';
import {
  VolunteerExperiencesCollection,
  VolunteerExperienceSchema,
} from '../src/verifications/schemas/volunteer-experience.schema';
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
const VERIFY = '/api/v1/submissions';
const EXPERIENCES = '/api/v1/experiences';
const PUBLIC_PROOF = '/api/v1/verify';

const CODE_PATTERN = new RegExp('^[A-HJ-NP-Z2-9]{8}$');

describe('verifications e2e (S11 Part B)', () => {
  let info: TestAppHandle;
  let mail: TestMailService;

  let orgToken: string;
  let orgSlug: string;
  let orgUserId: string;

  beforeAll(async () => {
    mail = new TestMailService();
    info = await createTestApp([], {
      env: { THROTTLE_LIMIT: '100000' },
      providers: [{ token: MAIL_SERVICE, useValue: mail }],
    });

    orgToken = await registerVerifiedOrg('s11-org@example.com');
    orgSlug = 's11-org';
    const org = await readOrg(orgSlug);
    orgUserId = String(org.userId);
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
          {
            title: 'Litter picker',
            description: 'Collect litter',
            requiredCount: 1,
            requiredSkills: [],
          },
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

  async function makeParticipation(
    orgTokenOwner: string,
    volunteerToken: string,
    title: string,
  ): Promise<{ participationId: string }> {
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
    return { participationId: candidates[0]._id as string };
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
  ): Promise<{ draftId: string; evidenceId: string }> {
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
    return { draftId, evidenceId };
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

  async function readMany(
    collection: string,
    schema: any,
    filter: Record<string, unknown> = {},
  ): Promise<any[]> {
    const connection = await createConnection(info.uri).asPromise();
    try {
      return await connection.model(collection, schema).find(filter).lean();
    } finally {
      await connection.close();
    }
  }

  describe('13.1 verify happy path', () => {
    let volunteerToken: string;
    let volunteerId: string;
    let participationId: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-b@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Happy Path',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      const volunteer = await readDoc<{
        _id: Types.ObjectId;
        userId: Types.ObjectId;
      }>(VolunteerProfilesCollection, VolunteerProfileSchema, {});
      volunteerId = String(volunteer!.userId);
    });

    it('org starts review and verifies: approved, completed, rows, stats', async () => {
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      const verified = await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ notes: 'Verified on arrival' })
        .expect(200);
      expect(verified.body.status).toBe('approved');
      expect(verified.body.notes).toBeUndefined();

      const submissionDoc = await readDoc<any>(
        SubmissionsCollection,
        SubmissionSchema,
        { _id: new Types.ObjectId(draftId) },
      );
      expect(submissionDoc!.status).toBe('approved');

      const participant = await readDoc<any>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
        { _id: submissionDoc!.participantId },
      );
      expect(participant!.status).toBe('completed');

      const verification = await readDoc<any>(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(verification!.status).toBe('verified');
      expect(String(verification!.decidedBy)).toBe(orgUserId);

      const experience = await readDoc<any>(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(experience).toBeDefined();
      expect(experience!.title).toBe('Litter picker');
      expect(experience!.verificationCode).toMatch(CODE_PATTERN);

      const profile = await readDoc<any>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
        { userId: new Types.ObjectId(volunteerId) },
      );
      expect(profile!.stats).toEqual({
        completedTasks: 1,
        verifiedExperiences: 1,
        volunteerHours: 0,
      });

      const submissionHistories = await readMany(
        StatusHistoryCollection,
        StatusHistorySchema,
        { entityType: 'submission', entityId: new Types.ObjectId(draftId) },
      );
      expect(submissionHistories).toHaveLength(3);
      const participantHistories = await readMany(
        StatusHistoryCollection,
        StatusHistorySchema,
        {
          entityType: 'task_participant',
          entityId: submissionDoc!.participantId,
        },
      );
      expect(participantHistories).toHaveLength(1);
    });

    it('emits exactly one volunteer notification and one experience row after verify', async () => {
      await pollUntil(async () => {
        const list = await request(info.app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) =>
            n.type === DomainEvents.SubmissionVerified &&
            n.payload?.submissionId === draftId,
        );
      });
      const list = await request(info.app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      const verifiedNotifications = list.body.items.filter(
        (n: any) =>
          n.type === DomainEvents.SubmissionVerified &&
          n.payload?.submissionId === draftId,
      );
      expect(verifiedNotifications).toHaveLength(1);

      const scoped = await readMany(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(scoped).toHaveLength(1);
    });
  });

  describe('13.2 constraint paths', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-c@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Constraints',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({})
        .expect(200);
    });

    it('double verify fails 409 and writes nothing further', async () => {
      const second = await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({})
        .expect(409);
      expect(second.body.code).toBe('INVALID_STATUS_TRANSITION');
      const verifications = await readMany(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(verifications).toHaveLength(1);
      const experiences = await readMany(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(experiences).toHaveLength(1);
      const reviews = await readMany(ReviewsCollection, ReviewSchema, {
        submissionId: new Types.ObjectId(draftId),
      });
      expect(reviews).toHaveLength(0);
    });

    it('reject on an already-approved submission fails 409', async () => {
      const rejected = await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'Too late' })
        .expect(409);
      expect(rejected.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('reject without a reason fails 400', async () => {
      const bad = await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({})
        .expect(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
    });

    it('a volunteer cannot decide and a bystander volunteer sees no rows', async () => {
      const bystander = await registerVerifiedVolunteer('s11-d@example.com');
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({})
        .expect(403);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${bystander}`)
        .send({})
        .expect(403);
    });

    it('a non-owning organization cannot verify (404)', async () => {
      const otherOrgToken = await registerVerifiedOrg('s11-other@example.com');
      const response = await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .send({})
        .expect(404);
      expect(response.body.code).toBe('SUBMISSION_NOT_FOUND');
    });
  });

  describe('13.3 read scoping', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;
    let verificationId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-e@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Reads',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({})
        .expect(200);
      const verification = await readDoc<any>(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      verificationId = String(verification!._id);
    });

    it('own volunteer and owning org read the verification; foreigners get 404', async () => {
      await request(info.app.getHttpServer())
        .get(`/api/v1/verifications/${verificationId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);

      await request(info.app.getHttpServer())
        .get(`/api/v1/verifications/${verificationId}`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      const bystander = await registerVerifiedVolunteer('s11-f@example.com');
      await request(info.app.getHttpServer())
        .get(`/api/v1/verifications/${verificationId}`)
        .set('Authorization', `Bearer ${bystander}`)
        .expect(404);

      const otherOrgToken = await registerVerifiedOrg('s11-other2@example.com');
      await request(info.app.getHttpServer())
        .get(`/api/v1/verifications/${verificationId}`)
        .set('Authorization', `Bearer ${otherOrgToken}`)
        .expect(404);
    });
  });

  describe('13.4 resubmission flow (reject → resubmit → re-verify, single rows)', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-gg@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Resubmit',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'Blurry photo' })
        .expect(200);
    });

    it('keeps a single experience, review and verified row across a resubmit re-verify', async () => {
      // Volunteer fixes the rejected draft (Part A rule: rejected → draft) and
      // resubmits.
      const edited = await request(info.app.getHttpServer())
        .patch(`${SUBMISSIONS}/${draftId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ description: 'Fixed and clearer photo' })
        .expect(200);
      expect(edited.body.status).toBe('draft');
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/submit`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ consentConfirmed: true })
        .expect(200);

      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ review: { rating: 4, comment: 'Now good' } })
        .expect(200);

      const verifications = await readMany(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(verifications).toHaveLength(1);
      expect(verifications[0].status).toBe('verified');
      expect(verifications[0].reason).toBeUndefined();

      const experiences = await readMany(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(experiences).toHaveLength(1);

      const reviews = await readMany(ReviewsCollection, ReviewSchema, {
        submissionId: new Types.ObjectId(draftId),
      });
      expect(reviews).toHaveLength(1);

      const experienceIds = new Set(experiences.map((e: any) => String(e._id)));
      expect(experienceIds.size).toBe(1);
    });

    it('does not double-count stats or duplicate participants', async () => {
      const profile = await readDoc<any>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
        { username: 's11-gg' },
      );
      expect(profile!.stats).toEqual({
        completedTasks: 1,
        verifiedExperiences: 1,
        volunteerHours: 0,
      });
    });
  });

  describe('13.5 experiences (me/detail/visibility)', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;
    let evidenceId: string;
    let experienceId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-g@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Experiences',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      evidenceId = submitted.evidenceId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({})
        .expect(200);
      const experience = await readDoc<any>(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      experienceId = String(experience!._id);
    });

    it('lists own experiences and reads detail with evidence + review', async () => {
      const mine = await request(info.app.getHttpServer())
        .get(`${EXPERIENCES}/me`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0].verificationCode).toMatch(CODE_PATTERN);

      const detail = await request(info.app.getHttpServer())
        .get(`${EXPERIENCES}/${experienceId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(detail.body.title).toBe('Litter picker');
      expect(detail.body.verificationCode).toMatch(CODE_PATTERN);
      expect(detail.body.evidence).toHaveLength(1);
      expect(detail.body.evidence[0].mediaId).toBe(evidenceId);
      expect(detail.body.review).toBeNull();
    });

    it('toggles visibility and exposes the change on detail', async () => {
      const toggled = await request(info.app.getHttpServer())
        .patch(`${EXPERIENCES}/${experienceId}/visibility`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ publicVisibility: 'private' })
        .expect(200);
      expect(toggled.body.publicVisibility).toBe('private');

      const detail = await request(info.app.getHttpServer())
        .get(`${EXPERIENCES}/${experienceId}`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(detail.body.publicVisibility).toBe('private');
    });

    it('a non-owning volunteer cannot read the experience (404)', async () => {
      const bystander = await registerVerifiedVolunteer('s11-h@example.com');
      await request(info.app.getHttpServer())
        .get(`${EXPERIENCES}/${experienceId}`)
        .set('Authorization', `Bearer ${bystander}`)
        .expect(404);
      await request(info.app.getHttpServer())
        .get(`${EXPERIENCES}/me`)
        .set('Authorization', `Bearer ${bystander}`)
        .expect(200);
      expect(
        (
          await request(info.app.getHttpServer())
            .get(`${EXPERIENCES}/me`)
            .set('Authorization', `Bearer ${bystander}`)
            .expect(200)
        ).body.items,
      ).toHaveLength(0);
    });
  });

  describe('13.6 public proof', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;
    let verificationCode: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-i@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Proof',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({})
        .expect(200);
      const experience = await readDoc<any>(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      verificationCode = experience!.verificationCode;
    });

    it('returns a public proof for the code without auth', async () => {
      const proof = await request(info.app.getHttpServer())
        .get(`${PUBLIC_PROOF}/${verificationCode}`)
        .expect(200);
      expect(proof.body.title).toBe('Litter picker');
      expect(proof.body.volunteer.handle).toBe('s11-i');
      expect(proof.body.volunteer.firstName).toBeNull();
      // Private evidence never leaks to guests.
      expect(proof.body.evidence).toHaveLength(0);
    });

    it('is case-insensitive for the code and 404s on an unknown code', async () => {
      await request(info.app.getHttpServer())
        .get(`${PUBLIC_PROOF}/${verificationCode.toLowerCase()}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .get(`${PUBLIC_PROOF}/AAAAAAAA`)
        .expect(404);
    });
  });

  describe('13.7 review written once with a deduped notification', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-j@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Review',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ review: { rating: 5, comment: 'Great work' } })
        .expect(200);
    });

    it('writes exactly one review row', async () => {
      const reviews = await readMany(ReviewsCollection, ReviewSchema, {
        submissionId: new Types.ObjectId(draftId),
      });
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({ rating: 5, comment: 'Great work' });

      const detail = await request(info.app.getHttpServer())
        .get(
          `${EXPERIENCES}/${String(
            (await readDoc<any>(
              VolunteerExperiencesCollection,
              VolunteerExperienceSchema,
              { submissionId: new Types.ObjectId(draftId) },
            ))!._id,
          )}`,
        )
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(detail.body.review.rating).toBe(5);
    });

    it('does not duplicate the volunteer notification (in-txn write + bus dedupe)', async () => {
      await pollUntil(async () => {
        const list = await request(info.app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) =>
            n.type === DomainEvents.SubmissionVerified &&
            n.payload?.submissionId === draftId,
        );
      });
      const list = await request(info.app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      const matches = list.body.items.filter(
        (n: any) =>
          n.type === DomainEvents.SubmissionVerified &&
          n.payload?.submissionId === draftId,
      );
      expect(matches).toHaveLength(1);
    });
  });

  describe('13.8 reject flow', () => {
    let volunteerToken: string;
    let participationId: string;
    let draftId: string;

    beforeAll(async () => {
      volunteerToken = await registerVerifiedVolunteer('s11-k@example.com');
      const pair = await makeParticipation(
        orgToken,
        volunteerToken,
        'S11 Reject',
      );
      participationId = pair.participationId;
      const submitted = await createAndSubmitSubmission(
        volunteerToken,
        participationId,
      );
      draftId = submitted.draftId;
      await request(info.app.getHttpServer())
        .post(`${SUBMISSIONS}/${draftId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
    });

    it('rejects the submission, records the reason, leaves stats alone', async () => {
      const rejected = await request(info.app.getHttpServer())
        .post(`${VERIFY}/${draftId}/reject`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ reason: 'Blurry photo' })
        .expect(200);
      expect(rejected.body.status).toBe('rejected');

      const verification = await readDoc<any>(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(draftId) },
      );
      expect(verification!.status).toBe('rejected');
      expect(verification!.reason).toBe('Blurry photo');

      const profile = await readDoc<any>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
        { username: 's11-k' },
      );
      expect(profile!.stats).toEqual({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
    });

    it('notifies the volunteer about the rejection', async () => {
      await pollUntil(async () => {
        const list = await request(info.app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) =>
            n.type === DomainEvents.SubmissionRejected &&
            n.payload?.submission?._id === draftId,
        );
      });
    });
  });
});
