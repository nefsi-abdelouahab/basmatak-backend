import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
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
import { AdminOrganizationsController } from './organizations.controller';
import { AdminOrganizationsService } from './organizations.service';
import { AdminStatsController } from './stats.controller';
import { AdminStatsService } from './stats.service';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';
import { AdminVolunteersController } from './volunteers.controller';
import { AdminVolunteersService } from './volunteers.service';

/**
 * Admin feature module (inventory §2.20 first half, roadmap S15): stats
 * overview, users/volunteers/organizations listing, user + organization
 * account-status control, and the organization-verification approve/reject
 * decision. Write access only to `users.status` and `organizations.*` through
 * StatusTransitionService. On boot it registers the `user` account whitelist;
 * the `organization` account pairs are appended to the S5 registration in
 * OrganizationsModule (design D4).
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
    ]),
  ],
  controllers: [
    AdminStatsController,
    AdminUsersController,
    AdminVolunteersController,
    AdminOrganizationsController,
  ],
  providers: [
    AdminStatsService,
    AdminUsersService,
    AdminVolunteersService,
    AdminOrganizationsService,
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
