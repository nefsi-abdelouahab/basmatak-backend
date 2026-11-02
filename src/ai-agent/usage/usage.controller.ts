import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { QuotaService } from '../budget/quota.service';
import { AiAgentUsageReport, UsageMeterService } from './usage-meter.service';

/**
 * Admin-only aggregate usage. There is no `@Public` here, so the global JWT
 * guard returns 401 without a token and the roles guard returns 403 for any
 * non-admin account.
 */
@ApiTags('ai-agent')
@Controller('ai-agent')
export class UsageController {
  constructor(
    private readonly usage: UsageMeterService,
    private readonly quota: QuotaService,
  ) {}

  @Get('usage')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin aggregate AI assistant usage' })
  getUsage(): AiAgentUsageReport {
    const now = Date.now();
    return this.usage.getReport(this.quota.getBudgetSnapshot(now), now);
  }
}
