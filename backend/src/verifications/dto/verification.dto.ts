import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EXPERIENCE_VISIBILITIES } from '../schemas/volunteer-experience.schema';

/** In-transaction review payload (F16/D9 step 6). */
export class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class VerifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewDto)
  review?: ReviewDto;
}

export class RejectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class UpdateExperienceVisibilityDto {
  @IsIn(EXPERIENCE_VISIBILITIES)
  publicVisibility!: (typeof EXPERIENCE_VISIBILITIES)[number];
}

export class ExperienceListQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
