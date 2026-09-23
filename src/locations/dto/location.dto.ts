import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationType } from '../schemas/location.schema';

export class CreateLocationDto {
  @ApiProperty({ example: '16', maxLength: 10 })
  @IsString()
  @Length(1, 10)
  code!: string;

  @ApiProperty({ enum: ['wilaya', 'municipality'] })
  @IsEnum(['wilaya', 'municipality'])
  type!: LocationType;

  @ApiPropertyOptional({
    description: 'Required when type=municipality',
    example: '16',
  })
  @ValidateIf((o) => o.type === 'municipality')
  @IsString()
  @Length(1, 10)
  parentCode?: string;

  @ApiProperty({ example: 'الجزائر' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ example: 'Alger' })
  @IsString()
  @IsNotEmpty()
  nameFr!: string;

  @ApiPropertyOptional({ description: 'Legacy administrative code' })
  @IsOptional()
  @IsString()
  legacyId?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 'الجزائر' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @ApiPropertyOptional({ example: 'Alger' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameFr?: string;

  @ApiPropertyOptional({ description: 'Legacy administrative code' })
  @IsOptional()
  @IsString()
  legacyId?: string;
}
