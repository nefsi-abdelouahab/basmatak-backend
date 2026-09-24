import {
  IsBooleanString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const TALENT_SORTS = ['newest', 'oldest', 'experiences_desc'] as const;

export type TalentSort = (typeof TALENT_SORTS)[number];

/**
 * Public talents feed query (roadmap S12 + Session 7). Bounded `q`, facet filters
 * (`skillId`, `categoryId`, `wilayaId`) plus Session 7 multi-select
 * (`skillIds`, `wilayaIds`), thresholds (`minExperiences`, `hasAvailability`,
 * `portfolio`), validated `sort`, and S1 cursor paging (`cursor`, `limit`).
 */
export class TalentsQueryDto {
  @ApiPropertyOptional({
    description: 'Matches username, names and bio',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Skill id(s); single or comma-separated multi-select',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  skillId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Skill category id(s); single or comma-separated',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Wilaya code(s); single or comma-separated multi-select',
    example: '16',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  wilayaId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Multi-select skill ids (comma-separated)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  skillIds?: string;

  @ApiPropertyOptional({
    description: 'Multi-select wilaya codes (comma-separated)',
    example: '16,31',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  wilayaIds?: string;

  @ApiPropertyOptional({
    description: 'Minimum verified experiences (roadmap talents filter)',
  })
  @IsOptional()
  @IsString()
  minExperiences?: string;

  @ApiPropertyOptional({
    description: 'Only volunteers with availability set',
    type: 'boolean',
  })
  @IsOptional()
  @IsBooleanString()
  hasAvailability?: string;

  @ApiPropertyOptional({
    description: 'Only volunteers with at least one portfolio item',
    type: 'boolean',
  })
  @IsOptional()
  @IsBooleanString()
  portfolio?: string;

  @ApiPropertyOptional({
    description: 'Server-defined sort whitelist',
    enum: TALENT_SORTS,
  })
  @IsOptional()
  @IsIn(TALENT_SORTS)
  sort?: TalentSort;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

/** Public experiences listing query (roadmap S12): S1 cursor paging only. */
export class PublicExperiencesQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}
