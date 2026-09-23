import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { ReportModel } from '../reports/report.schema';
import { ReportStatusDto, ReportsQueryDto } from './dto/admin-part-b.dto';
import { AdminReportsService } from './reports.service';

@ApiTags('admin (reports)')
@Controller('admin/reports')
@Roles('admin')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List reports (optional status filter)' })
  list(@Query() query: ReportsQueryDto): Promise<CursorPage<ReportModel>> {
    return this.reports.list(query);
  }

  @Patch(':reportId')
  @ApiOperation({ summary: 'Resolve/dismiss a report' })
  resolve(
    @CurrentAccount() account: AccountToken,
    @Param('reportId') reportId: string,
    @Body() dto: ReportStatusDto,
  ): Promise<ReportModel> {
    return this.reports.resolve(account, reportId, dto);
  }
}
