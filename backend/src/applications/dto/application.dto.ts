import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { APPLICATION_STATUSES } from '../schemas/application.schema';

export class ApplyApplicationDto {
  @ApiPropertyOptional({
    description:
      'Optional cover message ("why I want to participate"), trimmed and stored on the application; immutable after apply',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class ApplicationListQueryDto {
  @ApiPropertyOptional({ enum: APPLICATION_STATUSES })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description: 'Opaque base64 cursor from the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class OpportunityApplicationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by embedded position id',
    type: String,
    format: 'ObjectId',
  })
  @IsOptional()
  @IsMongoId()
  positionId?: string;

  @ApiPropertyOptional({ enum: APPLICATION_STATUSES })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description: 'Opaque base64 cursor from the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class OrganizationApplicationsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by a single opportunity',
    type: String,
    format: 'ObjectId',
  })
  @IsOptional()
  @IsMongoId()
  opportunityId?: string;

  @ApiPropertyOptional({ enum: APPLICATION_STATUSES })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description:
      'Text search over the org\u2019s own opportunity / position titles (caller-name search lands with the Session 17 name join)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Opaque base64 cursor from the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class RejectApplicationDto {
  @ApiProperty({ example: 'Position already filled', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
