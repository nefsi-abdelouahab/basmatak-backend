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
import {
  PORTFOLIO_VISIBILITIES,
  PortfolioVisibility,
} from '../schemas/portfolio-item.schema';

/** Body of `POST /portfolio/me` (inventory §2.15). */
export class CreatePortfolioItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsIn(PORTFOLIO_VISIBILITIES)
  visibility?: PortfolioVisibility;
}

/** Body of `PATCH /portfolio/:itemId` (inventory §2.15). */
export class UpdatePortfolioItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsIn(PORTFOLIO_VISIBILITIES)
  visibility?: PortfolioVisibility;
}

/** Body of `PUT /portfolio/me/order` (inventory §2.15, atomic batch). */
export class ReorderPortfolioDto {
  @IsArray()
  @IsMongoId({ each: true })
  itemIds!: string[];
}
