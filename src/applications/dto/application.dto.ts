import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { APPLICATION_STATUSES } from '../schemas/application.schema';

export class ApplicationListQueryDto {
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class OpportunityApplicationsQueryDto {
  @IsOptional()
  @IsMongoId()
  positionId?: string;

  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class RejectApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
