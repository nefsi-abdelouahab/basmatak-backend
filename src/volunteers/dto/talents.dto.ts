import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Public talents feed query (roadmap S12). Bounded `q`, facet filters
 * (`skillId`, `categoryId`, `wilayaId`) and S1 cursor paging (`cursor`,
 * `limit` as a string, clamped by the pagination util).
 */
export class TalentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsMongoId()
  skillId?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  wilayaId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

/** Public experiences listing query (roadmap S12): S1 cursor paging only. */
export class PublicExperiencesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
