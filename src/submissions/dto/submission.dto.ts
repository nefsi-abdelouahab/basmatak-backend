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

const OBJECT_ID = /^[0-9a-f]{24}$/;

export const SUBMISSION_FORMATS = [
  'image',
  'video',
  'document',
  'link',
] as const;

export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];

export const SUBMISSION_INBOX_SORTS = ['newest', 'oldest'] as const;

export type SubmissionInboxSort = (typeof SUBMISSION_INBOX_SORTS)[number];

export class CreateSubmissionDto {
  @ApiPropertyOptional({
    description: 'Optional contribution title',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class UpdateSubmissionDto {
  @ApiPropertyOptional({
    description: 'Contribution title',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

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

  @ApiPropertyOptional({
    description:
      'Submission status(es); single or comma-separated multi-status (e.g. submitted,under_review)',
    example: 'submitted,under_review',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @Matches(OBJECT_ID)
  opportunityId?: string;

  @ApiPropertyOptional({
    description:
      'Text search over title, description and deliverable titles (org inbox)',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by evidence format (image, video, document, link)',
    enum: SUBMISSION_FORMATS,
  })
  @IsOptional()
  @IsIn(SUBMISSION_FORMATS)
  format?: SubmissionFormat;

  @ApiPropertyOptional({
    description: 'Server-defined sort whitelist',
    enum: SUBMISSION_INBOX_SORTS,
  })
  @IsOptional()
  @IsIn(SUBMISSION_INBOX_SORTS)
  sort?: SubmissionInboxSort;
}
