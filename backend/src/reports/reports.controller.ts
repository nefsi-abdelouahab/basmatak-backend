import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportModel } from './report.schema';
import { ReportsService } from './reports.service';

/** 5 reports per minute (report-spam flood hardening, S19). */
const REPORT_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @ApiBearerAuth()
  @Post()
  @Throttle(REPORT_LIMIT)
  @ApiOperation({ summary: 'Report an entity (any logged-in role)' })
  create(
    @CurrentAccount() account: AccountToken,
    @Body() dto: CreateReportDto,
  ): Promise<ReportModel> {
    return this.reports.create(account, dto);
  }
}
