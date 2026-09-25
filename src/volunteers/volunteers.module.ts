import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FavoritesModule } from '../favorites/favorites.module';
import { SkillsModule } from '../skills/skills.module';
import {
  SkillCategoriesCollection,
  SkillCategorySchema,
} from '../skills/schemas/skill-category.schema';
import {
  OrganizationSchema,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { ReviewSchema, ReviewsCollection } from '../reviews/review.schema';
import { MediaCollection, MediaSchema } from '../media/schemas/media.schema';
import {
  PortfolioItemsCollection,
  PortfolioItemSchema,
} from '../portfolio/schemas/portfolio-item.schema';
import {
  VolunteerExperienceSchema,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  VerificationSchema,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import {
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from './schemas/volunteer-profile.schema';
import {
  VolunteerSkillSchema,
  VolunteerSkillsCollection,
} from './schemas/volunteer-skill.schema';
import {
  VolunteerAvailabilitiesCollection,
  VolunteerAvailabilitySchema,
} from './schemas/volunteer-availability.schema';
import { PublicVolunteersController } from './public-volunteers.controller';
import { VolunteerAvailabilityController } from './volunteer-availability.controller';
import { VolunteerSkillsController } from './volunteer-skills.controller';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

/**
 * Volunteers feature module (inventory §2.5): the volunteer profile row, its
 * skill list, weekly availability and member dashboard. Guest routes live in
 * `PublicVolunteersController`, declared AFTER `VolunteersController` so the
 * static `me` routes register before the `:username` catch-all (D1).
 * `MongooseModule` and `VolunteersService` are exported so CommonModule's
 * registration seam and later sessions can reuse the model tokens and
 * public-read seams.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VolunteerProfilesCollection, schema: VolunteerProfileSchema },
      { name: VolunteerSkillsCollection, schema: VolunteerSkillSchema },
      {
        name: VolunteerAvailabilitiesCollection,
        schema: VolunteerAvailabilitySchema,
      },
      { name: MediaCollection, schema: MediaSchema },
      {
        name: PortfolioItemsCollection,
        schema: PortfolioItemSchema,
      },
      {
        name: VolunteerExperiencesCollection,
        schema: VolunteerExperienceSchema,
      },
      // Session 15 reads (no writes): verification `decidedAt` for the
      // enriched `verifiedAt` on public/dashboard experience cards.
      { name: VerificationsCollection, schema: VerificationSchema },
      // Session 9 reads (no writes): skill categories for the derived
      // contribution areas, reviews + organizations for the public reviews
      // list. Registered here to avoid a cycle (ReviewsModule imports this one).
      {
        name: SkillCategoriesCollection,
        schema: SkillCategorySchema,
      },
      { name: ReviewsCollection, schema: ReviewSchema },
      { name: OrganizationsCollection, schema: OrganizationSchema },
    ]),
    SkillsModule,
    // Session 19: favorites card state on talents/profile reuses the
    // favorites store service-to-service (no duplicated counting logic).
    FavoritesModule,
  ],
  controllers: [
    VolunteersController,
    VolunteerSkillsController,
    VolunteerAvailabilityController,
    PublicVolunteersController,
  ],
  providers: [VolunteersService],
  exports: [MongooseModule, VolunteersService],
})
export class VolunteersModule {}
