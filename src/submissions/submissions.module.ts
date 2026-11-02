import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { MediaModule } from '../media/media.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import {
  VerificationSchema,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from './schemas/submission.schema';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

/**
 * Submissions feature module (inventory §2.12, roadmap S10 Part A): "report
 * work". Owns the `submissions` collection, the draft-edit-submit flow with
 * the consent rule, the volunteer `me`/detail routes, and the org verification
 * inbox. Registers the `submission` state machine whitelist (full machine so
 * Part B's `approved|rejected` write path needs no re-registration).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubmissionsCollection, schema: SubmissionSchema },
      // Read-only rejection reason for owner-scoped submission reads. Direct
      // registration avoids a module cycle (VerificationsModule imports this
      // module).
      { name: VerificationsCollection, schema: VerificationSchema },
    ]),
    // Read-only sibling models: the participant (→ its position snapshot) and
    // the owning organization (→ inbox/detail scoping), plus media reads for
    // evidence metadata in the detail route.
    MediaModule,
    ParticipationsModule,
    OpportunitiesModule,
    OrganizationsModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [MongooseModule],
})
export class SubmissionsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('submission', [
      ['draft', 'submitted'],
      ['submitted', 'under_review'],
      ['under_review', 'approved'],
      ['under_review', 'rejected'],
      ['rejected', 'draft'],
    ]);
  }
}
