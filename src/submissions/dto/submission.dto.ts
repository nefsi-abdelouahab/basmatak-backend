import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SUBMISSION_STATUSES } from '../schemas/submission.schema';

const OBJECT_ID = /^[0-9a-f]{24}$/;

export class UpdateSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(OBJECT_ID, { each: true })
  evidence?: string[];

  @IsOptional()
  @IsBoolean()
  consentConfirmed?: boolean;
}

export class SubmitDto {
  @IsOptional()
  @IsBoolean()
  consentConfirmed?: boolean;
}

export class SubmissionListQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsIn(SUBMISSION_STATUSES)
  status?: string;

  @IsOptional()
  @Matches(OBJECT_ID)
  opportunityId?: string;
}
