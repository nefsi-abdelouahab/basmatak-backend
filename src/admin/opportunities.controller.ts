import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { OpportunityModel } from '../opportunities/schemas/opportunity.schema';
import {
  OpportunitiesQueryDto,
  OpportunityStatusDto,
} from './dto/admin-part-b.dto';
import { AdminOpportunitiesService } from './opportunities.service';

@ApiTags('admin (opportunities)')
@Controller('admin/opportunities')
@Roles('admin')
export class AdminOpportunitiesController {
  constructor(private readonly opportunities: AdminOpportunitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List opportunities (newest-first)' })
  list(
    @Query() query: OpportunitiesQueryDto,
  ): Promise<CursorPage<OpportunityModel>> {
    return this.opportunities.list(query);
  }

  @Patch(':opportunityId/status')
  @ApiOperation({ summary: 'Force close/cancel an opportunity' })
  setStatus(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: OpportunityStatusDto,
  ): Promise<OpportunityModel> {
    return this.opportunities.setStatus(account, opportunityId, dto.status);
  }
}
