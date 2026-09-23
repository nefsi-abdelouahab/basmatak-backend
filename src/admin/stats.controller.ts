import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { AdminStatsOverview, AdminStatsService } from './stats.service';

@ApiBearerAuth()
@ApiTags('admin (stats)')
@Controller('admin/stats')
@Roles('admin')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Dashboard counts, hours, verification rate, gates',
  })
  overview(): Promise<AdminStatsOverview> {
    return this.stats.getOverview();
  }
}
