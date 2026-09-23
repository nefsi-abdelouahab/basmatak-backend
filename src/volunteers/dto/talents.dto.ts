import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Public talents feed query (roadmap S12). Bounded `q`, facet filters
 * (`skillId`, `categoryId`, `wilayaId`) and S1 cursor paging (`cursor`,
 * `limit` as a string, clamped by the pagination util).
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
    format: 'ObjectId',
    description: 'Skill id',
  })
  @IsOptional()
  @IsMongoId()
  skillId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Skill category id',
  })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ description: '2-digit wilaya code', example: '16' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  wilayaId?: string;

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
