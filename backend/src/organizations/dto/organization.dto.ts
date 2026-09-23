import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'جمعية الأمل', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'Association El-Amel', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameFr?: string;

  @ApiPropertyOptional({
    example: 'Volunteer charity in Algiers',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'ObjectId',
    description: 'Own media id',
  })
  @IsOptional()
  @IsMongoId()
  logoMediaId?: string;
}

export class SubmitOrganizationVerificationDto {
  @ApiProperty({
    description: 'Verification document media ids (at least one)',
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  documents!: string[];
}
