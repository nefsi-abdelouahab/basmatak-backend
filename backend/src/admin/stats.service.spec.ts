import { Model, Types } from 'mongoose';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import { SettingsService } from '../core/settings/settings.service';
import {
  SystemSettingModel,
  SystemSettingSchema,
  SystemSettingsCollection,
} from '../core/settings/system-setting.schema';
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
import {
  UserModel,
  UserSchema,
  UsersCollection,
} from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  SubmissionModel,
  SubmissionSchema,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import { AdminStatsService } from './stats.service';

describe('AdminStatsService (inventory §2.20 overview)', () => {
  let handle: MemoryConnectionHandle;
  let service: AdminStatsService;
  let userModel: Model<UserModel>;
  let organizationModel: Model<OrganizationModel>;
  let verificationModel: Model<OrganizationVerificationModel>;
  let volunteerModel: Model<VolunteerProfileModel>;
  let opportunityModel: Model<OpportunityModel>;
  let submissionModel: Model<SubmissionModel>;
  let settings: SettingsService;

  beforeAll(async () => {
    handle = await startMemoryConnection();
    userModel = handle.connection.model(UsersCollection, UserSchema);
    organizationModel = handle.connection.model(
      OrganizationsCollection,
      OrganizationSchema,
    );
    verificationModel = handle.connection.model(
      OrganizationVerificationsCollection,
      OrganizationVerificationSchema,
    );
    volunteerModel = handle.connection.model(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    opportunityModel = handle.connection.model(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    submissionModel = handle.connection.model(
      SubmissionsCollection,
      SubmissionSchema,
    );
    const settingModel = handle.connection.model<SystemSettingModel>(
      SystemSettingsCollection,
      SystemSettingSchema,
    );
    settings = new SettingsService(settingModel);

    service = new AdminStatsService(
      userModel,
      organizationModel,
      verificationModel,
      volunteerModel,
      opportunityModel,
      submissionModel,
      settings,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    const db = handle.connection.db!;
    for (const collection of [
      UsersCollection,
      OrganizationsCollection,
      OrganizationVerificationsCollection,
      VolunteerProfilesCollection,
      OpportunitiesCollection,
      SubmissionsCollection,
      SystemSettingsCollection,
    ]) {
      await db.dropCollection(collection).catch(() => undefined);
    }
  });

  async function seedVolunteer(hours: number): Promise<Types.ObjectId> {
    const user = await userModel.create({
      email: `vol-${new Types.ObjectId()}@example.com`,
      passwordHash: 'hash',
      role: 'volunteer',
      status: 'active',
    });
    await volunteerModel.create({
      userId: user._id,
      username: user.email.split('@')[0],
      stats: {
        completedTasks: 0,
        verifiedExperiences: 0,
        volunteerHours: hours,
      },
      publicProfile: {
        enabled: false,
        showAvatar: false,
        showBiography: false,
        showLocation: false,
        showSkills: false,
        showExperiences: false,
        showAvailability: false,
        showPortfolio: false,
      },
    });
    return user._id;
  }

  async function seedOrg(
    verificationStatus: 'pending' | 'verified' | 'rejected' = 'pending',
  ): Promise<Types.ObjectId> {
    const user = await userModel.create({
      email: `org-${new Types.ObjectId()}@example.com`,
      passwordHash: 'hash',
      role: 'organization',
      status: 'active',
    });
    const org = await organizationModel.create({
      userId: user._id,
      slug: `org-${new Types.ObjectId().toString()}${verificationStatus}`,
      verificationStatus,
      status: 'active',
    });
    if (verificationStatus === 'pending') {
      await verificationModel.create({
        organizationId: org._id,
        status: 'pending',
        documents: [],
        submittedAt: new Date(),
      });
    }
    return org._id;
  }

  async function seedSubmission(
    organizationId: Types.ObjectId,
    opportunityId: Types.ObjectId,
    status: string,
  ): Promise<void> {
    await submissionModel.create({
      participantId: new Types.ObjectId(),
      opportunityId,
      positionId: new Types.ObjectId(),
      organizationId,
      volunteerId: new Types.ObjectId(),
      deliverables: [],
      consentConfirmed: true,
      evidence: [],
      status,
    });
  }

  it('returns a zeroed overview on an empty database', async () => {
    const overview = await service.getOverview();
    expect(overview.counts).toEqual({
      users: 0,
      volunteers: 0,
      organizations: 0,
      verifiedOrganizations: 0,
      opportunities: 0,
      pendingVerifications: 0,
    });
    expect(overview.totalVolunteerHours).toBe(0);
    expect(overview.verificationRate).toBe(0);
    expect(overview.gateFreezes).toBe(0);
  });

  it('sums volunteer hours and counts users/volunteers separately', async () => {
    await seedVolunteer(5);
    await seedVolunteer(7);
    await userModel.create({
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: 'admin',
      status: 'active',
    });

    const overview = await service.getOverview();
    expect(overview.counts.users).toBe(3);
    expect(overview.counts.volunteers).toBe(2);
    expect(overview.totalVolunteerHours).toBe(12);
  });

  it('computes verificationRate as verified ÷ total (0 when no orgs)', async () => {
    await seedOrg('pending');
    const oneVerified = await seedOrg('verified');
    await seedOrg('verified');
    void oneVerified;

    const overview = await service.getOverview();
    expect(overview.counts.organizations).toBe(3);
    expect(overview.counts.verifiedOrganizations).toBe(2);
    expect(overview.counts.pendingVerifications).toBe(1);
    expect(overview.verificationRate).toBeCloseTo(2 / 3);
  });

  it('counts gate freezes per the §4 rule (distinct pending-review opportunities ≥ threshold)', async () => {
    const lockedOrg = await seedOrg();
    const openOrg = await seedOrg();

    const oppA = await opportunityModel.create({
      organizationId: lockedOrg,
      slug: 'a',
      title: 'A',
      description: 'desc',
      status: 'draft',
      positions: [],
    });
    const oppB = await opportunityModel.create({
      organizationId: lockedOrg,
      slug: 'b',
      title: 'B',
      description: 'desc',
      status: 'draft',
      positions: [],
    });
    const oppC = await opportunityModel.create({
      organizationId: lockedOrg,
      slug: 'c',
      title: 'C',
      description: 'desc',
      status: 'draft',
      positions: [],
    });
    const oppD = await opportunityModel.create({
      organizationId: openOrg,
      slug: 'd',
      title: 'D',
      description: 'desc',
      status: 'draft',
      positions: [],
    });

    // Locked org: three distinct opportunities with pending-review submissions.
    await seedSubmission(lockedOrg, oppA._id, 'submitted');
    await seedSubmission(lockedOrg, oppA._id, 'under_review');
    await seedSubmission(lockedOrg, oppB._id, 'under_review');
    await seedSubmission(lockedOrg, oppC._id, 'submitted');
    // Open org: one pending opportunity plus a reviewed (non-counting) row.
    await seedSubmission(openOrg, oppD._id, 'submitted');
    await seedSubmission(openOrg, oppD._id, 'approved');
    await opportunityModel.create({
      organizationId: lockedOrg,
      slug: 'no-submission-org',
      title: 'E',
      description: 'desc',
      status: 'draft',
      positions: [],
    });

    const overview = await service.getOverview();
    expect(overview.gateFreezes).toBe(1);
  });

  it('respects the maxPendingOpportunities threshold from settings', async () => {
    const one = await seedOrg();
    await Promise.all([
      seedSubmission(
        one,
        (
          await opportunityModel.create({
            organizationId: one,
            slug: 'f1',
            title: 'F1',
            description: 'd',
            status: 'draft',
            positions: [],
          })
        )._id,
        'submitted',
      ),
      seedSubmission(
        one,
        (
          await opportunityModel.create({
            organizationId: one,
            slug: 'f2',
            title: 'F2',
            description: 'd',
            status: 'draft',
            positions: [],
          })
        )._id,
        'submitted',
      ),
    ]);

    await settings.set('publishGate.maxPendingOpportunities', 2);
    expect((await service.getOverview()).gateFreezes).toBe(1);

    await settings.set('publishGate.maxPendingOpportunities', 3);
    expect((await service.getOverview()).gateFreezes).toBe(0);
  });
});
