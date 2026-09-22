import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const NotificationsCollection = 'notifications';

export interface Notification {
  userId: Types.ObjectId;
  type: string;
  payload?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  dedupeKey?: string;
}

export class NotificationModel extends Document implements Notification {
  userId!: Types.ObjectId;
  type!: string;
  payload?: Record<string, unknown>;
  isRead!: boolean;
  readAt?: Date;
  dedupeKey?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Notifications collection (inventory §2.17/§3, roadmap S9). Rows are created
 * either by the event bus or inside a Mongo transaction via the
 * `NOTIFICATIONS_REPOSITORY` seam (F4). The unique partial `dedupeKey` enforces
 * the "same event instance → at most one notification" rule (idempotency).
 */
export const NotificationSchema: Schema<NotificationModel> = createSchema({
  userId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true, trim: true },
  payload: { type: Schema.Types.Mixed },
  isRead: { type: Boolean, required: true, default: false },
  readAt: { type: Date },
  dedupeKey: { type: String },
});

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: 1 });
NotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } },
);
