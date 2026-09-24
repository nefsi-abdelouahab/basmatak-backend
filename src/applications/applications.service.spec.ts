import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApplicationsService } from './applications.service';
import {
  APPLICATION_STATUSES,
  ApplicationModel,
  ApplicationSchema,
  ApplicationsCollection,
} from './schemas/application.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../participations/schemas/task-participant.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../core/status-transitions/status-histories.schema';
import {
  ApplicationInboxJoiner,
  InertApplicationInboxJoiner,
} from '../common/seams/application-inbox-joiner';
import { ApplyApplicationDto } from './dto/application.dto';
import { DomainEvents } from '../common/constants/domain-events';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('ApplicationsService (backend-v2-application-states)', () => {
  let handle: MemoryConnectionHandle;
  let service: ApplicationsService;
  let registry: StatusTransitionRegistry;
  let joiner: ApplicationInboxJoiner;
  const emitted: unknown[] = [];

  const volunteer = new Types.ObjectId().toString();
  const organization = new Types.ObjectId();
  const orgUser = new Types.ObjectId();
  const foreignUser = new Types.ObjectId();

  function orgAccount() {
    return {
      sub: orgUser.toString(),
      role: 'organization' as const,
      sessionId: 's',
    };
  }

  function foreignOrgAccount() {
    return {
      sub: foreignUser.toString(),
      role: 'organization' as const,
      sessionId: 's',
    };
  }

  function volunteerAccount() {
    return { sub: volunteer, role: 'volunteer' as const, sessionId: 's' };
  }

  async function seedOrganization(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    slug: string,
  ): Promise<void> {
    const model = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    await model.create({
      _id: id,
      userId,
      slug,
      nameAr: 'Unit Org',
      verificationStatus: 'verified',
      status: 'active',
    });
  }

  async function seedOpportunity(opts?: {
    title?: string;
    positionTitle?: string;
    organizationId?: Types.ObjectId;
  }): Promise<{
    opportunityId: Types.ObjectId;
    positionId: Types.ObjectId;
    organizationId: Types.ObjectId;
  }> {
    const model = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const positionId = new Types.ObjectId();
    const organizationId = opts?.organizationId ?? organization;
    const row = await model.create({
      organizationId,
      slug: `s12-${new Types.ObjectId().toString()}`,
      title: opts?.title ?? 'Unit Cleanup',
      description: 'desc',
      categoryId: new Types.ObjectId(),
      status: 'published',
      positions: [
        {
          title: opts?.positionTitle ?? 'Bag wrangler',
          description: 'Carry bags',
          requiredCount: 1,
          filledCount: 0,
          requiredSkills: [],
        },
      ],
    });
    await model.updateOne(
      { _id: row._id },
      { $set: { 'positions.0._id': positionId } },
    );
    return { opportunityId: row._id, positionId, organizationId };
  }

  async function seedApplication(opts?: {
    volunteerId?: string;
    status?: string;
    message?: string;
    opportunityId?: Types.ObjectId;
    positionId?: Types.ObjectId;
    organizationId?: Types.ObjectId;
  }): Promise<ApplicationModel> {
    const model = handle.connection.model<ApplicationModel>(
      ApplicationsCollection,
      ApplicationSchema,
    );
    return model.create({
      opportunityId: opts?.opportunityId ?? new Types.ObjectId(),
      positionId: opts?.positionId ?? new Types.ObjectId(),
      volunteerId: new Types.ObjectId(opts?.volunteerId ?? volunteer),
      organizationId: opts?.organizationId ?? organization,
      status: opts?.status ?? 'pending',
      message: opts?.message,
    });
  }

  async function readFilledCount(
    opportunityId: Types.ObjectId,
  ): Promise<number> {
    const model = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const row = await model.findById(opportunityId).lean();
    return (
      (row?.positions[0] as unknown as { filledCount?: number })?.filledCount ??
      NaN
    );
  }

  async function historyRows(
    applicationId: Types.ObjectId,
  ): Promise<Array<{ from: string; to: string }>> {
    const rows = await handle.connection
      .collection(StatusHistoryCollection)
      .find({ entityType: 'application', entityId: applicationId })
      .toArray();
    return rows as unknown as Array<{ from: string; to: string }>;
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const applicationModel = handle.connection.model<ApplicationModel>(
      ApplicationsCollection,
      ApplicationSchema,
    );
    const opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    const organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    const historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );

    registry = new StatusTransitionRegistry();
    registry.register('application', [
      ['pending', 'accepted'],
      ['pending', 'rejected'],
      ['pending', 'withdrawn'],
      ['pending', 'under_review'],
      ['under_review', 'accepted'],
      ['under_review', 'rejected'],
      ['under_review', 'withdrawn'],
      ['accepted', 'withdrawn'],
    ]);
    const statusTransitions = new StatusTransitionService(
      historyModel,
      registry,
    );
    joiner = new InertApplicationInboxJoiner();

    const organizations = {
      findByUserId: async (userId: string | undefined) =>
        organizationModel.findOne({ userId }).exec(),
    };

    service = new ApplicationsService(
      handle.connection,
      applicationModel,
      opportunityModel,
      participantModel,
      organizations as never,
      statusTransitions,
      { createInSession: async () => undefined } as never,
      joiner,
      {
        emit: (name: string, payload: unknown) =>
          emitted.push({ name, payload }),
      } as never,
    );

    await seedOrganization(organization, orgUser, 's12-org');
    await seedOrganization(new Types.ObjectId(), foreignUser, 's12-foreign');
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    emitted.length = 0;
    await Promise.all([
      handle.connection.collection(ApplicationsCollection).deleteMany({}),
      handle.connection.collection(OpportunitiesCollection).deleteMany({}),
      handle.connection.collection(TaskParticipantsCollection).deleteMany({}),
      handle.connection.collection(StatusHistoryCollection).deleteMany({}),
    ]);
  });

  describe('whitelist (v2 application machine)', () => {
    it('admits every registered pair and rejects unlisted ones', async () => {
      for (const [from, to] of [
        ['pending', 'accepted'],
        ['pending', 'rejected'],
        ['pending', 'withdrawn'],
        ['pending', 'under_review'],
        ['under_review', 'accepted'],
        ['under_review', 'rejected'],
        ['under_review', 'withdrawn'],
        ['accepted', 'withdrawn'],
      ]) {
        expect(registry.isAllowed('application', from, to)).toBe(true);
      }
      expect(
        registry.isAllowed('application', 'accepted', 'under_review'),
      ).toBe(false);
      expect(registry.isAllowed('application', 'accepted', 'rejected')).toBe(
        false,
      );
      expect(registry.isAllowed('application', 'rejected', 'pending')).toBe(
        false,
      );
    });
  });

  describe('apply cover message (D1)', () => {
    it('stores a trimmed message and emits application.created once', async () => {
      const { opportunityId, positionId } = await seedOpportunity();
      const application = await service.apply(
        volunteerAccount(),
        opportunityId.toString(),
        positionId.toString(),
        '  I want to participate  ',
      );
      expect(application.message).toBe('I want to participate');
      const stored = await handle.connection
        .collection(ApplicationsCollection)
        .findOne({ _id: application._id });
      expect(stored?.message).toBe('I want to participate');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        name: DomainEvents.ApplicationCreated,
      });
    });

    it('stores no message when none is supplied', async () => {
      const { opportunityId, positionId } = await seedOpportunity();
      const application = await service.apply(
        volunteerAccount(),
        opportunityId.toString(),
        positionId.toString(),
      );
      expect(application.message).toBeUndefined();
      const stored = await handle.connection
        .collection(ApplicationsCollection)
        .findOne({ _id: application._id });
      expect(stored?.message).toBeUndefined();
    });

    it('rejects an oversized message at the DTO boundary (400)', async () => {
      const dto = plainToInstance(ApplyApplicationDto, {
        message: 'x'.repeat(2001),
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints?.maxLength).toBeDefined();
    });

    it('admits a blank or absent message at the DTO boundary', async () => {
      const errors = await validate(plainToInstance(ApplyApplicationDto, {}));
      expect(errors).toHaveLength(0);
    });
  });

  describe('start-review (D3)', () => {
    it('moves pending to under_review and writes one history row', async () => {
      const application = await seedApplication();
      const updated = await service.startReview(
        orgAccount(),
        application._id.toString(),
      );
      expect(updated.status).toBe('under_review');
      expect(
        await handle.connection
          .collection(ApplicationsCollection)
          .findOne({ _id: application._id }),
      ).toMatchObject({ status: 'under_review' });
      const rows = await historyRows(application._id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ from: 'pending', to: 'under_review' });
    });

    it('fails with 409 when the application is already under_review', async () => {
      const application = await seedApplication({ status: 'under_review' });
      await expect(
        service.startReview(orgAccount(), application._id.toString()),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_APPLICATION_STATUS',
      });
      const rows = await historyRows(application._id);
      expect(rows).toHaveLength(0);
    });

    it('fails with 409 for an accepted application and writes nothing', async () => {
      const application = await seedApplication({ status: 'accepted' });
      await expect(
        service.startReview(orgAccount(), application._id.toString()),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_APPLICATION_STATUS',
      });
    });

    it('treats a foreign org as 404', async () => {
      const application = await seedApplication();
      await expect(
        service.startReview(foreignOrgAccount(), application._id.toString()),
      ).rejects.toMatchObject({
        status: 404,
        code: 'APPLICATION_NOT_FOUND',
      });
    });

    it('treats a volunteer caller as 404 (no organization row)', async () => {
      const application = await seedApplication();
      await expect(
        service.startReview(volunteerAccount(), application._id.toString()),
      ).rejects.toMatchObject({
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
    });
  });

  describe('status-aware accept from under_review (D4)', () => {
    it('accepts an under_review application: seat, participant, single history row', async () => {
      const { opportunityId, positionId } = await seedOpportunity();
      const application = await seedApplication({
        status: 'under_review',
        opportunityId,
        positionId,
      });
      const updated = await service.acceptApplication(
        orgAccount(),
        application._id.toString(),
      );
      expect(updated.status).toBe('accepted');
      expect(await readFilledCount(opportunityId)).toBe(1);
      const participants = await handle.connection
        .collection(TaskParticipantsCollection)
        .find({ applicationId: application._id })
        .toArray();
      expect(participants).toHaveLength(1);
      expect(participants[0].status).toBe('accepted');
      const rows = await historyRows(application._id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ from: 'under_review', to: 'accepted' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        name: DomainEvents.ApplicationAccepted,
      });
    });

    it('refuses to accept an application that is already rejected (409)', async () => {
      const application = await seedApplication({ status: 'rejected' });
      await expect(
        service.acceptApplication(orgAccount(), application._id.toString()),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_APPLICATION_STATUS',
      });
    });
  });

  describe('status-aware reject from under_review (D5)', () => {
    it('rejects an under_review application with reason and one history row', async () => {
      const application = await seedApplication({ status: 'under_review' });
      const updated = await service.rejectApplication(
        orgAccount(),
        application._id.toString(),
        'profile incomplete',
      );
      expect(updated.status).toBe('rejected');
      expect(updated.reason).toBe('profile incomplete');
      const rows = await historyRows(application._id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ from: 'under_review', to: 'rejected' });
    });

    it('refuses to reject an already-rejected application (409)', async () => {
      const application = await seedApplication({ status: 'rejected' });
      await expect(
        service.rejectApplication(
          orgAccount(),
          application._id.toString(),
          'again',
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_APPLICATION_STATUS',
      });
    });
  });

  describe('withdraw from under_review (D5)', () => {
    it('withdraws an under_review application without touching seats', async () => {
      const { opportunityId, positionId } = await seedOpportunity();
      const application = await seedApplication({
        status: 'under_review',
        opportunityId,
        positionId,
      });
      const updated = await service.withdrawApplication(
        volunteerAccount(),
        application._id.toString(),
      );
      expect(updated.status).toBe('withdrawn');
      expect(await readFilledCount(opportunityId)).toBe(0);
      const rows = await historyRows(application._id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ from: 'under_review', to: 'withdrawn' });
    });
  });

  describe('org aggregate inbox + seam (D8/D9)', () => {
    it('aggregates applications across the org opportunities, paginated', async () => {
      const a = await seedOpportunity({ title: 'Beach Cleanup' });
      const b = await seedOpportunity({ title: 'Garden Plant' });
      await seedApplication({
        opportunityId: a.opportunityId,
        positionId: a.positionId,
      });
      await seedApplication({
        opportunityId: b.opportunityId,
        positionId: b.positionId,
      });

      const first = await service.listOrganizationInbox(orgAccount(), {
        limit: '1',
      });
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();

      const second = await service.listOrganizationInbox(orgAccount(), {
        limit: '1',
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(String(second.items[0]._id)).not.toBe(String(first.items[0]._id));
      expect(second.nextCursor).toBeNull();
    });

    it('filters by status, opportunityId, and q (opportunity title)', async () => {
      const beach = await seedOpportunity({ title: 'Beach Cleanup' });
      const garden = await seedOpportunity({ title: 'Garden Plant' });
      await seedApplication({
        status: 'under_review',
        opportunityId: beach.opportunityId,
        positionId: beach.positionId,
      });
      await seedApplication({
        opportunityId: garden.opportunityId,
        positionId: garden.positionId,
      });

      const byStatus = await service.listOrganizationInbox(orgAccount(), {
        status: 'under_review',
      });
      expect(byStatus.items).toHaveLength(1);
      expect(byStatus.items[0].status).toBe('under_review');

      const byOpportunity = await service.listOrganizationInbox(orgAccount(), {
        opportunityId: beach.opportunityId.toString(),
      });
      expect(byOpportunity.items).toHaveLength(1);

      const byQ = await service.listOrganizationInbox(orgAccount(), {
        q: 'garden',
      });
      expect(byQ.items).toHaveLength(1);
      expect(String(byQ.items[0].opportunityId)).toBe(
        garden.opportunityId.toString(),
      );
    });

    it('returns empty when q matches nothing', async () => {
      const page = await service.listOrganizationInbox(orgAccount(), {
        q: 'no-such-title',
      });
      expect(page.items).toHaveLength(0);
    });

    it('never leaks a foreign org application, regardless of filters', async () => {
      const own = await seedOpportunity({ title: 'Own Opp' });
      const foreign = await seedOpportunity({
        title: 'Foreign Opp',
        organizationId: new Types.ObjectId(),
      });
      await seedApplication({
        opportunityId: own.opportunityId,
        positionId: own.positionId,
      });
      await seedApplication({
        opportunityId: foreign.opportunityId,
        positionId: foreign.positionId,
        organizationId: foreign.organizationId,
      });

      const page = await service.listOrganizationInbox(orgAccount(), {});
      expect(page.items).toHaveLength(1);
      expect(String(page.items[0].opportunityId)).toBe(
        own.opportunityId.toString(),
      );
    });

    it('routes rows through the inert joiner unchanged (name-free, fields intact)', async () => {
      const beach = await seedOpportunity({ title: 'Beach Cleanup' });
      await seedApplication({
        status: 'under_review',
        message: 'count me in',
        opportunityId: beach.opportunityId,
        positionId: beach.positionId,
      });
      const spy = jest.spyOn(joiner, 'enrich');
      const page = await service.listOrganizationInbox(orgAccount(), {});
      expect(spy).toHaveBeenCalled();
      expect(page.items[0]).toMatchObject({
        status: 'under_review',
        message: 'count me in',
      });
      expect(page.items[0].volunteerId).toBeDefined();
    });

    it('preserves the status enum values surfaced by rows', async () => {
      const beach = await seedOpportunity({ title: 'Beach Cleanup' });
      await seedApplication({
        status: 'under_review',
        opportunityId: beach.opportunityId,
        positionId: beach.positionId,
      });
      const page = await service.listOrganizationInbox(orgAccount(), {});
      expect(APPLICATION_STATUSES).toContain(page.items[0].status);
    });
  });
});
