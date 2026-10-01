import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpportunitiesService } from './opportunities.service';
import { TaskParticipantsAdapter } from './task-participants.adapter';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from './schemas/opportunity.schema';
import {
  SkillModel,
  SkillSchema,
  SkillsCollection,
} from '../skills/schemas/skill.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import { PublishGateService } from '../common/seams/publish-gate.service';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
  VolunteerSkillSchema,
} from '../volunteers/schemas/volunteer-skill.schema';
import { scoreRecommendedOpportunity } from './opportunities.service';
import { OpportunityEmbedProvider } from './opportunity-embed.provider';
import { UpdateOpportunityDto } from './dto/opportunity.dto';
import {
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  SkillCategoriesCollection,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
import {
  LocationSchema,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import {
  ApplicationSchema,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import {
  TaskParticipantSchema,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';

const OP_PAIRS = [
  ['draft', 'published'],
  ['published', 'in_progress'],
  ['in_progress', 'completed'],
  ['published', 'closed'],
  ['published', 'cancelled'],
  ['in_progress', 'closed'],
  ['in_progress', 'cancelled'],
  ['accepted', 'active'],
] as const;

describe('OpportunitiesService (inventory §2.8, roadmap S6)', () => {
  let handle: MemoryConnectionHandle;
  let service: OpportunitiesService;
  let opportunityModel: Model<OpportunityModel>;
  let skillModel: Model<SkillModel>;
  let volunteerProfileModel: Model<VolunteerProfileModel>;
  let volunteerSkillModel: Model<VolunteerSkillModel>;
  let historyModel: Model<StatusHistoryModel>;
  let registry: StatusTransitionRegistry;
  let transitions: StatusTransitionService;
  let adapter: TaskParticipantsAdapter;
  let emitter: EventEmitter2;

  const orgId = new Types.ObjectId();
  const fakeOrg = {
    _id: orgId,
    slug: 'org',
    verificationStatus: 'verified',
    status: 'active',
  } as unknown as OrganizationModel;

  const organizations = {
    findByUserId: jest.fn(async () => fakeOrg),
  } as unknown as OrganizationsService;

  const publishGate = {
    evaluate: jest.fn(async () => ({ locked: false })),
  } as unknown as PublishGateService;

  const mediaOwnership = {
    assertFor: jest.fn(async () => ({})),
  };

  let registrySeq = 0;
  const registryId = {
    getNext: jest.fn(async () => {
      registrySeq += 1;
      return `OPP-${String(registrySeq).padStart(6, '0')}`;
    }),
  };

  const account: AccountToken = {
    sub: '64b000000000000000000020',
    role: 'organization',
    sessionId: '64b000000000000000000030',
  };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    skillModel = handle.connection.model(SkillsCollection, SkillSchema);
    volunteerProfileModel = handle.connection.model(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    volunteerSkillModel = handle.connection.model(
      VolunteerSkillsCollection,
      VolunteerSkillSchema,
    );

    registry = new StatusTransitionRegistry();
    registry.register('opportunity', OP_PAIRS);
    transitions = new StatusTransitionService(historyModel, registry);
    adapter = new TaskParticipantsAdapter(handle.connection);
    emitter = new EventEmitter2();

    // Session 19: real embed provider over memory models with a stubbed
    // favorites store (zero-state lookups keep legacy assertions stable).
    const embeds = new OpportunityEmbedProvider(
      handle.connection.model(OrganizationsCollection, OrganizationSchema),
      handle.connection.model(SkillCategoriesCollection, SkillCategorySchema),
      skillModel,
      handle.connection.model(LocationsCollection, LocationSchema),
      handle.connection.model(ApplicationsCollection, ApplicationSchema),
      handle.connection.model(
        TaskParticipantsCollection,
        TaskParticipantSchema,
      ),
      volunteerProfileModel,
      { lookup: async () => ({}) } as never,
    );

    service = new OpportunitiesService(
      opportunityModel,
      skillModel,
      volunteerProfileModel,
      volunteerSkillModel,
      organizations,
      transitions,
      publishGate,
      adapter,
      registryId as never,
      mediaOwnership as never,
      embeds,
      emitter,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    mediaOwnership.assertFor.mockClear();
    await handle.connection.collection(OpportunitiesCollection).deleteMany({});
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
    await handle.connection
      .collection(VolunteerProfilesCollection)
      .deleteMany({});
    await handle.connection
      .collection(VolunteerSkillsCollection)
      .deleteMany({});
    const db = handle.connection.db!;
    await db.dropCollection('task_participants').catch(() => undefined);
    await db.dropCollection('applications').catch(() => undefined);
  });

  async function createDraft(title = 'Build a well', count = 2) {
    return service.createOpportunity(account, {
      title,
      description: 'Fresh water for the village',
      positions: [
        {
          title: 'Helper',
          description: 'Carry supplies',
          requiredCount: count,
          requiredSkills: [],
        },
      ],
    });
  }

  describe('5.1 opportunity transition whitelist', () => {
    it('accepts the authorized pairs, including the accepted→active job path', async () => {
      for (const [from, to] of OP_PAIRS) {
        const entry = await transitions.assert({
          entityType: 'opportunity',
          entityId: orgId,
          from,
          to,
          actor: account.sub,
        });
        expect(entry.to).toBe(to);
      }
      expect(await historyModel.countDocuments({}).exec()).toBe(
        OP_PAIRS.length,
      );
    });

    it('rejects unauthorized pairs with INVALID_STATUS_TRANSITION', async () => {
      for (const [from, to] of [
        ['draft', 'completed'],
        ['completed', 'published'],
        ['closed', 'in_progress'],
        ['published', 'published'],
      ] as const) {
        await expect(
          transitions.assert({
            entityType: 'opportunity',
            entityId: orgId,
            from,
            to,
            actor: account.sub,
          }),
        ).rejects.toMatchObject({
          status: 409,
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
      expect(await historyModel.countDocuments({}).exec()).toBe(0);
    });
  });

  describe('5.2 position seat rules', () => {
    it('rejects a patch dropping requiredCount below filledCount', async () => {
      const opp = await createDraft('Seat rule', 3);
      const positionId = opp.positions[0]._id.toString();
      await opportunityModel
        .updateOne(
          { _id: opp._id },
          { $set: { 'positions.$[pos].filledCount': 2 } },
          { arrayFilters: [{ 'pos._id': new Types.ObjectId(positionId) }] },
        )
        .exec();

      await expect(
        service.updatePosition(account, opp._id.toString(), positionId, {
          requiredCount: 1,
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'POSITION_REQUIRED_COUNT_LOWER_THAN_FILLED',
      });
    });

    it('rejects a delete while filledCount > 0', async () => {
      const opp = await createDraft('Seat delete', 2);
      const positionId = opp.positions[0]._id.toString();
      await opportunityModel
        .updateOne(
          { _id: opp._id },
          { $set: { 'positions.$[pos].filledCount': 1 } },
          { arrayFilters: [{ 'pos._id': new Types.ObjectId(positionId) }] },
        )
        .exec();

      await expect(
        service.deletePosition(account, opp._id.toString(), positionId),
      ).rejects.toMatchObject({
        status: 409,
        code: 'POSITION_NOT_DELETABLE',
      });
    });

    it('rejects a delete while an application references the position', async () => {
      const opp = await createDraft('Seat apps', 2);
      const positionId = opp.positions[0]._id;
      await handle.connection.db!.collection('applications').insertOne({
        positionId,
        volunteerId: new Types.ObjectId(),
        status: 'pending',
      });

      await expect(
        service.deletePosition(
          account,
          opp._id.toString(),
          positionId.toString(),
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: 'POSITION_NOT_DELETABLE',
      });
    });

    it('allows seat-safe edits and deletes on a draft', async () => {
      const opp = await createDraft('Seat ok', 2);
      const positionId = opp.positions[0]._id.toString();
      const patched = await service.updatePosition(
        account,
        opp._id.toString(),
        positionId,
        {
          requiredCount: 4,
        },
      );
      expect(patched.positions[0].requiredCount).toBe(4);
      const deleted = await service.deletePosition(
        account,
        opp._id.toString(),
        positionId,
      );
      expect(deleted.positions).toHaveLength(0);
    });
  });

  describe('5.3 opportunityStartTicker idempotency', () => {
    it('transitions once and activates each accepted participant exactly once', async () => {
      const opp = await createDraft('Ticker', 1);
      await opportunityModel
        .updateOne(
          { _id: opp._id },
          {
            $set: {
              status: 'published',
              startDate: new Date(Date.now() - 1000),
            },
          },
        )
        .exec();
      await handle.connection.db!.collection('task_participants').insertMany([
        {
          opportunityId: opp._id,
          positionId: opp.positions[0]._id,
          volunteerId: new Types.ObjectId(),
          status: 'accepted',
        },
        {
          opportunityId: opp._id,
          positionId: opp.positions[0]._id,
          volunteerId: new Types.ObjectId(),
          status: 'accepted',
        },
      ]);

      const started = jest.fn();
      emitter.on('opportunity.started', started);

      const first = await service.runStartTicker();
      expect(first).toEqual({ started: 1, activated: 2 });
      expect((await opportunityModel.findById(opp._id).exec())!.status).toBe(
        'in_progress',
      );
      const participants = await handle.connection
        .db!.collection('task_participants')
        .find({ opportunityId: opp._id })
        .toArray();
      expect(
        participants.every((participant) => participant.status === 'active'),
      ).toBe(true);
      expect(started).toHaveBeenCalledTimes(1);
      expect(
        await historyModel.countDocuments({ to: 'in_progress' }).exec(),
      ).toBe(1);

      const second = await service.runStartTicker();
      expect(second).toEqual({ started: 0, activated: 0 });
      expect(started).toHaveBeenCalledTimes(1);
    });

    it('skips published opportunities with no startDate', async () => {
      const opp = await createDraft('No start', 1);
      await opportunityModel
        .updateOne({ _id: opp._id }, { $set: { status: 'published' } })
        .exec();
      const result = await service.runStartTicker();
      expect(result).toEqual({ started: 0, activated: 0 });
      expect((await opportunityModel.findById(opp._id).exec())!.status).toBe(
        'published',
      );
    });
  });

  describe('6.2 recommended feed', () => {
    const volunteerAccount = (sub: string): AccountToken => ({
      sub,
      role: 'volunteer',
      sessionId: '64b000000000000000000030',
    });

    async function seedProfile(
      sub: string,
      skills: Types.ObjectId[],
      wilayaId?: string,
    ): Promise<void> {
      await volunteerProfileModel.create({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(sub),
        username: `rec-${sub.slice(-6)}`,
        location: wilayaId ? { wilayaId } : undefined,
      });
      for (const skillId of skills) {
        await volunteerSkillModel.create({
          volunteerId: new Types.ObjectId(sub),
          skillId,
          level: 3,
          yearsOfExperience: 1,
          isPrimary: false,
        });
      }
    }

    async function seedOpportunity({
      _id,
      title,
      status = 'published',
      requiredSkills = [],
      wilayaId,
      filledCount = 0,
      requiredCount = 2,
    }: {
      _id: Types.ObjectId;
      title: string;
      status?: string;
      requiredSkills?: Types.ObjectId[];
      wilayaId?: string;
      filledCount?: number;
      requiredCount?: number;
    }): Promise<void> {
      await opportunityModel.create({
        _id,
        organizationId: orgId,
        slug: title.toLowerCase().replace(/\s+/g, '-'),
        title,
        description: 'Seed description for the recommended feed',
        categoryId: new Types.ObjectId(),
        status,
        location: wilayaId ? { wilayaId } : undefined,
        positions: [
          {
            title: 'Helper',
            description: 'Seed position description',
            requiredCount,
            filledCount,
            requiredSkills,
          },
        ],
      });
    }

    it('scoreRecommendedOpportunity is a deterministic pure score table', () => {
      const input = {
        requiredSkills: ['s1', 's2'],
        volunteerSkillIds: ['s1'],
        primarySkillIds: ['s1'],
        wilayaId: '16',
        opportunityWilayaId: '16',
      };
      expect(scoreRecommendedOpportunity(input)).toBe(20);
      expect(
        scoreRecommendedOpportunity({
          requiredSkills: ['s1'],
          volunteerSkillIds: [],
          primarySkillIds: [],
        }),
      ).toBe(0);
      expect(scoreRecommendedOpportunity(input)).toBe(
        scoreRecommendedOpportunity(input),
      );
    });

    it('ranks by skill overlap then wilaya, deterministic across two calls', async () => {
      const sub = '64b000000000000000000021';
      const skillA = new Types.ObjectId();
      await seedProfile(sub, [skillA], '16');
      await volunteerSkillModel
        .updateOne(
          { volunteerId: new Types.ObjectId(sub) },
          { $set: { isPrimary: true } },
        )
        .exec();

      const matchId = new Types.ObjectId('64b000000000000000000001');
      const skillOnlyId = new Types.ObjectId('64b000000000000000000002');
      const wilayaOnlyId = new Types.ObjectId('64b000000000000000000003');
      const noMatchId = new Types.ObjectId('64b000000000000000000004');
      await seedOpportunity({
        _id: matchId,
        title: 'Match',
        requiredSkills: [skillA],
        wilayaId: '16',
      });
      await seedOpportunity({
        _id: skillOnlyId,
        title: 'SkillOnly',
        requiredSkills: [skillA],
      });
      await seedOpportunity({
        _id: wilayaOnlyId,
        title: 'WilayaOnly',
        wilayaId: '16',
      });
      await seedOpportunity({
        _id: noMatchId,
        title: 'NoMatch',
        requiredSkills: [new Types.ObjectId()],
      });

      const first = await service.getRecommended(volunteerAccount(sub), {});
      expect(
        first.items.map((item) => (item._id as Types.ObjectId).toString()),
      ).toEqual([
        matchId.toString(),
        skillOnlyId.toString(),
        wilayaOnlyId.toString(),
        noMatchId.toString(),
      ]);
      const second = await service.getRecommended(volunteerAccount(sub), {});
      expect(
        second.items.map((item) => (item._id as Types.ObjectId).toString()),
      ).toEqual(
        first.items.map((item) => (item._id as Types.ObjectId).toString()),
      );
    });

    it('excludes non-published and fully-filled opportunities', async () => {
      const sub = '64b000000000000000000022';
      await seedProfile(sub, []);
      const openId = new Types.ObjectId('64b000000000000000000001');
      const draftId = new Types.ObjectId('64b000000000000000000002');
      const closedId = new Types.ObjectId('64b000000000000000000003');
      const fullId = new Types.ObjectId('64b000000000000000000004');
      const mixedId = new Types.ObjectId('64b000000000000000000005');
      await seedOpportunity({ _id: openId, title: 'Open' });
      await seedOpportunity({ _id: draftId, title: 'Draft', status: 'draft' });
      await seedOpportunity({
        _id: closedId,
        title: 'Closed',
        status: 'closed',
      });
      await seedOpportunity({
        _id: fullId,
        title: 'Full',
        filledCount: 2,
        requiredCount: 2,
      });
      await seedOpportunity({
        _id: mixedId,
        title: 'MixedOpen',
        filledCount: 1,
        requiredCount: 2,
      });

      const page = await service.getRecommended(volunteerAccount(sub), {});
      const ids = page.items.map((item) =>
        (item._id as Types.ObjectId).toString(),
      );
      expect(ids).toContain(openId.toString());
      expect(ids).toContain(mixedId.toString());
      expect(ids).not.toContain(draftId.toString());
      expect(ids).not.toContain(closedId.toString());
      expect(ids).not.toContain(fullId.toString());
    });

    it('degrades to the full published-open set with no skills/location', async () => {
      const sub = '64b000000000000000000023';
      await seedProfile(sub, []);
      const firstId = new Types.ObjectId('64b000000000000000000001');
      const secondId = new Types.ObjectId('64b000000000000000000002');
      await seedOpportunity({ _id: firstId, title: 'Older' });
      await seedOpportunity({ _id: secondId, title: 'Newer' });

      const page = await service.getRecommended(volunteerAccount(sub), {});
      expect(
        page.items.map((item) => (item._id as Types.ObjectId).toString()),
      ).toEqual([secondId.toString(), firstId.toString()]);
    });

    it('still returns candidates for an account with no profile at all', async () => {
      const ghost = volunteerAccount('64b000000000000000000024');
      const id = new Types.ObjectId('64b000000000000000000001');
      await seedOpportunity({ _id: id, title: 'For everyone' });
      const page = await service.getRecommended(ghost, {});
      expect(
        page.items.map((item) => (item._id as Types.ObjectId).toString()),
      ).toEqual([id.toString()]);
    });

    it('clamps the limit and advances via cursor in memory', async () => {
      const sub = '64b000000000000000000025';
      await seedProfile(sub, []);
      const ids = [
        '64b000000000000000000001',
        '64b000000000000000000002',
        '64b000000000000000000003',
        '64b000000000000000000004',
        '64b000000000000000000005',
      ].map((id) => new Types.ObjectId(id));
      for (const id of ids) {
        await seedOpportunity({ _id: id, title: `Page ${id.toString()}` });
      }
      expect(ids.map((id) => id.toString())).toEqual(
        [...ids.map((id) => id.toString())].sort(), // ascending
      );

      const first = await service.getRecommended(volunteerAccount(sub), {
        limit: '2',
      });
      expect(first.limit).toBe(2);
      expect(
        first.items.map((item) => (item._id as Types.ObjectId).toString()),
      ).toEqual([ids[4].toString(), ids[3].toString()]);
      expect(first.nextCursor).not.toBeNull();

      const second = await service.getRecommended(volunteerAccount(sub), {
        limit: '2',
        cursor: first.nextCursor ?? undefined,
      });
      expect(
        second.items.map((item) => (item._id as Types.ObjectId).toString()),
      ).toEqual([ids[2].toString(), ids[1].toString()]);

      const clamped = await service.getRecommended(volunteerAccount(sub), {
        limit: '500',
      });
      expect(clamped.limit).toBe(50);
    });
  });

  describe('11.1 opportunity fields (mode, cover, dates, duration, prerequisites)', () => {
    const coverId = new Types.ObjectId().toString();

    async function createFull() {
      return service.createOpportunity(account, {
        title: 'Harvest help',
        description: 'Pick olives with the cooperative',
        mode: 'onsite',
        coverMediaId: coverId,
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        durationMinutes: 240,
        prerequisites: ['Bring gloves'],
        positions: [
          {
            title: 'Picker',
            description: 'Pick olives',
            requiredCount: 4,
            requiredSkills: [],
            deliverables: ['Two crates a day'],
            startAt: '2026-10-01',
          },
        ],
      });
    }

    it('persists all new fields and asserts the cover purpose', async () => {
      const opp = await createFull();
      expect(opp.mode).toBe('onsite');
      expect(opp.coverMediaId?.toString()).toBe(coverId);
      expect(opp.durationMinutes).toBe(240);
      expect(opp.prerequisites).toEqual(['Bring gloves']);
      expect(opp.endDate?.toISOString().slice(0, 10)).toBe('2026-10-05');
      expect(opp.positions[0].deliverables).toEqual(['Two crates a day']);
      expect(opp.positions[0].startAt?.toISOString().slice(0, 10)).toBe(
        '2026-10-01',
      );
      expect(mediaOwnership.assertFor).toHaveBeenCalledWith(
        coverId,
        account.sub,
        'opportunity_cover',
      );
    });

    it('rejects an endDate preceding startDate with INVALID_END_DATE', async () => {
      await expect(
        service.createOpportunity(account, {
          title: 'Bad window',
          description: 'Ends before it starts',
          startDate: '2026-10-05',
          endDate: '2026-10-01',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_END_DATE' });
    });

    it('propagates cover ownership failures', async () => {
      mediaOwnership.assertFor.mockRejectedValueOnce(
        Object.assign(new Error('Media not found'), {
          status: 404,
          code: 'MEDIA_NOT_FOUND',
        }),
      );
      await expect(
        service.createOpportunity(account, {
          title: 'Bad cover',
          description: 'Foreign media',
          coverMediaId: new Types.ObjectId().toString(),
        }),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
    });

    it('accepts the same required skill on two positions (value dedupe)', async () => {
      const skill = await skillModel.create({
        slug: 'regression-skill',
        categoryId: new Types.ObjectId(),
        nameAr: 'مهارة',
        nameFr: 'Compétence',
        order: 0,
        active: true,
      });
      const skillId = skill._id.toString();
      const opp = await service.createOpportunity(account, {
        title: 'Shared skill',
        description: 'Two positions needing the same skill',
        positions: [
          {
            title: 'First',
            description: 'First seat',
            requiredCount: 1,
            requiredSkills: [skillId],
          },
          {
            title: 'Second',
            description: 'Second seat',
            requiredCount: 1,
            requiredSkills: [skillId],
          },
        ],
      });
      expect(opp.positions).toHaveLength(2);
    });

    it('allows the full new field set on a draft patch', async () => {
      const opp = await createDraft('Draft patch', 1);
      const patched = await service.updateOpportunity(
        account,
        opp._id.toString(),
        {
          mode: 'hybrid',
          durationMinutes: 90,
          prerequisites: ['Bike'],
          endDate: '2026-11-01',
          coverMediaId: coverId,
        },
      );
      expect(patched.mode).toBe('hybrid');
      expect(patched.durationMinutes).toBe(90);
      expect(patched.prerequisites).toEqual(['Bike']);
      expect(patched.coverMediaId?.toString()).toBe(coverId);
    });

    it('locks mode/prerequisites/duration/endDate once published', async () => {
      const opp = await createFull();
      await opportunityModel
        .updateOne({ _id: opp._id }, { $set: { status: 'published' } })
        .exec();
      const lockedPatches: UpdateOpportunityDto[] = [
        { mode: 'remote' },
        { prerequisites: ['Late'] },
        { durationMinutes: 60 },
        { endDate: '2026-10-06' },
      ];
      for (const patch of lockedPatches) {
        await expect(
          service.updateOpportunity(account, opp._id.toString(), patch),
        ).rejects.toMatchObject({
          status: 409,
          code: 'OPPORTUNITY_FIELD_LOCKED',
        });
      }
    });

    it('allows cover changes until the first acceptance', async () => {
      const opp = await createFull();
      await opportunityModel
        .updateOne({ _id: opp._id }, { $set: { status: 'published' } })
        .exec();
      const nextCover = new Types.ObjectId().toString();
      const patched = await service.updateOpportunity(
        account,
        opp._id.toString(),
        { coverMediaId: nextCover },
      );
      expect(patched.coverMediaId?.toString()).toBe(nextCover);

      await handle.connection.db!.collection('task_participants').insertOne({
        opportunityId: opp._id,
        positionId: opp.positions[0]._id,
        volunteerId: new Types.ObjectId(),
        status: 'accepted',
      });
      await expect(
        service.updateOpportunity(account, opp._id.toString(), {
          coverMediaId: new Types.ObjectId().toString(),
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'OPPORTUNITY_HAS_ACCEPTED_PARTICIPANTS',
      });
    });

    it('stores deliverables/startAt on position add and patch', async () => {
      const opp = await createDraft('Position extras', 1);
      const withAdded = await service.addPosition(account, opp._id.toString(), {
        title: 'Driver',
        requiredCount: 1,
        deliverables: ['Deliver crates'],
        startAt: '2026-10-02',
      });
      const added = withAdded.positions.find((p) => p.title === 'Driver')!;
      expect(added.deliverables).toEqual(['Deliver crates']);
      const patched = await service.updatePosition(
        account,
        opp._id.toString(),
        added._id.toString(),
        { deliverables: ['Deliver crates', 'Fuel log'] },
      );
      expect(
        patched.positions.find(
          (p) => p._id.toString() === added._id.toString(),
        )!.deliverables,
      ).toEqual(['Deliver crates', 'Fuel log']);
    });

    it('never exposes perks or logistics paths on the schema', async () => {
      const paths = Object.keys(opportunityModel.schema.paths);
      for (const banned of [
        'perks',
        'hostLogistics',
        'accommodation',
        'languageOfRecord',
      ]) {
        expect(paths).not.toContain(banned);
      }
    });
  });

  describe('11.2 org single-read and duplicate', () => {
    it('reads back an own draft via getOwnById', async () => {
      const opp = await service.createOpportunity(account, {
        title: 'Own draft read',
        description: 'Draft detail',
        mode: 'remote',
        durationMinutes: 45,
      });
      const found = await service.getOwnById(account, opp._id.toString());
      expect((found._id as Types.ObjectId).toString()).toBe(opp._id.toString());
      expect(found['mode']).toBe('remote');
    });

    it('hides foreign and malformed ids with 404', async () => {
      const opp = await createDraft('Foreign hidden', 1);
      const otherOrg = {
        _id: new Types.ObjectId(),
        slug: 'other',
        verificationStatus: 'verified',
        status: 'active',
      } as unknown as OrganizationModel;
      (organizations.findByUserId as jest.Mock).mockResolvedValueOnce(otherOrg);
      await expect(
        service.getOwnById(account, opp._id.toString()),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.getOwnById(account, 'not-an-id'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('duplicates as an independent draft with fresh identity', async () => {
      const source = await service.createOpportunity(account, {
        title: 'Source to copy',
        description: 'Copy me',
        mode: 'hybrid',
        durationMinutes: 120,
        prerequisites: ['Boots'],
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        positions: [
          {
            title: 'Helper',
            description: 'Help out',
            requiredCount: 3,
            requiredSkills: [],
            deliverables: ['Done'],
            startAt: '2026-10-01',
          },
        ],
      });
      await opportunityModel
        .updateOne(
          { _id: source._id },
          { $set: { 'positions.$[pos].filledCount': 2 } },
          {
            arrayFilters: [{ 'pos._id': source.positions[0]._id }],
          },
        )
        .exec();

      const copy = await service.duplicateOpportunity(
        account,
        source._id.toString(),
      );
      expect(copy._id.toString()).not.toBe(source._id.toString());
      expect(copy.slug).not.toBe(source.slug);
      expect(copy.registryId).not.toBe(source.registryId);
      expect(copy.status).toBe('draft');
      expect(copy.mode).toBe('hybrid');
      expect(copy.durationMinutes).toBe(120);
      expect(copy.prerequisites).toEqual(['Boots']);
      expect(copy.positions).toHaveLength(1);
      expect(copy.positions[0]._id.toString()).not.toBe(
        source.positions[0]._id.toString(),
      );
      expect(copy.positions[0].filledCount).toBe(0);
      expect(copy.positions[0].requiredCount).toBe(3);
      expect(copy.positions[0].deliverables).toEqual(['Done']);

      const fresh = await service.getOwnById(account, source._id.toString());
      const freshPositions = fresh['positions'] as Array<
        Record<string, unknown>
      >;
      expect(freshPositions[0]['filledCount']).toBe(2);
    });

    it('rejects duplicating a foreign id with 404', async () => {
      const otherOrg = {
        _id: new Types.ObjectId(),
        slug: 'stranger',
        verificationStatus: 'verified',
        status: 'active',
      } as unknown as OrganizationModel;
      (organizations.findByUserId as jest.Mock).mockResolvedValueOnce(otherOrg);
      await expect(
        service.duplicateOpportunity(account, new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
