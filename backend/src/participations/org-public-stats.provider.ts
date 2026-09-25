import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OrgPublicStats,
  OrgPublicStatsProvider,
} from '../common/seams/org-public-stats';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../skills/schemas/skill-category.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  countDistinctVolunteers,
  countInitiatives,
  perDomainBreakdown,
  readReliability,
  sumVerifiedHours,
  toOrgObjectId,
} from './org-dashboard.aggregates';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from './schemas/task-participant.schema';

/**
 * Real `OrgPublicStatsProvider` (Session 16 `org-dashboard`, defined by
 * Session 14 `org-facts`). Bound in `OrganizationsModule` via direct file
 * import (Session 15 precedent) — its constructor deps are exactly the models
 * available in that scope, so the swap needs no wider module change.
 * `responseRate` reuses the cached `ReliabilityService` snapshot (`0` when
 * cold); no new formula is introduced.
 */
@Injectable()
export class OrgPublicStatsProviderImpl implements OrgPublicStatsProvider {
  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(SkillCategoriesCollection)
    private readonly skillCategoryModel: Model<SkillCategoryModel>,
  ) {}

  async getStats(
    organizationId: Types.ObjectId | string,
  ): Promise<OrgPublicStats> {
    const orgId = toOrgObjectId(organizationId);
    const [volunteers, initiatives, verifiedHours, reliability, perDomain] =
      await Promise.all([
        countDistinctVolunteers(this.participantModel, orgId),
        countInitiatives(this.opportunityModel, orgId),
        sumVerifiedHours(this.experienceModel, orgId),
        readReliability(this.organizationModel, orgId),
        perDomainBreakdown(
          this.opportunityModel,
          this.skillCategoryModel,
          orgId,
        ),
      ]);
    return {
      volunteers,
      initiativesActive: initiatives.active,
      initiativesCompleted: initiatives.completed,
      verifiedHours,
      responseRate: reliability?.responseRate ?? 0,
      perDomain,
    };
  }
}
