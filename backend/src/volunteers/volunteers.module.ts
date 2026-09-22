import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SkillsModule } from '../skills/skills.module';
import { MediaCollection, MediaSchema } from '../media/schemas/media.schema';
import {
  VolunteerExperiencesCollection,
  VolunteerExperienceSchema,
} from '../verifications/schemas/volunteer-experience.schema';
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
        name: VolunteerExperiencesCollection,
        schema: VolunteerExperienceSchema,
      },
    ]),
    SkillsModule,
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
