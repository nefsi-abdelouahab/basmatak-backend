import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { SettingsService } from '../core/settings/settings.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from '../submissions/schemas/submission.schema';
import { TrustPublishGateService } from './trust-publish-gate.service';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('TrustPublishGateService', () => {
  let handle: MemoryConnectionHandle;
  let service: TrustPublishGateService;
  let emitted: unknown[];

  const organizationId = new Types.ObjectId();
  const settings = {
    get: jest.fn().mockResolvedValue(3),
  } as unknown as SettingsService;
  const config = new ConfigService({ PUBLISH_GATE_ENABLED: 'false' });
  const eventEmitter = new EventEmitter2();

  function seedSubmission(
    opportunity: Types.ObjectId,
    status: string,
  ): Promise<unknown> {
    const model = handle.connection.model(
      SubmissionsCollection,
      SubmissionSchema,
    );
    return model.create({
      participantId: new Types.ObjectId(),
      opportunityId: opportunity,
      positionId: new Types.ObjectId(),
      organizationId,
      volunteerId: new Types.ObjectId(),
      deliverables: [],
      consentConfirmed: true,
      evidence: [],
      status,
    });
  }

  async function seedOpportunity(
    id: Types.ObjectId,
    title: string,
    slug: string,
  ): Promise<void> {
    const model = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    await model.create({
      _id: id,
      organizationId,
      slug,
      title,
      description: 'Desc',
      categoryId: new Types.ObjectId(),
      status: 'published',
      positions: [],
    });
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const submissionModel = handle.connection.model(
      SubmissionsCollection,
      SubmissionSchema,
    );
    const opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    service = new TrustPublishGateService(
      config,
      submissionModel,
      opportunityModel,
      handle.connection.model(OrganizationsCollection, OrganizationSchema),
      settings,
      eventEmitter,
    );
    await handle.connection
      .model(OrganizationsCollection, OrganizationSchema)
      .create({
        _id: organizationId,
        userId: new Types.ObjectId(),
        slug: 'org-a',
      });
    eventEmitter.on('publish-gate.locked', (payload) => emitted.push(payload));
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    emitted = [];
    await Promise.all([
      handle.connection.collection(SubmissionsCollection).deleteMany({}),
      handle.connection.collection(OpportunitiesCollection).deleteMany({}),
    ]);
  });

  describe('3 counter rule (D4)', () => {
    it('counts distinct pending opportunities, not pending submissions', async () => {
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      await seedOpportunity(a, 'A', 'a');
      await seedOpportunity(b, 'B', 'b');
      await seedSubmission(a, 'submitted');
      await seedSubmission(a, 'under_review');
      await seedSubmission(b, 'under_review');

      expect(await service.countPendingOpportunities(organizationId)).toBe(2);
    });

    it('excludes drafts and decided submissions', async () => {
      const a = new Types.ObjectId();
      await seedOpportunity(a, 'A', 'a');
      await seedSubmission(a, 'draft');
      await seedSubmission(a, 'approved');
      await seedSubmission(a, 'rejected');

      expect(await service.countPendingOpportunities(organizationId)).toBe(0);
    });

    it('unlocks an opportunity when its last pending submission is decided', async () => {
      const a = new Types.ObjectId();
      await seedOpportunity(a, 'A', 'a');
      await seedSubmission(a, 'under_review');
      expect(await service.countPendingOpportunities(organizationId)).toBe(1);

      await handle.connection
        .collection(SubmissionsCollection)
        .updateMany({}, { $set: { status: 'approved' } });
      expect(await service.countPendingOpportunities(organizationId)).toBe(0);
    });
  });

  describe('3 threshold + demod 3.4 override', () => {
    it('reports locked when the pending count reaches the threshold', async () => {
      (settings.get as jest.Mock).mockResolvedValueOnce(3);
      for (let i = 0; i < 3; i += 1) {
        const op = new Types.ObjectId();
        await seedOpportunity(op, `O${i}`, `o${i}`);
        await seedSubmission(op, 'submitted');
      }
      const result = await service.evaluate({ id: organizationId.toString() });
      expect(result.locked).toBe(true);
      expect(result.code).toBe('PUBLISH_GATE_LOCKED');
    });

    it('reports unlocked under the threshold', async () => {
      (settings.get as jest.Mock).mockResolvedValueOnce(3);
      const op = new Types.ObjectId();
      await seedOpportunity(op, 'O', 'o');
      await seedSubmission(op, 'submitted');
      const result = await service.evaluate({ id: organizationId.toString() });
      expect(result.locked).toBe(false);
      expect(result.code).toBeUndefined();
    });

    it('demod lock override forces locked regardless of count', async () => {
      const demoConfig = new ConfigService({ PUBLISH_GATE_ENABLED: 'true' });
      const demoService = new TrustPublishGateService(
        demoConfig,
        handle.connection.model(SubmissionsCollection, SubmissionSchema),
        handle.connection.model(OpportunitiesCollection, OpportunitySchema),
        handle.connection.model(OrganizationsCollection, OrganizationSchema),
        settings,
        eventEmitter,
      );
      const result = await demoService.evaluate({
        id: organizationId.toString(),
      });
      expect(result.locked).toBe(true);
    });

    it('invalid org id is unlocked and emits nothing', async () => {
      const result = await service.evaluate({ id: 'not-an-id' });
      expect(result.locked).toBe(false);
      expect(emitted).toHaveLength(0);
    });
  });

  describe('4 status read', () => {
    it('returns locked, pendingCount, threshold and pendingOpportunities', async () => {
      (settings.get as jest.Mock).mockResolvedValueOnce(3);
      const a = new Types.ObjectId();
      await seedOpportunity(a, 'Beach', 'beach-clean');
      await seedSubmission(a, 'submitted');

      const status = await service.status(organizationId);
      expect(status.locked).toBe(false);
      expect(status.pendingCount).toBe(1);
      expect(status.threshold).toBe(3);
      expect(status.pendingOpportunities).toEqual([
        { id: a.toString(), slug: 'beach-clean', title: 'Beach' },
      ]);
    });
  });

  describe('5 locked event (D5)', () => {
    it('emits publish-gate.locked with organizationId + org record when locked', async () => {
      (settings.get as jest.Mock).mockResolvedValueOnce(3);
      for (let i = 0; i < 3; i += 1) {
        const op = new Types.ObjectId();
        await seedOpportunity(op, `O${i}`, `o${i}`);
        await seedSubmission(op, 'submitted');
      }
      await service.evaluate({ id: organizationId.toString() });

      expect(emitted).toHaveLength(1);
      const payload = emitted[0] as {
        organizationId: string;
        organization: { _id: Types.ObjectId };
      };
      expect(payload.organizationId).toBe(organizationId.toString());
      expect(payload.organization._id).toBeDefined();
    });

    it('does not emit when unlocked', async () => {
      const op = new Types.ObjectId();
      await seedOpportunity(op, 'O', 'o');
      await seedSubmission(op, 'submitted');
      await service.evaluate({ id: organizationId.toString() });
      expect(emitted).toHaveLength(0);
    });
  });
});
