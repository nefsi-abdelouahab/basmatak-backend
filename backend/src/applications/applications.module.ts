import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import {
  ApplicationsCollection,
  ApplicationSchema,
} from './schemas/application.schema';
import {
  InertNotificationsRepository,
  NOTIFICATIONS_REPOSITORY,
} from './notifications.repository';

/**
 * Applications feature module (inventory §2.9, roadmap S7). Owns the
 * `applications` collection and the F4 notification-in-transaction seam
 * (`NOTIFICATIONS_REPOSITORY`, inert until Session 9). Depends on
 * ParticipationsModule for the `task_participants` model used by the accept
 * and withdraw-accepted transactions.
 */
@Module({
  imports: [
    OpportunitiesModule,
    OrganizationsModule,
    ParticipationsModule,
    MongooseModule.forFeature([
      { name: ApplicationsCollection, schema: ApplicationSchema },
    ]),
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    InertNotificationsRepository,
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useExisting: InertNotificationsRepository,
    },
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('application', [
      ['pending', 'accepted'],
      ['pending', 'rejected'],
      ['pending', 'withdrawn'],
      ['accepted', 'withdrawn'],
    ]);
  }
}
