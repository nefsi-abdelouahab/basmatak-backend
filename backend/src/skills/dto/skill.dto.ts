import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSkillCategoryDto {
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @IsString()
  @IsNotEmpty()
  nameFr!: string;

  @IsInt()
  @Min(0)
  order!: number;
}

export class UpdateSkillCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameFr?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @IsString()
  @IsNotEmpty()
  nameFr!: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsMongoId()
  categoryId!: string;
}

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameFr?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}

export class SkillQueryDto {
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
