import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAccount } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportModel } from './report.schema';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Report an entity (any logged-in role)' })
  create(
    @CurrentAccount() account: AccountToken,
    @Body() dto: CreateReportDto,
  ): Promise<ReportModel> {
    return this.reports.create(account, dto);
  }
}
