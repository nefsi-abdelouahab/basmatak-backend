import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { OrgParticipantsQueryDto } from './dto/org-dashboard.dto';
import { OrgDashboardService } from './org-dashboard.service';

/**
 * Organization dashboard reads (Session 16 `org-dashboard`). Lives in the
 * participations module (roadmap §3 S6 scope) under the `organizations/me`
 * path so the archived `OrganizationsController` stays untouched — the
 * two-segment `me/*` paths cannot collide with its one-segment `:slug` route.
 */
@ApiBearerAuth()
@ApiTags('organizations')
@Controller('organizations/me')
export class OrgDashboardController {
  constructor(private readonly dashboard: OrgDashboardService) {}

  @Get('participants')
  @Roles('organization')
  @ApiOperation({
    summary: "Cross-opportunity participant roster of the caller's org",
  })
  listParticipants(
    @CurrentAccount() account: AccountToken,
    @Query() query: OrgParticipantsQueryDto,
  ) {
    return this.dashboard.listOrgParticipants(account, query);
  }

  @Get('stats')
  @Roles('organization')
  @ApiOperation({ summary: "Private dashboard aggregates of the caller's org" })
  getStats(@CurrentAccount() account: AccountToken) {
    return this.dashboard.getOrgStats(account);
  }
}
