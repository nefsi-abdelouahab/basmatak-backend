import { Types, ClientSession } from 'mongoose';

export const NOTIFICATIONS_REPOSITORY = 'NOTIFICATIONS_REPOSITORY';

/**
 * F4 seam: transactional flows (accept application, withdraw accepted
 * application, verify submission) persist in-app notifications INSIDE the
 * same Mongo transaction, not over the EventEmitter bus. The notifications
 * module (Session 9) owns the `notifications` collection and provides the real
 * `MongoNotificationsRepository` bound to this token; each transactional flow
 * also emits its post-commit convenience event, whose handler derives the same
 * dedupe key so it is swallowed (no double-notify).
 */
export interface TransactionalNotification {
  recipientId: Types.ObjectId;
  type: string;
  payload?: Record<string, unknown>;
}

export interface NotificationsRepository {
  createInSession(
    notification: TransactionalNotification,
    session: ClientSession,
  ): Promise<void>;
}
