import { Model, Types } from 'mongoose';
import { OrganizationsService } from './organizations.service';
import { UsersService } from '../users/users.service';
import {
  SessionModel,
  SessionsCollection,
  SessionSchema,
} from '../auth/schemas/session.schema';
import { InertOrgPublicStatsProvider } from '../common/seams/org-public-stats';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  StatusHistoryModel,
  StatusHistorySchema,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  LocationModel,
  LocationsCollection,
  LocationSchema,
} from '../locations/schemas/location.schema';
import { LocationsService } from '../locations/locations.service';
import {
  OpportunitiesCollection,
  OpportunityModel,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
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
  let opportunityModel: Model<OpportunityModel>;
  let sessionModel: Model<SessionModel>;
  let locationModel: Model<LocationModel>;
  let skillCategoryModel: Model<SkillCategoryModel>;
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
    opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    sessionModel = handle.connection.model<SessionModel>(
      SessionsCollection,
      SessionSchema,
    );
    locationModel = handle.connection.model<LocationModel>(
      LocationsCollection,
      LocationSchema,
    );
    skillCategoryModel = handle.connection.model<SkillCategoryModel>(
      SkillCategoriesCollection,
      SkillCategorySchema,
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
      opportunityModel,
      sessionModel,
      userModel,
      historyModel,
      skillCategoryModel,
      new LocationsService(locationModel),
      new InertOrgPublicStatsProvider(),
      handle.connection,
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
    await handle.connection.collection(OpportunitiesCollection).deleteMany({});
    await handle.connection.collection(SessionsCollection).deleteMany({});
    await handle.connection.collection(LocationsCollection).deleteMany({});
    await handle.connection
      .collection(SkillCategoriesCollection)
      .deleteMany({});
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
    purpose:
      | 'verification_document'
      | 'organization_logo'
      | 'organization_cover'
      | 'organization_document',
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
        service.listOrgOpportunities('org-owner'),
      ).rejects.toMatchObject({
        status: 404,
      });
      void org;
      expect((await service.listPublic()).items).toHaveLength(0);
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
      expect((await service.listPublic()).items).toHaveLength(1);
      expect(await service.listOrgOpportunities('org-owner')).toEqual([]);
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

  describe('fact-sheet schema guard (Session 14)', () => {
    it('has no perks-equivalent paths and no client-settable registryId', async () => {
      const paths = Object.keys(OrganizationSchema.paths);
      for (const banned of ['perks', 'benefits', 'marketing']) {
        expect(paths).not.toContain(banned);
      }
      expect(paths).toContain('annualReportMediaId');
      expect(paths).toContain('registryId');
    });
  });

  describe('fact-sheet PATCH (Session 14)', () => {
    async function seedReferenceData() {
      await locationModel.create({
        code: '16',
        type: 'wilaya',
        nameAr: 'الجزائر',
        nameFr: 'Alger',
      });
      await locationModel.create({
        code: '1601',
        type: 'municipality',
        parentCode: '16',
        nameAr: 'الجزائر الوسطى',
        nameFr: 'Alger Centre',
      });
      const category = await skillCategoryModel.create({
        slug: 'education',
        nameAr: 'التعليم',
        nameFr: 'Éducation',
        order: 1,
        active: true,
      });
      return category._id.toString();
    }

    it('persists the full fact sheet and reads it back', async () => {
      const { user } = await createOrgOwner();
      const categoryId = await seedReferenceData();
      const cover = await createMedia(
        user._id.toString(),
        'organization_cover',
      );
      const report = await createMedia(
        user._id.toString(),
        'organization_document',
      );

      const updated = await service.updateOwn(accountOf(user), {
        nameFr: 'Association El-Amel',
        description: 'Volunteer charity in Algiers',
        type: 'Association',
        registrationNumber: 'REG-2024-001',
        location: {
          wilayaId: '16',
          municipalityId: '1601',
          address: 'Rue Didouche Mourad',
        },
        website: 'https://el-amel.example.org',
        foundedYear: 2018,
        contact: {
          email: 'contact@el-amel.example.org',
          phone: '+213555123456',
        },
        focusDisciplines: [categoryId],
        operatingScope: 'Algiers and surroundings',
        publicProfile: { enabled: true },
        coverMediaId: cover,
        annualReportMediaId: report,
      });

      expect(updated.type).toBe('Association');
      expect(updated.location?.wilayaId).toBe('16');
      expect(updated.website).toBe('https://el-amel.example.org');
      expect(updated.foundedYear).toBe(2018);
      expect(updated.focusDisciplines?.map(String)).toEqual([categoryId]);
      expect(updated.coverMediaId?.toString()).toBe(cover);
      expect(updated.annualReportMediaId?.toString()).toBe(report);

      const own = await service.getOwn(accountOf(user));
      expect(own.type).toBe('Association');
    });

    it('merges nested facts leaf-wise without wiping siblings', async () => {
      const { user } = await createOrgOwner();
      await seedReferenceData();
      await service.updateOwn(accountOf(user), {
        location: {
          wilayaId: '16',
          municipalityId: '1601',
          address: 'Old address',
        },
      });
      const updated = await service.updateOwn(accountOf(user), {
        location: { address: 'New address' },
      });
      expect(updated.location?.address).toBe('New address');
      expect(updated.location?.wilayaId).toBe('16');
      expect(updated.location?.municipalityId).toBe('1601');
    });

    it('allows facts PATCH before email verification', async () => {
      const user = await userModel.create({
        email: 'fresh@example.com',
        passwordHash: 'hash',
        role: 'organization',
        status: 'active',
      });
      await orgModel.create({
        userId: user._id,
        slug: 'fresh-org',
        verificationStatus: 'pending',
        status: 'active',
      });
      const updated = await service.updateOwn(accountOf(user), {
        type: 'Foundation',
      });
      expect(updated.type).toBe('Foundation');
    });

    it('rejects unknown location refs with INVALID_LOCATION', async () => {
      const { user } = await createOrgOwner();
      await seedReferenceData();
      await expect(
        service.updateOwn(accountOf(user), { location: { wilayaId: '99' } }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_LOCATION' });
      await expect(
        service.updateOwn(accountOf(user), {
          location: { wilayaId: '16', municipalityId: '9999' },
        }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_LOCATION' });
      await expect(
        service.updateOwn(accountOf(user), {
          location: { municipalityId: '1601' },
        }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_LOCATION' });
    });

    it('rejects unknown skill-category refs with INVALID_FOCUS_DISCIPLINE', async () => {
      const { user } = await createOrgOwner();
      await expect(
        service.updateOwn(accountOf(user), {
          focusDisciplines: ['507f1f77bcf86cd799439011'],
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_FOCUS_DISCIPLINE',
      });
    });

    it('rejects cover/report media with the wrong purpose', async () => {
      const { user } = await createOrgOwner();
      const logo = await createMedia(user._id.toString(), 'organization_logo');
      await expect(
        service.updateOwn(accountOf(user), { coverMediaId: logo }),
      ).rejects.toMatchObject({ code: 'MEDIA_PURPOSE_MISMATCH' });
      await expect(
        service.updateOwn(accountOf(user), { annualReportMediaId: logo }),
      ).rejects.toMatchObject({ code: 'MEDIA_PURPOSE_MISMATCH' });
    });

    it('detaches the annual report on explicit null', async () => {
      const { user } = await createOrgOwner();
      const report = await createMedia(
        user._id.toString(),
        'organization_document',
      );
      await service.updateOwn(accountOf(user), {
        annualReportMediaId: report,
      });
      const detached = await service.updateOwn(accountOf(user), {
        annualReportMediaId: null,
      } as unknown as Parameters<typeof service.updateOwn>[1]);
      expect(detached.annualReportMediaId).toBeNull();
    });
  });

  describe('profile completion (Session 14)', () => {
    it('reports missing keys and the filled share', async () => {
      const { user } = await createOrgOwner();
      await service.updateOwn(accountOf(user), {
        nameFr: 'Association El-Amel',
        contact: { phone: '+213555123456' },
      });
      const completion = await service.getProfileCompletion(accountOf(user));
      expect(completion.complete).toBe(false);
      expect(completion.missingFields).toContain('description');
      expect(completion.missingFields).toContain('coverMediaId');
      expect(completion.missingFields).not.toContain('name');
      expect(completion.missingFields).not.toContain('contact');
      // name (10) + contact (10) of 100 → 20%.
      expect(completion.percent).toBe(20);
    });

    it('reports complete at 100 once every key is filled', async () => {
      const { user } = await createOrgOwner();
      await locationModel.create({
        code: '16',
        type: 'wilaya',
        nameAr: 'الجزائر',
        nameFr: 'Alger',
      });
      const category = await skillCategoryModel.create({
        slug: 'education',
        nameAr: 'التعليم',
        nameFr: 'Éducation',
        order: 1,
        active: true,
      });
      const cover = await createMedia(
        user._id.toString(),
        'organization_cover',
      );
      const logo = await createMedia(user._id.toString(), 'organization_logo');
      await service.updateOwn(accountOf(user), {
        nameFr: 'Association El-Amel',
        description: 'Charity',
        type: 'Association',
        registrationNumber: 'REG-1',
        location: { wilayaId: '16' },
        website: 'https://example.org',
        foundedYear: 2020,
        contact: { email: 'a@example.org' },
        focusDisciplines: [category._id.toString()],
        operatingScope: 'National',
        logoMediaId: logo,
        coverMediaId: cover,
      });
      const completion = await service.getProfileCompletion(accountOf(user));
      expect(completion).toEqual({
        percent: 100,
        missingFields: [],
        complete: true,
      });
    });

    it('404s for accounts without an organization', async () => {
      const user = await userModel.create({
        email: 'lonely@example.com',
        passwordHash: 'hash',
        role: 'volunteer',
        status: 'active',
      });
      await expect(
        service.getProfileCompletion(accountOf(user)),
      ).rejects.toMatchObject({
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
    });
  });

  describe('public payload aggregates seam (Session 14)', () => {
    it('exposes zeroed aggregates and null activeSince before Session 16', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();
      const payload = await service.getPublicBySlug('org-owner');
      expect(payload['aggregates']).toEqual({
        volunteers: 0,
        initiativesActive: 0,
        initiativesCompleted: 0,
        verifiedHours: 0,
        responseRate: 0,
        perDomain: [],
        activeSince: null,
      });
    });

    it('derives activeSince from foundedYear', async () => {
      const { user, org } = await createOrgOwner();
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified', foundedYear: 2018 } },
        )
        .exec();
      void user;
      const payload = await service.getPublicBySlug('org-owner');
      expect(payload.aggregates.activeSince).toBe(2018);
    });

    it('404s the detail and excludes the list when the platform toggle is off', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      await orgModel
        .updateOne(
          { _id: org._id },
          {
            $set: {
              verificationStatus: 'verified',
              publicProfile: { enabled: false },
            },
          },
        )
        .exec();
      await expect(service.getPublicBySlug('org-owner')).rejects.toMatchObject({
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
      expect((await service.listPublic()).items).toHaveLength(0);
    });

    it('treats a missing platform toggle as enabled', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();
      // Bypass schema defaults to simulate legacy rows without the subdocument.
      await handle.connection
        .collection(OrganizationsCollection)
        .updateOne({ _id: org._id }, { $unset: { publicProfile: '' } });

      const payload = await service.getPublicBySlug('org-owner');
      expect(payload.id).toBe(org._id.toString());
      expect((await service.listPublic()).items).toHaveLength(1);
    });

    it('returns exactly the public card/profile fields (no owner or internal data)', async () => {
      const { user, org } = await createOrgOwner();
      const logo = await createMedia(user._id.toString(), 'organization_logo');
      const cover = await createMedia(
        user._id.toString(),
        'organization_cover',
      );
      const report = await createMedia(
        user._id.toString(),
        'organization_document',
      );
      await orgModel
        .updateOne(
          { _id: org._id },
          {
            $set: {
              verificationStatus: 'verified',
              nameAr: 'جمعية الأمل',
              nameFr: 'Association El-Amel',
              description: 'Volunteer charity',
              logoMediaId: logo,
              coverMediaId: cover,
              registryId: 'ORG-000042',
              foundedYear: 2018,
              registrationNumber: 'REG-2024-001',
              reliability: { score: 99 },
              annualReportMediaId: report,
              publicProfile: { enabled: true },
              location: {
                wilayaId: '16',
                municipalityId: '1601',
                address: 'Rue Didouche Mourad',
              },
              website: 'https://el-amel.example.org',
              contact: {
                email: 'contact@el-amel.example.org',
                phone: '+213555123456',
              },
              focusDisciplines: [new Types.ObjectId()],
              operatingScope: 'Algiers and surroundings',
            },
          },
        )
        .exec();

      const profile = await service.getPublicBySlug('org-owner');
      expect(Object.keys(profile).sort()).toEqual(
        [
          'aggregates',
          'contact',
          'coverMediaId',
          'description',
          'focusDisciplines',
          'foundedYear',
          'id',
          'location',
          'logoMediaId',
          'nameAr',
          'nameFr',
          'operatingScope',
          'registryId',
          'slug',
          'verificationStatus',
          'website',
        ].sort(),
      );
      expect(profile).toMatchObject({
        id: org._id.toString(),
        slug: 'org-owner',
        registryId: 'ORG-000042',
        verificationStatus: 'verified',
        foundedYear: 2018,
        logoMediaId: logo,
        coverMediaId: cover,
        location: {
          wilayaId: '16',
          municipalityId: '1601',
          address: 'Rue Didouche Mourad',
        },
        contact: {
          email: 'contact@el-amel.example.org',
        },
      });
      // Guests never receive the contact phone key (Phase 2 privacy rule).
      expect(profile.contact).not.toHaveProperty('phone');
      for (const forbidden of [
        '_id',
        'userId',
        'status',
        'reliability',
        'annualReportMediaId',
        'publicProfile',
        'registrationNumber',
        'createdAt',
        'updatedAt',
        '__v',
      ]) {
        expect(profile).not.toHaveProperty(forbidden);
      }

      const card = (await service.listPublic()).items[0];
      expect(Object.keys(card).sort()).toEqual(
        [
          'coverMediaId',
          'description',
          'foundedYear',
          'id',
          'logoMediaId',
          'nameAr',
          'nameFr',
          'registryId',
          'slug',
          'verificationStatus',
        ].sort(),
      );
      expect(card).toMatchObject({
        id: org._id.toString(),
        slug: 'org-owner',
        verificationStatus: 'verified',
        logoMediaId: logo,
        coverMediaId: cover,
        registryId: 'ORG-000042',
        foundedYear: 2018,
      });
      for (const forbidden of [
        '_id',
        'userId',
        'status',
        'reliability',
        'annualReportMediaId',
        'publicProfile',
        'registrationNumber',
        'createdAt',
        'updatedAt',
        '__v',
      ]) {
        expect(card).not.toHaveProperty(forbidden);
      }
    });
  });

  describe('public contact phone gating (Phase 2)', () => {
    async function seedPublicOrg(
      options: {
        orgPhone?: string;
        accountPhone?: string;
        accountStatus?: 'active' | 'suspended' | 'deleted';
      } = {},
    ) {
      const user = await userModel.create({
        email: `phone-org-${Math.random()}@example.com`,
        passwordHash: 'hash',
        role: 'organization',
        status: options.accountStatus ?? 'active',
        emailVerifiedAt: new Date(),
        ...(options.accountPhone ? { phone: options.accountPhone } : {}),
      });
      const org = await orgModel.create({
        userId: user._id,
        slug: 'phone-org',
        verificationStatus: 'verified',
        status: 'active',
        publicProfile: { enabled: true },
        ...(options.orgPhone ? { contact: { phone: options.orgPhone } } : {}),
      });
      return { user, org };
    }

    async function liveSession(
      userId: Types.ObjectId,
      overrides: { expiresAt?: Date; rotatedAt?: Date } = {},
    ) {
      return sessionModel.create({
        userId,
        refreshTokenHash: `hash-${Math.random()}`,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3600_000),
        ...(overrides.rotatedAt ? { rotatedAt: overrides.rotatedAt } : {}),
      });
    }

    function viewerOf(
      user: UserModel,
      session: SessionModel,
    ): Pick<AccountToken, 'sub' | 'sessionId'> {
      return {
        sub: user._id.toString(),
        sessionId: session._id.toString(),
      };
    }

    it('omits the dedicated phone key from guests', async () => {
      await seedPublicOrg({ orgPhone: '+213555123456' });
      const guest = await service.getPublicBySlug('phone-org');
      expect(guest.contact).toEqual({ email: null });
    });

    it('returns the dedicated phone to an active account with a live session', async () => {
      const { user } = await seedPublicOrg({ orgPhone: '+213555123456' });
      const session = await liveSession(user._id);
      const viewer = await service.getPublicBySlug(
        'phone-org',
        viewerOf(user, session),
      );
      expect(viewer.contact.phone).toBe('+213555123456');
    });

    it('does not fall back to the owning account phone', async () => {
      const { user } = await seedPublicOrg({ accountPhone: '+213661234567' });
      const session = await liveSession(user._id);
      const viewer = await service.getPublicBySlug(
        'phone-org',
        viewerOf(user, session),
      );
      expect(viewer.contact).not.toHaveProperty('phone');
    });

    it.each([
      ['suspended', 'suspended'],
      ['deleted', 'deleted'],
    ] as const)('treats a %s account as a guest', async (_label, status) => {
      const { user } = await seedPublicOrg({
        orgPhone: '+213555123456',
        accountStatus: status,
      });
      const session = await liveSession(user._id);
      const viewer = await service.getPublicBySlug(
        'phone-org',
        viewerOf(user, session),
      );
      expect(viewer.contact).not.toHaveProperty('phone');
    });

    it('treats a rotated session as a guest', async () => {
      const { user } = await seedPublicOrg({ orgPhone: '+213555123456' });
      const session = await liveSession(user._id, {
        rotatedAt: new Date(Date.now() - 60_000),
      });
      const viewer = await service.getPublicBySlug(
        'phone-org',
        viewerOf(user, session),
      );
      expect(viewer.contact).not.toHaveProperty('phone');
    });

    it('treats an expired session as a guest', async () => {
      const { user } = await seedPublicOrg({ orgPhone: '+213555123456' });
      const session = await liveSession(user._id, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      const viewer = await service.getPublicBySlug(
        'phone-org',
        viewerOf(user, session),
      );
      expect(viewer.contact).not.toHaveProperty('phone');
    });

    it('treats a session owned by another account as a guest', async () => {
      const { user } = await seedPublicOrg({ orgPhone: '+213555123456' });
      const other = await userModel.create({
        email: `other-viewer-${Math.random()}@example.com`,
        passwordHash: 'hash',
        role: 'volunteer',
        status: 'active',
        emailVerifiedAt: new Date(),
      });
      const session = await liveSession(other._id);
      const viewer = await service.getPublicBySlug('phone-org', {
        sub: user._id.toString(),
        sessionId: session._id.toString(),
      });
      expect(viewer.contact).not.toHaveProperty('phone');
    });

    it('does not run a session lookup for guests', async () => {
      await seedPublicOrg({ orgPhone: '+213555123456' });
      const spy = jest.spyOn(sessionModel, 'findOne');
      try {
        await service.getPublicBySlug('phone-org');
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('per-status public opportunities (Session 14)', () => {
    async function seedOpportunity(
      orgId: unknown,
      slug: string,
      status: 'published' | 'completed' | 'closed' | 'draft',
    ) {
      return opportunityModel.create({
        organizationId: orgId,
        slug,
        title: `Initiative ${slug}`,
        description: 'Description',
        status,
      });
    }

    it('filters the archive by status with published as default', async () => {
      const { user, org } = await createOrgOwner();
      void user;
      await orgModel
        .updateOne(
          { _id: org._id },
          { $set: { verificationStatus: 'verified' } },
        )
        .exec();
      await seedOpportunity(org._id, 'opp-live', 'published');
      await seedOpportunity(org._id, 'opp-done', 'completed');
      await seedOpportunity(org._id, 'opp-old', 'closed');
      await seedOpportunity(org._id, 'opp-draft', 'draft');

      const byDefault = await service.listOrgOpportunities('org-owner');
      expect(byDefault.map((row) => row.slug)).toEqual(['opp-live']);
      const completed = await service.listOrgOpportunities('org-owner', {
        status: 'completed',
      });
      expect(completed.map((row) => row.slug)).toEqual(['opp-done']);
      const closed = await service.listOrgOpportunities('org-owner', {
        status: 'closed',
      });
      expect(closed.map((row) => row.slug)).toEqual(['opp-old']);
    });
  });

  describe('delete own organization (Session 14)', () => {
    it('archives org + user, revokes sessions, and writes history', async () => {
      const { user, org } = await createOrgOwner();
      await sessionModel.create({
        userId: user._id,
        refreshTokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await sessionModel.create({
        userId: user._id,
        refreshTokenHash: 'hash-2',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const result = await service.deleteOwn(accountOf(user));
      expect(result).toEqual({
        deleted: true,
        organizationId: org._id.toString(),
      });

      expect((await orgModel.findById(org._id).exec())!.status).toBe('deleted');
      const retired = await userModel.findById(user._id).exec();
      expect(retired!.status).toBe('deleted');
      expect(retired!.deletedAt).toBeInstanceOf(Date);
      expect(
        await sessionModel.countDocuments({ userId: user._id }).exec(),
      ).toBe(0);
      const history = await historyModel.find({}).exec();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityType: 'organization',
        from: 'active',
        to: 'deleted',
      });
      expect(await service.getPublicOrganization('org-owner')).toBeNull();
    });

    it('rolls back everything when a step fails', async () => {
      const { user, org } = await createOrgOwner();
      const spy = jest.spyOn(sessionModel, 'deleteMany').mockReturnValueOnce({
        exec: () => Promise.reject(new Error('boom')),
      } as unknown as ReturnType<typeof sessionModel.deleteMany>);
      try {
        await expect(service.deleteOwn(accountOf(user))).rejects.toThrow(
          'boom',
        );
      } finally {
        spy.mockRestore();
      }
      expect((await orgModel.findById(org._id).exec())!.status).toBe('active');
      expect((await userModel.findById(user._id).exec())!.status).toBe(
        'active',
      );
      expect(await historyModel.countDocuments({}).exec()).toBe(0);
    });

    it('404s for accounts without an organization', async () => {
      const user = await userModel.create({
        email: 'lonely@example.com',
        passwordHash: 'hash',
        role: 'volunteer',
        status: 'active',
      });
      await expect(service.deleteOwn(accountOf(user))).rejects.toMatchObject({
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
    });
  });
});
