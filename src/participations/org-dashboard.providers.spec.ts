import { Model, Types } from 'mongoose';
import {
  ApplicationModel,
  ApplicationsCollection,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  SubmissionModel,
  SubmissionsCollection,
  SubmissionSchema,
} from '../submissions/schemas/submission.schema';
import {
  VerificationModel,
  VerificationsCollection,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
  VolunteerExperienceSchema,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import { OrgDashboardService } from './org-dashboard.service';
import { OrgFootprintProviderImpl } from './org-footprint.provider';
import { OrgPublicStatsProviderImpl } from './org-public-stats.provider';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from './schemas/task-participant.schema';

describe('org-dashboard providers and service (Session 16)', () => {
  let handle: MemoryConnectionHandle;
  let opportunityModel: Model<OpportunityModel>;
  let participantModel: Model<TaskParticipantModel>;
  let experienceModel: Model<VolunteerExperienceModel>;
  let organizationModel: Model<OrganizationModel>;
  let skillCategoryModel: Model<SkillCategoryModel>;
  let applicationModel: Model<ApplicationModel>;
  let submissionModel: Model<SubmissionModel>;
  let verificationModel: Model<VerificationModel>;
  let profileModel: Model<VolunteerProfileModel>;

  let statsProvider: OrgPublicStatsProviderImpl;
  let footprintProvider: OrgFootprintProviderImpl;
  let service: OrgDashboardService;

  const orgId = new Types.ObjectId();
  const orgUserId = new Types.ObjectId();
  const v1 = new Types.ObjectId();
  const v2 = new Types.ObjectId();
  const v3 = new Types.ObjectId();

  let cat1: Types.ObjectId;
  let cat2: Types.ObjectId;
  const positionByOpp = new Map<string, Types.ObjectId>();

  function account(): AccountToken {
    return {
      sub: orgUserId.toString(),
      role: 'organization',
      sessionId: new Types.ObjectId().toString(),
    };
  }

  async function seedFixture(): Promise<void> {
    const [c1, c2] = await skillCategoryModel.create([
      { slug: 'education', nameAr: 'تعليم', nameFr: 'Education', order: 1 },
      { slug: 'sante', nameAr: 'صحة', nameFr: 'Sante', order: 2 },
    ]);
    cat1 = c1._id;
    cat2 = c2._id;

    await organizationModel.create({
      _id: orgId,
      userId: orgUserId,
      slug: 'org-a',
      verificationStatus: 'verified',
      status: 'active',
      reliability: {
        responseRate: 0.75,
        decidedRatio: 0.5,
        medianDecisionHours: 5,
        anomaly: false,
        lastRefreshedAt: new Date(),
      },
    });

    const position = (title: string) => ({
      title,
      description: `${title} work`,
      requiredCount: 2,
    });
    const opps = await opportunityModel.create([
      {
        organizationId: orgId,
        slug: 'opp-1',
        title: 'Beach cleanup',
        description: 'Clean the beach',
        categoryId: cat1,
        status: 'published',
        positions: [position('Cleaner')],
      },
      {
        organizationId: orgId,
        slug: 'opp-2',
        title: 'Food drive',
        description: 'Collect food',
        categoryId: cat2,
        status: 'in_progress',
        positions: [position('Driver')],
      },
      {
        organizationId: orgId,
        slug: 'opp-3',
        title: 'Tree planting',
        description: 'Plant trees',
        categoryId: cat1,
        status: 'completed',
        positions: [position('Planter')],
      },
      {
        organizationId: orgId,
        slug: 'opp-4',
        title: 'Park repair',
        description: 'Repair benches',
        status: 'closed',
        positions: [position('Carpenter')],
      },
      {
        organizationId: orgId,
        slug: 'opp-5',
        title: 'Draft campaign',
        description: 'Not yet live',
        categoryId: cat2,
        status: 'draft',
        positions: [position('Writer')],
      },
      {
        organizationId: orgId,
        slug: 'opp-6',
        title: 'Cancelled run',
        description: 'Called off',
        categoryId: cat1,
        status: 'cancelled',
        positions: [position('Runner')],
      },
    ]);
    for (const opp of opps) {
      positionByOpp.set(
        opp.slug,
        (opp.positions[0] as unknown as { _id: Types.ObjectId })._id,
      );
    }
    const pos = (slug: string): Types.ObjectId => positionByOpp.get(slug)!;
    const oppId = (slug: string): Types.ObjectId =>
      opps.find((row) => row.slug === slug)!._id;

    const participants = await participantModel.create([
      {
        opportunityId: oppId('opp-1'),
        positionId: pos('opp-1'),
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v1,
        status: 'accepted',
      },
      {
        opportunityId: oppId('opp-2'),
        positionId: pos('opp-2'),
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v1,
        status: 'active',
      },
      {
        opportunityId: oppId('opp-3'),
        positionId: pos('opp-3'),
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v2,
        status: 'completed',
      },
      {
        opportunityId: oppId('opp-1'),
        positionId: pos('opp-1'),
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v2,
        status: 'withdrawn',
      },
      {
        opportunityId: oppId('opp-4'),
        positionId: pos('opp-4'),
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v3,
        status: 'removed',
      },
      {
        opportunityId: oppId('opp-2'),
        positionId: pos('opp-2'),
        applicationId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v2,
        status: 'accepted',
      },
    ]);

    await experienceModel.create([
      {
        submissionId: new Types.ObjectId(),
        volunteerId: v1,
        organizationId: orgId,
        opportunityId: oppId('opp-1'),
        positionId: pos('opp-1'),
        title: 'Beach cleanup record',
        verificationCode: 'CODE-1',
        duration: 90,
        // Pre-window timestamp proves the lifetime (Q1) aggregation.
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        submissionId: new Types.ObjectId(),
        volunteerId: v1,
        organizationId: orgId,
        opportunityId: oppId('opp-2'),
        positionId: pos('opp-2'),
        title: 'Food drive record',
        verificationCode: 'CODE-2',
        duration: 60,
      },
      {
        submissionId: new Types.ObjectId(),
        volunteerId: v2,
        organizationId: orgId,
        opportunityId: oppId('opp-3'),
        positionId: pos('opp-3'),
        title: 'Tree planting record',
        verificationCode: 'CODE-3',
        duration: 30,
      },
    ]);

    await applicationModel.create([
      {
        opportunityId: oppId('opp-1'),
        positionId: pos('opp-1'),
        volunteerId: v1,
        organizationId: orgId,
        status: 'pending',
      },
      {
        opportunityId: oppId('opp-2'),
        positionId: pos('opp-2'),
        volunteerId: v2,
        organizationId: orgId,
        status: 'under_review',
      },
      {
        opportunityId: oppId('opp-3'),
        positionId: pos('opp-3'),
        volunteerId: v2,
        organizationId: orgId,
        status: 'accepted',
      },
    ]);

    const now = Date.now();
    await verificationModel.create([
      {
        submissionId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v1,
        status: 'verified',
        decidedAt: new Date(now - 3_600_000),
        decidedBy: orgUserId,
      },
      {
        submissionId: new Types.ObjectId(),
        organizationId: orgId,
        volunteerId: v2,
        status: 'verified',
        decidedAt: new Date(now - 40 * 24 * 3_600_000),
        decidedBy: orgUserId,
      },
    ]);

    const mediaId = new Types.ObjectId();
    const byKey = new Map(
      participants.map((row) => [
        `${row.volunteerId.toString()}:${row.opportunityId.toString()}:${row.status}`,
        row._id,
      ]),
    );
    await submissionModel.create([
      {
        participantId: byKey.get(
          `${v1.toString()}:${oppId('opp-1').toString()}:accepted`,
        )!,
        opportunityId: oppId('opp-1'),
        positionId: pos('opp-1'),
        organizationId: orgId,
        volunteerId: v1,
        status: 'submitted',
        evidence: [{ mediaId }],
      },
      {
        participantId: byKey.get(
          `${v2.toString()}:${oppId('opp-3').toString()}:completed`,
        )!,
        opportunityId: oppId('opp-3'),
        positionId: pos('opp-3'),
        organizationId: orgId,
        volunteerId: v2,
        status: 'approved',
        evidence: [],
      },
    ]);

    await profileModel.create([
      {
        userId: v1,
        username: 'vol-one',
        firstName: 'Amine',
        lastName: 'Benali',
        geographicBase: 'Alger',
      },
      {
        userId: v2,
        username: 'vol-two',
        firstName: 'Sara',
      },
    ]);
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    participantModel = handle.connection.model<TaskParticipantModel>(
      TaskParticipantsCollection,
      TaskParticipantSchema,
    );
    experienceModel = handle.connection.model<VolunteerExperienceModel>(
      VolunteerExperiencesCollection,
      VolunteerExperienceSchema,
    );
    organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    skillCategoryModel = handle.connection.model<SkillCategoryModel>(
      SkillCategoriesCollection,
      SkillCategorySchema,
    );
    applicationModel = handle.connection.model<ApplicationModel>(
      ApplicationsCollection,
      ApplicationSchema,
    );
    submissionModel = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    verificationModel = handle.connection.model<VerificationModel>(
      VerificationsCollection,
      VerificationSchema,
    );
    profileModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );

    statsProvider = new OrgPublicStatsProviderImpl(
      opportunityModel,
      participantModel,
      experienceModel,
      organizationModel,
      skillCategoryModel,
    );
    footprintProvider = new OrgFootprintProviderImpl(
      opportunityModel,
      applicationModel,
      participantModel,
      experienceModel,
      organizationModel,
    );
    const organizationsStub = {
      findByUserId: async () =>
        organizationModel.findOne({ userId: orgUserId }).exec(),
    };
    service = new OrgDashboardService(
      participantModel,
      profileModel,
      opportunityModel,
      submissionModel,
      experienceModel,
      applicationModel,
      verificationModel,
      organizationModel,
      organizationsStub as unknown as OrganizationsService,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await Promise.all(
      [
        OpportunitiesCollection,
        TaskParticipantsCollection,
        VolunteerExperiencesCollection,
        OrganizationsCollection,
        SkillCategoriesCollection,
        ApplicationsCollection,
        SubmissionsCollection,
        VerificationsCollection,
        VolunteerProfilesCollection,
      ].map((name) => handle.connection.collection(name).deleteMany({})),
    );
    positionByOpp.clear();
    await seedFixture();
  });

  describe('OrgPublicStatsProviderImpl.getStats', () => {
    it('returns database-derived aggregates', async () => {
      const stats = await statsProvider.getStats(orgId);
      expect(stats.volunteers).toBe(2);
      expect(stats.initiativesActive).toBe(2);
      expect(stats.initiativesCompleted).toBe(2);
      expect(stats.verifiedHours).toBe(180);
      expect(stats.responseRate).toBe(0.75);
      expect(stats.perDomain).toEqual([
        { domain: 'Education', share: 0.75 },
        { domain: 'Sante', share: 0.25 },
      ]);
    });

    it('returns zeros for an organization without activity', async () => {
      const stats = await statsProvider.getStats(new Types.ObjectId());
      expect(stats).toEqual({
        volunteers: 0,
        initiativesActive: 0,
        initiativesCompleted: 0,
        verifiedHours: 0,
        responseRate: 0,
        perDomain: [],
      });
    });

    it('caps per-domain slices at eight, sorted desc', async () => {
      const categories = await skillCategoryModel.create(
        Array.from({ length: 10 }, (_, index) => ({
          slug: `cold-cat-${index}`,
          nameAr: `فئة ${index}`,
          nameFr: `Category ${index}`,
          order: 10 + index,
        })),
      );
      const coldOrg = new Types.ObjectId();
      await opportunityModel.create(
        categories.map((category, index) => ({
          organizationId: coldOrg,
          slug: `cold-opp-${index}`,
          title: `Cold opp ${index}`,
          description: 'Cold',
          categoryId: category._id,
          status: 'published',
          positions: [],
        })),
      );
      const stats = await statsProvider.getStats(coldOrg);
      expect(stats.perDomain).toHaveLength(8);
      const shares = stats.perDomain.map((slice) => slice.share);
      expect([...shares].sort((a, b) => b - a)).toEqual(shares);
    });
  });

  describe('OrgFootprintProviderImpl.getFootprint', () => {
    it('returns database-derived footprint with cached reliability', async () => {
      const footprint = await footprintProvider.getFootprint(orgId);
      expect(footprint.opportunities).toBe(6);
      expect(footprint.applications).toBe(3);
      expect(footprint.participants).toBe(4);
      expect(footprint.experiences).toBe(3);
      expect(footprint.hours).toBe(180);
      expect(footprint.reliability).toEqual({
        responseRate: 0.75,
        decidedRatio: 0.5,
        medianDecisionHours: 5,
        anomaly: false,
      });
    });

    it('returns zeros and null reliability for an empty organization', async () => {
      const footprint = await footprintProvider.getFootprint(
        new Types.ObjectId(),
      );
      expect(footprint).toEqual({
        opportunities: 0,
        applications: 0,
        participants: 0,
        experiences: 0,
        hours: 0,
        reliability: null,
      });
    });
  });

  describe('OrgDashboardService.getOrgStats', () => {
    it('returns the private dashboard numbers', async () => {
      const stats = await service.getOrgStats(account());
      expect(stats).toEqual({
        opportunitiesActive: 2,
        opportunitiesCompleted: 2,
        applicationsPending: 1,
        applicationsUnderReview: 1,
        participantsActive: 3,
        participantsCompleted: 1,
        verifiedHours: 180,
        decisionsLast30d: 1,
        decidedRatio: 0.5,
        medianDecisionHours: 5,
      });
    });
  });

  describe('OrgDashboardService.listOrgParticipants', () => {
    it('returns all statuses by default with joins', async () => {
      const page = await service.listOrgParticipants(account(), {});
      expect(page.total).toBe(6);
      expect(page.items).toHaveLength(6);
      const accepted = page.items.find(
        (row) =>
          (row as { status: string }).status === 'accepted' &&
          (
            (row as { volunteer: { username: string } | null }).volunteer as {
              username: string;
            } | null
          )?.username === 'vol-one',
      ) as unknown as {
        volunteer: { username: string; firstName: string };
        opportunity: { title: string; slug: string; status: string };
        submission: { state: string; mediaIds: unknown[] } | null;
        hourlyTotal: number;
      };
      expect(accepted.volunteer.username).toBe('vol-one');
      expect(accepted.volunteer.firstName).toBe('Amine');
      expect(accepted.opportunity.title).toBe('Beach cleanup');
      expect(accepted.submission?.state).toBe('submitted');
      expect(accepted.submission?.mediaIds).toHaveLength(1);
      expect(accepted.hourlyTotal).toBe(90);
    });

    it('nulls joins gracefully when profile and submission are absent', async () => {
      const page = await service.listOrgParticipants(account(), {
        status: 'removed',
      });
      expect(page.total).toBe(1);
      const row = page.items[0] as unknown as {
        volunteer: null;
        submission: null;
        hourlyTotal: number;
      };
      expect(row.volunteer).toBeNull();
      expect(row.submission).toBeNull();
      expect(row.hourlyTotal).toBe(0);
    });

    it('filters by status including completed', async () => {
      const page = await service.listOrgParticipants(account(), {
        status: 'completed',
      });
      expect(page.total).toBe(1);
      const row = page.items[0] as unknown as { hourlyTotal: number };
      expect(row.hourlyTotal).toBe(30);
    });

    it('matches q across volunteer, opportunity, and position titles', async () => {
      const byVolunteer = await service.listOrgParticipants(account(), {
        q: 'vol-one',
      });
      expect(byVolunteer.total).toBe(2);
      const byOpportunity = await service.listOrgParticipants(account(), {
        q: 'Tree planting',
      });
      expect(byOpportunity.total).toBe(1);
      const byPosition = await service.listOrgParticipants(account(), {
        q: 'carpenter',
      });
      expect(byPosition.total).toBe(1);
      const none = await service.listOrgParticipants(account(), {
        q: 'no-such-thing-xyz',
      });
      expect(none.total).toBe(0);
      expect(none.items).toEqual([]);
    });
  });
});
