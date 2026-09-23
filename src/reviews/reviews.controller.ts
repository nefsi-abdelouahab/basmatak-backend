import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAccount, Roles } from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { CreateReviewDto, ReviewListQueryDto } from './dto/review.dto';
import { ReviewModel } from './review.schema';
import { ReviewsService } from './reviews.service';

/**
 * Reviews controller (inventory §2.16, roadmap S13 owner-split / F16):
 * the owning organization reviews a verified submission, and the two
 * §2.16 list routes. `/me` routes keep their static prefix so `me` is never
 * swallowed by the organizations `:slug` catch-all (route-order trap).
 */
@ApiBearerAuth()
@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @ApiParam({
    name: 'submissionId',
    description: 'The submission id',
    type: String,
    format: 'ObjectId',
  })
  @Post('submissions/:submissionId/review')
  @Roles('organization')
  @ApiOperation({
    summary: 'Review a verified submission (owning organization)',
  })
  write(
    @CurrentAccount() account: AccountToken,
    @Param('submissionId') submissionId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewModel> {
    return this.reviews.writeReview(account, submissionId, dto);
  }

  @Get('volunteers/me/reviews')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Reviews the caller has received' })
  listReceived(
    @CurrentAccount() account: AccountToken,
    @Query() query: ReviewListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    return this.reviews.listReceived(account, query);
  }

  @Get('organizations/me/reviews')
  @Roles('organization')
  @ApiOperation({ summary: "Reviews the caller's organization has given" })
  listGiven(
    @CurrentAccount() account: AccountToken,
    @Query() query: ReviewListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    return this.reviews.listGiven(account, query);
  }
}
