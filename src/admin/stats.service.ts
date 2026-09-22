import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SettingsService } from '../core/settings/settings.service';
import {
  OrganizationsCollection,
  OrganizationModel,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationModel,
} from '../organizations/schemas/organization-verification.schema';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';

export interface AdminStatsOverview {
  counts: {
    users: number;
    volunteers: number;
    organizations: number;
    verifiedOrganizations: number;
    opportunities: number;
    pendingVerifications: number;
  };
  totalVolunteerHours: number;
  verificationRate: number;
  gateFreezes: number;
}

const GATE_STATUSES = ['submitted', 'under_review'] as const;
const GATE_KEY = 'publishGate.maxPendingOpportunities';
const GATE_DEFAULT_THRESHOLD = 3;

/**
 * Admin dashboard overview (inventory §2.20). Reads follow the §3 indexes (no
 * new scans); the gate-freeze figure re-derives the §4/§2.20 rule at read time:
 * an organization is locked once it holds `maxPendingOpportunities` distinct
 * opportunities that have at least one submission in `submitted|under_review`.
 */
@Injectable()
export class AdminStatsService {
  constructor(
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OrganizationVerificationsCollection)
    private readonly verificationModel: Model<OrganizationVerificationModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly volunteerModel: Model<VolunteerProfileModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    private readonly settings: SettingsService,
  ) {}

  async getOverview(): Promise<AdminStatsOverview> {
    const [
      users,
      volunteers,
      organizations,
      verifiedOrganizations,
      opportunities,
      pendingVerifications,
      hoursAgg,
      gateFreezes,
    ] = await Promise.all([
      this.userModel.countDocuments({}).exec(),
      this.userModel.countDocuments({ role: 'volunteer' }).exec(),
      this.organizationModel.countDocuments({}).exec(),
      this.organizationModel
        .countDocuments({ verificationStatus: 'verified' })
        .exec(),
      this.opportunityModel.countDocuments({}).exec(),
      this.verificationModel.countDocuments({ status: 'pending' }).exec(),
      this.aggregateVolunteerHours(),
      this.countGateFreezes(),
    ]);

    return {
      counts: {
        users,
        volunteers,
        organizations,
        verifiedOrganizations,
        opportunities,
        pendingVerifications,
      },
      totalVolunteerHours: hoursAgg ?? 0,
      verificationRate:
        organizations > 0 ? verifiedOrganizations / organizations : 0,
      gateFreezes,
    };
  }

  private async aggregateVolunteerHours(): Promise<number | null> {
    const [row] = await this.volunteerModel
      .aggregate<{ hours: number }>([
        { $group: { _id: null, hours: { $sum: '$stats.volunteerHours' } } },
      ])
      .exec();
    return row ? row.hours : null;
  }

  private async countGateFreezes(): Promise<number> {
    const threshold =
      (await this.settings.get<number>(GATE_KEY, GATE_DEFAULT_THRESHOLD)) ??
      GATE_DEFAULT_THRESHOLD;
    const [row] = await this.submissionModel
      .aggregate<{ frozen: number }>([
        { $match: { status: { $in: GATE_STATUSES } } },
        {
          $group: {
            _id: '$organizationId',
            opportunities: { $addToSet: '$opportunityId' },
          },
        },
        { $project: { pendingCount: { $size: '$opportunities' } } },
        { $match: { pendingCount: { $gte: threshold } } },
        { $count: 'frozen' },
      ])
      .exec();
    return row ? row.frozen : 0;
  }
}
