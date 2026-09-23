import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PORTFOLIO_VISIBILITIES,
  PortfolioVisibility,
} from '../schemas/portfolio-item.schema';

/** Body of `POST /portfolio/me` (inventory §2.15). */
export class CreatePortfolioItemDto {
  @ApiProperty({ example: 'Beach cleanup 2026', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({
    example: 'Photo of the team at work',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Own media ids (max 50)',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({ enum: PORTFOLIO_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn(PORTFOLIO_VISIBILITIES)
  visibility?: PortfolioVisibility;
}

/** Body of `PATCH /portfolio/:itemId` (inventory §2.15). */
export class UpdatePortfolioItemDto {
  @ApiPropertyOptional({ example: 'Beach cleanup 2026', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({
    example: 'Photo of the team at work',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Own media ids (max 50)',
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({ enum: PORTFOLIO_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn(PORTFOLIO_VISIBILITIES)
  visibility?: PortfolioVisibility;
}

/** Body of `PUT /portfolio/me/order` (inventory §2.15, atomic batch). */
export class ReorderPortfolioDto {
  @ApiProperty({
    description: 'All item ids in the desired display order',
    type: 'array',
    items: { type: 'string' },
  })
  @IsArray()
  @IsMongoId({ each: true })
  itemIds!: string[];
}
