import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NOTIFICATIONS_REPOSITORY } from '../applications/notifications.repository';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsEventHandlers } from './notifications-event-handlers';
import { NotificationPrefsService } from './notification-prefs.service';
import { MongoNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import {
  NotificationSchema,
  NotificationsCollection,
} from './schemas/notification.schema';
import {
  NotificationPrefSchema,
  NotificationPrefsCollection,
} from './schemas/notification-pref.schema';

/**
 * Notifications feature module (inventory §2.17, roadmap S9). Owns the
 * `notifications` collection and ships the real F4 repository — the paperwork
 * module swaps its inert seam binding (applications.module) to this provider.
 * MongooseModule is exported so the applications module can resolve the
 * Notification model for `useClass` on that token. The event handlers read the
 * `organizations` and `task_participants` models (imported via the sibling
 * modules, which export their MongooseModule) to resolve notification
 * recipients — read-only access, their collections stay owned by their
 * modules.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationsCollection, schema: NotificationSchema },
      { name: NotificationPrefsCollection, schema: NotificationPrefSchema },
    ]),
    OrganizationsModule,
    ParticipationsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    MongoNotificationsRepository,
    NotificationPrefsService,
    NotificationsEventHandlers,
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useExisting: MongoNotificationsRepository,
    },
  ],
  exports: [
    MongooseModule,
    NotificationsService,
    NotificationPrefsService,
    NOTIFICATIONS_REPOSITORY,
  ],
})
export class NotificationsModule implements OnModuleInit {
  constructor(private readonly prefs: NotificationPrefsService) {}

  /** Seed the two global digest settings keys idempotently (design D5, flag-only). */
  async onModuleInit(): Promise<void> {
    await this.prefs.ensureDigestSettings();
  }
}
