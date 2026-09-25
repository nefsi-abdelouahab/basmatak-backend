import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SkillsModule } from '../skills/skills.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { VolunteersModule } from '../volunteers/volunteers.module';
import { ExperiencesController } from './experiences.controller';
import { AttestationController } from './attestation/attestation.controller';
import { AttestationService } from './attestation/attestation.service';
import { ExperienceEnrichmentService } from './experience-enrichment.service';
import { ExperiencesService } from './experiences.service';
import { PublicVerificationController } from './public-verification.controller';
import {
  VolunteerExperienceSchema,
  VolunteerExperiencesCollection,
} from './schemas/volunteer-experience.schema';
import {
  VerificationSchema,
  VerificationsCollection,
} from './schemas/verification.schema';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

/**
 * Verifications feature module (inventory §2.13/§2.14, roadmap S11 Part B).
 * Owns the `verifications` and `volunteer_experiences` collections plus the
 * ExperiencesService/controllers (folded here per task 8.7); brother models
 * (submissions, participants, opportunities, profiles, media, reviews,
 * notifications) come from the sibling modules that own and export them —
 * read-only access, their collections stay owned upstream.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VerificationsCollection, schema: VerificationSchema },
      {
        name: VolunteerExperiencesCollection,
        schema: VolunteerExperienceSchema,
      },
    ]),
    ReviewsModule,
    SubmissionsModule,
    ParticipationsModule,
    OpportunitiesModule,
    OrganizationsModule,
    VolunteersModule,
    MediaModule,
    NotificationsModule,
    SkillsModule,
  ],
  controllers: [
    VerificationsController,
    PublicVerificationController,
    ExperiencesController,
    // Session 18 attestation download (registration-line-only addition).
    AttestationController,
  ],
  providers: [
    VerificationsService,
    ExperiencesService,
    ExperienceEnrichmentService,
    AttestationService,
  ],
  exports: [MongooseModule],
})
export class VerificationsModule {}
