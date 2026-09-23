import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';

/**
 * Admin review moderation (inventory §2.20): hiding a review sets its `status`
 * to `hidden` so it is excluded from reliability and anomaly metrics. Not a
 * StatusTransitionService transition — a moderation flag, recorded by the S1
 * audit interceptor instead.
 */
@Injectable()
export class AdminReviewsService {
  constructor(
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
  ) {}

  async hide(reviewId: string): Promise<ReviewModel> {
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) {
      throw new BusinessException('REVIEW_NOT_FOUND', 'Review not found', 404);
    }
    if (review.status === 'hidden') {
      throw new BusinessException(
        'REVIEW_ALREADY_HIDDEN',
        'Review is already hidden',
        409,
      );
    }
    await this.reviewModel
      .updateOne({ _id: review._id }, { $set: { status: 'hidden' } })
      .exec();
    const updated = await this.reviewModel.findById(review._id).exec();
    if (!updated) {
      throw new BusinessException('REVIEW_NOT_FOUND', 'Review not found', 404);
    }
    return updated;
  }
}
