import { Controller, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/auth.decorators';
import { ReviewModel } from '../reviews/review.schema';
import { AdminReviewsService } from './reviews.service';

@ApiTags('admin (reviews)')
@Controller('admin/reviews')
@Roles('admin')
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Patch(':reviewId/hide')
  @ApiOperation({ summary: 'Hide a review (excluded from reliability)' })
  hide(@Param('reviewId') reviewId: string): Promise<ReviewModel> {
    return this.reviews.hide(reviewId);
  }
}
