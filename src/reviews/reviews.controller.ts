import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentAccount,
  Public,
  Roles,
} from '../common/decorators/auth.decorators';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { BusinessException } from '../common/exceptions/business.exception';
import { VolunteersService } from '../volunteers/volunteers.service';
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
  constructor(
    private readonly reviews: ReviewsService,
    private readonly volunteers: VolunteersService,
  ) {}

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

  /**
   * Public reviews of a volunteer (Session 9, visible rows only). Registered
   * AFTER `volunteers/me/reviews` in this controller so the static `me` route
   * wins over the `:username` catch-all (same route-order trap as above).
   */
  @ApiParam({
    name: 'username',
    description: 'Volunteer username',
    type: String,
  })
  @Get('volunteers/:username/reviews')
  @Public()
  @ApiOperation({
    summary: 'Public reviews of a volunteer (visible rows only)',
  })
  async publicReviews(
    @Param('username') username: string,
    @Query() query: ReviewListQueryDto,
  ) {
    const profile =
      await this.volunteers.findEnabledProfileByUsername(username);
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return this.volunteers.getPublicReviews(
      profile.userId.toString(),
      query.limit,
      query.cursor,
    );
  }
}
