import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewSchema, ReviewsCollection } from './review.schema';

/**
 * Reviews module (inventory §2.16, roadmap S13 owner-split / F16). Model only
 * in this session — the three §2.16 review routes and reliability are Session
 * 13's work. `MongooseModule` is exported so the verifications module can
 * inject the `Review` model inside the verify transaction.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReviewsCollection, schema: ReviewSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class ReviewsModule {}
