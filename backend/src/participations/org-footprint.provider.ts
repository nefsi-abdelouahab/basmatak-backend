import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import {
  OrgFootprint,
  OrgFootprintProvider,
} from '../common/seams/org-footprint';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  ENGAGED_PARTICIPANT_STATUSES,
  readReliability,
  sumVerifiedHours,
  toOrgObjectId,
} from './org-dashboard.aggregates';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from './schemas/task-participant.schema';

/**
 * Real `OrgFootprintProvider` (Session 16 `org-dashboard`, defined by
 * Session 8 `admin-analytics`). Bound in `AdminModule` via direct file import
 * (Session 15 precedent) — every model below is already registered in that
 * scope, so the swap is a single binding line. Read-only; the reliability
 * cache stays owned by `ReliabilityService`.
 */
@Injectable()
export class OrgFootprintProviderImpl implements OrgFootprintProvider {
  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
  ) {}

  async getFootprint(
    organizationId: Types.ObjectId | string,
  ): Promise<OrgFootprint> {
    const orgId = toOrgObjectId(organizationId);
    const [
      opportunities,
      applications,
      participants,
      experiences,
      hours,
      reliability,
    ] = await Promise.all([
      this.opportunityModel.countDocuments({ organizationId: orgId }).exec(),
      this.applicationModel.countDocuments({ organizationId: orgId }).exec(),
      this.participantModel
        .countDocuments({
          organizationId: orgId,
          status: { $in: ENGAGED_PARTICIPANT_STATUSES },
        })
        .exec(),
      this.experienceModel.countDocuments({ organizationId: orgId }).exec(),
      sumVerifiedHours(this.experienceModel, orgId),
      readReliability(this.organizationModel, orgId),
    ]);
    return {
      opportunities,
      applications,
      participants,
      experiences,
      hours,
      reliability: reliability
        ? {
            ...(reliability.responseRate !== undefined
              ? { responseRate: reliability.responseRate }
              : {}),
            ...(reliability.decidedRatio !== undefined
              ? { decidedRatio: reliability.decidedRatio }
              : {}),
            ...(reliability.medianDecisionHours !== undefined
              ? { medianDecisionHours: reliability.medianDecisionHours }
              : {}),
            ...(reliability.anomaly !== undefined
              ? { anomaly: reliability.anomaly }
              : {}),
          }
        : null,
    };
  }
}
