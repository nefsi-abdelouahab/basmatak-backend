import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { CursorPage } from '../common/pagination/paginated.interface';
import { AuditLogModel } from '../core/audit/audit-log.schema';
import { AdminAuditService } from './audit.service';
import { AuditLogsQueryDto } from './dto/admin-part-b.dto';

@ApiBearerAuth()
@ApiTags('admin (audit)')
@Controller('admin/audit-logs')
@Roles('admin')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: 'Browse audit logs (actor/entity/date filters)' })
  list(@Query() query: AuditLogsQueryDto): Promise<CursorPage<AuditLogModel>> {
    return this.audit.list(query);
  }
}
