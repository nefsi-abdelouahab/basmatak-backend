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

/**
 * Cross-cutting providers: seams (inert defaults until their owning sessions)
 * and the app logger. Guards/filters/pipes are registered at the app level.
 * `REGISTRATION_EXTRAS_SERVICE` is bound to the role-dispatching organization
 * provider (S5); Session 2's volunteer provider discards every other role.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationsCollection, schema: OrganizationSchema },
    ]),
  ],
  providers: [
    AppLogger,
    PublishGateService,
    PortfolioQueryService,
    MediaOwnership,
    InertRegistrationExtrasService,
    {
      provide: REGISTRATION_EXTRAS_SERVICE,
      useClass: OrganizationRegistrationExtrasService,
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