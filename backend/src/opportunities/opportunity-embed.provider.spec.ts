import { Model, Types } from 'mongoose';
import { OpportunityEmbedProvider } from './opportunity-embed.provider';
import {
  ApplicationModel,
  ApplicationSchema,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import {
  LocationModel,
  LocationSchema,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  TaskParticipantModel,
  TaskParticipantSchema,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import {
  SkillModel,
  SkillSchema,
  SkillsCollection,
} from '../skills/schemas/skill.schema';
import {
  SkillCategoryModel,
  SkillCategorySchema,
  SkillCategoriesCollection,
} from '../skills/schemas/skill-category.schema';
import {
  VolunteerProfileModel,
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from './schemas/opportunity.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('OpportunityEmbedProvider (Session 19)', () => {
  let handle: MemoryConnectionHandle;
  let provider: OpportunityEmbedProvider;
  let opportunityModel: Model<OpportunityModel>;
  let organizationModel: Model<OrganizationModel>;
  let lookup: jest.Mock;

  const orgUserId = new Types.ObjectId();
  let orgId: Types.ObjectId;
  let categoryId: Types.ObjectId;
  let skillId: Types.ObjectId;

  async function seedBase(): Promise<{
    oppA: OpportunityModel;
    oppB: OpportunityModel;
    positionA: Types.ObjectId;
  }> {
    const org = await organizationModel.create({
      userId: orgUserId,
      slug: 'embed-org',
      nameFr: 'Orgue Exemple',
      nameAr: 'منظمة مثال',
      verificationStatus: 'verified',
      status: 'active',
    });
    orgId = org._id;
    const category = await handle.connection
      .model<SkillCategoryModel>(SkillCategoriesCollection, SkillCategorySchema)
      .create({ slug: 'cat', nameAr: 'فئة', nameFr: 'Catégorie', order: 1 });
    categoryId = category._id;
    const skill = await handle.connection
      .model<SkillModel>(SkillsCollection, SkillSchema)
      .create({
        slug: 'skill',
        categoryId,
        nameAr: 'مهارة',
        nameFr: 'Compétence',
        order: 1,
        active: true,
      });
    skillId = skill._id;
    const locationModel = handle.connection.model<LocationModel>(
      LocationsCollection,
      LocationSchema,
    );
    await locationModel.create([
      { code: '16', type: 'wilaya', nameAr: 'الجزائر', nameFr: 'Alger' },
      {
        code: '16001',
        type: 'municipality',
        parentCode: '16',
        nameAr: 'بلدية',
        nameFr: 'Commune',
      },
    ]);

    const common = {
      organizationId: orgId,
      categoryId,
      description: 'desc',
      location: { wilayaId: '16', municipalityId: '16001' },
    };
    const oppA = await opportunityModel.create({
      ...common,
      slug: 'opp-a',
      title: 'Opp A',
      status: 'published',
      positions: [
        {
          title: 'Helper',
          description: 'help',
          requiredCount: 2,
          requiredSkills: [skillId],
          deliverables: ['Report'],
        },
      ],
    });
    const oppB = await opportunityModel.create({
      ...common,
      slug: 'opp-b',
      title: 'Opp B',
      status: 'published',
      positions: [
        {
          title: 'Driver',
          description: 'drive',
          requiredCount: 1,
          requiredSkills: [],
          deliverables: [],
        },
      ],
    });
    return {
      oppA,
      oppB,
      positionA: oppA.positions[0]._id,
    };
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    organizationModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    lookup = jest.fn(async () => ({}));
    provider = new OpportunityEmbedProvider(
      organizationModel,
      handle.connection.model(SkillCategoriesCollection, SkillCategorySchema),
      handle.connection.model(SkillsCollection, SkillSchema),
      handle.connection.model(LocationsCollection, LocationSchema),
      handle.connection.model<ApplicationModel>(
        ApplicationsCollection,
        ApplicationSchema,
      ),
      handle.connection.model<TaskParticipantModel>(
        TaskParticipantsCollection,
        TaskParticipantSchema,
      ),
      handle.connection.model<VolunteerProfileModel>(
        VolunteerProfilesCollection,
        VolunteerProfileSchema,
      ),
      { lookup } as never,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    lookup.mockReset();
    lookup.mockResolvedValue({});
    await Promise.all(
      [
        OpportunitiesCollection,
        OrganizationsCollection,
        SkillCategoriesCollection,
        SkillsCollection,
        LocationsCollection,
        ApplicationsCollection,
        TaskParticipantsCollection,
        VolunteerProfilesCollection,
      ].map((name) => handle.connection.collection(name).deleteMany({})),
    );
  });

  it('embeds org identity, labels and skill names on cards in batched queries', async () => {
    const { oppA, oppB } = await seedBase();
    const orgFind = jest.spyOn(organizationModel, 'find');
    try {
      const cards = await provider.embedCards([oppA, oppB], undefined);
      expect(cards).toHaveLength(2);
      expect(cards[0]['organization']).toMatchObject({
        id: orgId.toString(),
        slug: 'embed-org',
        nameFr: 'Orgue Exemple',
        verificationStatus: 'verified',
      });
      expect(cards[0]['categoryName']).toMatchObject({ nameFr: 'Catégorie' });
      expect(cards[0]['locationLabels']).toMatchObject({
        wilaya: { nameFr: 'Alger' },
        municipality: { nameFr: 'Commune' },
      });
      const positions = cards[0]['positions'] as Array<Record<string, unknown>>;
      expect(positions[0]['skillNames']).toEqual([
        { skillId: skillId.toString(), nameAr: 'مهارة', nameFr: 'Compétence' },
      ]);
      // No counts / assigned on cards.
      expect(positions[0]).not.toHaveProperty('applicationCount');
      expect(positions[0]).not.toHaveProperty('assigned');
      // One org query for two opportunities sharing the org (no N+1).
      expect(orgFind).toHaveBeenCalledTimes(1);
      // Favorites resolved through the shared lookup, once per page.
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      orgFind.mockRestore();
    }
  });

  it('counts non-terminal applications and names only current assignees', async () => {
    const { oppA, positionA } = await seedBase();
    const positionId = positionA;
    const applicationModel = handle.connection.model<ApplicationModel>(
      ApplicationsCollection,
      ApplicationSchema,
    );
    const participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    const profileModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    const volunteerId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    await applicationModel.create([
      {
        opportunityId: oppA._id,
        positionId,
        volunteerId,
        organizationId: orgId,
        status: 'pending',
      },
      {
        opportunityId: oppA._id,
        positionId,
        volunteerId: otherId,
        organizationId: orgId,
        status: 'accepted',
      },
      {
        opportunityId: oppA._id,
        positionId,
        volunteerId: otherId,
        organizationId: orgId,
        status: 'withdrawn',
      },
      {
        opportunityId: oppA._id,
        positionId,
        volunteerId: otherId,
        organizationId: orgId,
        status: 'rejected',
      },
    ]);
    await profileModel.create({
      userId: volunteerId,
      username: 'vol-active',
      firstName: 'Amine',
      lastName: 'Benali',
    });
    await participantModel.create([
      {
        opportunityId: oppA._id,
        positionId,
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId,
        status: 'active',
      },
      {
        opportunityId: oppA._id,
        positionId,
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: otherId,
        status: 'withdrawn',
      },
    ]);

    const [full] = await provider.embedFull([oppA], undefined);
    const positions = full['positions'] as Array<Record<string, unknown>>;
    // pending + accepted counted; withdrawn + rejected excluded.
    expect(positions[0]['applicationCount']).toBe(2);
    const assigned = positions[0]['assigned'] as Array<Record<string, unknown>>;
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatchObject({
      volunteerId: volunteerId.toString(),
      fullName: 'Amine Benali',
      username: 'vol-active',
    });
  });

  it('returns zero-state favorites for guests and degrades dangling refs', async () => {
    const opp = await opportunityModel.create({
      organizationId: new Types.ObjectId(),
      slug: 'orphan',
      title: 'Orphan',
      description: 'desc',
      categoryId: new Types.ObjectId(),
      status: 'published',
      positions: [
        {
          title: 'Solo',
          description: 'solo',
          requiredCount: 1,
          requiredSkills: [new Types.ObjectId()],
          deliverables: [],
        },
      ],
    });
    const [full] = await provider.embedFull([opp], undefined);
    expect(full['organization']).toBeNull();
    expect(full['categoryName']).toBeNull();
    expect(full['isFavorited']).toBe(false);
    expect(full['favoriteCount']).toBe(0);
    const positions = full['positions'] as Array<Record<string, unknown>>;
    expect(positions[0]['skillNames']).toEqual([]);
    expect(positions[0]['applicationCount']).toBe(0);
    expect(positions[0]['assigned']).toEqual([]);
  });

  it('returns an empty array without queries for empty input', async () => {
    const orgFind = jest.spyOn(organizationModel, 'find');
    try {
      await expect(provider.embedCards([], undefined)).resolves.toEqual([]);
      await expect(provider.embedFull([], 'someone')).resolves.toEqual([]);
      expect(orgFind).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    } finally {
      orgFind.mockRestore();
    }
  });
});
