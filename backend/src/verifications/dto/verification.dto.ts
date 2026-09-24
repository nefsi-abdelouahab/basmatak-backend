import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EXPERIENCE_VISIBILITIES } from '../schemas/volunteer-experience.schema';

/** In-transaction review payload (F16/D9 step 6). */
export class ReviewDto {
  @ApiProperty({
    description: '1-5 rating',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ example: 'Great work', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class VerifyDto {
  @ApiPropertyOptional({ example: 'Verified on site', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    type: ReviewDto,
    description: 'Optional in-transaction review',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewDto)
  review?: ReviewDto;
}

export class RejectDto {
  @ApiProperty({
    example: 'Evidence does not match the deliverable',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

export class UpdateExperienceVisibilityDto {
  @ApiProperty({ enum: EXPERIENCE_VISIBILITIES })
  @IsIn(EXPERIENCE_VISIBILITIES)
  publicVisibility!: (typeof EXPERIENCE_VISIBILITIES)[number];
}

export class ExperienceListQueryDto {
  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  skillId?: string;

  @ApiPropertyOptional({ description: 'Created-at lower bound (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Created-at upper bound (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
