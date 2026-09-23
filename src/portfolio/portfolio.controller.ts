import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  CreatePortfolioItemDto,
  ReorderPortfolioDto,
  UpdatePortfolioItemDto,
} from './dto/portfolio.dto';
import { PortfolioService } from './portfolio.service';

/**
 * Portfolio controller (inventory §2.15, roadmap S14): the volunteer's curated
 * showcase. All routes require a volunteer token; the guest read lives on the
 * volunteers controller (`GET /volunteers/:username/portfolio`).
 */
@ApiBearerAuth()
@ApiTags('portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get('me')
  @Roles('volunteer')
  @ApiOperation({ summary: "List the caller's own curated portfolio items" })
  listMine(@CurrentAccount() account: AccountToken) {
    return this.portfolio.listMine(account);
  }

  @Post('me')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Create a portfolio item with media linkage' })
  create(
    @CurrentAccount() account: AccountToken,
    @Body() dto: CreatePortfolioItemDto,
  ) {
    return this.portfolio.create(account, dto);
  }

  @Put('me/order')
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Atomically reorder the whole portfolio (Mongo batch)',
  })
  reorder(
    @CurrentAccount() account: AccountToken,
    @Body() dto: ReorderPortfolioDto,
  ) {
    return this.portfolio.reorder(account, dto);
  }

  @ApiParam({
    name: 'itemId',
    description: 'The portfolio item id',
    type: String,
    format: 'ObjectId',
  })
  @Patch(':itemId')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Update an owned portfolio item' })
  update(
    @CurrentAccount() account: AccountToken,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePortfolioItemDto,
  ) {
    return this.portfolio.update(account, itemId, dto);
  }

  @ApiParam({
    name: 'itemId',
    description: 'The portfolio item id',
    type: String,
    format: 'ObjectId',
  })
  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Delete an owned item and clear its media linkage',
  })
  async remove(
    @CurrentAccount() account: AccountToken,
    @Param('itemId') itemId: string,
  ) {
    await this.portfolio.delete(account, itemId);
  }
}
