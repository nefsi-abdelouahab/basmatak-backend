import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobRegistry } from '../core/jobs/job-registry';
import { SettingsService } from '../core/settings/settings.service';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { FavoritesModule } from '../favorites/favorites.module';
import {
  ApplicationsCollection,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import {
  LocationSchema,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  TaskParticipantSchema,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { SkillsModule } from '../skills/skills.module';
import {
  SkillCategoriesCollection,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
import {
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillsCollection,
  VolunteerSkillSchema,
} from '../volunteers/schemas/volunteer-skill.schema';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityEmbedProvider } from './opportunity-embed.provider';
import { PositionsController } from './positions.controller';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from './schemas/opportunity.schema';
import { TaskParticipantsAdapter } from './task-participants.adapter';

/**
 * Opportunities feature module (inventory §1 module 9, roadmap S6).
 * On boot it registers the `opportunity` lifecycle whitelist (D5), seeds the
 * publish-gate default settings (D6) and registers the `opportunityStartTicker`
 * handler (D8). Imported BEFORE `OrganizationsModule` in AppModule so the
 * static `organizations/me/opportunities` routes win over S5's `:slug` route.
 */
@Module({
  imports: [
    OrganizationsModule,
    SkillsModule,
    FavoritesModule,
    MongooseModule.forFeature([
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: VolunteerProfilesCollection, schema: VolunteerProfileSchema },
      { name: VolunteerSkillsCollection, schema: VolunteerSkillSchema },
      // Session 19 reads (no writes): category/location labels, per-position
      // application counts and assigned-participant joins for the embed
      // provider (same read-only-ref pattern as the favorites module).
      { name: SkillCategoriesCollection, schema: SkillCategorySchema },
      { name: LocationsCollection, schema: LocationSchema },
      { name: ApplicationsCollection, schema: ApplicationSchema },
      { name: TaskParticipantsCollection, schema: TaskParticipantSchema },
    ]),
  ],
  controllers: [OpportunitiesController, PositionsController],
  providers: [
    OpportunitiesService,
    TaskParticipantsAdapter,
    OpportunityEmbedProvider,
  ],
  exports: [MongooseModule, OpportunitiesService, OpportunityEmbedProvider],
})
export class OpportunitiesModule implements OnModuleInit {
  constructor(
    private readonly registry: StatusTransitionRegistry,
    private readonly jobRegistry: JobRegistry,
    private readonly settings: SettingsService,
    private readonly opportunities: OpportunitiesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.settings.ensureDefaults();
    this.registry.register('opportunity', [
      ['draft', 'published'],
      ['published', 'in_progress'],
      ['in_progress', 'completed'],
      ['published', 'closed'],
      ['published', 'cancelled'],
      ['in_progress', 'closed'],
      ['in_progress', 'cancelled'],
    ]);
    this.jobRegistry.register('opportunityStartTicker', () =>
      this.opportunities.runStartTicker(),
    );
  }
}
