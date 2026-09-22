import { Model } from 'mongoose';
import { OrganizationsService } from './organizations.service';
import { UsersService } from '../users/users.service';
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
} from './schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationSchema,
  OrganizationVerificationsCollection,
} from './schemas/organization-verification.schema';
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { MediaOwnership } from '../common/seams/media-ownership';
import {
  MediaModel,
  MediaCollection,
  MediaSchema,
} from '../media/schemas/media.schema';

describe('OrganizationsService (inventory §2.7, roadmap S5)', () => {
  let handle: MemoryConnectionHandle;
  let service: OrganizationsService;
  let users: UsersService;
  let orgModel: Model<OrganizationModel>;
  let verificationModel: Model<OrganizationVerificationModel>;
  let historyModel: Model<StatusHistoryModel>;
  let userModel: Model<UserModel>;
  let mediaModel: Model<MediaModel>;
  let registry: StatusTransitionRegistry;

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
    userModel = handle.connection.model(UsersCollection, UserSchema);
    mediaModel = handle.connection.model<MediaModel>(
      MediaCollection,
      MediaSchema,
    );

    users = new UsersService(userModel);
    registry = new StatusTransitionRegistry();
    registry.register('organization', [
      ['pending', 'verified'],
      ['pending', 'rejected'],
      ['rejected', 'pending'],
    ]);
    const transitions = new StatusTransitionService(historyModel, registry);
    service = new OrganizationsService(
      orgModel,
      verificationModel,
      transitions,
      users,
      new MediaOwnership(mediaModel),
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(OrganizationsCollection).deleteMany({});
    await handle.connection
      .collection(OrganizationVerificationsCollection)
      .deleteMany({});
    await handle.connection.collection(StatusHistoryCollection).deleteMany({});
    await handle.connection.collection(UsersCollection).deleteMany({});
    await handle.connection.collection(MediaCollection).deleteMany({});
  });

  async function createOrgOwner() {
    const user = await userModel.create({
      email: 'org-owner@example.com',
      passwordHash: 'hash',
      role: 'organization',
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    const org = await orgModel.create({
      userId: user._id,
      slug: 'org-owner',
      verificationStatus: 'pending',
      status: 'active',
    });
    return { user, org };
  }

  function accountOf(user: UserModel): AccountToken {
    return {
      sub: user._id.toString(),
      role: 'organization',
      sessionId: '64b000000000000000000020',
    };
  }

  async function createMedia(
    ownerId: string,
    purpose: 'verification_document' | 'organization_logo',
  ): Promise<string> {
    const row = await mediaModel.create({
      ownerId,
      purpose,
      visibility: 'private',
      type: 'file',
      storageKey: `${purpose}/${ownerId}/probe-${Math.random()}.pdf`,
    });
    return row._id.toString();
  }

  describe('submitVerification (F1 machine)', () => {
    it('from pending stores documents and keeps pending (no history)', async () => {
      const { user, org } = await createOrgOwner();
      const doc = await createMedia(
        user._id.toString(),
        'verification_document',
      );
      const row = await service.submitVerification(accountOf(user), [doc]);

      expect(row.status).toBe('pending');
      const stored = await verificationModel.findById(row._id).exec();
      expect(stored!.documents).toHaveLength(1);
      const after = await orgModel.findById(org._id).exec();
      expect(after!.verificationStatus).toBe('pending');
      const history = await historyModel.countDocuments({}).exec();
      expect(history).toBe(0);
    });

    it('from rejected transitions to pending and writes a history entry', async () => {
      const { user, org } = await createOrgOwner();
      await verificationModel.create({
        organizationId: org._id,
        status: 'rejected',
        documents: [],
        submittedAt: new Date(),
      });
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'rejected' } },
        )
        .exec();

      const row = await service.submitVerification(accountOf(user), [
        await createMedia(user._id.toString(), 'verification_document'),
      ]);
      expect(row.status).toBe('pending');

      const after = await orgModel.findById(org._id).exec();
      expect(after!.verificationStatus).toBe('pending');
      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityType: 'organization',
        from: 'rejected',
        to: 'pending',
      });
    });

    it('rejects a submission from an already-verified organization', async () => {
      const { user, org } = await createOrgOwner();
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();

      await expect(
        service.submitVerification(accountOf(user), [
          '507f1f77bcf86cd799439011',
        ]),
      ).rejects.toMatchObject({ status: 409, code: 'ORG_ALREADY_VERIFIED' });
    });

    it('requires a verified email regardless of env flag (A10)', async () => {
      const user = await userModel.create({
        email: 'unverified@example.com',
        passwordHash: 'hash',
        role: 'organization',
        status: 'active',
      });
      const org = await orgModel.create({
        userId: user._id,
        slug: 'unverified-org',
        verificationStatus: 'pending',
        status: 'active',
      });
      void org;

      await expect(
        service.submitVerification(accountOf(user), [
          '507f1f77bcf86cd799439011',
        ]),
      ).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
    });
  });

  describe('public reads (verified + active only)', () => {
    it('hides a pending organization from public lookups and lists', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      expect(await service.getPublicOrganization('org-owner')).toBeNull();
      await expect(service.getPublicBySlug('org-owner')).rejects.toMatchObject({
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
      await expect(
        service.listPublishedOpportunities('org-owner'),
      ).rejects.toMatchObject({
        status: 404,
      });
      void org;
      expect(await service.listPublic()).toHaveLength(0);
    });

    it('exposes the organization once verified and active', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();

      const fetched = await service.getPublicOrganization('org-owner');
      expect(fetched).not.toBeNull();
      expect(fetched!.verificationStatus).toBe('verified');
      expect(await service.listPublic()).toHaveLength(1);
      expect(await service.listPublishedOpportunities('org-owner')).toEqual([]);
    });

    it('hides a verified but suspended organization', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified', status: 'suspended' } },
        )
        .exec();
      expect(await service.getPublicOrganization('org-owner')).toBeNull();
    });
  });
});
