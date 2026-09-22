import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppLogger } from './logger/app.logger';
import { PublishGateService } from './seams/publish-gate.service';
import { PortfolioQueryService } from './seams/portfolio-query.service';
import { MediaOwnership } from './seams/media-ownership';
import {
  InertRegistrationExtrasService,
  REGISTRATION_EXTRAS_SERVICE,
} from './seams/registration-extras.service';
import { OrganizationRegistrationExtrasService } from '../organizations/organization-registration-extras.service';
import {
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import { VolunteerRegistrationExtrasService } from '../volunteers/volunteer-registration-extras.service';
import { VolunteersModule } from '../volunteers/volunteers.module';

/**
 * Cross-cutting providers: seams (inert defaults until their owning sessions)
 * and the app logger. Guards/filters/pipes are registered at the app level.
 * `REGISTRATION_EXTRAS_SERVICE` is the role-dispatching volunteer provider
 * (S2+S5): it creates the `volunteer_profiles` row for volunteers and hands
 * every other role to the organization provider.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationsCollection, schema: OrganizationSchema },
    ]),
    VolunteersModule,
  ],
  providers: [
    AppLogger,
    PublishGateService,
    PortfolioQueryService,
    MediaOwnership,
    InertRegistrationExtrasService,
    OrganizationRegistrationExtrasService,
    VolunteerRegistrationExtrasService,
    {
      provide: REGISTRATION_EXTRAS_SERVICE,
      useClass: VolunteerRegistrationExtrasService,
    },
  ],
  exports: [
    AppLogger,
    PublishGateService,
    PortfolioQueryService,
    MediaOwnership,
    InertRegistrationExtrasService,
    REGISTRATION_EXTRAS_SERVICE,
  ],
})
export class CommonModule {}