import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationSchema,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../core/status-transitions/status-histories.schema';
import {
  NotificationSchema,
  NotificationsCollection,
} from '../notifications/schemas/notification.schema';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  TaskParticipantSchema,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import {
  SubmissionSchema,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * Activity feature module (Session 12 `backend-v2-activity-feed`). Owns no
 * collection: every model below is a read-only reference to a peer-owned
 * collection (same pattern as the admin module's `status_histories`
 * registration). No peer module is imported or modified.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StatusHistoryCollection, schema: StatusHistorySchema },
      { name: NotificationsCollection, schema: NotificationSchema },
      { name: ApplicationsCollection, schema: ApplicationSchema },
      { name: SubmissionsCollection, schema: SubmissionSchema },
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: OrganizationsCollection, schema: OrganizationSchema },
      { name: VolunteerProfilesCollection, schema: VolunteerProfileSchema },
      { name: TaskParticipantsCollection, schema: TaskParticipantSchema },
    ]),
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
