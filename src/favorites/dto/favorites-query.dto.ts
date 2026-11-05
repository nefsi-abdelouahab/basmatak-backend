import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FAVORITE_TARGET_TYPES,
  FavoriteTargetType,
} from '../schemas/favorite.schema';

export class FavoritesListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by target type',
    enum: FAVORITE_TARGET_TYPES,
  })
  @IsOptional()
  @IsIn(FAVORITE_TARGET_TYPES)
  targetType?: FavoriteTargetType;

  @ApiPropertyOptional({ description: 'Opaque base64 cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (default 20, max 50)' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class FavoritesLookupQueryDto {
  @ApiProperty({
    description: 'Target type for every requested key',
    enum: FAVORITE_TARGET_TYPES,
  })
  @IsIn(FAVORITE_TARGET_TYPES)
  targetType!: FavoriteTargetType;

  @ApiProperty({
    description:
      'Comma-separated keys (opportunity ObjectIds, talent usernames, or organization slugs); 1–50',
    example: '69123456789abcdef01234567,another-id',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  targetIds!: string;
}
