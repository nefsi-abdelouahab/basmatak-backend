import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentAccount,
  Public,
  Roles,
} from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  CreateOpportunityDto,
  OpportunityFeedQueryDto,
  OwnOpportunityQueryDto,
  RecommendedQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

/**
 * Opportunities controller (inventory §2.8, roadmap S6).
 *
 * Route-order traps (D3/D4):
 * - `GET /opportunities/recommended` MUST precede `GET /opportunities/:idOrSlug`
 *   or the catch-all swallows `recommended`.
 * - `GET /organizations/me/opportunities` MUST precede the `:slug` variant, and
 *   this module is imported BEFORE `OrganizationsModule` in AppModule so both
 *   static org routes register ahead of S5's `GET organizations/:slug/...`.
 */
@ApiTags('opportunities')
@Controller()
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get('opportunities')
  @Public()
  @ApiOperation({ summary: 'Public feed (published only, cursor paginated)' })
  feed(@Query() query: OpportunityFeedQueryDto) {
    return this.opportunities.listPublic(query);
  }

  @ApiBearerAuth()
  @Get('opportunities/recommended')
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Recommended feed for the volunteer (rule-based scoring)',
  })
  recommended(
    @CurrentAccount() account: AccountToken,
    @Query() query: RecommendedQueryDto,
  ) {
    return this.opportunities.getRecommended(account, query);
  }

  @ApiParam({
    name: 'idOrSlug',
    description: 'Opportunity id or slug',
    type: String,
  })
  @Get('opportunities/:idOrSlug')
  @Public()
  @ApiOperation({ summary: 'Public opportunity detail by id or slug' })
  getByIdOrSlug(@Param('idOrSlug') idOrSlug: string) {
    return this.opportunities.getByIdOrSlug(idOrSlug);
  }

  @ApiBearerAuth()
  @Post('organizations/me/opportunities')
  @Roles('organization')
  @ApiOperation({ summary: 'Create an opportunity draft with positions' })
  create(
    @CurrentAccount() account: AccountToken,
    @Body() dto: CreateOpportunityDto,
  ) {
    return this.opportunities.createOpportunity(account, dto);
  }

  @ApiBearerAuth()
  @Get('organizations/me/opportunities')
  @Roles('organization')
  @ApiOperation({
    summary: "List the caller's own opportunities (all statuses)",
  })
  listOwn(
    @CurrentAccount() account: AccountToken,
    @Query() query: OwnOpportunityQueryDto,
  ) {
    return this.opportunities.listOwn(account, query);
  }

  @ApiParam({
    name: 'slug',
    description: 'Organization slug',
    type: String,
  })
  @Get('organizations/:slug/opportunities')
  @Public()
  @ApiOperation({
    summary: 'Public opportunities of an organization (published)',
  })
  listBySlug(@Param('slug') slug: string) {
    return this.opportunities.listByOrganizationSlug(slug);
  }

  @ApiBearerAuth()
  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Patch('opportunities/:opportunityId')
  @Roles('organization')
  @ApiOperation({ summary: 'Update an owned opportunity' })
  update(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.opportunities.updateOpportunity(account, opportunityId, dto);
  }

  @ApiBearerAuth()
  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Delete('opportunities/:opportunityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('organization')
  @ApiOperation({ summary: 'Delete a draft opportunity' })
  async remove(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
  ) {
    await this.opportunities.deleteOpportunity(account, opportunityId);
  }

  @ApiBearerAuth()
  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Post('opportunities/:opportunityId/publish')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Publish a draft (verified org + gate)' })
  publish(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.opportunities.publishOpportunity(account, opportunityId);
  }

  @ApiBearerAuth()
  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Post('opportunities/:opportunityId/close')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Close an opportunity' })
  close(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.opportunities.closeOpportunity(account, opportunityId);
  }

  @ApiBearerAuth()
  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Post('opportunities/:opportunityId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Cancel an opportunity' })
  cancel(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.opportunities.cancelOpportunity(account, opportunityId);
  }

  @ApiBearerAuth()
  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Post('opportunities/:opportunityId/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Complete an in_progress opportunity' })
  complete(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.opportunities.completeOpportunity(account, opportunityId);
  }
}
