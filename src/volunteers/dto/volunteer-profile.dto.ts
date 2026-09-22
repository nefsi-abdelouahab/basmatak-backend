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

export class VolunteerLocationDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/, { message: 'wilayaId must be a 2-digit wilaya code' })
  wilayaId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'municipalityId must be a 4-digit municipality code',
  })
  municipalityId?: string;
}

export class UpdateVolunteerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VolunteerLocationDto)
  location?: VolunteerLocationDto;

  @IsOptional()
  @IsMongoId()
  avatar?: string;

  @IsOptional()
  @IsMongoId()
  banner?: string;
}

export class PublicProfileDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  showAvatar?: boolean;

  @IsOptional()
  @IsBoolean()
  showBiography?: boolean;

  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @IsOptional()
  @IsBoolean()
  showSkills?: boolean;

  @IsOptional()
  @IsBoolean()
  showExperiences?: boolean;

  @IsOptional()
  @IsBoolean()
  showAvailability?: boolean;

  @IsOptional()
  @IsBoolean()
  showPortfolio?: boolean;
}

/** A5 privacy flags; the payload is `{ publicProfile: {...} }` (only these keys). */
export class UpdatePublicSettingsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PublicProfileDto)
  publicProfile!: PublicProfileDto;
}
