import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import {
  NOTIFICATIONS_REPOSITORY,
  NotificationsRepository,
  TransactionalNotification,
} from '../applications/notifications.repository';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  buildCursor,
  decodeCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
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
    const limit = normalizeLimit(rawLimit);
    const cursor = decodeCursor(rawCursor);
    const filter: FilterQuery<NotificationModel> = {
      userId: new Types.ObjectId(userId),
    };
    if (cursor) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.notificationModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return {
      items,
      nextCursor: buildCursor(lastId).cursor,
      limit,
    };
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
