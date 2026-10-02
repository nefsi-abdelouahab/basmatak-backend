import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { OpportunityModel } from '../opportunities/schemas/opportunity.schema';
import {
  OpportunitiesQueryDto,
  OpportunityStatusDto,
} from './dto/admin-part-b.dto';
import {
  AdminOpportunitiesService,
  AdminOpportunityRow,
  AdminOpportunityVerificationRow,
} from './opportunities.service';
import { adminCsvFilename, adminCsvStream } from './csv/admin-csv';

@ApiBearerAuth()
@ApiTags('admin (opportunities)')
@Controller('admin/opportunities')
@Roles('admin')
export class AdminOpportunitiesController {
  constructor(private readonly opportunities: AdminOpportunitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List opportunities (newest-first)' })
  async list(
    @Query() query: OpportunitiesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<AdminOpportunityRow> | StreamableFile> {
    const page = await this.opportunities.list(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('opportunities')}"`,
      );
      return new StreamableFile(adminCsvStream('opportunities', page.items));
    }
    return page;
  }

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Get(':opportunityId/verification-status')
  @ApiOperation({
    summary:
      'Per-participant submission and verification state for one opportunity',
  })
  getVerificationStatus(
    @Param('opportunityId') opportunityId: string,
  ): Promise<{ items: AdminOpportunityVerificationRow[] }> {
    return this.opportunities.getVerificationStatus(opportunityId);
  }

  @ApiParam({
    name: 'opportunityId',
    description: 'The opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':opportunityId/status')
  @ApiOperation({ summary: 'Force close/cancel an opportunity' })
  setStatus(
    @CurrentAccount() account: AccountToken,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: OpportunityStatusDto,
  ): Promise<OpportunityModel> {
    return this.opportunities.setStatus(account, opportunityId, dto.status, {
      reason: dto.reason,
      notes: dto.notes,
    });
  }
}
