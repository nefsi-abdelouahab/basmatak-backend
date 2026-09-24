import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../core/status-transitions/status-histories.schema';
import {
  ApplicationsCollection,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import {
  InertOrgFootprintProvider,
  ORG_FOOTPRINT_PROVIDER,
} from '../common/seams/org-footprint';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationSchema,
} from '../organizations/schemas/organization-verification.schema';
import {
  SubmissionsCollection,
  SubmissionSchema,
} from '../submissions/schemas/submission.schema';
import { UserSchema, UsersCollection } from '../users/schemas/user.schema';
import {
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  AuditLogsCollection,
  AuditLogSchema,
} from '../core/audit/audit-log.schema';
import {
  SystemSettingsCollection,
  SystemSettingSchema,
} from '../core/settings/system-setting.schema';
import { ReviewSchema, ReviewsCollection } from '../reviews/review.schema';
import { ReportSchema, ReportsCollection } from '../reports/report.schema';
import {
  TaskParticipantsCollection,
  TaskParticipantSchema,
} from '../participations/schemas/task-participant.schema';
import {
  VerificationsCollection,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { AdminAnalyticsController } from './analytics.controller';
import { AdminAnalyticsService } from './analytics.service';
import { AdminAuditController } from './audit.controller';
import { AdminAuditService } from './audit.service';
import { AdminOpportunitiesController } from './opportunities.controller';
import { AdminOpportunitiesService } from './opportunities.service';
import { AdminOrganizationsController } from './organizations.controller';
import { AdminOrganizationsService } from './organizations.service';
import { AdminReportsController } from './reports.controller';
import { AdminReportsService } from './reports.service';
import { AdminReviewsController } from './reviews.controller';
import { AdminReviewsService } from './reviews.service';
import { AdminSettingsController } from './settings.controller';
import { AdminSettingsService } from './settings.service';
import { AdminStatsController } from './stats.controller';
import { AdminStatsService } from './stats.service';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';
import { AdminVolunteersController } from './volunteers.controller';
import { AdminVolunteersService } from './volunteers.service';

/**
 * Admin feature module (inventory §2.20, roadmap S15 + S16 Part B): stats
 * overview, users/volunteers/organizations listing, user + organization
 * account-status control, organization-verification decisions, plus the
 * Part B surface — opportunity listing/force-close, review hiding, report
 * triage, audit-log browsing, and settings management. Write access goes
 * through StatusTransitionService where a state machine exists. On boot it
 * registers the `user` account whitelist; the `organization` account pairs
 * and `report` whitelist are registered by their owning modules.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UsersCollection, schema: UserSchema },
      { name: OrganizationsCollection, schema: OrganizationSchema },
      {
        name: OrganizationVerificationsCollection,
        schema: OrganizationVerificationSchema,
      },
      { name: VolunteerProfilesCollection, schema: VolunteerProfileSchema },
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: SubmissionsCollection, schema: SubmissionSchema },
      { name: ReviewsCollection, schema: ReviewSchema },
      { name: ReportsCollection, schema: ReportSchema },
      { name: ApplicationsCollection, schema: ApplicationSchema },
      { name: TaskParticipantsCollection, schema: TaskParticipantSchema },
      { name: VerificationsCollection, schema: VerificationSchema },
      { name: StatusHistoryCollection, schema: StatusHistorySchema },
      { name: AuditLogsCollection, schema: AuditLogSchema },
      { name: SystemSettingsCollection, schema: SystemSettingSchema },
    ]),
  ],
  controllers: [
    AdminAnalyticsController,
    AdminStatsController,
    AdminUsersController,
    AdminVolunteersController,
    AdminOrganizationsController,
    AdminOpportunitiesController,
    AdminReviewsController,
    AdminReportsController,
    AdminAuditController,
    AdminSettingsController,
  ],
  providers: [
    AdminAnalyticsService,
    { provide: ORG_FOOTPRINT_PROVIDER, useClass: InertOrgFootprintProvider },
    AdminStatsService,
    AdminUsersService,
    AdminVolunteersService,
    AdminOrganizationsService,
    AdminOpportunitiesService,
    AdminReviewsService,
    AdminReportsService,
    AdminAuditService,
    AdminSettingsService,
  ],
})
export class AdminModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('user', [
      ['active', 'suspended'],
      ['suspended', 'active'],
    ]);
  }
}
