import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VolunteerLocationDto {
  @ApiPropertyOptional({
    description: '2-digit wilaya code',
    example: '16',
    pattern: '^\\d{2}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/, { message: 'wilayaId must be a 2-digit wilaya code' })
  wilayaId?: string;

  @ApiPropertyOptional({
    description: '4-digit municipality code',
    example: '1601',
    pattern: '^\\d{4}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'municipalityId must be a 4-digit municipality code',
  })
  municipalityId?: string;
}

export class UpdateVolunteerProfileDto {
  @ApiPropertyOptional({ example: 'Amine', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Benali', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Volunteer since 2024', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ type: VolunteerLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VolunteerLocationDto)
  location?: VolunteerLocationDto;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Own media id with purpose=avatar',
  })
  @IsOptional()
  @IsMongoId()
  avatar?: string;

  @ApiPropertyOptional({ type: String, format: 'ObjectId' })
  @IsOptional()
  @IsMongoId()
  banner?: string;
}

export class PublicProfileDto {
  @ApiPropertyOptional({
    description: 'Master toggle for the public profile',
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showAvatar?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showBiography?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showSkills?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showExperiences?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showAvailability?: boolean;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @IsBoolean()
  showPortfolio?: boolean;
}

/** A5 privacy flags; the payload is `{ publicProfile: {...} }` (only these keys). */
export class UpdatePublicSettingsDto {
  @ApiProperty({ type: PublicProfileDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PublicProfileDto)
  publicProfile!: PublicProfileDto;
}
