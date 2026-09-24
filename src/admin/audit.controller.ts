import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../common/decorators/auth.decorators';
import { CursorPage } from '../common/pagination/paginated.interface';
import { AdminAuditService, AdminAuditRow } from './audit.service';
import { AuditLogsQueryDto } from './dto/admin-part-b.dto';
import { adminCsvFilename, adminCsvStream } from './csv/admin-csv';

@ApiBearerAuth()
@ApiTags('admin (audit)')
@Controller('admin/audit-logs')
@Roles('admin')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: 'Browse audit logs (actor/entity/date filters)' })
  async list(
    @Query() query: AuditLogsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CursorPage<AdminAuditRow> | StreamableFile> {
    const page = await this.audit.list(query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${adminCsvFilename('audit-logs')}"`,
      );
      return new StreamableFile(adminCsvStream('audit-logs', page.items));
    }
    return page;
  }
}
