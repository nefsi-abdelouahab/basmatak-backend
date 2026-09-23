import { Controller, Get, Param } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import {
  CurrentAccount,
  Public,
  Roles,
} from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  PublishGateStatus,
  TrustPublishGateService,
} from './trust-publish-gate.service';
import { ReliabilityService } from './reliability.service';

/**
 * Trust controller (roadmap A7/F8): the org-facing publish-gate status read
 * and the public per-org reliability profile. `/me/publish-gate` is declared
 * before `/organizations/:slug` in controller scan order so `me` is never
 * swallowed as a slug (§2.7 route-order trap).
 */
@ApiTags('trust')
@Controller()
export class TrustController {
  constructor(
    private readonly gate: TrustPublishGateService,
    private readonly reliability: ReliabilityService,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
  ) {}

  @Get('organizations/me/publish-gate')
  @Roles('organization')
  @ApiOperation({ summary: "Caller's organization publish-gate state" })
  async publishGate(
    @CurrentAccount() account: AccountToken,
  ): Promise<PublishGateStatus> {
    const organization = await this.organizationModel
      .findOne({ userId: account.sub })
      .select('_id')
      .lean()
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    return this.gate.status(organization._id);
  }

  @Get('organizations/:slug/reliability')
  @Public()
  @ApiOperation({ summary: 'Public reliability metrics by organization slug' })
  async reliabilityBySlug(@Param('slug') slug: string): Promise<unknown> {
    const organization = await this.organizationModel
      .findOne({
        slug,
        verificationStatus: 'verified',
        status: 'active',
      })
      .select('reliability')
      .lean()
      .exec();
    if (!organization || !organization.reliability) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    return organization.reliability;
  }
}
