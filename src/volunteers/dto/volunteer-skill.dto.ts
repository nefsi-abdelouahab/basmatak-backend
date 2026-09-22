import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class AddVolunteerSkillDto {
  @IsMongoId()
  skillId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  level!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  yearsOfExperience?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateVolunteerSkillDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  yearsOfExperience?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
