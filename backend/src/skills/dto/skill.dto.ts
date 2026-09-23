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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSkillCategoryDto {
  @ApiProperty({ example: 'صحة وإسعافات أولية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ example: 'First Aid & Health' })
  @IsString()
  @IsNotEmpty()
  nameFr!: string;

  @ApiProperty({ description: 'Order in the list', example: 1, minimum: 0 })
  @IsInt()
  @Min(0)
  order!: number;
}

export class UpdateSkillCategoryDto {
  @ApiPropertyOptional({ example: 'صحة وإسعافات أولية' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @ApiPropertyOptional({ example: 'First Aid & Health' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameFr?: string;

  @ApiPropertyOptional({ description: 'Order in the list', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    description: 'Deactivate instead of delete',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateSkillDto {
  @ApiProperty({ example: 'إسعافات أولية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ example: 'First aid' })
  @IsString()
  @IsNotEmpty()
  nameFr!: string;

  @ApiProperty({ description: 'Order within the category', minimum: 0 })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiProperty({
    type: String,
    format: 'ObjectId',
    description: 'Owning skill category',
  })
  @IsMongoId()
  categoryId!: string;
}

export class UpdateSkillDto {
  @ApiPropertyOptional({ example: 'إسعافات أولية' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @ApiPropertyOptional({ example: 'First aid' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameFr?: string;

  @ApiPropertyOptional({ description: 'Order within the category', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    description: 'Deactivate instead of delete',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Owning skill category',
  })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}

export class SkillQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Skill category id',
  })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Keyword on skill names',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
