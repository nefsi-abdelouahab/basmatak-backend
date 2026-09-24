import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import {
  AdminAnalyticsQueue,
  AdminAnalyticsOverview,
  AdminAnalyticsSeries,
  AdminAnalyticsService,
} from './analytics.service';
import { AnalyticsSeriesQueryDto } from './dto/analytics-query.dto';

/**
 * Admin analytics controller (Session 8): database-derived overview, UTC time
 * series, and attention queue. Admin-only like every `/admin/*` route; the
 * existing `/health` System Status card and CSV exports are untouched.
 */
@ApiBearerAuth()
@ApiTags('admin (analytics)')
@Controller('admin/analytics')
@Roles('admin')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Totals with deltas, activity, queue and medians' })
  overview(): Promise<AdminAnalyticsOverview> {
    return this.analytics.getOverview();
  }

  @Get('series')
  @ApiOperation({ summary: 'Per-day UTC signups, applications, verifications' })
  series(
    @Query() query: AnalyticsSeriesQueryDto,
  ): Promise<AdminAnalyticsSeries> {
    return this.analytics.getSeries(query.days);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Attention totals per category plus maintenance' })
  queue(): Promise<AdminAnalyticsQueue> {
    return this.analytics.getQueue();
  }
}
