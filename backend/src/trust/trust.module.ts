import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OpportunitySchema,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  SubmissionSchema,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VerificationSchema,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import { ReviewSchema, ReviewsCollection } from '../reviews/review.schema';
import { ReliabilityService } from './reliability.service';
import { TrustController } from './trust.controller';
import { TrustPublishGateService } from './trust-publish-gate.service';

/**
 * Trust module (roadmap A7/F8): the real publish gate + the reliability read
 * model. Depends only on `@Global` core providers (SettingsService, JobRegistry,
 * the event bus) plus its own model bindings, so the DI override in CommonModule
 * adds no cycle.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubmissionsCollection, schema: SubmissionSchema },
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: VerificationsCollection, schema: VerificationSchema },
      { name: ReviewsCollection, schema: ReviewSchema },
      { name: OrganizationsCollection, schema: OrganizationSchema },
    ]),
  ],
  controllers: [TrustController],
  providers: [TrustPublishGateService, ReliabilityService],
  exports: [TrustPublishGateService, ReliabilityService, MongooseModule],
})
export class TrustModule {}
