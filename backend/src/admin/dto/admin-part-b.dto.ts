import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpportunitiesQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class OpportunityStatusDto {
  @ApiProperty({ enum: ['closed', 'cancelled'] })
  @IsIn(['closed', 'cancelled'])
  status!: 'closed' | 'cancelled';
}

export class ReportsQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'in_review', 'resolved', 'dismissed'] })
  @IsOptional()
  @IsIn(['open', 'in_review', 'resolved', 'dismissed'])
  status?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
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

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class SettingsValueDto {
  @ApiProperty({
    description: 'Numeric value stored under the setting key',
    example: 3,
    type: 'number',
  })
  @IsNumber({ allowInfinity: false })
  value!: number;
}
