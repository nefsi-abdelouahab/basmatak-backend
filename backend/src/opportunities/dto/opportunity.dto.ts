import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBooleanString,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FEED_SORTS = [
  'newest',
  'oldest',
  'deadline_asc',
  'startDate_asc',
] as const;

export type FeedSort = (typeof FEED_SORTS)[number];

export const OWN_OPPORTUNITY_SORTS = ['newest', 'oldest'] as const;

export type OwnOpportunitySort = (typeof OWN_OPPORTUNITY_SORTS)[number];

export const OPPORTUNITY_MODES = ['onsite', 'remote', 'hybrid'] as const;

export type OpportunityMode = (typeof OPPORTUNITY_MODES)[number];

/** Bounds for the free-text string arrays (prerequisites, deliverables). */
export const MAX_PREREQUISITES = 20;
export const MAX_PREREQUISITE_LENGTH = 500;
export const MAX_DELIVERABLES = 20;
export const MAX_DELIVERABLE_LENGTH = 500;

export class LocationDto {
  @ApiPropertyOptional({ description: 'Wilaya code (01-58)', example: '16' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  wilayaId?: string;

  @ApiPropertyOptional({
    description: 'Municipality code (4 digits)',
    example: '1601',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  municipalityId?: string;

  @ApiPropertyOptional({
    description: 'Geo coordinates [lng, lat]',
    type: 'array',
    minItems: 2,
    maxItems: 2,
    items: { type: 'number' },
    example: [3.05, 36.75],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  @Min(-180, { each: true })
  @Max(180, { each: true })
  coordinates?: [number, number];
}

export class CreatePositionDto {
  @ApiProperty({ example: 'Distribute hygiene kits', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    example: 'Help 3 families in Algiers',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Number of seats', example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  requiredCount!: number;

  @ApiPropertyOptional({
    description: 'Skill ids required for this position',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional({
    description: 'Expected contributions / deliverables for this position',
    type: 'array',
    items: { type: 'string', maxLength: MAX_DELIVERABLE_LENGTH },
    maxItems: MAX_DELIVERABLES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DELIVERABLES)
  @IsString({ each: true })
  @MaxLength(MAX_DELIVERABLE_LENGTH, { each: true })
  deliverables?: string[];

  @ApiPropertyOptional({ description: 'Optional per-position schedule start' })
  @IsOptional()
  @IsDateString()
  startAt?: string;
}

export class UpdatePositionDto {
  @ApiPropertyOptional({ example: 'Distribute hygiene kits', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    example: 'Help 3 families in Algiers',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Seats; never below the filled count',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredCount?: number;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    description: 'Skill ids required for this position',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional({
    description: 'Expected contributions / deliverables for this position',
    type: 'array',
    items: { type: 'string', maxLength: MAX_DELIVERABLE_LENGTH },
    maxItems: MAX_DELIVERABLES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DELIVERABLES)
  @IsString({ each: true })
  @MaxLength(MAX_DELIVERABLE_LENGTH, { each: true })
  deliverables?: string[];

  @ApiPropertyOptional({ description: 'Optional per-position schedule start' })
  @IsOptional()
  @IsDateString()
  startAt?: string;
}

export class CreateOpportunityDto {
  @ApiProperty({ example: 'Ramadan food distribution', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    example: 'Help distribute meal boxes in Algiers',
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Skill category id',
  })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'ISO date; past starts auto-start (job)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'ISO date; must not precede startDate',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Real duration in minutes (positive int)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Participation mode',
    enum: OPPORTUNITY_MODES,
  })
  @IsOptional()
  @IsIn(OPPORTUNITY_MODES)
  mode?: OpportunityMode;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Cover media id (purpose opportunity_cover)',
  })
  @IsOptional()
  @IsMongoId()
  coverMediaId?: string;

  @ApiPropertyOptional({
    description: 'Prerequisites for volunteers',
    type: 'array',
    items: { type: 'string', maxLength: MAX_PREREQUISITE_LENGTH },
    maxItems: MAX_PREREQUISITES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PREREQUISITES)
  @IsString({ each: true })
  @MaxLength(MAX_PREREQUISITE_LENGTH, { each: true })
  prerequisites?: string[];

  @ApiPropertyOptional({ description: 'Last day applications are accepted' })
  @IsOptional()
  @IsDateString()
  applicationDeadline?: string;

  @ApiPropertyOptional({ type: LocationDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({
    type: 'array',
    items: { $ref: '#/components/schemas/CreatePositionDto' },
    minItems: 1,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePositionDto)
  positions?: CreatePositionDto[];
}

/**
 * PATCH body. `slug`, `organizationId`, `status` and `positions` are never
 * allowed here; the global pipe's `forbidNonWhitelisted` rejects attempts.
 */
export class UpdateOpportunityDto {
  @ApiPropertyOptional({ example: 'Ramadan food distribution', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    example: 'Help distribute meal boxes in Algiers',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'ISO date; must not precede startDate',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Real duration in minutes (positive int)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Participation mode (pre-publish only)',
    enum: OPPORTUNITY_MODES,
  })
  @IsOptional()
  @IsIn(OPPORTUNITY_MODES)
  mode?: OpportunityMode;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Cover media id (purpose opportunity_cover)',
  })
  @IsOptional()
  @IsMongoId()
  coverMediaId?: string;

  @ApiPropertyOptional({
    description: 'Prerequisites for volunteers (pre-publish only)',
    type: 'array',
    items: { type: 'string', maxLength: MAX_PREREQUISITE_LENGTH },
    maxItems: MAX_PREREQUISITES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PREREQUISITES)
  @IsString({ each: true })
  @MaxLength(MAX_PREREQUISITE_LENGTH, { each: true })
  prerequisites?: string[];

  @ApiPropertyOptional({
    description: 'ISO date (forward-only once published)',
  })
  @IsOptional()
  @IsDateString()
  applicationDeadline?: string;

  @ApiPropertyOptional({ type: LocationDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}

export class OpportunityFeedQueryDto {
  @ApiPropertyOptional({
    description: 'Keyword on title/description',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Skill category id(s), comma-separated for multi-select',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  categoryId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Skill id(s), comma-separated for multi-select',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  skillId?: string;

  @ApiPropertyOptional({
    example: '16',
    description: 'Wilaya code(s), comma-separated for multi-select',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  wilayaId?: string;

  @ApiPropertyOptional({
    example: '1601',
    description: 'Municipality code(s), comma-separated for multi-select',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  municipalityId?: string;

  @ApiPropertyOptional({ description: 'Start-date lower bound (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Start-date upper bound (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Only opportunities with at least one open seat',
    type: 'boolean',
  })
  @IsOptional()
  @IsBooleanString()
  hasOpenPositions?: string;

  @ApiPropertyOptional({
    description: 'Restrict to the caller volunteer wilaya (`me` only)',
    enum: ['me'],
  })
  @IsOptional()
  @IsIn(['me'])
  nearMe?: string;

  @ApiPropertyOptional({
    description: 'Server-defined sort whitelist',
    enum: FEED_SORTS,
  })
  @IsOptional()
  @IsIn(FEED_SORTS)
  sort?: FeedSort;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class OwnOpportunityQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by opportunity status',
    enum: [
      'draft',
      'published',
      'in_progress',
      'completed',
      'closed',
      'cancelled',
    ],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Title/location/skill keyword (own rows)',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description: 'Server-defined sort whitelist',
    enum: OWN_OPPORTUNITY_SORTS,
  })
  @IsOptional()
  @IsIn(OWN_OPPORTUNITY_SORTS)
  sort?: OwnOpportunitySort;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

/** Recommended feed query (roadmap S12): S1 cursor paging only. */
export class RecommendedQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}
