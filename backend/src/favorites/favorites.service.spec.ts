import { Model, Types } from 'mongoose';
import {
  OpportunitiesCollection,
  OpportunityModel,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationsCollection,
  OrganizationModel,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  VolunteerProfileModel,
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import { FavoritesService } from './favorites.service';
import {
  FavoriteModel,
  FavoritesCollection,
  FavoriteSchema,
} from './schemas/favorite.schema';

describe('FavoritesService (Session 17)', () => {
  let handle: MemoryConnectionHandle;
  let favoriteModel: Model<FavoriteModel>;
  let service: FavoritesService;

  const userA = new Types.ObjectId().toString();
  const userB = new Types.ObjectId().toString();
  const oppId = new Types.ObjectId();
  const talentUserId = new Types.ObjectId();
  const TALENT_USERNAME = 's17-unit-talent';
  const orgId = new Types.ObjectId();
  const orgUserId = new Types.ObjectId();
  const ORG_SLUG = 's17-unit-org';
  const deadline = new Date('2026-12-31T00:00:00.000Z');

  beforeAll(async () => {
    handle = await startMemoryConnection();
    favoriteModel = handle.connection.model<FavoriteModel>(
      FavoritesCollection,
      FavoriteSchema,
    );
    const opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const profileModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    const organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    await favoriteModel.init();
    // Peer rows bypass mongoose validation (raw inserts — only the fields
    // this service reads are needed).
    await handle.connection.collection('opportunities').insertOne({
      _id: oppId,
      organizationId: orgId,
      title: 'Unit River Cleanup',
      slug: 'unit-river-cleanup',
      status: 'published',
      applicationDeadline: deadline,
    });
    await handle.connection.collection('volunteer_profiles').insertOne({
      _id: new Types.ObjectId(),
      userId: talentUserId,
      username: TALENT_USERNAME,
      firstName: 'Unit',
      lastName: 'Talent',
    });
    await handle.connection.collection('organizations').insertOne({
      _id: orgId,
      userId: orgUserId,
      slug: ORG_SLUG,
      nameFr: 'Unit Organization',
      nameAr: 'منظمة الوحدة',
      status: 'active',
    });
    service = new FavoritesService(
      favoriteModel,
      opportunityModel,
      profileModel,
      organizationModel,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await favoriteModel.deleteMany({});
  });

  describe('opportunity toggle', () => {
    it('creates one row on first save and collapses repeats', async () => {
      const first = await service.saveOpportunity(userA, oppId.toString());
      expect(first).toEqual({ created: true, favoriteCount: 1 });

      const second = await service.saveOpportunity(userA, oppId.toString());
      expect(second).toEqual({ created: false, favoriteCount: 1 });

      const rows = await favoriteModel
        .countDocuments({
          userId: new Types.ObjectId(userA),
          targetType: 'opportunity',
          targetId: oppId.toString(),
        })
        .exec();
      expect(rows).toBe(1);
    });

    it('collapses concurrent duplicate inserts into a single row', async () => {
      const results = await Promise.all([
        service.saveOpportunity(userA, oppId.toString()),
        service.saveOpportunity(userA, oppId.toString()),
      ]);
      expect(results.map((result) => result.favoriteCount)).toEqual([1, 1]);
      expect(
        results.filter((result) => result.created).length +
          results.filter((result) => !result.created).length,
      ).toBe(2);
      const rows = await favoriteModel
        .countDocuments({
          userId: new Types.ObjectId(userA),
          targetType: 'opportunity',
        })
        .exec();
      expect(rows).toBe(1);
    });

    it('rejects unknown and malformed ids with OPPORTUNITY_NOT_FOUND', async () => {
      await expect(
        service.saveOpportunity(userA, new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ status: 404, code: 'OPPORTUNITY_NOT_FOUND' });
      await expect(
        service.saveOpportunity(userA, 'not-an-id'),
      ).rejects.toMatchObject({
        status: 404,
        code: 'OPPORTUNITY_NOT_FOUND',
      });
      await expect(
        service.removeOpportunity(userA, 'not-an-id'),
      ).rejects.toMatchObject({
        status: 404,
        code: 'OPPORTUNITY_NOT_FOUND',
      });
    });

    it('removes the row and tolerates absent rows', async () => {
      await service.saveOpportunity(userA, oppId.toString());
      await service.removeOpportunity(userA, oppId.toString());
      await expect(
        service.removeOpportunity(userA, oppId.toString()),
      ).resolves.toBeUndefined();
      const rows = await favoriteModel
        .countDocuments({ userId: new Types.ObjectId(userA) })
        .exec();
      expect(rows).toBe(0);
    });
  });

  describe('talent toggle', () => {
    it('resolves the username to the volunteer userId', async () => {
      const result = await service.saveTalent(userA, TALENT_USERNAME);
      expect(result).toEqual({ created: true, favoriteCount: 1 });
      const row = await favoriteModel
        .findOne({
          userId: new Types.ObjectId(userA),
          targetType: 'talent',
        })
        .lean()
        .exec();
      expect(row?.targetId).toBe(talentUserId.toString());
    });

    it('rejects unknown usernames and tolerates unknown deletes', async () => {
      await expect(
        service.saveTalent(userA, 'ghost-username'),
      ).rejects.toMatchObject({
        status: 404,
        code: 'VOLUNTEER_PROFILE_NOT_FOUND',
      });
      await expect(
        service.removeTalent(userA, 'ghost-username'),
      ).resolves.toBeUndefined();
    });
  });

  describe('organization toggle', () => {
    it('resolves the slug to the organization userId', async () => {
      const result = await service.saveOrganization(userA, ORG_SLUG);
      expect(result).toEqual({ created: true, favoriteCount: 1 });
      const row = await favoriteModel
        .findOne({
          userId: new Types.ObjectId(userA),
          targetType: 'organization',
        })
        .lean()
        .exec();
      expect(row?.targetId).toBe(orgUserId.toString());
    });

    it('rejects unknown slugs and tolerates unknown deletes', async () => {
      await expect(
        service.saveOrganization(userA, 'ghost-org'),
      ).rejects.toMatchObject({
        status: 404,
        code: 'ORGANIZATION_NOT_FOUND',
      });
      await expect(
        service.removeOrganization(userA, 'ghost-org'),
      ).resolves.toBeUndefined();
    });

    it('summarizes saved organizations', async () => {
      await service.saveOrganization(userA, ORG_SLUG);
      const page = await service.listOwn(userA, { targetType: 'organization' });
      expect(page.total).toBe(1);
      expect(page.items[0].summary).toEqual({
        slug: ORG_SLUG,
        nameAr: 'منظمة الوحدة',
        nameFr: 'Unit Organization',
        status: 'active',
      });
    });
  });

  describe('list, counts, lookup', () => {
    it('lists newest-first with totals and per-type summaries', async () => {
      await service.saveOpportunity(userA, oppId.toString());
      await service.saveTalent(userA, TALENT_USERNAME);

      const page = await service.listOwn(userA, {});
      expect(page.total).toBe(2);
      expect(page.page).toBe(1);
      expect(page.items).toHaveLength(2);
      // Talent saved last → first item.
      expect(page.items[0].targetType).toBe('talent');
      expect(page.items[0].summary).toEqual({
        username: TALENT_USERNAME,
        fullName: 'Unit Talent',
      });
      expect(page.items[1].summary).toEqual({
        title: 'Unit River Cleanup',
        slug: 'unit-river-cleanup',
        status: 'published',
        applicationDeadline: deadline,
        organization: {
          slug: ORG_SLUG,
          nameAr: 'منظمة الوحدة',
          nameFr: 'Unit Organization',
        },
      });

      const filtered = await service.listOwn(userA, {
        targetType: 'opportunity',
      });
      expect(filtered.total).toBe(1);
      expect(filtered.items[0].targetType).toBe('opportunity');
    });

    it('returns null summaries for deleted targets', async () => {
      await service.saveOpportunity(userA, oppId.toString());
      await handle.connection
        .collection('opportunities')
        .deleteOne({ _id: oppId });
      const page = await service.listOwn(userA, {});
      expect(page.total).toBe(1);
      expect(page.items[0].summary).toBeNull();
      // Restore the peer row for the remaining tests.
      await handle.connection.collection('opportunities').insertOne({
        _id: oppId,
        organizationId: orgId,
        title: 'Unit River Cleanup',
        slug: 'unit-river-cleanup',
        status: 'published',
        applicationDeadline: deadline,
      });
    });

    it('scopes counts to the caller', async () => {
      await service.saveOpportunity(userA, oppId.toString());
      await service.saveTalent(userA, TALENT_USERNAME);
      await service.saveOrganization(userA, ORG_SLUG);
      await expect(service.countsOwn(userA)).resolves.toEqual({
        opportunity: 1,
        talent: 1,
        organization: 1,
      });
      await expect(service.countsOwn(userB)).resolves.toEqual({
        opportunity: 0,
        talent: 0,
        organization: 0,
      });
    });

    it('lookup reflects caller saves plus platform counts', async () => {
      await service.saveOpportunity(userA, oppId.toString());
      await service.saveOpportunity(userB, oppId.toString());
      const unknown = new Types.ObjectId().toString();

      const authed = await service.lookup(
        { targetType: 'opportunity', targetIds: `${oppId},${unknown}` },
        userA,
      );
      expect(authed[oppId.toString()]).toEqual({
        favorited: true,
        favoriteCount: 2,
      });
      expect(authed[unknown]).toEqual({ favorited: false, favoriteCount: 0 });

      const guest = await service.lookup(
        { targetType: 'opportunity', targetIds: oppId.toString() },
        undefined,
      );
      expect(guest[oppId.toString()]).toEqual({
        favorited: false,
        favoriteCount: 2,
      });
    });

    it('talent lookup keys on username with zero entries for ghosts', async () => {
      await service.saveTalent(userA, TALENT_USERNAME);
      const result = await service.lookup(
        {
          targetType: 'talent',
          targetIds: `${TALENT_USERNAME},ghost-username`,
        },
        userA,
      );
      expect(result[TALENT_USERNAME]).toEqual({
        favorited: true,
        favoriteCount: 1,
      });
      expect(result['ghost-username']).toEqual({
        favorited: false,
        favoriteCount: 0,
      });
    });

    it('organization lookup keys on slug with zero entries for ghosts', async () => {
      await service.saveOrganization(userA, ORG_SLUG);
      const result = await service.lookup(
        {
          targetType: 'organization',
          targetIds: `${ORG_SLUG},ghost-org`,
        },
        userA,
      );
      expect(result[ORG_SLUG]).toEqual({
        favorited: true,
        favoriteCount: 1,
      });
      expect(result['ghost-org']).toEqual({
        favorited: false,
        favoriteCount: 0,
      });
    });

    it('rejects empty and oversized lookup batches', async () => {
      await expect(
        service.lookup({ targetType: 'opportunity', targetIds: '' }, userA),
      ).rejects.toMatchObject({ status: 400 });
      const many = Array.from({ length: 51 }, () =>
        new Types.ObjectId().toString(),
      ).join(',');
      await expect(
        service.lookup({ targetType: 'opportunity', targetIds: many }, userA),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('indexes', () => {
    it('creates the unique triple plus the list/count supporting indexes', async () => {
      const indexes = await favoriteModel.collection.indexes();
      const byName = new Map(indexes.map((index) => [index.name, index.key]));
      expect(byName.get('userId_1_targetType_1_targetId_1')).toEqual({
        userId: 1,
        targetType: 1,
        targetId: 1,
      });
      const triple = indexes.find(
        (index) => index.name === 'userId_1_targetType_1_targetId_1',
      );
      expect(triple?.unique).toBe(true);
      expect(byName.get('userId_1_targetType_1_createdAt_-1')).toBeDefined();
      expect(byName.get('targetType_1_targetId_1')).toBeDefined();
    });
  });
});
