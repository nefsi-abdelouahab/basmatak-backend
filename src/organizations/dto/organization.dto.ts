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

export class OrganizationListQueryDto {
  @ApiPropertyOptional({
    description: 'Bounded public search (name/slug)',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Legacy roadmap `page` input — accepted but ignored; pagination stays cursor-based and `page` is returned as response metadata',
  })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
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
