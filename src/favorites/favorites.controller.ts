import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
  CurrentAccount,
  Public,
  Roles,
} from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  FavoritesListQueryDto,
  FavoritesLookupQueryDto,
} from './dto/favorites-query.dto';
import { FavoritesService } from './favorites.service';

/**
 * Favorites controller (Session 17 `backend-v2-favorites`). Full paths on a
 * bare `@Controller()` so no shared controller file is touched. Toggle and
 * list routes require the volunteer role (guests 401 via the global guard —
 * decision 10, no new logic); `lookup` is guest-tolerant via
 * `OptionalJwtAuthGuard` and answers counts-only for anonymous callers.
 */
@ApiBearerAuth()
@ApiTags('favorites')
@Controller()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @ApiParam({
    name: 'id',
    description: 'Opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Post('favorites/opportunities/:id')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Save an opportunity (idempotent)' })
  async saveOpportunity(
    @CurrentAccount() account: AccountToken,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.favorites.saveOpportunity(account.sub, id);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      favorited: true,
      favoriteCount: result.favoriteCount,
    };
  }

  @ApiParam({
    name: 'id',
    description: 'Opportunity id',
    type: String,
    format: 'ObjectId',
  })
  @Delete('favorites/opportunities/:id')
  @Roles('volunteer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsave an opportunity (idempotent)' })
  async removeOpportunity(
    @CurrentAccount() account: AccountToken,
    @Param('id') id: string,
  ): Promise<void> {
    await this.favorites.removeOpportunity(account.sub, id);
  }

  @ApiParam({
    name: 'username',
    description: 'Volunteer username',
    type: String,
  })
  @Post('favorites/talents/:username')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Save a talent by username (idempotent)' })
  async saveTalent(
    @CurrentAccount() account: AccountToken,
    @Param('username') username: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.favorites.saveTalent(account.sub, username);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      favorited: true,
      favoriteCount: result.favoriteCount,
    };
  }

  @ApiParam({
    name: 'username',
    description: 'Volunteer username',
    type: String,
  })
  @Delete('favorites/talents/:username')
  @Roles('volunteer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsave a talent by username (idempotent)' })
  async removeTalent(
    @CurrentAccount() account: AccountToken,
    @Param('username') username: string,
  ): Promise<void> {
    await this.favorites.removeTalent(account.sub, username);
  }

  @Get('favorites')
  @Roles('volunteer')
  @ApiOperation({ summary: "List the caller's saves (both target types)" })
  listOwn(
    @CurrentAccount() account: AccountToken,
    @Query() query: FavoritesListQueryDto,
  ) {
    return this.favorites.listOwn(account.sub, query);
  }

  @Get('favorites/counts')
  @Roles('volunteer')
  @ApiOperation({ summary: "The caller's per-type save totals" })
  countsOwn(@CurrentAccount() account: AccountToken) {
    return this.favorites.countsOwn(account.sub);
  }

  @Get('favorites/lookup')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Batch card state ({ favorited, favoriteCount } per key)',
  })
  lookup(
    @Query() query: FavoritesLookupQueryDto,
    @CurrentAccount() account?: AccountToken,
  ) {
    return this.favorites.lookup(query, account?.sub);
  }
}
