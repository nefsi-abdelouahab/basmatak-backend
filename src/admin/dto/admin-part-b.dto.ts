import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OPPORTUNITY_STATUSES,
  OpportunityStatus,
} from '../../opportunities/schemas/opportunity.schema';
import {
  REPORT_PRIORITIES,
  REPORT_TARGET_TYPES,
  ReportPriority,
  ReportStatus,
  ReportTargetType,
} from '../../reports/report.schema';
import { ModerationActionDto } from './moderation-action.dto';

export class OpportunitiesQueryDto {
  @ApiPropertyOptional({
    description: 'Title/slug/registryId keyword',
    maxLength: 254,
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ enum: OPPORTUNITY_STATUSES })
  @IsOptional()
  @IsIn(OPPORTUNITY_STATUSES)
  status?: OpportunityStatus;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  organizationId?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'title'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'title'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class OpportunityStatusDto {
  @ApiProperty({ enum: ['closed', 'cancelled'] })
  @IsIn(['closed', 'cancelled'])
  status!: 'closed' | 'cancelled';

  @ApiPropertyOptional({
    description: 'Short reason recorded in status_histories',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Longer context recorded in status_histories',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReportsQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'in_review', 'resolved', 'dismissed'] })
  @IsOptional()
  @IsIn(['open', 'in_review', 'resolved', 'dismissed'])
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: REPORT_TARGET_TYPES })
  @IsOptional()
  @IsIn(REPORT_TARGET_TYPES)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ enum: REPORT_PRIORITIES })
  @IsOptional()
  @IsIn(REPORT_PRIORITIES)
  priority?: ReportPriority;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  assignedAdminId?: string;

  @ApiPropertyOptional({ description: 'Title/reason keyword', maxLength: 254 })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ description: 'Created-at window start (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Created-at window end (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'priority'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'priority'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class ReportStatusDto {
  @ApiProperty({ enum: ['in_review', 'resolved', 'dismissed'] })
  @IsIn(['in_review', 'resolved', 'dismissed'])
  status!: 'in_review' | 'resolved' | 'dismissed';

  @ApiPropertyOptional({ description: 'Resolution notes', maxLength: 4000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  resolution?: string;

  @ApiPropertyOptional({
    description:
      'Optional moderation consequence executed atomically with a `resolved` status (Session 20). Requires `resolution`. Without `action` the route resolves/dismisses exactly as before.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ModerationActionDto)
  action?: ModerationActionDto;
}

export class AuditLogsQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Actor user id',
  })
  @IsOptional()
  @IsMongoId()
  actor?: string;

  @ApiPropertyOptional({
    description: 'Entity type, e.g. opportunity',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  entityId?: string;

  @ApiPropertyOptional({ description: 'ISO date filter' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Action/path keyword', maxLength: 254 })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest'],
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}
export class SettingsValueDto {
  @ApiProperty({
    description:
      'Value stored under the setting key (shape validated per key by the settings service)',
    example: 3,
  })
  @IsDefined()
  value!: unknown;
}

export class MaintenanceToggleDto {
  @ApiProperty({ description: 'Switch maintenance mode on or off' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: 'Neutral message shown on 503s and system status',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

/** Read one entity's status history (both params required). */
export class StatusHistoriesQueryDto {
  @ApiPropertyOptional({ description: 'Entity type, e.g. user' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Alias of limit' })
  @IsOptional()
  @IsString()
  pageSize?: string;
}
