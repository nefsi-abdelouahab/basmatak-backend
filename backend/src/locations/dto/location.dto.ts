import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { LocationType } from '../schemas/location.schema';

export class CreateLocationDto {
  @IsString()
  @Length(1, 10)
  code!: string;

  @IsEnum(['wilaya', 'municipality'])
  type!: LocationType;

  @ValidateIf((o) => o.type === 'municipality')
  @IsString()
  @Length(1, 10)
  parentCode?: string;

  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @IsString()
  @IsNotEmpty()
  nameFr!: string;

  @IsOptional()
  @IsString()
  legacyId?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameAr?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nameFr?: string;

  @IsOptional()
  @IsString()
  legacyId?: string;
}
