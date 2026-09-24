import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { ApplicationsService } from './applications.service';
import {
  ApplicationListQueryDto,
  ApplyApplicationDto,
  OpportunityApplicationsQueryDto,
  OrganizationApplicationsQueryDto,
  RejectApplicationDto,
} from './dto/application.dto';

/**
 * Applications controller (inventory §2.9, roadmap S7).
 *
 * Route-order note: `/applications/me` is declared before
 * `/applications/:applicationId` so the static path wins over the parameter
 * route.
 */
@ApiBearerAuth()
@ApiTags('applications')
@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @ApiParam({
    name: 'positionId',
    description: 'The position id',
    type: String,
    format: 'ObjectId',
  })
  @Post('opportunities/:opportunityId/positions/:positionId/applications')
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Apply to an open position (cover message optional)',
  })
  apply(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Param('positionId') positionId: string,
    @Body() dto: ApplyApplicationDto,
  ) {
    return this.applications.apply(
      account,
      opportunityId,
      positionId,
      dto.message,
    );
  }

  @Get('applications/me')
  @Roles('volunteer')
  @ApiOperation({ summary: "List the caller's own applications" })
  listOwn(
    @CurrentAccount() account: AccountToken,
    @Query() query: ApplicationListQueryDto,
  ) {
    return this.applications.listMyApplications(account, query);
  }

  @ApiParam({
    name: 'applicationId',
    description: 'The application id',
    type: String,
    format: 'ObjectId',
  })
  @Get('applications/:applicationId')
  @ApiOperation({ summary: 'Application detail (own volunteer or owning org)' })
  get(
    @CurrentAccount() account: AccountToken,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applications.getApplication(account, applicationId);
  }

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Get('opportunities/:opportunityId/applications')
  @Roles('organization')
  @ApiOperation({ summary: 'List an owned opportunity applications' })
  listForOpportunity(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Query() query: OpportunityApplicationsQueryDto,
  ) {
    return this.applications.listOpportunityApplications(
      account,
      opportunityId,
      query,
    );
  }

  @Get('organizations/me/applications')
  @Roles('organization')
  @ApiOperation({
    summary:
      'Aggregate application inbox across the caller\u2019s opportunities',
  })
  listInbox(
    @CurrentAccount() account: AccountToken,
    @Query() query: OrganizationApplicationsQueryDto,
  ) {
    return this.applications.listOrganizationInbox(account, query);
  }

  @ApiParam({
    name: 'applicationId',
    description: 'The application id',
    type: String,
    format: 'ObjectId',
  })
  @Post('applications/:applicationId/accept')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Accept an application (transaction)' })
  accept(
    @CurrentAccount() account: AccountToken,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applications.acceptApplication(account, applicationId);
  }

  @ApiParam({
    name: 'applicationId',
    description: 'The application id',
    type: String,
    format: 'ObjectId',
  })
  @Post('applications/:applicationId/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({ summary: 'Reject an application with a reason' })
  reject(
    @CurrentAccount() account: AccountToken,
    @Param('applicationId') applicationId: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.applications.rejectApplication(
      account,
      applicationId,
      dto.reason,
    );
  }

  @ApiParam({
    name: 'applicationId',
    description: 'The application id',
    type: String,
    format: 'ObjectId',
  })
  @Post('applications/:applicationId/start-review')
  @HttpCode(HttpStatus.OK)
  @Roles('organization')
  @ApiOperation({
    summary: 'Move a pending application under review (org-owner only)',
  })
  startReview(
    @CurrentAccount() account: AccountToken,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applications.startReview(account, applicationId);
  }

  @ApiParam({
    name: 'applicationId',
    description: 'The application id',
    type: String,
    format: 'ObjectId',
  })
  @Post('applications/:applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Withdraw an application (accepted path is a transaction)',
  })
  withdraw(
    @CurrentAccount() account: AccountToken,
    @Param('applicationId') applicationId: string,
  ) {
    return this.applications.withdrawApplication(account, applicationId);
  }
}
