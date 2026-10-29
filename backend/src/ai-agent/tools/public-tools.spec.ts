import { Model, Types } from 'mongoose';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../../test/utils/memory-connection';
import {
  LocationModel,
  LocationSchema,
  LocationsCollection,
} from '../../locations/schemas/location.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from '../../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationSchema,
  OrganizationsCollection,
} from '../../organizations/schemas/organization.schema';
import {
  SkillModel,
  SkillSchema,
  SkillsCollection,
} from '../../skills/schemas/skill.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
  SkillCategorySchema,
} from '../../skills/schemas/skill-category.schema';
import { KnowledgeNormalizer } from '../knowledge/normalizer';
import { PlatformStatsPayload, PlatformStatsTool } from './platform-stats.tool';
import {
  REFERENCE_CACHE_TTL_MS,
  SearchReferenceDataPayload,
  SearchReferenceDataTool,
} from './search-reference-data.tool';
import {
  SearchOpportunitiesPayload,
  SearchOpportunitiesTool,
} from './search-opportunities.tool';
import {
  SearchOrganizationsPayload,
  SearchOrganizationsTool,
} from './search-organizations.tool';
import { ToolExecutor } from './tool-executor';
import { ToolRegistry } from './tool-registry';
import {
  ReadOnlyTool,
  ToolInputError,
  findForbiddenToolResultKey,
} from './tool.types';

const ORG_ID = new Types.ObjectId('64c000000000000000000001');
const ORG_TWO_ID = new Types.ObjectId('64c000000000000000000002');
const PENDING_ORG_ID = new Types.ObjectId('64c000000000000000000003');
const SUSPENDED_ORG_ID = new Types.ObjectId('64c000000000000000000004');
const REJECTED_ORG_ID = new Types.ObjectId('64c000000000000000000005');

const CATEGORY_ID = new Types.ObjectId('64a000000000000000000001');
const CATEGORY_TWO_ID = new Types.ObjectId('64a000000000000000000002');
const TECH_CATEGORY_ID = new Types.ObjectId('64a000000000000000000003');
const SKILL_ID = new Types.ObjectId('64b000000000000000000001');
const SKILL_TWO_ID = new Types.ObjectId('64b000000000000000000002');
const INACTIVE_SKILL_ID = new Types.ObjectId('64b000000000000000000003');
const NEW_SKILL_ID = new Types.ObjectId('64b000000000000000000004');
const PROGRAMMING_SKILL_ID = new Types.ObjectId('64b000000000000000000005');

const OPP_A_ID = new Types.ObjectId('64d000000000000000000001');
const OPP_B_ID = new Types.ObjectId('64d000000000000000000002');
const OPP_C_ID = new Types.ObjectId('64d000000000000000000003');
const OPP_DRAFT_ID = new Types.ObjectId('64d000000000000000000004');
const OPP_CLOSED_ID = new Types.ObjectId('64d000000000000000000005');
const OPP_CANCELLED_ID = new Types.ObjectId('64d000000000000000000006');
const OPP_IN_PROGRESS_ID = new Types.ObjectId('64d000000000000000000007');
const OPP_PROGRAMMING_ID = new Types.ObjectId('64d000000000000000000008');

async function run<T>(tool: ReadOnlyTool, input?: unknown): Promise<T> {
  return (await tool.definition.handler(input)) as T;
}

function opportunityDoc(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organizationId: ORG_ID,
    slug: 'beach-cleanup',
    registryId: 'OPP-SECRET-1',
    title: 'Beach cleanup',
    description: 'Clean the beach in Algiers.',
    categoryId: CATEGORY_ID,
    status: 'published',
    mode: 'onsite',
    coverMediaId: new Types.ObjectId('64e000000000000000000001'),
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    endDate: new Date('2026-11-02T00:00:00.000Z'),
    applicationDeadline: new Date('2026-10-30T00:00:00.000Z'),
    prerequisites: ['Secret prerequisite'],
    location: {
      wilayaId: '16',
      municipalityId: '1601',
      coordinates: [3.05, 36.75],
    },
    positions: [
      {
        title: 'Volunteer',
        description: 'Help out',
        requiredCount: 5,
        filledCount: 2,
        requiredSkills: [SKILL_ID],
        deliverables: ['Secret deliverable'],
      },
    ],
    ...overrides,
  };
}

