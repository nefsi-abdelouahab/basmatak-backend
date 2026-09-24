import { Model, Types } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  ApplicationsCollection,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import {
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../participations/schemas/task-participant.schema';
import {
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  LocationsCollection,
  LocationSchema,
} from '../locations/schemas/location.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { AdminOpportunitiesService } from './opportunities.service';

const OPPORTUNITY_PAIRS = [
  ['draft', 'published'],
  ['published', 'closed'],
  ['published', 'cancelled'],
  ['published', 'in_progress'],
  ['in_progress', 'closed'],
  ['in_progress', 'cancelled'],
  ['in_progress', 'completed'],
  ['completed', 'closed'],
] as const;

describe('AdminOpportunitiesService (inventory §2.20 opportunities)', () => {
  let handle: MemoryConnectionHandle;
  let service: AdminOpportunitiesService;
  let opportunityModel: Model<OpportunityModel>;
  let historyModel: Model<StatusHistoryModel>;

  const admin: AccountToken = {
    sub: '507f1f77bcf86cd799439011',
    role: 'admin',
    sessionId: '507f1f77bcf86cd799439012',
  };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const organizationModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    const applicationModel = handle.connection.model(
      ApplicationsCollection,
      ApplicationSchema,
    );
    const participantModel = handle.connection.model(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    const profileModel = handle.connection.model(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    const locationModel = handle.connection.model(
      LocationsCollection,
      LocationSchema,
    );
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    const registry = new StatusTransitionRegistry();
    registry.register('opportunity', OPPORTUNITY_PAIRS);
    const transitions = new StatusTransitionService(historyModel, registry);
    service = new AdminOpportunitiesService(
      opportunityModel,
      organizationModel,
      applicationModel,
      participantModel,
      profileModel,
      locationModel,
      transitions,
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
  });

  async function seedOpportunity(status: string, orgSuffix: string) {
    return opportunityModel.create({
      organizationId: new Types.ObjectId(),
      slug: `opp-${orgSuffix}`,
      title: `Opportunity ${orgSuffix}`,
      description: `Opportunity ${orgSuffix} description`,
      status,
    });
  }

  describe('list', () => {
    it('returns an empty page with no opportunities', async () => {
      const page = await service.list({});
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
      expect(page.limit).toBe(20);
    });

    it('paginates newest-first by _id desc with a nextCursor', async () => {
      for (let i = 0; i < 3; i += 1) {
        await seedOpportunity('published', `a-${i}`);
      }
      const first = await service.list({ limit: '2' });
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await service.list({
        limit: '2',
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();

      const firstIds = first.items.map((o) => o.opportunity._id.toString());
      const secondIds = second.items.map((o) => o.opportunity._id.toString());
      const all = [...firstIds, ...secondIds];
      const sorted = [...all].sort((a, b) => b.localeCompare(a));
      expect(all).toEqual(sorted);
    });
  });

  describe('setStatus', () => {
    it('closes a published opportunity and writes a history row', async () => {
      const opportunity = await seedOpportunity('published', 'close-me');
      const updated = await service.setStatus(
        admin,
        opportunity._id.toString(),
        'closed',
      );

      expect(updated.status).toBe('closed');
      expect(
        await opportunityModel.findById(opportunity._id).exec(),
      ).toMatchObject({
        status: 'closed',
      });

      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityType: 'opportunity',
        from: 'published',
        to: 'closed',
      });
      expect(history[0].actor.toString()).toBe(admin.sub);
    });

    it('accepts the in_progress → cancelled admin override', async () => {
      const opportunity = await seedOpportunity('in_progress', 'cancel-me');
      const updated = await service.setStatus(
        admin,
        opportunity._id.toString(),
        'cancelled',
      );
      expect(updated.status).toBe('cancelled');
    });

    it('rejects an unauthorized jump (draft → closed) with 409', async () => {
      const opportunity = await seedOpportunity('draft', 'no-jump');
      await expect(
        service.setStatus(admin, opportunity._id.toString(), 'closed'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
      expect(await historyModel.countDocuments({}).exec()).toBe(0);
    });

    it('rejects a no-op status change', async () => {
      const opportunity = await seedOpportunity('closed', 'no-op');
      await expect(
        service.setStatus(admin, opportunity._id.toString(), 'closed'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('404s for an unknown opportunity', async () => {
      await expect(
        service.setStatus(admin, '507f1f77bcf86cd799439099', 'closed'),
      ).rejects.toMatchObject({ status: 404, code: 'OPPORTUNITY_NOT_FOUND' });
    });
  });
});
