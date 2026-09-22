import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SkillsModule } from '../skills/skills.module';
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
import { VolunteerAvailabilityController } from './volunteer-availability.controller';
import { VolunteerSkillsController } from './volunteer-skills.controller';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

/**
 * Volunteers feature module (inventory §2.5): the volunteer profile row, its
 * skill list, weekly availability and member dashboard. `MongooseModule` and
 * `VolunteersService` are exported so CommonModule's registration seam and
 * later sessions can reuse the model tokens and public-read seams.
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
    ]),
    SkillsModule,
  ],
  controllers: [
    VolunteersController,
    VolunteerSkillsController,
    VolunteerAvailabilityController,
  ],
  providers: [VolunteersService],
  exports: [MongooseModule, VolunteersService],
})
export class VolunteersModule {}
