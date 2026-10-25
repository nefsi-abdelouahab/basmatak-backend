import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LocationModel,
  LocationsCollection,
} from '../../locations/schemas/location.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../../organizations/schemas/organization.schema';
import {
  SkillModel,
  SkillsCollection,
} from '../../skills/schemas/skill.schema';
import { assertAllowedKeys } from './tool-input';
import { ReadOnlyTool, ToolDefinition, defineReadOnlyTool } from './tool.types';

export const PLATFORM_STATS_TOOL_NAME = 'platform_stats';

const ALLOWED_ARGUMENTS: readonly string[] = [];

export interface PlatformStatsPayload {
  publishedOpportunities: number;
  verifiedOrganizations: number;
  activeSkills: number;
  wilayas: number;
  municipalities: number;
}

@Injectable()
export class PlatformStatsTool implements ReadOnlyTool {
  readonly definition: ToolDefinition;

  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    @InjectModel(LocationsCollection)
    private readonly locationModel: Model<LocationModel>,
  ) {
    this.definition = defineReadOnlyTool({
      name: PLATFORM_STATS_TOOL_NAME,
      description:
        'Return public Basmatak platform counts: published opportunities, verified active organizations, active skills, and locations. Read-only; no private or user counts.',
      allowedIntents: ['platform_stats'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      handler: (input) => this.execute(input),
    });
  }

  private async execute(input: unknown): Promise<PlatformStatsPayload> {
    assertAllowedKeys(input, ALLOWED_ARGUMENTS);

    const [
      publishedOpportunities,
      verifiedOrganizations,
      activeSkills,
      wilayas,
      municipalities,
    ] = await Promise.all([
      this.opportunityModel.countDocuments({ status: 'published' }).exec(),
      this.organizationModel
        .countDocuments({
          verificationStatus: 'verified',
          status: 'active',
        })
        .exec(),
      this.skillModel.countDocuments({ active: true }).exec(),
      this.locationModel.countDocuments({ type: 'wilaya' }).exec(),
      this.locationModel.countDocuments({ type: 'municipality' }).exec(),
    ]);

    return {
      publishedOpportunities,
      verifiedOrganizations,
      activeSkills,
      wilayas,
      municipalities,
    };
  }
}
