import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * PATCH /users/me: contact fields only. `role` and `status` are intentionally
 * absent — the validation pipe's `forbidNonWhitelisted` rejects them.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;
}
