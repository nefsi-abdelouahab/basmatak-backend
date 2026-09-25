import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APPLICATION_INBOX_JOINER } from '../common/seams/application-inbox-joiner';
import { StatusTransitionRegistry } from '../core/status-transitions/status-transition.registry';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import { ApplicationInboxJoinerImpl } from './application-inbox.joiner';
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
  providers: [
    ApplicationsService,
    ApplicationInboxJoinerImpl,
    // Session 19 fills the Session 5 seam: the module-scoped binding shadows
    // CommonModule's inert default for this module's consumers (no other
    // module consumes the token). All joined models resolve through the
    // already-imported Organizations/Opportunities modules' exports.
    { provide: APPLICATION_INBOX_JOINER, useClass: ApplicationInboxJoinerImpl },
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
      ['pending', 'under_review'],
      ['under_review', 'accepted'],
      ['under_review', 'rejected'],
      ['under_review', 'withdrawn'],
      ['accepted', 'withdrawn'],
    ]);
  }
}
