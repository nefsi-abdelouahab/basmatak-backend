import { INestApplication } from '@nestjs/common';
import { createConnection, Types } from 'mongoose';
import * as request from 'supertest';
import { MAIL_SERVICE } from '../../src/mail/mail.interface';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { DomainEvents } from '../../src/common/constants/domain-events';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../../src/core/status-transitions/status-histories.schema';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../../src/organizations/schemas/organization.schema';
import {
  ApplicationsCollection,
  ApplicationSchema,
} from '../../src/applications/schemas/application.schema';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../../src/opportunities/schemas/opportunity.schema';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from '../../src/submissions/schemas/submission.schema';
import {
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../../src/participations/schemas/task-participant.schema';
import {
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../../src/volunteers/schemas/volunteer-profile.schema';
import {
  VerificationsCollection,
  VerificationSchema,
} from '../../src/verifications/schemas/verification.schema';
import {
  VolunteerExperiencesCollection,
  VolunteerExperienceSchema,
} from '../../src/verifications/schemas/volunteer-experience.schema';
import {
  ReviewsCollection,
  ReviewSchema,
} from '../../src/reviews/review.schema';
import {
  SkillsCollection,
  SkillSchema,
} from '../../src/skills/schemas/skill.schema';
import { TestMailService } from '../utils/test-mail.service';
import { createTestApp, TestAppHandle } from '../utils/test-db';
import {
  CORE_ADMIN_EMAIL,
  CORE_ADMIN_PASSWORD,
  CORE_JOBS_KEY,
  CORE_LOOP_ENV,
  seedCoreData,
} from '../helpers/seed-utils';

const REGISTER_VOLUNTEER = '/api/v1/auth/register/volunteer';
const REGISTER_ORG = '/api/v1/auth/register/organization';
const LOGIN = '/api/v1/auth/login';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const ORGS_ME_VERIFICATION = '/api/v1/organizations/me/verification';
const ORGS_ME_OPPORTUNITIES = '/api/v1/organizations/me/opportunities';
const OPPORTUNITIES = '/api/v1/opportunities';
const APPLICATIONS = '/api/v1/applications';
const PARTICIPATIONS = '/api/v1/participations';
const SUBMISSIONS = '/api/v1/submissions';
const MEDIA_UPLOADS = '/api/v1/media/uploads';
const NOTIFICATIONS = '/api/v1/notifications';
const PUBLIC_PROOF = '/api/v1/verify';
const VOLUNTEERS_ME = '/api/v1/volunteers/me';
const VOLUNTEERS_PUBLIC = '/api/v1/volunteers';
const ADMIN_ORGANIZATIONS = '/api/v1/admin/organizations';
const PUBLISH_GATE = '/api/v1/organizations/me/publish-gate';
const JOBS_RUN = '/api/v1/internal/jobs/run';

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const PASSWORD = 'Password123!';

describe('core loop e2e (S18): register → verify → apply → start → submit → approve → proof', () => {
  let info: TestAppHandle;
  let app: INestApplication;
  let mail: TestMailService;

  let volunteerToken: string;
  let volunteerId: string;
  let volunteerUsername: string;
  let orgToken: string;
  let orgUserId: string;
  let adminToken: string;
  let coreOpportunity: Record<string, any>;
  let coreApplicationId: string;
  let coreParticipationId: string;
  let coreSubmissionId: string;
  let coreEvidencePublic: string;
  let coreEvidencePrivate: string;
  let coreVerificationCode: string;
  let coreOrganizationId: string;

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
  });

  afterAll(async () => {
    if (info) {
      await info.close();
    }
  });

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

  async function register(endpoint: string, email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .send({ email, password: PASSWORD });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function verifyLatestEmail(): Promise<void> {
    const record = mail.latest('verify');
    expect(record).toBeDefined();
    await request(app.getHttpServer())
      .post(VERIFY_EMAIL)
      .send({ token: record!.token })
      .expect(204);
  }

  async function registerVerifiedVolunteer(email: string): Promise<string> {
    const token = await register(REGISTER_VOLUNTEER, email);
    await verifyLatestEmail();
    return token;
  }

  async function uploadMedia(
    token: string,
    purpose: string,
    visibility: string,
  ): Promise<string> {
    const isEvidence = purpose === 'submission_evidence';
    const response = await request(app.getHttpServer())
      .post(MEDIA_UPLOADS)
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: isEvidence ? 'evidence.png' : 'license.pdf',
        mimeType: isEvidence ? 'image/png' : 'application/pdf',
        size: 12_345,
        purpose,
        visibility,
      })
      .expect(201);
    return response.body.mediaId as string;
  }

  async function createOpportunity(
    token: string,
    title: string,
    extra: Record<string, unknown> = {},
  ): Promise<Record<string, any>> {
    const response = await request(app.getHttpServer())
      .post(ORGS_ME_OPPORTUNITIES)
      .set('Authorization', `Bearer ${token}`)
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
      });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function publishOpportunity(
    token: string,
    opportunityId: string,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(`${OPPORTUNITIES}/${opportunityId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function applyAndAccept(
    ownerToken: string,
    applyToken: string,
    opportunity: Record<string, any>,
  ): Promise<{ applicationId: string; participationId: string }> {
    const applied = await request(app.getHttpServer())
      .post(
        `${OPPORTUNITIES}/${opportunity._id}/positions/${opportunity.positions[0]._id}/applications`,
      )
      .set('Authorization', `Bearer ${applyToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${APPLICATIONS}/${applied.body._id}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const pending = await request(app.getHttpServer())
      .get(`${PARTICIPATIONS}/me`)
      .set('Authorization', `Bearer ${applyToken}`)
      .expect(200);
    const candidates = pending.body.items.filter(
      (item: any) =>
        String(item.opportunityId) === opportunity._id &&
        item.status === 'accepted',
    );
    expect(candidates).toHaveLength(1);
    return {
      applicationId: applied.body._id as string,
      participationId: candidates[0]._id as string,
    };
  }

  async function runJobs(): Promise<void> {
    const response = await request(app.getHttpServer())
      .post(JOBS_RUN)
      .set('X-Jobs-Key', CORE_JOBS_KEY)
      .expect(200);
    expect(response.body).toMatchObject({ ok: true });
  }

  async function createAndSubmitSubmission(
    token: string,
    participationId: string,
    evidenceIds: string[],
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`${PARTICIPATIONS}/${participationId}/submissions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const draftId = created.body._id as string;
    await request(app.getHttpServer())
      .patch(`${SUBMISSIONS}/${draftId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Picked 12 bags and swept the whole esplanade',
        evidence: evidenceIds,
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${SUBMISSIONS}/${draftId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ consentConfirmed: true })
      .expect(200);
    return draftId;
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

  async function createVerifiedOrg(
    email: string,
  ): Promise<{ token: string; organizationId: string; userId: string }> {
    const token = await register(REGISTER_ORG, email);
    await verifyLatestEmail();
    const documentId = await uploadMedia(
      token,
      'verification_document',
      'private',
    );
    const submitted = await request(app.getHttpServer())
      .post(ORGS_ME_VERIFICATION)
      .set('Authorization', `Bearer ${token}`)
      .send({ documents: [documentId] })
      .expect(201);
    expect(submitted.body.status).toBe('pending');
    const organization = await readDoc<any>(
      OrganizationsCollection,
      OrganizationSchema,
      { slug: email.split('@')[0] },
    );
    expect(organization).toBeDefined();
    await request(app.getHttpServer())
      .post(`${ADMIN_ORGANIZATIONS}/${organization!._id}/verification/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    return {
      token,
      organizationId: String(organization!._id),
      userId: String(organization!.userId),
    };
  }

  describe('steps 1-2: volunteer profile and verified organization', () => {
    it('volunteer registers, verifies email, builds profile/skills/availability and enables the public profile', async () => {
      volunteerToken = await registerVerifiedVolunteer('core-vol@example.com');
      volunteerUsername = 'core-vol';

      await request(app.getHttpServer())
        .patch(VOLUNTEERS_ME)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ firstName: 'Core', bio: 'First verified proof' })
        .expect(200);

      const seededSkill = await readDoc<any>(SkillsCollection, SkillSchema, {});
      expect(seededSkill).toBeDefined();
      await request(app.getHttpServer())
        .post(`${VOLUNTEERS_ME}/skills`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          skillId: String(seededSkill!._id),
          level: 4,
          isPrimary: true,
        })
        .expect(201);

      await request(app.getHttpServer())
        .put(`${VOLUNTEERS_ME}/availability`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          monday: [{ from: '09:00', to: '12:00' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${VOLUNTEERS_ME}/public-settings`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          publicProfile: {
            enabled: true,
            showExperiences: true,
            showSkills: true,
            showBiography: true,
          },
        })
        .expect(200);

      const profile = await readDoc<any>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
        { username: volunteerUsername },
      );
      expect(profile).toBeDefined();
      expect(profile!.publicProfile.enabled).toBe(true);
      expect(profile!.firstName).toBe('Core');
      volunteerId = String(profile!.userId);
    });

    it('org registers, submits verification documents, and the seeded admin approves', async () => {
      orgToken = await register(REGISTER_ORG, 'core-org@example.com');
      await verifyLatestEmail();

      const documentId = await uploadMedia(
        orgToken,
        'verification_document',
        'private',
      );
      const submitted = await request(app.getHttpServer())
        .post(ORGS_ME_VERIFICATION)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ documents: [documentId] })
        .expect(201);
      expect(submitted.body.status).toBe('pending');

      const organization = await readDoc<any>(
        OrganizationsCollection,
        OrganizationSchema,
        { slug: 'core-org' },
      );
      expect(organization).toBeDefined();
      expect(organization!.verificationStatus).toBe('pending');
      coreOrganizationId = String(organization!._id);
      orgUserId = String(organization!.userId);

      const approved = await request(app.getHttpServer())
        .post(
          `${ADMIN_ORGANIZATIONS}/${coreOrganizationId}/verification/approve`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(approved.body.verificationStatus).toBe('verified');

      const status = await request(app.getHttpServer())
        .get(ORGS_ME_VERIFICATION)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      expect(status.body.verificationStatus).toBe('verified');
      expect(status.body.latest.status).toBe('verified');
    });
  });

  describe('steps 3-5: publish, apply, start, submit', () => {
    it('org publishes with a past startDate and future applicationDeadline', async () => {
      coreOpportunity = await createOpportunity(orgToken, 'Riverside Sweep', {
        startDate: new Date(Date.now() - 60_000).toISOString(),
        applicationDeadline: new Date(
          Date.now() + 7 * 24 * 3600 * 1000,
        ).toISOString(),
      });
      expect(coreOpportunity.status).toBe('draft');

      const published = await publishOpportunity(orgToken, coreOpportunity._id);
      expect(published.body.status).toBe('published');

      const feed = await request(app.getHttpServer())
        .get(OPPORTUNITIES)
        .expect(200);
      expect(feed.body.items.map((o: any) => o._id)).toContain(
        coreOpportunity._id,
      );
    });

    it('volunteer applies, org accepts (transaction), jobs tick starts it and activates the participant', async () => {
      const pair = await applyAndAccept(
        orgToken,
        volunteerToken,
        coreOpportunity,
      );
      coreApplicationId = pair.applicationId;

      await runJobs();

      const opportunity = await readDoc<any>(
        OpportunitiesCollection,
        OpportunitySchema,
        { _id: new Types.ObjectId(coreOpportunity._id) },
      );
      expect(opportunity!.status).toBe('in_progress');
      expect(opportunity!.positions[0].filledCount).toBe(1);

      const application = await readDoc<any>(
        ApplicationsCollection,
        ApplicationSchema,
        { _id: new Types.ObjectId(coreApplicationId) },
      );
      expect(application!.status).toBe('accepted');

      const active = await request(app.getHttpServer())
        .get(`${PARTICIPATIONS}/me`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      const matches = active.body.items.filter(
        (item: any) =>
          String(item.opportunityId) === coreOpportunity._id &&
          item.status === 'active',
      );
      expect(matches).toHaveLength(1);
      coreParticipationId = matches[0]._id as string;

      const feed = await request(app.getHttpServer())
        .get(OPPORTUNITIES)
        .expect(200);
      expect(feed.body.items.map((o: any) => o._id)).not.toContain(
        coreOpportunity._id,
      );
    });

    it('volunteer uploads public and private evidence and submits with consent', async () => {
      coreEvidencePublic = await uploadMedia(
        volunteerToken,
        'submission_evidence',
        'public',
      );
      coreEvidencePrivate = await uploadMedia(
        volunteerToken,
        'submission_evidence',
        'private',
      );
      coreSubmissionId = await createAndSubmitSubmission(
        volunteerToken,
        coreParticipationId,
        [coreEvidencePublic, coreEvidencePrivate],
      );

      const submission = await readDoc<any>(
        SubmissionsCollection,
        SubmissionSchema,
        { _id: new Types.ObjectId(coreSubmissionId) },
      );
      expect(submission!.status).toBe('submitted');
      expect(submission!.consentConfirmed).toBe(true);
    });
  });

  describe('step 6: start-review, verify transaction and rollback probe', () => {
    it('org starts review and verifies with a review: rows, stats, history, deduped notification', async () => {
      await request(app.getHttpServer())
        .post(`${SUBMISSIONS}/${coreSubmissionId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      const verified = await request(app.getHttpServer())
        .post(`${SUBMISSIONS}/${coreSubmissionId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({
          notes: 'Verified on-site',
          review: { rating: 5, comment: 'Spotless riverfront' },
        })
        .expect(200);
      expect(verified.body.status).toBe('approved');

      const submission = await readDoc<any>(
        SubmissionsCollection,
        SubmissionSchema,
        { _id: new Types.ObjectId(coreSubmissionId) },
      );
      expect(submission!.status).toBe('approved');

      const verification = await readDoc<any>(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(coreSubmissionId) },
      );
      expect(verification!.status).toBe('verified');
      expect(String(verification!.decidedBy)).toBe(orgUserId);
      expect(verification!.notes).toBe('Verified on-site');

      const experience = await readDoc<any>(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(coreSubmissionId) },
      );
      expect(experience).toBeDefined();
      expect(experience!.title).toBe('Cleaner');
      expect(experience!.verificationCode).toMatch(CODE_PATTERN);
      expect(experience!.evidenceIds.map(String)).toEqual(
        expect.arrayContaining([coreEvidencePublic, coreEvidencePrivate]),
      );
      coreVerificationCode = experience!.verificationCode;

      const participant = await readDoc<any>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
        { _id: submission!.participantId },
      );
      expect(participant!.status).toBe('completed');

      const reviews = await readMany(ReviewsCollection, ReviewSchema, {
        submissionId: new Types.ObjectId(coreSubmissionId),
      });
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        rating: 5,
        comment: 'Spotless riverfront',
      });

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
        {
          entityType: 'submission',
          entityId: new Types.ObjectId(coreSubmissionId),
        },
      );
      expect(submissionHistories).toHaveLength(3);
      expect(submissionHistories.map((h: any) => h.to)).toEqual([
        'submitted',
        'under_review',
        'approved',
      ]);
      const participantHistories = await readMany(
        StatusHistoryCollection,
        StatusHistorySchema,
        { entityType: 'task_participant', entityId: submission!.participantId },
      );
      expect(participantHistories).toHaveLength(1);
      expect(participantHistories[0].to).toBe('completed');

      await pollUntil(async () => {
        const list = await request(app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${volunteerToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) =>
            n.type === DomainEvents.SubmissionVerified &&
            n.payload?.submissionId === coreSubmissionId,
        );
      });
      const list = await request(app.getHttpServer())
        .get(NOTIFICATIONS)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      const matches = list.body.items.filter(
        (n: any) =>
          n.type === DomainEvents.SubmissionVerified &&
          n.payload?.submissionId === coreSubmissionId,
      );
      expect(matches).toHaveLength(1);
    });

    it('rollback probe: a failing in-transaction dependency persists nothing, retry recovers', async () => {
      const rollbackToken = await registerVerifiedVolunteer(
        'rollback-vol@example.com',
      );
      const rollbackOpportunity = await createOpportunity(
        orgToken,
        'Rollback Sweep',
        {
          startDate: new Date(Date.now() - 60_000).toISOString(),
          applicationDeadline: new Date(
            Date.now() + 7 * 24 * 3600 * 1000,
          ).toISOString(),
        },
      );
      await publishOpportunity(orgToken, rollbackOpportunity._id);
      const pair = await applyAndAccept(
        orgToken,
        rollbackToken,
        rollbackOpportunity,
      );
      await runJobs();
      const evidenceId = await uploadMedia(
        rollbackToken,
        'submission_evidence',
        'private',
      );
      const rollbackSubmissionId = await createAndSubmitSubmission(
        rollbackToken,
        pair.participationId,
        [evidenceId],
      );
      await request(app.getHttpServer())
        .post(`${SUBMISSIONS}/${rollbackSubmissionId}/start-review`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      const notifications = app.get(NotificationsService);
      const spy = jest
        .spyOn(notifications, 'createInSession')
        .mockRejectedValueOnce(new Error('forced in-transaction failure'));

      let failed: request.Response | null = null;
      try {
        const response = await request(app.getHttpServer())
          .post(`${SUBMISSIONS}/${rollbackSubmissionId}/verify`)
          .set('Authorization', `Bearer ${orgToken}`)
          .send({});
        failed = response;
      } finally {
        spy.mockRestore();
      }
      expect(failed!.status).toBe(500);

      const submission = await readDoc<any>(
        SubmissionsCollection,
        SubmissionSchema,
        { _id: new Types.ObjectId(rollbackSubmissionId) },
      );
      expect(submission!.status).toBe('under_review');

      const verifications = await readMany(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(rollbackSubmissionId) },
      );
      expect(verifications).toHaveLength(0);
      const experiences = await readMany(
        VolunteerExperiencesCollection,
        VolunteerExperienceSchema,
        { submissionId: new Types.ObjectId(rollbackSubmissionId) },
      );
      expect(experiences).toHaveLength(0);
      const reviews = await readMany(ReviewsCollection, ReviewSchema, {
        submissionId: new Types.ObjectId(rollbackSubmissionId),
      });
      expect(reviews).toHaveLength(0);

      const participant = await readDoc<any>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
        { applicationId: new Types.ObjectId(pair.applicationId) },
      );
      expect(participant!.status).toBe('active');

      const rollbackProfile = await readDoc<any>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
        { username: 'rollback-vol' },
      );
      expect(rollbackProfile!.stats).toEqual({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });

      const histories = await readMany(
        StatusHistoryCollection,
        StatusHistorySchema,
        {
          entityType: 'submission',
          entityId: new Types.ObjectId(rollbackSubmissionId),
        },
      );
      expect(histories.map((h: any) => h.to)).toEqual([
        'submitted',
        'under_review',
      ]);

      await request(app.getHttpServer())
        .post(`${SUBMISSIONS}/${rollbackSubmissionId}/verify`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ review: { rating: 4, comment: 'Recovered cleanly' } })
        .expect(200);
      const recovered = await readMany(
        VerificationsCollection,
        VerificationSchema,
        { submissionId: new Types.ObjectId(rollbackSubmissionId) },
      );
      expect(recovered).toHaveLength(1);
      expect(recovered[0].status).toBe('verified');
    });
  });

  describe('step 7: public outcome', () => {
    it('GET /verify/:code returns the public summary without private evidence', async () => {
      const proof = await request(app.getHttpServer())
        .get(`${PUBLIC_PROOF}/${coreVerificationCode}`)
        .expect(200);
      expect(proof.body.title).toBe('Cleaner');
      expect(proof.body.volunteer.handle).toBe(volunteerUsername);
      expect(proof.body.volunteer.firstName).toBe('Core');
      expect(proof.body.evidence).toHaveLength(1);
      expect(proof.body.evidence[0].mediaId).toBe(coreEvidencePublic);
      expect(proof.body.evidence.map((e: any) => e.mediaId)).not.toContain(
        coreEvidencePrivate,
      );
    });

    it('GET /volunteers/:username shows the experience and the dashboard stats are incremented', async () => {
      const profile = await request(app.getHttpServer())
        .get(`${VOLUNTEERS_PUBLIC}/${volunteerUsername}`)
        .expect(200);
      expect(profile.body.username).toBe(volunteerUsername);
      expect(profile.body.skills).toHaveLength(1);
      expect(profile.body.experiences).toHaveLength(1);
      expect(profile.body.experiences[0].title).toBe('Cleaner');
      expect(profile.body.experiences[0].evidence).toHaveLength(1);
      expect(profile.body.experiences[0].evidence[0].mediaId).toBe(
        coreEvidencePublic,
      );

      const dashboard = await request(app.getHttpServer())
        .get(`${VOLUNTEERS_ME}/dashboard`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .expect(200);
      expect(dashboard.body.stats).toEqual({
        completedTasks: 1,
        verifiedExperiences: 1,
        volunteerHours: 0,
      });
    });
  });

  describe('step 8: negative probes', () => {
    it('an unverified volunteer application is blocked EMAIL_NOT_VERIFIED and unblocks after verification', async () => {
      const target = await createOpportunity(orgToken, 'Gated Apply Target', {
        applicationDeadline: new Date(
          Date.now() + 7 * 24 * 3600 * 1000,
        ).toISOString(),
      });
      await publishOpportunity(orgToken, target._id);

      const unverified = await register(
        REGISTER_VOLUNTEER,
        'unverified-vol@v.example',
      );
      const blocked = await request(app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${target._id}/positions/${target.positions[0]._id}/applications`,
        )
        .set('Authorization', `Bearer ${unverified}`)
        .expect(403);
      expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

      await verifyLatestEmail();
      await request(app.getHttpServer())
        .post(
          `${OPPORTUNITIES}/${target._id}/positions/${target.positions[0]._id}/applications`,
        )
        .set('Authorization', `Bearer ${unverified}`)
        .expect(201);
    });

    it('an unverified org publish is blocked EMAIL_NOT_VERIFIED and unblocks after the real verification path', async () => {
      const unverifiedOrg = await register(REGISTER_ORG, 'gated-org@org.test');
      const created = await request(app.getHttpServer())
        .post(ORGS_ME_OPPORTUNITIES)
        .set('Authorization', `Bearer ${unverifiedOrg}`)
        .send({ title: 'Blocked Draft', description: 'Never published' })
        .expect(403);
      expect(created.body.code).toBe('EMAIL_NOT_VERIFIED');
      await request(app.getHttpServer())
        .post(`${OPPORTUNITIES}/507f1f77bcf86cd799439011/publish`)
        .set('Authorization', `Bearer ${unverifiedOrg}`)
        .expect(403)
        .then((response) => {
          expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
        });

      await verifyLatestEmail();
      const documentId = await uploadMedia(
        unverifiedOrg,
        'verification_document',
        'private',
      );
      await request(app.getHttpServer())
        .post(ORGS_ME_VERIFICATION)
        .set('Authorization', `Bearer ${unverifiedOrg}`)
        .send({ documents: [documentId] })
        .expect(201);
      const organization = await readDoc<any>(
        OrganizationsCollection,
        OrganizationSchema,
        { slug: 'gated-org' },
      );
      await request(app.getHttpServer())
        .post(
          `${ADMIN_ORGANIZATIONS}/${organization!._id}/verification/approve`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const draft = await createOpportunity(unverifiedOrg, 'Gated Uncollected');
      await publishOpportunity(unverifiedOrg, draft._id);
    });

    it('accepted-withdraw transaction commits atomically (application, participant, seat, history, notification)', async () => {
      const withdrawToken = await registerVerifiedVolunteer(
        'withdraw-vol@example.com',
      );
      const opportunity = await createOpportunity(orgToken, 'Withdraw Ticket', {
        startDate: new Date(Date.now() - 60_000).toISOString(),
        applicationDeadline: new Date(
          Date.now() + 7 * 24 * 3600 * 1000,
        ).toISOString(),
      });
      await publishOpportunity(orgToken, opportunity._id);
      const pair = await applyAndAccept(orgToken, withdrawToken, opportunity);
      await runJobs();

      const participantBefore = await readDoc<any>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
        { applicationId: new Types.ObjectId(pair.applicationId) },
      );
      expect(participantBefore!.status).toBe('active');

      const withdrawn = await request(app.getHttpServer())
        .post(`${APPLICATIONS}/${pair.applicationId}/withdraw`)
        .set('Authorization', `Bearer ${withdrawToken}`)
        .expect(200);
      expect(withdrawn.body.status).toBe('withdrawn');

      const application = await readDoc<any>(
        ApplicationsCollection,
        ApplicationSchema,
        { _id: new Types.ObjectId(pair.applicationId) },
      );
      expect(application!.status).toBe('withdrawn');

      const participant = await readDoc<any>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
        { applicationId: new Types.ObjectId(pair.applicationId) },
      );
      expect(participant!.status).toBe('withdrawn');

      const opportunityDoc = await readDoc<any>(
        OpportunitiesCollection,
        OpportunitySchema,
        { _id: new Types.ObjectId(opportunity._id) },
      );
      expect(opportunityDoc!.positions[0].filledCount).toBe(0);

      const histories = await readMany(
        StatusHistoryCollection,
        StatusHistorySchema,
        {
          entityType: 'application',
          entityId: new Types.ObjectId(pair.applicationId),
        },
      );
      expect(histories).toHaveLength(2);
      const withdrawalStep = histories.find((h: any) => h.to === 'withdrawn');
      expect(withdrawalStep).toMatchObject({
        from: 'accepted',
        to: 'withdrawn',
      });

      await pollUntil(async () => {
        const list = await request(app.getHttpServer())
          .get(NOTIFICATIONS)
          .set('Authorization', `Bearer ${withdrawToken}`)
          .expect(200);
        return list.body.items.some(
          (n: any) =>
            n.type === DomainEvents.ApplicationWithdrawn &&
            n.payload?.applicationId === pair.applicationId,
        );
      });
    });

    it('S13 regression: a second org with 3 pending submissions is gate-locked on the 4th publish', async () => {
      const gate = await createVerifiedOrg('gate-hold@org.test');
      const titles = ['Hold A', 'Hold B', 'Hold C'];
      for (const title of titles) {
        const hold = await createOpportunity(gate.token, title);
        await publishOpportunity(gate.token, hold._id);
        const holdVolunteer = await registerVerifiedVolunteer(
          `hold-vol-${title.toLowerCase().replace(' ', '')}@v.example`,
        );
        const pair = await applyAndAccept(gate.token, holdVolunteer, hold);
        const evidenceId = await uploadMedia(
          holdVolunteer,
          'submission_evidence',
          'private',
        );
        await createAndSubmitSubmission(holdVolunteer, pair.participationId, [
          evidenceId,
        ]);
      }

      const status = await request(app.getHttpServer())
        .get(PUBLISH_GATE)
        .set('Authorization', `Bearer ${gate.token}`)
        .expect(200);
      expect(status.body.locked).toBe(true);
      expect(status.body.pendingCount).toBe(3);
      expect(status.body.threshold).toBe(3);
      expect(status.body.pendingOpportunities).toHaveLength(3);

      const spike = await createOpportunity(gate.token, 'Hold Spike');
      const blocked = await request(app.getHttpServer())
        .post(`${OPPORTUNITIES}/${spike._id}/publish`)
        .set('Authorization', `Bearer ${gate.token}`)
        .expect(409);
      expect(blocked.body.code).toBe('PUBLISH_GATE_LOCKED');
    });
  });
});
