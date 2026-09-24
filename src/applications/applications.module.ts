import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import {
  ApplicationsCollection,
  ApplicationSchema,
} from './schemas/application.schema';

/**
 * Applications feature module (inventory §2.9, roadmap S7). Owns the
 * `applications` collection and the F4 notification-in-transaction seam
 * (`NOTIFICATIONS_REPOSITORY`, bound and exported by the notifications module,
 * Session 9). The applications service injects that token and writes
 * notification rows inside the accept / withdraw-accepted transactions via the
 * real Mongo-backed repository. Depends on ParticipationsModule for the
 * `task_participants` model used by those transactions.
 */
@Module({
  imports: [
    NotificationsModule,
    OpportunitiesModule,
    OrganizationsModule,
    ParticipationsModule,
    MongooseModule.forFeature([
      { name: ApplicationsCollection, schema: ApplicationSchema },
    ]),
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule implements OnModuleInit {
  constructor(private readonly registry: StatusTransitionRegistry) {}

  onModuleInit(): void {
    this.registry.register('application', [
      ['pending', 'accepted'],
      ['pending', 'rejected'],
      ['pending', 'withdrawn'],
      ['pending', 'under_review'],
      ['under_review', 'accepted'],
      ['under_review', 'rejected'],
      ['under_review', 'withdrawn'],
      ['accepted', 'withdrawn'],
    ]);
  }
}
