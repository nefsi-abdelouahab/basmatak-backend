import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { validate } from 'class-validator';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { DomainEvents } from '../common/constants/domain-events';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationSchema,
  OrganizationVerificationsCollection,
} from '../organizations/schemas/organization-verification.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { RejectionReasonDto } from './dto/admin-query.dto';
import { AdminOrganizationsService } from './organizations.service';

const ORG_PAIRS = [
  ['pending', 'verified'],
  ['pending', 'rejected'],
  ['rejected', 'pending'],
  ['active', 'suspended'],
  ['suspended', 'active'],
] as const;

describe('AdminOrganizationsService (inventory §2.20 organizations)', () => {
  let handle: MemoryConnectionHandle;
  let service: AdminOrganizationsService;
  let orgModel: Model<OrganizationModel>;
  let verificationModel: Model<OrganizationVerificationModel>;
  let historyModel: Model<StatusHistoryModel>;
  let emitter: EventEmitter2;
  let emitted: unknown[];

  const admin: AccountToken = {
    sub: '507f1f77bcf86cd799439011',
    role: 'admin',
    sessionId: '507f1f77bcf86cd799439012',
  };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    orgModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    verificationModel = handle.connection.model(
      OrganizationVerificationsCollection,
      OrganizationVerificationSchema,
    );
    historyModel = handle.connection.model(
      StatusHistoryCollection,
      StatusHistorySchema,
    );
    const registry = new StatusTransitionRegistry();
    registry.register('organization', ORG_PAIRS);
    const transitions = new StatusTransitionService(historyModel, registry);
    emitter = new EventEmitter2();
    service = new AdminOrganizationsService(
      orgModel,
      verificationModel,
      transitions,
      emitter,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(() => {
    emitter.removeAllListeners(DomainEvents.OrgVerificationUpdated);
    emitted = [];
    emitter.on(DomainEvents.OrgVerificationUpdated, (payload) =>
      emitted.push(payload),
    );
  });

  afterEach(async () => {
    await handle.connection.collection(OrganizationsCollection).deleteMany({});
    await handle.connection
      .collection(OrganizationVerificationsCollection)
      .deleteMany({});
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
  });

  async function seedOrganization(
    verificationStatus: 'pending' | 'verified' | 'rejected' = 'pending',
    status: 'active' | 'suspended' | 'deleted' = 'active',
  ): Promise<OrganizationModel> {
    return orgModel.create({
      userId: new Types.ObjectId(),
      slug: `org-${new Types.ObjectId().toString()}`,
      verificationStatus,
      status,
    });
  }

  async function seedPendingVerification(
    organizationId: Types.ObjectId,
    submittedAt = new Date(),
  ): Promise<OrganizationVerificationModel> {
    return verificationModel.create({
      organizationId,
      status: 'pending',
      documents: [],
      submittedAt,
    });
  }

  describe('setStatus (account active ↔ suspended)', () => {
    it('suspends an active organization and writes a history row', async () => {
      const organization = await seedOrganization();
      const updated = await service.setStatus(
        admin,
        organization._id.toString(),
        'suspended',
      );

      expect(updated.status).toBe('suspended');
      const stored = await orgModel.findById(organization._id).exec();
      expect(stored!.status).toBe('suspended');

      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityType: 'organization',
        from: 'active',
        to: 'suspended',
      });
    });

    it('reinstate returns a suspended organization to active', async () => {
      const organization = await seedOrganization('pending', 'suspended');
      await service.setStatus(admin, organization._id.toString(), 'active');
      const stored = await orgModel.findById(organization._id).exec();
      expect(stored!.status).toBe('active');
      expect(await historyModel.countDocuments({}).exec()).toBe(1);
    });

    it('rejects a no-op and a deleted-account change', async () => {
      const organization = await seedOrganization();
      await expect(
        service.setStatus(admin, organization._id.toString(), 'active'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });

      const deleted = await seedOrganization('pending', 'deleted');
      await expect(
        service.setStatus(admin, deleted._id.toString(), 'active'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('404s for an unknown organization', async () => {
      await expect(
        service.setStatus(admin, '507f1f77bcf86cd799439099', 'suspended'),
      ).rejects.toMatchObject({ status: 404, code: 'ORGANIZATION_NOT_FOUND' });
    });

    it('does not emit verification events for account-status changes', () => {
      expect(emitted).toEqual([]);
    });
  });

  describe('approve (F1 pending → verified)', () => {
    it('marks the org and row verified, writes history once and emits once', async () => {
      const organization = await seedOrganization();
      const row = await seedPendingVerification(organization._id);
      void row;

      const decision = await service.approve(
        admin,
        organization._id.toString(),
      );
      expect(decision).toMatchObject({
        verificationStatus: 'verified',
        decidedBy: admin.sub,
      });

      const orgRow = await orgModel.findById(organization._id).exec();
      expect(orgRow!.verificationStatus).toBe('verified');

      const verification = await verificationModel
        .findOne({ organizationId: organization._id })
        .exec();
      expect(verification!.status).toBe('verified');
      expect(verification!.decidedAt).toBeInstanceOf(Date);
      expect(verification!.decidedBy!.toString()).toBe(admin.sub);

      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityType: 'organization',
        from: 'pending',
        to: 'verified',
      });

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ organizationId: organization._id });
    });

    it('404s for an unknown organization', async () => {
      await expect(
        service.approve(admin, '507f1f77bcf86cd799439099'),
      ).rejects.toMatchObject({ status: 404, code: 'ORGANIZATION_NOT_FOUND' });
    });

    it('rejects already-verified organizations', async () => {
      const organization = await seedOrganization('verified');
      await expect(
        service.approve(admin, organization._id.toString()),
      ).rejects.toMatchObject({ status: 409, code: 'ORG_ALREADY_VERIFIED' });
      expect(emitted).toEqual([]);
    });

    it('409s when no pending verification row exists', async () => {
      const organization = await seedOrganization();
      await expect(
        service.approve(admin, organization._id.toString()),
      ).rejects.toMatchObject({ status: 409, code: 'NO_PENDING_VERIFICATION' });
      expect(emitted).toEqual([]);
    });

    it('cannot approve a rejected organization without a resubmission', async () => {
      const organization = await seedOrganization();
      const row = await seedPendingVerification(organization._id);
      void row;
      await service.reject(
        admin,
        organization._id.toString(),
        'documents unclear',
      );

      await expect(
        service.approve(admin, organization._id.toString()),
      ).rejects.toMatchObject({ status: 409, code: 'NO_PENDING_VERIFICATION' });
    });
  });

  describe('reject (pending → rejected)', () => {
    it('records the reason, marks org and row rejected, writes history and emits', async () => {
      const organization = await seedOrganization();
      await seedPendingVerification(organization._id);

      const decision = await service.reject(
        admin,
        organization._id.toString(),
        'Missing commercial registry',
      );
      expect(decision).toMatchObject({
        verificationStatus: 'rejected',
        rejectionReason: 'Missing commercial registry',
        decidedBy: admin.sub,
      });

      const orgRow = await orgModel.findById(organization._id).exec();
      expect(orgRow!.verificationStatus).toBe('rejected');

      const verification = await verificationModel
        .findOne({ organizationId: organization._id })
        .exec();
      expect(verification!.status).toBe('rejected');
      expect(verification!.rejectionReason).toBe('Missing commercial registry');
      expect(verification!.decidedBy!.toString()).toBe(admin.sub);

      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        from: 'pending',
        to: 'rejected',
      });

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ organizationId: organization._id });
    });

    it('409s without a pending row and 404s for unknown orgs', async () => {
      const organization = await seedOrganization();
      await expect(
        service.reject(admin, organization._id.toString(), 'reason'),
      ).rejects.toMatchObject({ status: 409, code: 'NO_PENDING_VERIFICATION' });
      await expect(
        service.reject(admin, '507f1f77bcf86cd799439099', 'reason'),
      ).rejects.toMatchObject({ status: 404, code: 'ORGANIZATION_NOT_FOUND' });
    });
  });

  describe('RejectionReasonDto validation (400 surface)', () => {
    it('requires a non-empty rejectionReason', async () => {
      const empty = new RejectionReasonDto();
      (empty as unknown as Record<string, unknown>).rejectionReason = '   ';
      expect(await validate(empty)).toHaveLength(1);

      const missing = new RejectionReasonDto();
      expect(await validate(missing)).toHaveLength(1);

      const valid = new RejectionReasonDto();
      valid.rejectionReason = 'Missing documents';
      expect(await validate(valid)).toHaveLength(0);
    });
  });
});
