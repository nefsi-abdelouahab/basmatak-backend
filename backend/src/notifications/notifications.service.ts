import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  NOTIFICATIONS_REPOSITORY,
  NotificationsRepository,
  TransactionalNotification,
} from '../applications/notifications.repository';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { NotificationPrefsService } from './notification-prefs.service';
import { buildNotificationKey } from './notifications-key.util';
import {
  NotificationModel,
  NotificationsCollection,
} from './schemas/notification.schema';

/**
 * Notifications service (inventory §2.17, roadmap S9). `createForRecipient`
 * is the bus path (idempotent via the unique `dedupeKey`); `createInSession`
 * delegates to the F4 repository so transactional flows write atomically.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(NotificationsCollection)
    private readonly notificationModel: Model<NotificationModel>,
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: NotificationsRepository,
    private readonly prefs: NotificationPrefsService,
  ) {}

  /**
   * Bus path: create a notification from an event, swallowing a duplicate
   * `dedupeKey` (the same event delivered twice, or a flow whose notification
   * was already written inside a transaction, F4 — both yield at most one row).
   */
  async createForRecipient(
    recipientId: Types.ObjectId,
    type: string,
    payload?: unknown,
  ): Promise<void> {
    if (!(await this.prefs.enabledFor(recipientId.toString(), type))) {
      return;
    }
    const dedupeKey = buildNotificationKey(
      type,
      payload,
      recipientId.toString(),
    );
    try {
      await this.notificationModel.create([
        {
          userId: recipientId,
          type,
          payload: payload as Record<string, unknown> | undefined,
          dedupeKey,
        },
      ]);
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  /**
   * Bus path with preference gating (design D2, S9). Resolves the recipient's
   * notification prefs; when the event type is disabled for the recipient the
   * notification is skipped entirely. Otherwise delegates to the idempotent
   * `createForRecipient`. `createInSession` (transactional path) is untouched.
   */
  async createForRecipientIfEnabled(
    recipientId: Types.ObjectId | string,
    type: string,
    payload?: unknown,
  ): Promise<void> {
    if (!(await this.prefs.enabledFor(String(recipientId), type))) {
      return;
    }
    return this.createForRecipient(
      new Types.ObjectId(recipientId.toString()),
      type,
      payload,
    );
  }

  /**
   * D5 digest flag, read through the notifications module boundary (flag-only,
   * no digest delivery in S9). Tolerant of absent/non-boolean stored value
   * (defaults `false`).
   */
  async isDigestEnabled(): Promise<boolean> {
    return this.prefs.isDigestEnabled();
  }

  /**
   * D5 digest interval in days, read through the notifications module boundary
   * (flag-only, no digest delivery in S9). Tolerant of absent/non-numeric
   * stored value (defaults `7`).
   */
  async digestIntervalDays(): Promise<number> {
    return this.prefs.digestIntervalDays();
  }

  /** Transactional path: persist inside the caller's Mongo transaction (F4). */
  async createInSession(
    notification: TransactionalNotification,
    session: ClientSession,
  ): Promise<void> {
    return this.repository.createInSession(notification, session);
  }

  async list(
    userId: string,
    rawLimit: string | undefined,
    rawCursor: string | undefined,
  ): Promise<CursorPage<NotificationModel>> {
    return execPage(
      this.notificationModel,
      { userId: new Types.ObjectId(userId) },
      {
        limit: rawLimit,
        cursor: rawCursor,
        sort: { _id: -1 },
        sortToken: 'newest',
        cursorFilter: (decoded) => {
          if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
            return {};
          }
          return { _id: { $lt: new Types.ObjectId(decoded.id) } };
        },
      },
    );
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationModel
      .countDocuments({
        userId: new Types.ObjectId(userId),
        isRead: false,
      })
      .exec();
    return { count };
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationModel> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new BusinessException(
        'NOTIFICATION_NOT_FOUND',
        'Notification not found',
        404,
      );
    }
    const updated = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessException(
        'NOTIFICATION_NOT_FOUND',
        'Notification not found',
        404,
      );
    }
    return updated;
  }

  async readAll(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationModel
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          isRead: false,
        },
        { $set: { isRead: true, readAt: new Date() } },
      )
      .exec();
    return { updated: result.modifiedCount ?? 0 };
  }
}
