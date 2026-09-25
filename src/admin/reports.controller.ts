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
import { ReportModel } from '../reports/report.schema';
import { ReportStatusDto, ReportsQueryDto } from './dto/admin-part-b.dto';
import { AssignAdminDto } from './dto/admin-query.dto';
import { AdminReportsService, AdminReportRow } from './reports.service';
import { ModerationActionsService } from './moderation-actions.service';
import { adminCsvFilename, adminCsvStream } from './csv/admin-csv';

@ApiBearerAuth()
@ApiTags('admin (reports)')
@Controller('admin/reports')
@Roles('admin')
export class AdminReportsController {
  constructor(
    private readonly reports: AdminReportsService,
    private readonly moderation: ModerationActionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reports (optional status filter)' })
  async list(
    @Query() query: ReportsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<AdminReportRow> | StreamableFile> {
    const page = await this.reports.list(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('reports')}"`,
      );
      return new StreamableFile(adminCsvStream('reports', page.items));
    }
    return page;
  }

  @ApiParam({
    name: 'reportId',
    description: 'The report id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':reportId/assign')
  @ApiOperation({ summary: 'Assign a report to an admin' })
  assign(
    @Param('reportId') reportId: string,
    @Body() dto: AssignAdminDto,
  ): Promise<ReportModel> {
    return this.reports.assign(reportId, dto.assignedAdminId);
  }

  @ApiParam({
    name: 'reportId',
    description: 'The report id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':reportId')
  @ApiOperation({
    summary:
      'Resolve/dismiss a report (optionally with a moderation consequence)',
  })
  resolve(
    @CurrentAccount() account: AccountToken,
    @Param('reportId') reportId: string,
    @Body() dto: ReportStatusDto,
  ): Promise<ReportModel> {
    // Terminal `resolved` calls run through the composite so the
    // suspend-on-report policy default applies; without an action (and with
    // the flag off) the outcome is identical to the plain path below.
    if (dto.action || dto.status === 'resolved') {
      return this.moderation.resolveWithAction(account, reportId, dto);
    }
    return this.reports.resolve(account, reportId, dto);
  }
}
