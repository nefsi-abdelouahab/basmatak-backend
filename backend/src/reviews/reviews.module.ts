import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { VolunteersModule } from '../volunteers/volunteers.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ReviewSchema, ReviewsCollection } from './review.schema';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Reviews module (inventory §2.16, roadmap S13 owner-split / F16). Owns the
 * `reviews` collection and the three §2.16 review routes; the schema/model and
 * its in-transaction write inside the verify flow stay shared with the
 * verifications module (exported `MongooseModule`). Brother models used for
 * the read join (submissions, volunteer profiles, opportunities) come from the
 * sibling modules that own and export them.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReviewsCollection, schema: ReviewSchema },
    ]),
    SubmissionsModule,
    VolunteersModule,
    OpportunitiesModule,
    OrganizationsModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [MongooseModule],
})
export class ReviewsModule {}