describe('Session 6 public tools', () => {
  let handle: MemoryConnectionHandle;
  let opportunityModel: Model<OpportunityModel>;
  let organizationModel: Model<OrganizationModel>;
  let skillModel: Model<SkillModel>;
  let skillCategoryModel: Model<SkillCategoryModel>;
  let locationModel: Model<LocationModel>;

  let opportunitiesTool: SearchOpportunitiesTool;
  let organizationsTool: SearchOrganizationsTool;
  let referenceTool: SearchReferenceDataTool;
  let statsTool: PlatformStatsTool;

  let now: number;
  const clock = { now: () => now };

  beforeAll(async () => {
    handle = await startMemoryConnection();
    opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    skillModel = handle.connection.model<SkillModel>(
      SkillsCollection,
      SkillSchema,
    );
    skillCategoryModel = handle.connection.model<SkillCategoryModel>(
      SkillCategoriesCollection,
      SkillCategorySchema,
    );
    locationModel = handle.connection.model<LocationModel>(
      LocationsCollection,
      LocationSchema,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await Promise.all([
      handle.connection.collection(OpportunitiesCollection).deleteMany({}),
      handle.connection.collection(OrganizationsCollection).deleteMany({}),
      handle.connection.collection(SkillsCollection).deleteMany({}),
      handle.connection.collection(SkillCategoriesCollection).deleteMany({}),
      handle.connection.collection(LocationsCollection).deleteMany({}),
    ]);
    await seedReferenceData();
    await seedOrganizations();
    await seedOpportunities();

    now = 1_000_000;
    opportunitiesTool = new SearchOpportunitiesTool(
      opportunityModel,
      organizationModel,
      skillModel,
      skillCategoryModel,
      new KnowledgeNormalizer({
        synonyms: [
          ['programming', 'programmation', 'code', 'coding', 'برمجة', 'برمجه'],
        ],
      }),
    );
    organizationsTool = new SearchOrganizationsTool(organizationModel);
    referenceTool = new SearchReferenceDataTool(
      skillModel,
      locationModel,
      clock,
    );
    statsTool = new PlatformStatsTool(
      opportunityModel,
      organizationModel,
      skillModel,
      locationModel,
    );
  });

  async function seedReferenceData(): Promise<void> {
    await Promise.all([
      handle.connection.collection(SkillCategoriesCollection).insertMany([
        {
          _id: CATEGORY_ID,
          slug: 'environment',
          nameAr: 'البيئة',
          nameFr: 'Environment',
          order: 1,
          active: true,
        },
        {
          _id: CATEGORY_TWO_ID,
          slug: 'education',
          nameAr: 'التعليم',
          nameFr: 'Education',
          order: 2,
          active: true,
        },
        {
          _id: TECH_CATEGORY_ID,
          slug: 'technology',
          nameAr: 'التقنية',
          nameFr: 'Technology',
          order: 3,
          active: true,
        },
      ]),
      handle.connection.collection(SkillsCollection).insertMany([
        {
          _id: SKILL_ID,
          slug: 'first-aid',
          categoryId: CATEGORY_ID,
          nameAr: 'الإسعافات الأولية',
          nameFr: 'First Aid',
          order: 1,
          active: true,
        },
        {
          _id: SKILL_TWO_ID,
          slug: 'teaching',
          categoryId: CATEGORY_TWO_ID,
          nameAr: 'التدريس',
          nameFr: 'Teaching',
          order: 2,
          active: true,
        },
        {
          _id: INACTIVE_SKILL_ID,
          slug: 'archived-skill',
          categoryId: CATEGORY_ID,
          nameAr: 'مؤرشف',
          nameFr: 'Archived Skill',
          order: 3,
          active: false,
        },
      ]),
      handle.connection.collection(LocationsCollection).insertMany([
        {
          code: '16',
          type: 'wilaya',
          nameAr: 'الجزائر',
          nameFr: 'Algiers',
        },
        {
          code: '1601',
          type: 'municipality',
          parentCode: '16',
          nameAr: 'باب الوادي',
          nameFr: 'Bab El Oued',
        },
        {
          code: '1602',
          type: 'municipality',
          parentCode: '16',
          nameAr: 'حسين داي',
          nameFr: 'Hussein Dey',
        },
        {
          code: '31',
          type: 'wilaya',
          nameAr: 'وهران',
          nameFr: 'Oran',
        },
        {
          code: '3101',
          type: 'municipality',
          parentCode: '31',
          nameAr: 'بئر الجير',
          nameFr: 'Bir El Djir',
        },
      ]),
    ]);
  }

  async function seedOrganizations(): Promise<void> {
    await handle.connection.collection(OrganizationsCollection).insertMany([
      {
        _id: ORG_ID,
        userId: new Types.ObjectId('64f000000000000000000001'),
        slug: 'green-earth',
        registryId: 'ORG-SECRET-1',
        nameAr: 'الأرض الخضراء',
        nameFr: 'Green Earth',
        description: 'Environmental volunteers in Algiers.',
        type: 'association',
        registrationNumber: 'REG-SECRET-1',
        location: {
          wilayaId: '16',
          municipalityId: '1601',
          address: 'Secret street 1',
        },
        website: 'https://green.example',
        foundedYear: 2010,
        contact: {
          email: 'secret-green@example.com',
          phone: '0550000001',
        },
        publicProfile: { enabled: true },
        reliability: { score: 99 },
        verificationStatus: 'verified',
        status: 'active',
      },
      {
        _id: ORG_TWO_ID,
        userId: new Types.ObjectId('64f000000000000000000002'),
        slug: 'blue-sky',
        registryId: 'ORG-SECRET-2',
        nameAr: 'السماء الزرقاء',
        nameFr: 'Blue Sky',
        description: 'Education volunteers in Oran.',
        type: 'ngo',
        registrationNumber: 'REG-SECRET-2',
        location: {
          wilayaId: '31',
          municipalityId: '3101',
          address: 'Secret street 2',
        },
        website: 'https://blue.example',
        foundedYear: 2015,
        contact: {
          email: 'secret-blue@example.com',
          phone: '0550000002',
        },
        verificationStatus: 'verified',
        status: 'active',
      },
      {
        _id: PENDING_ORG_ID,
        userId: new Types.ObjectId('64f000000000000000000003'),
        slug: 'pending-org',
        nameAr: 'قيد المراجعة',
        nameFr: 'Pending Org',
        verificationStatus: 'pending',
        status: 'active',
      },
      {
        _id: SUSPENDED_ORG_ID,
        userId: new Types.ObjectId('64f000000000000000000004'),
        slug: 'suspended-org',
        nameAr: 'موقوف',
        nameFr: 'Suspended Org',
        verificationStatus: 'verified',
        status: 'suspended',
      },
      {
        _id: REJECTED_ORG_ID,
        userId: new Types.ObjectId('64f000000000000000000005'),
        slug: 'rejected-org',
        nameAr: 'مرفوض',
        nameFr: 'Rejected Org',
        verificationStatus: 'rejected',
        status: 'deleted',
      },
    ]);
  }

  async function seedOpportunities(): Promise<void> {
    await handle.connection.collection(OpportunitiesCollection).insertMany([
      opportunityDoc({ _id: OPP_A_ID }),
      opportunityDoc({
        _id: OPP_B_ID,
        organizationId: ORG_TWO_ID,
        slug: 'remote-tutoring',
        registryId: 'OPP-SECRET-2',
        title: 'Remote tutoring',
        description: 'Teach students online.',
        categoryId: CATEGORY_TWO_ID,
        mode: 'remote',
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-02T00:00:00.000Z'),
        applicationDeadline: new Date('2026-11-15T00:00:00.000Z'),
        location: {
          wilayaId: '31',
          municipalityId: '3101',
          coordinates: [0.64, 35.7],
        },
        positions: [
          {
            title: 'Tutor',
            description: 'Teach online',
            requiredCount: 3,
            filledCount: 0,
            requiredSkills: [SKILL_TWO_ID],
            deliverables: ['Secret deliverable'],
          },
        ],
      }),
      opportunityDoc({
        _id: OPP_C_ID,
        slug: 'tree-planting',
        registryId: 'OPP-SECRET-3',
        title: 'Tree planting',
        description: 'Plant trees in the park.',
        mode: 'hybrid',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-02T00:00:00.000Z'),
        applicationDeadline: new Date('2026-12-01T00:00:00.000Z'),
        location: {
          wilayaId: '16',
          municipalityId: '1602',
          coordinates: [3.1, 36.7],
        },
      }),
      opportunityDoc({
        _id: OPP_DRAFT_ID,
        slug: 'draft-opportunity',
        title: 'Draft opportunity',
        status: 'draft',
      }),
      opportunityDoc({
        _id: OPP_CLOSED_ID,
        slug: 'closed-opportunity',
        title: 'Closed opportunity',
        status: 'closed',
      }),
      opportunityDoc({
        _id: OPP_CANCELLED_ID,
        slug: 'cancelled-opportunity',
        title: 'Cancelled opportunity',
        status: 'cancelled',
      }),
      opportunityDoc({
        _id: OPP_IN_PROGRESS_ID,
        slug: 'in-progress-opportunity',
        title: 'In progress opportunity',
        status: 'in_progress',
      }),
      opportunityDoc({
        _id: OPP_PROGRAMMING_ID,
        slug: 'mentorat-bootcamp-code-pour-jeunes-oran',
        title: 'Mentorat bootcamp code pour jeunes — Oran',
        description: 'Accompagner les jeunes dans un bootcamp de code à Oran.',
        status: 'draft',
        categoryId: TECH_CATEGORY_ID,
        location: {
          wilayaId: '31',
          municipalityId: '3101',
          coordinates: [0.64, 35.7],
        },
        positions: [
          {
            title: 'Mentor',
            description: 'Encadrer les jeunes',
            requiredCount: 2,
            filledCount: 0,
            requiredSkills: [PROGRAMMING_SKILL_ID],
            deliverables: ['Secret deliverable'],
          },
        ],
      }),
    ]);
  }

  async function opportunitySlugs(input?: unknown): Promise<string[]> {
    const payload = await run<SearchOpportunitiesPayload>(
      opportunitiesTool,
      input,
    );
    return payload.items.map((item) => item.slug);
  }

  async function organizationSlugs(input?: unknown): Promise<string[]> {
    const payload = await run<SearchOrganizationsPayload>(
      organizationsTool,
      input,
    );
    return payload.items.map((item) => item.slug).sort();
  }

  describe('search_opportunities', () => {
    it('returns only published opportunities with public card fields', async () => {
      const payload = await run<SearchOpportunitiesPayload>(opportunitiesTool, {
        limit: 8,
      });

      expect(payload.items.map((item) => item.slug).sort()).toEqual([
        'beach-cleanup',
        'remote-tutoring',
        'tree-planting',
      ]);

      const beach = payload.items.find((item) => item.slug === 'beach-cleanup');
      expect(beach).toMatchObject({
        id: OPP_A_ID.toHexString(),
        title: 'Beach cleanup',
        description: 'Clean the beach in Algiers.',
        mode: 'onsite',
        location: { wilaya: '16', municipality: '1601' },
        organization: {
          id: ORG_ID.toHexString(),
          slug: 'green-earth',
          nameAr: 'الأرض الخضراء',
          nameFr: 'Green Earth',
        },
        openPositions: 1,
      });
      expect(beach?.skills).toEqual([
        {
          id: SKILL_ID.toHexString(),
          nameAr: 'الإسعافات الأولية',
          nameFr: 'First Aid',
        },
      ]);
      expect(beach?.startDate).toBe('2026-11-01T00:00:00.000Z');
      expect(beach?.endDate).toBe('2026-11-02T00:00:00.000Z');
      expect(beach?.applicationDeadline).toBe('2026-10-30T00:00:00.000Z');
      expect(beach).not.toHaveProperty('_id');

      const serialized = JSON.stringify(payload);
      for (const forbidden of [
        '_id',
        'registryId',
        'userId',
        'contact',
        'email',
        'phone',
        'address',
        'coordinates',
        'prerequisites',
        'coverMediaId',
        'deliverables',
        'OPP-SECRET',
        'REG-SECRET',
        'Secret street',
        'secret-green@example.com',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(findForbiddenToolResultKey(payload)).toBeNull();
    });

    it('applies text, location, mode, skill, and category filters', async () => {
      expect(await opportunitySlugs({ text: 'beach' })).toEqual([
        'beach-cleanup',
      ]);
      expect(await opportunitySlugs({ text: 'park' })).toEqual([
        'tree-planting',
      ]);
      expect((await opportunitySlugs({ wilaya: '16' })).sort()).toEqual([
        'beach-cleanup',
        'tree-planting',
      ]);
      expect(await opportunitySlugs({ municipality: '1602' })).toEqual([
        'tree-planting',
      ]);
      expect(await opportunitySlugs({ mode: 'remote' })).toEqual([
        'remote-tutoring',
      ]);
      expect(
        (await opportunitySlugs({ skill: SKILL_ID.toHexString() })).sort(),
      ).toEqual(['beach-cleanup', 'tree-planting']);
      expect(
        (
          await opportunitySlugs({ category: CATEGORY_ID.toHexString() })
        ).sort(),
      ).toEqual(['beach-cleanup', 'tree-planting']);
      expect(
        await opportunitySlugs({ wilaya: '16', municipality: '1601' }),
      ).toEqual(['beach-cleanup']);
    });

    it('matches skill and category names in Arabic, French, and English', async () => {
      await Promise.all([
        handle.connection.collection(SkillsCollection).insertOne({
          _id: PROGRAMMING_SKILL_ID,
          slug: 'programming',
          categoryId: TECH_CATEGORY_ID,
          nameAr: 'برمجة',
          nameFr: 'Programmation',
          order: 4,
          active: true,
        }),
        handle.connection
          .collection(OpportunitiesCollection)
          .updateOne(
            { _id: OPP_PROGRAMMING_ID },
            { $set: { status: 'published' } },
          ),
      ]);

      for (const term of [
        'برمجة',
        'programming',
        'programmation',
        'التقنية',
        'technology',
      ]) {
        expect(await opportunitySlugs({ text: term })).toContain(
          'mentorat-bootcamp-code-pour-jeunes-oran',
        );
      }
    });

    it('supports the documented sort orders', async () => {
      expect(await opportunitySlugs({ sort: 'deadline_asc' })).toEqual([
        'beach-cleanup',
        'remote-tutoring',
        'tree-planting',
      ]);
      expect(await opportunitySlugs({ sort: 'startDate_asc' })).toEqual([
        'tree-planting',
        'beach-cleanup',
        'remote-tutoring',
      ]);
      expect(await opportunitySlugs({ sort: 'oldest' })).toEqual([
        'beach-cleanup',
        'remote-tutoring',
        'tree-planting',
      ]);
      expect(await opportunitySlugs({ sort: 'newest' })).toEqual([
        'tree-planting',
        'remote-tutoring',
        'beach-cleanup',
      ]);
    });

    it('defaults to five rows and enforces the hard cap of eight', async () => {
      await handle.connection.collection(OpportunitiesCollection).insertMany(
        Array.from({ length: 6 }, (_, index) =>
          opportunityDoc({
            slug: `extra-opportunity-${index}`,
            title: `Extra opportunity ${index}`,
            description: 'Extra published opportunity.',
          }),
        ),
      );

      expect(
        (await run<SearchOpportunitiesPayload>(opportunitiesTool)).items,
      ).toHaveLength(5);
      expect(
        (
          await run<SearchOpportunitiesPayload>(opportunitiesTool, {
            limit: 8,
          })
        ).items,
      ).toHaveLength(8);

      for (const limit of [0, 9, 2.5, '8']) {
        await expect(run(opportunitiesTool, { limit })).rejects.toBeInstanceOf(
          ToolInputError,
        );
      }
    });

    it('rejects unknown keys, Mongo operators, and invalid ids', async () => {
      for (const input of [
        { status: 'draft' },
        { $where: 'this.title' },
        { filter: { status: 'published' } },
        { sort: { _id: -1 } },
        { text: { $ne: null } },
        { skill: 'not-an-object-id' },
        { text: 'x'.repeat(121) },
      ]) {
        await expect(run(opportunitiesTool, input)).rejects.toBeInstanceOf(
          ToolInputError,
        );
      }
    });

    it('trims long descriptions to the public card length', async () => {
      await handle.connection
        .collection(OpportunitiesCollection)
        .updateOne(
          { _id: OPP_A_ID },
          { $set: { description: 'x'.repeat(2000) } },
        );

      const payload = await run<SearchOpportunitiesPayload>(opportunitiesTool, {
        text: 'Beach cleanup',
      });

      expect(payload.items).toHaveLength(1);
      expect(payload.items[0].description?.length).toBeLessThanOrEqual(280);
      expect(payload.items[0].description?.endsWith('…')).toBe(true);
    });
  });

  describe('search_organizations', () => {
    it('returns only verified active organizations with public fields', async () => {
      const payload = await run<SearchOrganizationsPayload>(organizationsTool, {
        limit: 8,
      });

      expect(payload.items.map((item) => item.slug).sort()).toEqual([
        'blue-sky',
        'green-earth',
      ]);

      const green = payload.items.find((item) => item.slug === 'green-earth');
      expect(green).toEqual({
        id: ORG_ID.toHexString(),
        slug: 'green-earth',
        nameAr: 'الأرض الخضراء',
        nameFr: 'Green Earth',
        type: 'association',
        description: 'Environmental volunteers in Algiers.',
        location: { wilaya: '16', municipality: '1601' },
        website: 'https://green.example',
        foundedYear: 2010,
      });
      expect(green).not.toHaveProperty('_id');

      const serialized = JSON.stringify(payload);
      for (const forbidden of [
        '_id',
        'userId',
        'contact',
        'email',
        'phone',
        'registryId',
        'registrationNumber',
        'address',
        'publicProfile',
        'reliability',
        'ORG-SECRET',
        'REG-SECRET',
        'secret-green@example.com',
        'Secret street',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(findForbiddenToolResultKey(payload)).toBeNull();
    });

    it('applies name, text, wilaya, and type filters', async () => {
      expect(await organizationSlugs({ name: 'green' })).toEqual([
        'green-earth',
      ]);
      expect(await organizationSlugs({ text: 'Blue' })).toEqual(['blue-sky']);
      expect(await organizationSlugs({ wilaya: '31' })).toEqual(['blue-sky']);
      expect(await organizationSlugs({ type: 'NGO' })).toEqual(['blue-sky']);
      expect(await organizationSlugs({ name: 'green', text: 'blue' })).toEqual(
        [],
      );
    });

    it('defaults to five rows and enforces the hard cap of eight', async () => {
      await handle.connection.collection(OrganizationsCollection).insertMany(
        Array.from({ length: 7 }, (_, index) => ({
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(),
          slug: `extra-org-${index}`,
          nameFr: `Extra Org ${index}`,
          verificationStatus: 'verified',
          status: 'active',
        })),
      );

      expect(
        (await run<SearchOrganizationsPayload>(organizationsTool)).items,
      ).toHaveLength(5);
      expect(
        (
          await run<SearchOrganizationsPayload>(organizationsTool, {
            limit: 8,
          })
        ).items,
      ).toHaveLength(8);

      for (const limit of [0, 9, 2.5, '8']) {
        await expect(run(organizationsTool, { limit })).rejects.toBeInstanceOf(
          ToolInputError,
        );
      }
    });

    it('rejects unknown keys, visibility overrides, and operator-shaped input', async () => {
      for (const input of [
        { q: 'green' },
        { verificationStatus: 'pending' },
        { $where: 'this.slug' },
        { type: { $ne: null } },
        { limit: 9 },
      ]) {
        await expect(run(organizationsTool, input)).rejects.toBeInstanceOf(
          ToolInputError,
        );
      }
    });

    it('trims long descriptions to the public card length', async () => {
      await handle.connection
        .collection(OrganizationsCollection)
        .updateOne(
          { _id: ORG_ID },
          { $set: { description: 'x'.repeat(2000) } },
        );

      const payload = await run<SearchOrganizationsPayload>(organizationsTool, {
        name: 'green',
      });

      expect(payload.items).toHaveLength(1);
      expect(payload.items[0].description?.length).toBeLessThanOrEqual(280);
      expect(payload.items[0].description?.endsWith('…')).toBe(true);
    });
  });

  describe('search_reference_data', () => {
    it('returns active skills and stored locations only', async () => {
      const payload = await run<SearchReferenceDataPayload>(referenceTool, {
        limit: 8,
      });

      expect(payload.skills.map((skill) => skill.slug)).toEqual([
        'first-aid',
        'teaching',
      ]);
      expect(payload.skills.map((skill) => skill.slug)).not.toContain(
        'archived-skill',
      );
      expect(payload.locations.map((location) => location.code)).toEqual([
        '16',
        '1601',
        '1602',
        '31',
        '3101',
      ]);
      expect(payload.skills[0]).toEqual({
        id: SKILL_ID.toHexString(),
        slug: 'first-aid',
        nameAr: 'الإسعافات الأولية',
        nameFr: 'First Aid',
        categoryId: CATEGORY_ID.toHexString(),
      });
      expect(payload.locations[1]).toEqual({
        code: '1601',
        type: 'municipality',
        parentCode: '16',
        nameAr: 'باب الوادي',
        nameFr: 'Bab El Oued',
      });
      expect(findForbiddenToolResultKey(payload)).toBeNull();
    });

    it('filters by kind, text, category, and parent', async () => {
      const skillsOnly = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'skills',
      });
      expect(skillsOnly.skills.map((skill) => skill.slug)).toEqual([
        'first-aid',
        'teaching',
      ]);
      expect(skillsOnly.locations).toEqual([]);

      const locationsOnly = await run<SearchReferenceDataPayload>(
        referenceTool,
        { kind: 'locations' },
      );
      expect(locationsOnly.skills).toEqual([]);
      expect(locationsOnly.locations).toHaveLength(5);

      const byText = await run<SearchReferenceDataPayload>(referenceTool, {
        text: 'first',
      });
      expect(byText.skills.map((skill) => skill.slug)).toEqual(['first-aid']);
      expect(byText.locations).toEqual([]);

      const byCategory = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'skills',
        category: CATEGORY_TWO_ID.toHexString(),
      });
      expect(byCategory.skills.map((skill) => skill.slug)).toEqual([
        'teaching',
      ]);

      const byParent = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'locations',
        parent: '16',
      });
      expect(
        byParent.locations.map((location) => location.code).sort(),
      ).toEqual(['1601', '1602']);
      expect(byParent.skills).toEqual([]);

      const both = await run<SearchReferenceDataPayload>(referenceTool, {
        category: CATEGORY_ID.toHexString(),
        parent: '31',
      });
      expect(both.skills.map((skill) => skill.slug)).toEqual(['first-aid']);
      expect(both.locations.map((location) => location.code).sort()).toEqual([
        '3101',
      ]);
    });

    it('rejects kind-specific arguments, invalid ids, and unknown keys', async () => {
      await expect(
        run(referenceTool, {
          kind: 'locations',
          category: CATEGORY_ID.toHexString(),
        }),
      ).rejects.toThrow('category is only valid for skills.');
      await expect(
        run(referenceTool, { kind: 'skills', parent: '16' }),
      ).rejects.toThrow('parent is only valid for locations.');

      for (const input of [
        { kind: 'users' },
        { category: 'not-an-id' },
        { parent: '16; drop' },
        { limit: 9 },
        { active: true },
      ]) {
        await expect(run(referenceTool, input)).rejects.toBeInstanceOf(
          ToolInputError,
        );
      }
    });

    it('caches active reference data for five minutes using the injected clock', async () => {
      const first = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'skills',
      });
      expect(first.skills.map((skill) => skill.slug)).toEqual([
        'first-aid',
        'teaching',
      ]);

      await handle.connection.collection(SkillsCollection).insertOne({
        _id: NEW_SKILL_ID,
        slug: 'new-skill',
        categoryId: CATEGORY_ID,
        nameAr: 'مهارة جديدة',
        nameFr: 'New Skill',
        order: 0,
        active: true,
      });

      const cached = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'skills',
      });
      expect(cached.skills.map((skill) => skill.slug)).toEqual([
        'first-aid',
        'teaching',
      ]);

      now += REFERENCE_CACHE_TTL_MS - 1;
      const stillCached = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'skills',
      });
      expect(stillCached.skills.map((skill) => skill.slug)).toEqual([
        'first-aid',
        'teaching',
      ]);

      now += 1;
      const refreshed = await run<SearchReferenceDataPayload>(referenceTool, {
        kind: 'skills',
      });
      expect(refreshed.skills.map((skill) => skill.slug)).toEqual([
        'new-skill',
        'first-aid',
        'teaching',
      ]);
      expect(refreshed.skills.map((skill) => skill.slug)).not.toContain(
        'archived-skill',
      );
    });
  });

  describe('platform_stats', () => {
    it('returns public counts only and ignores private collections', async () => {
      const payload = await run<PlatformStatsPayload>(statsTool);

      expect(payload).toEqual({
        publishedOpportunities: 3,
        verifiedOrganizations: 2,
        activeSkills: 2,
        wilayas: 2,
        municipalities: 3,
      });
      expect(Object.keys(payload).sort()).toEqual([
        'activeSkills',
        'municipalities',
        'publishedOpportunities',
        'verifiedOrganizations',
        'wilayas',
      ]);

      const serialized = JSON.stringify(payload).toLowerCase();
      for (const forbidden of [
        'user',
        'application',
        'talent',
        'submission',
        'session',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('accepts omitted or empty arguments and rejects any filter', async () => {
      await expect(run(statsTool)).resolves.toMatchObject({
        publishedOpportunities: 3,
      });
      await expect(run(statsTool, {})).resolves.toMatchObject({
        verifiedOrganizations: 2,
      });
      await expect(
        run(statsTool, { includeUsers: true }),
      ).rejects.toBeInstanceOf(ToolInputError);
      await expect(
        run(statsTool, { status: 'published' }),
      ).rejects.toBeInstanceOf(ToolInputError);
    });
  });

  describe('tool executor integration', () => {
    function buildRegistry(): ToolRegistry {
      return new ToolRegistry([
        opportunitiesTool,
        organizationsTool,
        referenceTool,
        statsTool,
      ]);
    }

    it('executes all four tools with bounded, privacy-safe payloads', async () => {
      const executor = new ToolExecutor(buildRegistry());
      const results = await Promise.all([
        executor.execute('search_opportunities', { limit: 8 }),
        executor.execute('search_organizations', { limit: 8 }),
        executor.execute('search_reference_data', { limit: 8 }),
        executor.execute('platform_stats'),
      ]);

      expect(results.map((result) => result.tool)).toEqual([
        'search_opportunities',
        'search_organizations',
        'search_reference_data',
        'platform_stats',
      ]);
      for (const result of results) {
        expect(result.ok).toBe(true);
        expect(result.meta.charCount).toBeLessThanOrEqual(1200);
        expect(
          findForbiddenToolResultKey(result.ok ? result.data : null),
        ).toBeNull();
      }
    });

    it('shares the 3,000-character total budget across calls', async () => {
      await handle.connection.collection(OpportunitiesCollection).insertMany(
        Array.from({ length: 6 }, (_, index) =>
          opportunityDoc({
            slug: `budget-opportunity-${index}`,
            title: `Budget opportunity ${index}`,
            description: 'x'.repeat(2000),
          }),
        ),
      );
      await handle.connection
        .collection(OpportunitiesCollection)
        .updateMany(
          { status: 'published' },
          { $set: { description: 'x'.repeat(2000) } },
        );

      const executor = new ToolExecutor(buildRegistry());
      const batch = await executor.executeMany([
        { name: 'search_opportunities', arguments: { limit: 8 } },
        { name: 'search_opportunities', arguments: { limit: 8 } },
        { name: 'search_opportunities', arguments: { limit: 8 } },
      ]);

      expect(batch.results).toHaveLength(3);
      expect(batch.totalChars).toBeLessThanOrEqual(3000);
      expect(batch.totalChars).toBe(
        batch.results.reduce((sum, result) => sum + result.meta.charCount, 0),
      );
      expect(batch.truncated).toBe(true);
      for (const result of batch.results) {
        expect(result.meta.charCount).toBeLessThanOrEqual(1200);
      }
    });

    it('times out a slow query with a safe error', async () => {
      const slowQuery: Record<string, unknown> = {};
      for (const method of ['select', 'sort', 'limit', 'lean']) {
        slowQuery[method] = () => slowQuery;
      }
      slowQuery.exec = () => new Promise<never>(() => undefined);
      const slowModel = {
        find: () => slowQuery,
      } as unknown as Model<OpportunityModel>;
      const slowTool = new SearchOpportunitiesTool(
        slowModel,
        organizationModel,
        skillModel,
        skillCategoryModel,
      );
      const executor = new ToolExecutor(new ToolRegistry([slowTool]), {
        timeoutMs: 20,
      });

      const result = await executor.execute('search_opportunities', {});

      expect(result).toEqual({
        ok: false,
        tool: 'search_opportunities',
        error: {
          code: 'TIMEOUT',
          message: 'Tool execution timed out.',
        },
        meta: { charCount: 0, truncated: false },
      });
      expect(JSON.stringify(result)).not.toContain('stack');
    });

    it('does not mutate any of the four collections', async () => {
      const counts = async () => {
        const [opportunities, organizations, skills, locations] =
          await Promise.all([
            opportunityModel.countDocuments({}).exec(),
            organizationModel.countDocuments({}).exec(),
            skillModel.countDocuments({}).exec(),
            locationModel.countDocuments({}).exec(),
          ]);
        return { opportunities, organizations, skills, locations };
      };

      const before = await counts();
      const executor = new ToolExecutor(buildRegistry());
      await executor.executeMany([
        { name: 'search_opportunities', arguments: { limit: 8 } },
        { name: 'search_organizations', arguments: { limit: 8 } },
        { name: 'search_reference_data', arguments: { limit: 8 } },
        { name: 'platform_stats' },
      ]);
      const after = await counts();

      expect(after).toEqual(before);
    });
  });
});
