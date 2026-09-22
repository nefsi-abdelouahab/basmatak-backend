import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  NotificationsRepository,
  TransactionalNotification,
} from '../applications/notifications.repository';
import { buildNotificationKey } from './notifications-key.util';
import {
  NotificationModel,
  NotificationsCollection,
} from './schemas/notification.schema';

/**
 * Real Mongo-backed F4 repository (roadmap S9). Swaps in for the applications
 * module's inert seam: transactional flows (accept, withdraw-accepted, and the
 * later verify transaction) persist notification rows inside their own
 * transaction. The dedupe key is derived exactly like the bus handlers', so a
 * post-commit event can never duplicate an in-transaction row.
 */
@Injectable()
export class MongoNotificationsRepository implements NotificationsRepository {
  constructor(
    @InjectModel(NotificationsCollection)
    private readonly notificationModel: Model<NotificationModel>,
  ) {}

  async createInSession(
    notification: TransactionalNotification,
    session: ClientSession,
  ): Promise<void> {
    await this.notificationModel.create(
      [
        {
          userId: notification.recipientId,
          type: notification.type,
          payload: notification.payload,
          dedupeKey: buildNotificationKey(
            notification.type,
            notification.payload,
            notification.recipientId.toString(),
          ),
        },
      ],
      { session },
    );
  }
}
