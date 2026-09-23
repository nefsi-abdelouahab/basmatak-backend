import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * PATCH /users/me: contact fields only. `role` and `status` are intentionally
 * absent — the validation pipe's `forbidNonWhitelisted` rejects them.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'new@example.com', maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+213555123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;
}
