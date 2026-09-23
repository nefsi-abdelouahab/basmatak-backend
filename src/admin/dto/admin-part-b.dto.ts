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

export class OpportunitiesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class OpportunityStatusDto {
  @IsIn(['closed', 'cancelled'])
  status!: 'closed' | 'cancelled';
}

export class ReportsQueryDto {
  @IsOptional()
  @IsIn(['open', 'in_review', 'resolved', 'dismissed'])
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class ReportStatusDto {
  @IsIn(['in_review', 'resolved', 'dismissed'])
  status!: 'in_review' | 'resolved' | 'dismissed';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  resolution?: string;
}

export class AuditLogsQueryDto {
  @IsOptional()
  @IsMongoId()
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @IsMongoId()
  entityId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class SettingsValueDto {
  @IsNumber({ allowInfinity: false })
  value!: number;
}
