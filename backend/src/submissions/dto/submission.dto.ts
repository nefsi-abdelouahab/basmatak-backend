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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUBMISSION_STATUSES } from '../schemas/submission.schema';

const OBJECT_ID = /^[0-9a-f]{24}$/;

export class UpdateSubmissionDto {
  @ApiPropertyOptional({ description: 'Work description', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Evidence media ids (max 50)',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(OBJECT_ID, { each: true })
  evidence?: string[];

  @ApiPropertyOptional({
    description:
      'Consent for people shown in media (required when evidence includes image/video)',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  consentConfirmed?: boolean;
}

export class SubmitDto {
  @ApiPropertyOptional({
    description: 'Consent for people shown in evidence media',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  consentConfirmed?: boolean;
}

export class SubmissionListQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES })
  @IsOptional()
  @IsIn(SUBMISSION_STATUSES)
  status?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @Matches(OBJECT_ID)
  opportunityId?: string;
}
