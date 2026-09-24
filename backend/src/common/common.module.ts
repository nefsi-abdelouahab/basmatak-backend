import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppLogger } from './logger/app.logger';
import { PublishGateService } from './seams/publish-gate.service';
import { PortfolioQueryService } from './seams/portfolio-query.service';
import { MediaOwnership } from './seams/media-ownership';
import {
  APPLICATION_INBOX_JOINER,
  InertApplicationInboxJoiner,
} from './seams/application-inbox-joiner';
import { CountersCollection, CounterSchema } from './counters/counters.schema';
import { RegistryIdService } from './counters/registry-id.service';
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
import { MediaCollection, MediaSchema } from '../media/schemas/media.schema';
import {
  PortfolioItemSchema,
  PortfolioItemsCollection,
} from '../portfolio/schemas/portfolio-item.schema';
import { TrustModule } from '../trust/trust.module';
import { TrustPublishGateService } from '../trust/trust-publish-gate.service';

/**
 * Cross-cutting providers: seams (inert defaults until their owning sessions)
 * and the app logger. Guards/filters/pipes are registered at the app level.
 * `PublishGateService` is overridden with the real trust-layer counter via DI
 * (D3); `REGISTRATION_EXTRAS_SERVICE` is the role-dispatching volunteer
 * provider (S2+S5): it creates the `volunteer_profiles` row for volunteers and
 * hands every other role to the organization provider.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationsCollection, schema: OrganizationSchema },
      { name: MediaCollection, schema: MediaSchema },
      { name: PortfolioItemsCollection, schema: PortfolioItemSchema },
      { name: CountersCollection, schema: CounterSchema },
    ]),
    VolunteersModule,
    TrustModule,
  ],
  providers: [
    AppLogger,
    { provide: PublishGateService, useClass: TrustPublishGateService },
    PortfolioQueryService,
    MediaOwnership,
    RegistryIdService,
    InertRegistrationExtrasService,
    OrganizationRegistrationExtrasService,
    VolunteerRegistrationExtrasService,
    {
      provide: REGISTRATION_EXTRAS_SERVICE,
      useClass: VolunteerRegistrationExtrasService,
    },
    {
      provide: APPLICATION_INBOX_JOINER,
      useClass: InertApplicationInboxJoiner,
    },
  ],
  exports: [
    AppLogger,
    PublishGateService,
    PortfolioQueryService,
    MediaOwnership,
    RegistryIdService,
    InertRegistrationExtrasService,
    REGISTRATION_EXTRAS_SERVICE,
    APPLICATION_INBOX_JOINER,
  ],
})
export class CommonModule {}
