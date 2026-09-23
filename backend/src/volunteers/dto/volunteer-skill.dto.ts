import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddVolunteerSkillDto {
  @ApiProperty({
    type: String,
    format: 'ObjectId',
    description: 'Seeded skill id',
  })
  @IsMongoId()
  skillId!: string;

  @ApiProperty({
    description: '1-5 proficiency level',
    example: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  level!: number;

  @ApiPropertyOptional({
    description: 'Years of experience',
    example: 2,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    description: 'Only one skill can be primary',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateVolunteerSkillDto {
  @ApiPropertyOptional({
    description: '1-5 proficiency level',
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  @ApiPropertyOptional({
    description: 'Years of experience',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    description: 'Only one skill can be primary',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
