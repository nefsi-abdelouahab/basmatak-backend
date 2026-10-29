import { Types } from 'mongoose';
import { SubmissionsService } from './submissions.service';
import {
  SubmissionModel,
  SubmissionsCollection,
  SubmissionSchema,
} from './schemas/submission.schema';
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
import { MediaOwnership } from '../common/seams/media-ownership';
import { MediaService } from '../media/media.service';
import {
  VerificationModel,
  VerificationSchema,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import { DomainEvents } from '../common/constants/domain-events';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('SubmissionsService (S10 Part A)', () => {
  let handle: MemoryConnectionHandle;
  let service: SubmissionsService;
  let registry: StatusTransitionRegistry;
  let mediaOwnership: MediaOwnership;
  let mediaService: MediaService;
  const emitted: unknown[] = [];

  const volunteer = new Types.ObjectId().toString();
  const organization = new Types.ObjectId();
  const opportunityId = new Types.ObjectId();

  function account() {
    return { sub: volunteer, role: 'volunteer' as const, sessionId: 'sid' };
  }

  async function seedOpportunity(
    positionId: Types.ObjectId,
  ): Promise<Types.ObjectId> {
    const opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const row = await opportunityModel.create({
      organizationId: organization,
      slug: 'submissions-unit-opp',
      title: 'Unit cleanup',
      description: 'desc',
      status: 'published',
      positions: [
        {
          title: 'Bag wrangler',
          description: 'Carry bags',
          requiredCount: 1,
          filledCount: 0,
          requiredSkills: [],
        },
      ],
    });
    // Overwrite the embedded position id with the seeded positionId so the
    // lookup in createForParticipation resolves.
    await opportunityModel.updateOne(
      {},
      { $set: { 'positions.0._id': positionId } },
    );
    return row._id;
  }

  async function seedParticipant(
    seededOpportunityId: Types.ObjectId,
    positionId: Types.ObjectId,
  ): Promise<Types.ObjectId> {
    const participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    const row = await participantModel.create({
      opportunityId: seededOpportunityId,
      positionId,
      applicationId: new Types.ObjectId(),
      organizationId: organization,
      volunteerId: new Types.ObjectId(volunteer),
      status: 'accepted',
    });
    return row._id;
  }

  async function seedOrganization(): Promise<void> {
    const organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    await organizationModel.create({
      _id: organization,
      userId: new Types.ObjectId(),
      slug: 'submissions-unit-org',
      name: 'Unit Org',
      verificationStatus: 'verified',
      status: 'active',
    });
  }

  async function providesMedia(
    mimeType: string | undefined,
    type: 'file' | 'link' = 'file',
  ): Promise<string> {
    const mediaModel = handle.connection.model<MediaModel>(
      MediaCollection,
      MediaSchema,
    );
    const row = await mediaModel.create({
      ownerId: new Types.ObjectId(volunteer),
      purpose: 'submission_evidence',
      visibility: 'private',
      type,
      mimeType,
    });
    return row._id.toString();
  }

  async function seedOptionalSubmission(): Promise<SubmissionModel> {
    const model = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    return model.create({
      participantId: new Types.ObjectId(),
      opportunityId,
      positionId: new Types.ObjectId(),
      organizationId: organization,
      volunteerId: new Types.ObjectId(volunteer),
      deliverables: [{ title: 'Bag wrangler', description: 'Carry bags' }],
      description: 'Done',
      consentConfirmed: false,
      evidence: [],
      status: 'draft',
    });
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const submissionModel = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    const historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    registry = new StatusTransitionRegistry();
    registry.register('submission', [
      ['draft', 'submitted'],
      ['submitted', 'under_review'],
      ['under_review', 'approved'],
      ['under_review', 'rejected'],
      ['rejected', 'draft'],
    ]);
    const statusTransitions = new StatusTransitionService(
      historyModel,
      registry,
    );

    const participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    const opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );

    mediaOwnership = new MediaOwnership(
      handle.connection.model<MediaModel>(MediaCollection, MediaSchema),
    );
    mediaService = new MediaService(
      handle.connection.model<MediaModel>(MediaCollection, MediaSchema),
      null as never,
      mediaOwnership,
      null as never,
      null as never,
    );

    const organizations = {
      findByUserId: async (userId: string) =>
        organizationModel.findOne({ userId }).exec(),
    } as never;

    service = new SubmissionsService(
      submissionModel,
      participantModel,
      opportunityModel,
      organizationModel,
      handle.connection.model<MediaModel>(MediaCollection, MediaSchema),
      organizations,
      mediaService,
      mediaOwnership,
      statusTransitions,
      {
        emit: (name: string, payload: unknown) =>
          emitted.push({ name, payload }),
      } as never,
      // Session 19: real profile model for the volunteer join.
      handle.connection.model<VolunteerProfileModel>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
      ),
      // Rejection-reason read model.
      handle.connection.model<VerificationModel>(
        VerificationsCollection,
        VerificationSchema,
      ),
    );

    await seedOrganization();
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    emitted.length = 0;
    await Promise.all([
      handle.connection.collection(SubmissionsCollection).deleteMany({}),
      handle.connection.collection(TaskParticipantsCollection).deleteMany({}),
      handle.connection.collection(OpportunitiesCollection).deleteMany({}),
      handle.connection.collection(MediaCollection).deleteMany({}),
      handle.connection.collection(StatusHistoryCollection).deleteMany({}),
      handle.connection.collection(VerificationsCollection).deleteMany({}),
    ]);
  });

  describe('5.1 create', () => {
    it('creates a draft with position-derived deliverables and denormalized ids', async () => {
      const positionId = new Types.ObjectId();
      const seededOpportunityId = await seedOpportunity(positionId);
      const participantId = await seedParticipant(
        seededOpportunityId,
        positionId,
      );

      const submission = await service.createForParticipation(
        account(),
        participantId.toString(),
      );
      expect(submission.status).toBe('draft');
      expect(submission.deliverables).toHaveLength(1);
      expect(submission.deliverables[0].title).toBe('Bag wrangler');
      expect(submission.consentConfirmed).toBe(false);
      expect(submission.volunteerId.toString()).toBe(volunteer);
      expect(submission.organizationId.toString()).toBe(
        organization.toString(),
      );
    });

    it('rejects a second create for the same participation with 409', async () => {
      const positionId = new Types.ObjectId();
      const seededOpportunityId = await seedOpportunity(positionId);
      const participantId = await seedParticipant(
        seededOpportunityId,
        positionId,
      );

      await service.createForParticipation(account(), participantId.toString());
      await expect(
        service.createForParticipation(account(), participantId.toString()),
      ).rejects.toMatchObject({
        status: 409,
        code: 'SUBMISSION_ALREADY_EXISTS',
      });
    });

    it('treats a foreign participation as not found (404)', async () => {
      const participantModel = handle.connection.model<TaskParticipantModel>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
      );
      const foreign = await participantModel.create({
        opportunityId,
        positionId: new Types.ObjectId(),
        applicationId: new Types.ObjectId(),
        organizationId: organization,
        volunteerId: new Types.ObjectId(),
        status: 'accepted',
      });
      const other = account();
      await expect(
        service.createForParticipation(other, foreign._id.toString()),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PARTICIPATION_NOT_FOUND',
      });
    });
  });

  describe('5.2 edit', () => {
    it('applies an edit to a draft and stays draft', async () => {
      const submission = await seedOptionalSubmission();
      const updated = await service.updateDraft(
        account(),
        submission._id.toString(),
        { description: 'Improved', consentConfirmed: true },
      );
      expect(updated.description).toBe('Improved');
      expect(updated.consentConfirmed).toBe(true);
      expect(updated.status).toBe('draft');
    });

    it('editing a rejected submission returns it to draft with a history row', async () => {
      const model = handle.connection.model<SubmissionModel>(
        SubmissionsCollection,
        SubmissionSchema,
      );
      const rejected = await model.create({
        participantId: new Types.ObjectId(),
        opportunityId,
        positionId: new Types.ObjectId(),
        organizationId: organization,
        volunteerId: new Types.ObjectId(volunteer),
        deliverables: [{ title: 'Bag wrangler' }],
        description: 'Old',
        consentConfirmed: false,
        evidence: [],
        status: 'rejected',
      });

      const updated = await service.updateDraft(
        account(),
        rejected._id.toString(),
        { description: 'Resubmit' },
      );
      expect(updated.status).toBe('draft');
      expect(updated.description).toBe('Resubmit');

      const history = await handle.connection
        .collection(StatusHistoryCollection)
        .findOne({ entityType: 'submission', entityId: rejected._id });
      expect(history).not.toBeNull();
      expect(history?.from).toBe('rejected');
      expect(history?.to).toBe('draft');
    });

    it('rejects edits to submitted/under_review/approved with 409', async () => {
      const model = handle.connection.model<SubmissionModel>(
        SubmissionsCollection,
        SubmissionSchema,
      );
      for (const status of ['submitted', 'under_review', 'approved']) {
        const row = await model.create({
          participantId: new Types.ObjectId(),
          opportunityId,
          positionId: new Types.ObjectId(),
          organizationId: organization,
          volunteerId: new Types.ObjectId(volunteer),
          deliverables: [{ title: 'Bag wrangler' }],
          description: 'Done',
          consentConfirmed: false,
          evidence: [],
          status,
        });
        await expect(
          service.updateDraft(account(), row._id.toString(), {
            description: 'Nope',
          }),
        ).rejects.toMatchObject({
          status: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    });

    it('validates foreign evidence media and rejects 404', async () => {
      const submission = await seedOptionalSubmission();
      const strangerMedia = await providesMedia('image/png');
      await handle.connection
        .model<MediaModel>(MediaCollection, MediaSchema)
        .updateOne(
          { _id: new Types.ObjectId(strangerMedia) },
          { $set: { ownerId: new Types.ObjectId() } },
        );
      await expect(
        service.updateDraft(account(), submission._id.toString(), {
          evidence: [strangerMedia],
        }),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
      const reloaded = await handle.connection
        .model<SubmissionModel>(SubmissionsCollection, SubmissionSchema)
        .findById(submission._id)
        .exec();
      expect(reloaded!.evidence).toHaveLength(0);
    });
  });

  describe('5.3 submit', () => {
    async function seedDraft(opts?: {
      description?: string;
      evidence?: string[];
    }): Promise<SubmissionModel> {
      const model = handle.connection.model<SubmissionModel>(
        SubmissionsCollection,
        SubmissionSchema,
      );
      const row = await model.create({
        participantId: new Types.ObjectId(),
        opportunityId,
        positionId: new Types.ObjectId(),
        organizationId: organization,
        volunteerId: new Types.ObjectId(volunteer),
        deliverables: [{ title: 'Bag wrangler', description: 'Carry bags' }],
        description: opts?.description ?? 'Done',
        consentConfirmed: false,
        evidence:
          opts?.evidence?.map((mediaId) => ({
            mediaId: new Types.ObjectId(mediaId),
          })) ?? [],
        status: 'draft',
      });
      return row;
    }

    it('submits with description + evidence and emits submission.submitted once', async () => {
      const imageMedia = await providesMedia('image/png');
      const submission = await seedDraft({ evidence: [imageMedia] });
      const updated = await service.submit(
        account(),
        submission._id.toString(),
        { consentConfirmed: true },
      );
      expect(updated.status).toBe('submitted');
      expect(updated.consentConfirmed).toBe(true);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        name: DomainEvents.SubmissionSubmitted,
      });

      const history = await handle.connection
        .collection(StatusHistoryCollection)
        .findOne({ entityType: 'submission', entityId: submission._id });
      expect(history?.to).toBe('submitted');
    });

    it('rejects an empty description with 400 and keeps draft', async () => {
      const submission = await seedDraft({ description: '   ' });
      await expect(
        service.submit(account(), submission._id.toString(), {}),
      ).rejects.toMatchObject({ status: 400, code: 'DESCRIPTION_REQUIRED' });
      const reloaded = await handle.connection
        .model<SubmissionModel>(SubmissionsCollection, SubmissionSchema)
        .findById(submission._id)
        .exec();
      expect(reloaded!.status).toBe('draft');
      expect(emitted).toHaveLength(0);
    });

    it('rejects an unevidenced deliverable with 400 EVIDENCE_REQUIRED', async () => {
      const submission = await seedDraft();
      await expect(
        service.submit(account(), submission._id.toString(), {}),
      ).rejects.toMatchObject({ status: 400, code: 'EVIDENCE_REQUIRED' });
    });

    it('rejects image evidence without consent with 400 CONSENT_REQUIRED', async () => {
      const imageMedia = await providesMedia('image/png');
      const submission = await seedDraft({ evidence: [imageMedia] });
      await expect(
        service.submit(account(), submission._id.toString(), {}),
      ).rejects.toMatchObject({ status: 400, code: 'CONSENT_REQUIRED' });
    });

    it('passes pdf-only evidence without consent', async () => {
      const pdfMedia = await providesMedia('application/pdf');
      const submission = await seedDraft({ evidence: [pdfMedia] });
      const updated = await service.submit(
        account(),
        submission._id.toString(),
        {},
      );
      expect(updated.status).toBe('submitted');
      expect(emitted).toHaveLength(1);
    });
  });

  describe('5.5 rejection reason (owner-scoped)', () => {
    function submissionModel() {
      return handle.connection.model<SubmissionModel>(
        SubmissionsCollection,
        SubmissionSchema,
      );
    }

    function verificationModel() {
      return handle.connection.model<VerificationModel>(
        VerificationsCollection,
        VerificationSchema,
      );
    }

    async function seedSubmission(
      status: SubmissionModel['status'],
      reason?: string,
      owner: string = volunteer,
    ): Promise<SubmissionModel> {
      const submission = await submissionModel().create({
        participantId: new Types.ObjectId(),
        opportunityId,
        positionId: new Types.ObjectId(),
        organizationId: organization,
        volunteerId: new Types.ObjectId(owner),
        deliverables: [{ title: 'Bag wrangler' }],
        description: 'Done',
        evidence: [],
        status,
      });
      if (reason !== undefined) {
        await verificationModel().create({
          submissionId: submission._id,
          organizationId: organization,
          volunteerId: new Types.ObjectId(owner),
          status: 'rejected',
          reason,
          decidedAt: new Date(),
          decidedBy: organization,
        });
      }
      return submission;
    }

    it('lists the reason for rejected and draft-after-rejection, hides after resubmit', async () => {
      const rejected = await seedSubmission('rejected', 'Evidence was blurry');
      const draft = await seedSubmission('draft', 'Add a completion photo');
      const untouched = await seedSubmission('submitted');

      const page = await service.listMine(account(), {});
      const byId = new Map(page.items.map((item) => [String(item._id), item]));
      expect(byId.get(rejected._id.toString())?.rejectionReason).toBe(
        'Evidence was blurry',
      );
      expect(byId.get(draft._id.toString())?.rejectionReason).toBe(
        'Add a completion photo',
      );
      expect(byId.get(untouched._id.toString())?.rejectionReason).toBeNull();

      // Once the corrected draft is resubmitted the reason is no longer shown.
      await submissionModel().updateOne(
        { _id: draft._id },
        { $set: { status: 'submitted' } },
      );
      const after = await service.listMine(account(), {});
      expect(
        after.items.find((item) => String(item._id) === draft._id.toString())
          ?.rejectionReason,
      ).toBeNull();
    });

    it('scopes the list to the owning volunteer', async () => {
      await seedSubmission(
        'rejected',
        'Private reason',
        new Types.ObjectId().toString(),
      );
      const page = await service.listMine(account(), {});
      expect(page.items).toHaveLength(0);
    });

    it('exposes the reason on detail to the owning volunteer and organization only', async () => {
      const rejected = await seedSubmission('rejected', 'Reason for owner');

      const volunteerDetail = await service.getDetail(
        account(),
        rejected._id.toString(),
      );
      expect(volunteerDetail.rejectionReason).toBe('Reason for owner');

      const orgRow = await handle.connection
        .model<OrganizationModel>(OrganizationsCollection, OrganizationSchema)
        .findOne({ slug: 'submissions-unit-org' })
        .exec();
      const orgDetail = await service.getDetail(
        {
          sub: orgRow!.userId.toString(),
          role: 'organization',
          sessionId: 'sid',
        },
        rejected._id.toString(),
      );
      expect(orgDetail.rejectionReason).toBe('Reason for owner');

      await expect(
        service.getDetail(
          {
            sub: new Types.ObjectId().toString(),
            role: 'volunteer',
            sessionId: 'sid',
          },
          rejected._id.toString(),
        ),
      ).rejects.toMatchObject({ status: 404, code: 'SUBMISSION_NOT_FOUND' });
    });
  });

  describe('5.4 whitelist', () => {
    it('accepts the five registered pairs and rejects unlisted pairs', async () => {
      expect(registry.isAllowed('submission', 'draft', 'submitted')).toBe(true);
      expect(
        registry.isAllowed('submission', 'submitted', 'under_review'),
      ).toBe(true);
      expect(registry.isAllowed('submission', 'under_review', 'approved')).toBe(
        true,
      );
      expect(registry.isAllowed('submission', 'under_review', 'rejected')).toBe(
        true,
      );
      expect(registry.isAllowed('submission', 'rejected', 'draft')).toBe(true);

      expect(registry.isAllowed('submission', 'draft', 'approved')).toBe(false);
      // Part A never writes approved|rejected; the whitelist alone is passive.
    });
  });
});
