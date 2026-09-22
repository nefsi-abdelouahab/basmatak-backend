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

    registry = new StatusTransitionRegistry();
    registry.register('opportunity', OP_PAIRS);
    transitions = new StatusTransitionService(historyModel, registry);
    adapter = new TaskParticipantsAdapter(handle.connection);
    emitter = new EventEmitter2();

    service = new OpportunitiesService(
      opportunityModel,
      skillModel,
      organizations,
      transitions,
      publishGate,
      adapter,
      emitter,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(OpportunitiesCollection).deleteMany({});
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
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
});
