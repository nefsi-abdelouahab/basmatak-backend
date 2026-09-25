import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SessionsCollection,
  SessionSchema,
} from '../auth/schemas/session.schema';
import {
  ORG_PUBLIC_STATS_PROVIDER,
  InertOrgPublicStatsProvider,
} from '../common/seams/org-public-stats';
import {
  StatusHistoryCollection,
  StatusHistorySchema,
} from '../core/status-transitions/status-histories.schema';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { LocationsModule } from '../locations/locations.module';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  SkillCategoriesCollection,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
import { UsersCollection, UserSchema } from '../users/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { OrganizationRegistrationExtrasService } from './organization-registration-extras.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from './schemas/organization.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationSchema,
} from './schemas/organization-verification.schema';

/**
 * Organizations feature module (inventory §2.7): the org page, `/me`
 * internals and the verification-document flow. Registers the `organization`
 * whitelist: the verification-status machine (`pending → verified | rejected
 * → pending`) driven by S5/S15, plus the S15 account pairs (`active ↔
 * suspended`) used by the admin status route — so every change is recorded in
 * `status_histories`. MongooseModule is exported for S15/S17 reuse.
 *
 * Session 14 (`backend-v2-org-facts`) additions, all read-scoped except the
 * transactional self-deletion: `opportunities` (per-status public archive),
 * `sessions` (self-deletion revocation), `users` (self-deletion retire),
 * `status_histories` (self-deletion history bypassing the whitelist, which
 * keeps rejecting `active → deleted`), and `skill_categories`
 * (focus-disciplines existence). Re-registration via `forFeature` follows the
 * Session 12 activity-module precedent. Location refs validate through the
 * imported `LocationsModule` (no locations files edited).
 */
@Module({
  imports: [
    AuthModule,
    LocationsModule,
    MongooseModule.forFeature([
      { name: OrganizationsCollection, schema: OrganizationSchema },
      {
        name: OrganizationVerificationsCollection,
        schema: OrganizationVerificationSchema,
      },
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: SessionsCollection, schema: SessionSchema },
      { name: UsersCollection, schema: UserSchema },
      { name: StatusHistoryCollection, schema: StatusHistorySchema },
      { name: SkillCategoriesCollection, schema: SkillCategorySchema },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationRegistrationExtrasService,
    {
      provide: ORG_PUBLIC_STATS_PROVIDER,
      useClass: InertOrgPublicStatsProvider,
    },
  ],
  exports: [MongooseModule, OrganizationsService],
})
export class OrganizationsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('organization', [
      ['pending', 'verified'],
      ['pending', 'rejected'],
      ['rejected', 'pending'],
      ['active', 'suspended'],
      ['suspended', 'active'],
    ]);
  }
}
