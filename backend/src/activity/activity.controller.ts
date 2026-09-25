import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { ActivityService } from './activity.service';

/**
 * Activity controller (Session 12 `backend-v2-activity-feed`). Full paths on
 * a bare `@Controller()` so no shared controller file is touched; `/me`
 * scoping is server-derived from the account, never from caller input.
 */
@ApiBearerAuth()
@ApiTags('activity')
@Controller()
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('organizations/me/activity')
  @Roles('organization')
  @ApiOperation({
    summary: "List the caller's organization activity (newest first)",
  })
  getOrgActivity(
    @CurrentAccount() account: AccountToken,
    @Query() query: ActivityFeedQueryDto,
  ) {
    return this.activity.getOrgActivity(account, query);
  }

  @Get('volunteers/me/activity')
  @Roles('volunteer')
  @ApiOperation({
    summary: "List the caller's volunteer activity (newest first)",
  })
  getVolunteerActivity(
    @CurrentAccount() account: AccountToken,
    @Query() query: ActivityFeedQueryDto,
  ) {
    return this.activity.getVolunteerActivity(account, query);
  }
}
