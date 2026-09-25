import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerificationsService } from './verifications.service';
import { VerifyDto, RejectDto } from './dto/verification.dto';
import {
  VerificationModel,
  VerificationSchema,
  VerificationsCollection,
} from './schemas/verification.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperienceSchema,
  VolunteerExperiencesCollection,
} from './schemas/volunteer-experience.schema';
import {
  ReviewModel,
  ReviewSchema,
  ReviewsCollection,
} from '../reviews/review.schema';
import {
  SubmissionModel,
  SubmissionSchema,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../participations/schemas/task-participant.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  MediaModel,
  MediaCollection,
  MediaSchema,
} from '../media/schemas/media.schema';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../core/status-transitions/status-histories.schema';
import { DomainEvents } from '../common/constants/domain-events';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

const CODE_PATTERN = new RegExp('^[A-HJ-NP-Z2-9]{8}$');
const SKILL_ID = new Types.ObjectId();
const ORG_USER_ID = new Types.ObjectId();
const ORGANIZATION_ID = new Types.ObjectId();
const VOLUNTEER_ID = new Types.ObjectId();
const POSITION_ID = new Types.ObjectId();

describe('VerificationsService (S11 Part B)', () => {
  let handle: MemoryConnectionHandle;
  let service: VerificationsService;
  let statusTransitions: StatusTransitionService;
  let verificationModel: any;
  let experienceModel: any;
  let reviewModel: any;
  let submissionModel: any;
  let participantModel: any;
  let opportunityModel: any;
  let organizationModel: any;
  let profileModel: any;
  const emitted: unknown[] = [];
  const notified: unknown[] = [];
  let failCreateInSession: boolean;
  let baseSeeded = false;
  let baseCache: {
    opportunityId: Types.ObjectId;
    participantId: Types.ObjectId;
    evidenceId: Types.ObjectId;
  };

  function orgAccount(sub = ORG_USER_ID.toString()) {
    return { sub, role: 'organization' as const, sessionId: 'sid' };
  }

  function volunteerAccount(sub = VOLUNTEER_ID.toString()) {
    return { sub, role: 'volunteer' as const, sessionId: 'sid' };
  }

  async function seedOpportunity(): Promise<Types.ObjectId> {
    const row = await opportunityModel.create({
      organizationId: ORGANIZATION_ID,
      slug: 'verifications-unit-opp',
      title: 'Unit cleanup',
      description: 'desc',
      status: 'published',
      positions: [
        {
          title: 'Bag wrangler',
          description: 'Carry bags',
          requiredCount: 1,
          filledCount: 0,
          requiredSkills: [SKILL_ID],
        },
      ],
    });
    await opportunityModel.updateOne(
      {},
      { $set: { 'positions.0._id': POSITION_ID } },
    );
    return row._id;
  }

  async function seedParticipant(
    seededOpportunityId: Types.ObjectId,
    status: 'accepted' | 'active' | 'completed' = 'accepted',
  ): Promise<Types.ObjectId> {
    const row = await participantModel.create({
      opportunityId: seededOpportunityId,
      positionId: POSITION_ID,
      applicationId: new Types.ObjectId(),
      organizationId: ORGANIZATION_ID,
      volunteerId: VOLUNTEER_ID,
      status,
    });
    return row._id;
  }

  async function seedExtraParticipant(
    opportunityId: Types.ObjectId,
  ): Promise<Types.ObjectId> {
    const row = await participantModel.create({
      opportunityId,
      positionId: POSITION_ID,
      applicationId: new Types.ObjectId(),
      organizationId: ORGANIZATION_ID,
      volunteerId: VOLUNTEER_ID,
      status: 'accepted',
    });
    return row._id;
  }

  async function seedBase(): Promise<{
    opportunityId: Types.ObjectId;
    participantId: Types.ObjectId;
    evidenceId: Types.ObjectId;
  }> {
    if (baseSeeded) {
      return baseCache;
    }
    await organizationModel.create({
      _id: ORGANIZATION_ID,
      userId: ORG_USER_ID,
      slug: 'verifications-unit-org',
      name: 'Unit Org',
      verificationStatus: 'verified',
      status: 'active',
    });
    await profileModel.create({
      userId: VOLUNTEER_ID,
      username: 'verification-volunteer',
    });
    const opportunityId = await seedOpportunity();
    const participantId = await seedParticipant(opportunityId);
    const mediaRow = await handle.connection
      .model<MediaModel>(MediaCollection, MediaSchema)
      .create({
        ownerId: VOLUNTEER_ID,
        purpose: 'submission_evidence',
        visibility: 'private',
        type: 'file',
        mimeType: 'image/png',
      });
    baseCache = {
      opportunityId,
      participantId,
      evidenceId: mediaRow._id,
    };
    baseSeeded = true;
    return baseCache;
  }

  async function seedSubmission(
    status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected',
    participantId: Types.ObjectId,
    evidenceId: Types.ObjectId,
    opportunityId: Types.ObjectId,
  ): Promise<SubmissionModel> {
    return submissionModel.create({
      participantId,
      opportunityId,
      positionId: POSITION_ID,
      organizationId: ORGANIZATION_ID,
      volunteerId: VOLUNTEER_ID,
      deliverables: [{ title: 'Bag wrangler', description: 'Carry bags' }],
      description: 'Done',
      consentConfirmed: true,
      evidence: [{ mediaId: evidenceId }],
      status,
    });
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    verificationModel = handle.connection.model<VerificationModel>(
      VerificationsCollection,
      VerificationSchema,
    );
    experienceModel = handle.connection.model<VolunteerExperienceModel>(
      VolunteerExperiencesCollection,
      VolunteerExperienceSchema,
    );
    reviewModel = handle.connection.model<ReviewModel>(
      ReviewsCollection,
      ReviewSchema,
    );
    submissionModel = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    profileModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );

    const historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    const registry = new StatusTransitionRegistry();
    registry.register('submission', [
      ['draft', 'submitted'],
      ['submitted', 'under_review'],
      ['under_review', 'approved'],
      ['under_review', 'rejected'],
      ['rejected', 'draft'],
    ]);
    registry.register('task_participant', [
      ['accepted', 'active'],
      ['accepted', 'completed'],
      ['active', 'completed'],
      ['accepted', 'withdrawn'],
      ['active', 'withdrawn'],
      ['accepted', 'removed'],
      ['active', 'removed'],
    ]);
    statusTransitions = new StatusTransitionService(historyModel, registry);

    const organizations = {
      findByUserId: async (userId: string) =>
        organizationModel.findOne({ userId }).exec(),
    } as never;

    service = new VerificationsService(
      handle.connection,
      verificationModel,
      experienceModel,
      submissionModel,
      participantModel,
      opportunityModel,
      profileModel,
      handle.connection.model<MediaModel>(MediaCollection, MediaSchema),
      reviewModel,
      organizations,
      statusTransitions,
      {
        createInSession: async (
          notification: unknown,
          _session: unknown,
        ): Promise<void> => {
          notified.push(notification);
          if (failCreateInSession) {
            throw new Error('simulated mid-transaction failure');
          }
        },
      } as never,
      { getNext: jest.fn().mockResolvedValue('EXP-000001') } as never,
      {
        emit: (name: string, payload: unknown) =>
          emitted.push({ name, payload }),
      } as never,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    emitted.length = 0;
    notified.length = 0;
    failCreateInSession = false;
    baseSeeded = false;
    await Promise.all([
      handle.connection.collection(VerificationsCollection).deleteMany({}),
      handle.connection
        .collection(VolunteerExperiencesCollection)
        .deleteMany({}),
      handle.connection.collection(ReviewsCollection).deleteMany({}),
      handle.connection.collection(SubmissionsCollection).deleteMany({}),
      handle.connection.collection(TaskParticipantsCollection).deleteMany({}),
      handle.connection.collection(OpportunitiesCollection).deleteMany({}),
      handle.connection.collection(OrganizationsCollection).deleteMany({}),
      handle.connection.collection(VolunteerProfilesCollection).deleteMany({}),
      handle.connection.collection(MediaCollection).deleteMany({}),
      handle.connection.collection(StatusHistoryCollection).deleteMany({}),
    ]);
  });

  async function historyCounts(
    entityId: Types.ObjectId,
    entityType: string,
  ): Promise<Record<string, number>> {
    const rows = await handle.connection
      .model(StatusHistoryCollection, StatusHistorySchema)
      .find({ entityId, entityType })
      .select('to')
      .lean();
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.to] = (acc[row.to] ?? 0) + 1;
      return acc;
    }, {});
  }

  async function verifyHappyPath(dto: unknown = {}): Promise<SubmissionModel> {
    const { participantId, evidenceId, opportunityId } = await seedBase();
    const submission = await seedSubmission(
      'submitted',
      participantId,
      evidenceId,
      opportunityId,
    );
    const updated = await service.verify(
      orgAccount(),
      String(submission._id),
      dto as VerifyDto,
    );
    return updated;
  }

  describe('12.2 verify', () => {
    it('rejects organizations that own no org row (404)', async () => {
      await expect(
        service.verify(
          orgAccount(new Types.ObjectId().toString()),
          '0'.repeat(24),
          {
            notes: 'x',
          },
        ),
      ).rejects.toMatchObject({ status: 404, code: 'ORGANIZATION_NOT_FOUND' });
    });

    it('treats a submission of another organization as not found (404)', async () => {
      await organizationModel.create({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        slug: 'verifications-unit-other',
        name: 'Other Org',
        verificationStatus: 'verified',
        status: 'active',
      });
      const { participantId, evidenceId, opportunityId } = await seedBase();
      const submission = await seedSubmission(
        'submitted',
        participantId,
        evidenceId,
        opportunityId,
      );
      const foreignUser = new Types.ObjectId();
      await organizationModel.create({
        _id: new Types.ObjectId(),
        userId: foreignUser,
        slug: 'verifications-unit-foreign',
        name: 'Foreign Org',
        verificationStatus: 'verified',
        status: 'active',
      });
      await expect(
        service.verify(
          orgAccount(foreignUser.toString()),
          String(submission._id),
          {
            notes: 'x',
          },
        ),
      ).rejects.toMatchObject({ status: 404, code: 'SUBMISSION_NOT_FOUND' });
    });

    it.each([
      ['draft', 'draft'],
      ['approved', 'approved'],
      ['rejected', 'rejected'],
    ])(
      'precondition 409 for a %s submission (writes nothing)',
      async (_label, status) => {
        const { participantId, evidenceId, opportunityId } = await seedBase();
        const submission = await seedSubmission(
          status as 'draft',
          participantId,
          evidenceId,
          opportunityId,
        );
        await expect(
          service.verify(orgAccount(), String(submission._id), {}),
        ).rejects.toMatchObject({
          status: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
        expect(await verificationModel.countDocuments()).toBe(0);
        expect(await experienceModel.countDocuments()).toBe(0);
      },
    );

    it('traverses two history rows from submitted vs one from under_review', async () => {
      const updated = await verifyHappyPath();
      expect(updated.status).toBe('approved');
      expect(
        await historyCounts(
          new Types.ObjectId(updated._id.toString()),
          'submission',
        ),
      ).toEqual({ under_review: 1, approved: 1 });

      const { opportunityId } = await seedBase();
      const freshParticipant = await seedExtraParticipant(opportunityId);
      const evidenceId = (await seedBase()).evidenceId;
      const underReview = await seedSubmission(
        'under_review',
        freshParticipant,
        evidenceId,
        opportunityId,
      );
      const second = await service.verify(
        orgAccount(),
        String(underReview._id),
        {},
      );
      expect(second.status).toBe('approved');
      expect(
        await historyCounts(
          new Types.ObjectId(second._id.toString()),
          'submission',
        ),
      ).toEqual({ approved: 1 });

      const twoRows = await handle.connection
        .model(StatusHistoryCollection, StatusHistorySchema)
        .countDocuments({ entityType: 'submission' });
      expect(twoRows).toBe(3);
    });

    it('marks an accepted or active participant completed with a history row', async () => {
      const updated = await verifyHappyPath();
      const participant = await participantModel.findById(
        updated.participantId,
      );
      expect(participant.status).toBe('completed');
      expect(await historyCounts(participant._id, 'task_participant')).toEqual({
        completed: 1,
      });

      const { opportunityId, evidenceId } = await seedBase();
      const freshActive = await seedExtraParticipant(opportunityId);
      await participantModel.updateOne(
        { _id: freshActive },
        { $set: { status: 'active' } },
      );
      const submission = await seedSubmission(
        'submitted',
        freshActive,
        evidenceId,
        opportunityId,
      );
      await service.verify(orgAccount(), String(submission._id), {});
      const activeParticipant = await participantModel.findById(freshActive);
      expect(activeParticipant.status).toBe('completed');
    });

    it('writes the verified verification row plus the experience snapshot with a code', async () => {
      const updated = await verifyHappyPath({ notes: 'Verified on site' });
      const verification = await verificationModel.findOne({
        submissionId: updated._id,
      });
      expect(verification).toMatchObject({
        organizationId: ORGANIZATION_ID,
        volunteerId: VOLUNTEER_ID,
        status: 'verified',
        notes: 'Verified on site',
        decidedBy: ORG_USER_ID,
      });
      expect(verification.reason).toBeUndefined();
      expect(verification.decidedAt).toBeInstanceOf(Date);

      const experience = await experienceModel.findOne({
        submissionId: updated._id,
      });
      expect(experience).toMatchObject({
        volunteerId: VOLUNTEER_ID,
        organizationId: ORGANIZATION_ID,
        positionId: POSITION_ID,
        title: 'Bag wrangler',
        description: 'Carry bags',
        duration: 0,
      });
      expect(String(experience.skills[0])).toBe(String(SKILL_ID));
      expect(String(experience.evidenceIds[0])).toBe(
        String(updated.evidence[0].mediaId),
      );
      expect(experience.verificationCode).toMatch(CODE_PATTERN);
    });

    it('stamps the opportunity durationMinutes and falls back to 0 for legacy rows', async () => {
      const { opportunityId, evidenceId } = await seedBase();
      await opportunityModel.updateOne(
        { _id: opportunityId },
        { $set: { durationMinutes: 180 } },
      );
      const participant = await seedExtraParticipant(opportunityId);
      const submission = await seedSubmission(
        'submitted',
        participant,
        evidenceId,
        opportunityId,
      );
      await service.verify(orgAccount(), String(submission._id), {});
      const experience = await experienceModel.findOne({
        submissionId: submission._id,
      });
      expect(experience.duration).toBe(180);
      const profile = await profileModel.findOne({ userId: VOLUNTEER_ID });
      expect(profile.stats.volunteerHours).toBe(180);

      await opportunityModel.updateOne(
        { _id: opportunityId },
        { $unset: { durationMinutes: 1 } },
      );
      const legacyParticipant = await seedExtraParticipant(opportunityId);
      const legacySubmission = await seedSubmission(
        'submitted',
        legacyParticipant,
        evidenceId,
        opportunityId,
      );
      await service.verify(orgAccount(), String(legacySubmission._id), {});
      const legacy = await experienceModel.findOne({
        submissionId: legacySubmission._id,
      });
      expect(legacy.duration).toBe(0);
    });

    it('inserts a review only when provided', async () => {
      const first = await verifyHappyPath({
        review: { rating: 5, comment: 'Outstanding' },
      });
      expect(await reviewModel.countDocuments()).toBe(1);
      await expect(
        reviewModel.findOne({ submissionId: first._id }),
      ).resolves.toMatchObject({ rating: 5, comment: 'Outstanding' });

      const { opportunityId, evidenceId } = await seedBase();
      const freshParticipant = await seedExtraParticipant(opportunityId);
      const second = await seedSubmission(
        'submitted',
        freshParticipant,
        evidenceId,
        opportunityId,
      );
      await service.verify(orgAccount(), String(second._id), {});
      expect(await reviewModel.countDocuments()).toBe(1);
    });

    it('rejects a second review for the same submission and rolls everything back (409)', async () => {
      const { participantId, evidenceId, opportunityId } = await seedBase();
      const submission = await seedSubmission(
        'submitted',
        participantId,
        evidenceId,
        opportunityId,
      );
      await reviewModel.create({
        submissionId: submission._id,
        organizationId: ORGANIZATION_ID,
        volunteerId: VOLUNTEER_ID,
        rating: 5,
      });

      await expect(
        service.verify(orgAccount(), String(submission._id), {
          review: { rating: 3 },
        }),
      ).rejects.toMatchObject({ status: 409, code: 'REVIEW_ALREADY_EXISTS' });

      const reloaded = await submissionModel.findById(submission._id);
      expect(reloaded.status).toBe('submitted');
      expect(await verificationModel.countDocuments()).toBe(0);
      expect(await experienceModel.countDocuments()).toBe(0);
      expect(await reviewModel.countDocuments()).toBe(1);
      const participant = await participantModel.findById(participantId);
      expect(participant.status).toBe('accepted');
      const profile = await profileModel
        .findOne({ userId: VOLUNTEER_ID })
        .lean();
      expect(profile.stats).toEqual({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
      expect(emitted).toHaveLength(0);
    });

    it('emits submission.verified exactly once after commit', async () => {
      const updated = await verifyHappyPath();
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        name: DomainEvents.SubmissionVerified,
      });
      expect((emitted[0] as any).payload.submission._id).toEqual(updated._id);
      expect(notified).toHaveLength(1);
      expect(notified[0]).toMatchObject({
        recipientId: VOLUNTEER_ID,
        type: DomainEvents.SubmissionVerified,
      });
    });
  });

  describe('12.3 verify stats', () => {
    it('increments completedTasks, verifiedExperiences and volunteerHours on the right profile', async () => {
      await verifyHappyPath();
      const profile = await profileModel
        .findOne({ userId: VOLUNTEER_ID })
        .lean();
      expect(profile.stats).toEqual({
        completedTasks: 1,
        verifiedExperiences: 1,
        volunteerHours: 0,
      });
    });

    it('leaves stats untouched when the transaction rolls back a mid-txn failure', async () => {
      failCreateInSession = true;
      await expect(verifyHappyPath()).rejects.toThrow(
        'simulated mid-transaction failure',
      );
      const profile = await profileModel
        .findOne({ userId: VOLUNTEER_ID })
        .lean();
      expect(profile.stats).toEqual({
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: 0,
      });
      expect(await verificationModel.countDocuments()).toBe(0);
      expect(await experienceModel.countDocuments()).toBe(0);
      expect(
        await participantModel.findOne({}).then((p: any) => p.status),
      ).toBe('accepted');
      const submissions = await submissionModel.find({});
      expect(submissions).toHaveLength(1);
      expect(submissions[0].status).toBe('submitted');
      expect(emitted).toHaveLength(0);
    });
  });

  describe('12.4 reject', () => {
    it('rejects a submitted submission writing the reason to a rejected verification row', async () => {
      const { participantId, evidenceId, opportunityId } = await seedBase();
      const submission = await seedSubmission(
        'submitted',
        participantId,
        evidenceId,
        opportunityId,
      );
      const updated = await service.reject(
        orgAccount(),
        String(submission._id),
        { reason: 'Blurry photo' } as RejectDto,
      );
      expect(updated.status).toBe('rejected');
      expect(await historyCounts(updated._id, 'submission')).toEqual({
        under_review: 1,
        rejected: 1,
      });
      expect(
        await verificationModel.findOne({ submissionId: updated._id }),
      ).toMatchObject({
        status: 'rejected',
        reason: 'Blurry photo',
        decidedBy: ORG_USER_ID,
      });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        name: DomainEvents.SubmissionRejected,
        payload: { reason: 'Blurry photo' },
      });
      expect(notified).toHaveLength(0);
    });

    it('rejects an already-decided submission with 409 and writes nothing', async () => {
      const { participantId, evidenceId, opportunityId } = await seedBase();
      const submission = await seedSubmission(
        'approved',
        participantId,
        evidenceId,
        opportunityId,
      );
      await expect(
        service.reject(orgAccount(), String(submission._id), {
          reason: 'Too late',
        } as RejectDto),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
      expect(await verificationModel.countDocuments()).toBe(0);
    });

    it('keeps the participant state untouched on reject', async () => {
      const { participantId, evidenceId, opportunityId } = await seedBase();
      const submission = await seedSubmission(
        'submitted',
        participantId,
        evidenceId,
        opportunityId,
      );
      await service.reject(orgAccount(), String(submission._id), {
        reason: 'Nope',
      } as RejectDto);
      const participant = await participantModel.findById(participantId);
      expect(participant.status).toBe('accepted');
      expect(await historyCounts(participant._id, 'task_participant')).toEqual(
        {},
      );
    });
  });

  describe('12.4 DTO validation (reason required, rating bounds)', () => {
    it('requires reason on RejectDto', async () => {
      const errors = await validate(plainToInstance(RejectDto, {}));
      expect(errors.some((e) => e.property === 'reason')).toBe(true);
      const clean = await validate(plainToInstance(RejectDto, { reason: 'x' }));
      expect(clean).toHaveLength(0);
    });

    it('rejects out-of-range review ratings', async () => {
      const bad = await validate(
        plainToInstance(VerifyDto, { review: { rating: 6 } }),
      );
      expect(bad.length).toBeGreaterThan(0);
      const good = await validate(
        plainToInstance(VerifyDto, {
          notes: 'x',
          review: { rating: 5, comment: 'ok' },
        }),
      );
      expect(good).toHaveLength(0);
    });
  });

  describe('11.1 getVerification', () => {
    it('returns the row to the owning volunteer and hides it from a foreign volunteer', async () => {
      const updated = await verifyHappyPath();
      const verification = await verificationModel.findOne({
        submissionId: updated._id,
      });
      await expect(
        service.getVerification(volunteerAccount(), String(verification._id)),
      ).resolves.toMatchObject({ status: 'verified' });

      const foreign = new Types.ObjectId().toString();
      await expect(
        service.getVerification(
          volunteerAccount(foreign),
          String(verification._id),
        ),
      ).rejects.toMatchObject({ status: 404, code: 'VERIFICATION_NOT_FOUND' });
    });

    it('returns the row to the owning org and hides it from a foreign org', async () => {
      const updated = await verifyHappyPath();
      const verification = await verificationModel.findOne({
        submissionId: updated._id,
      });
      await expect(
        service.getVerification(orgAccount(), String(verification._id)),
      ).resolves.toMatchObject({ status: 'verified' });

      const foreign = new Types.ObjectId();
      const foreignUserId = new Types.ObjectId();
      await organizationModel.create({
        _id: foreign,
        userId: foreignUserId,
        slug: 'verifications-unit-get',
        name: 'Foreign Getter',
        verificationStatus: 'verified',
        status: 'active',
      });
      await expect(
        service.getVerification(
          orgAccount(foreignUserId.toString()),
          String(verification._id),
        ),
      ).rejects.toMatchObject({ status: 404, code: 'VERIFICATION_NOT_FOUND' });
    });

    it('404 on invalid or missing ids', async () => {
      await expect(
        service.getVerification(volunteerAccount(), 'not-an-id'),
      ).rejects.toMatchObject({ status: 404, code: 'VERIFICATION_NOT_FOUND' });
      await expect(
        service.getVerification(volunteerAccount(), '0'.repeat(24)),
      ).rejects.toMatchObject({ status: 404, code: 'VERIFICATION_NOT_FOUND' });
    });
  });
});
