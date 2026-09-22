import { Injectable } from '@nestjs/common';
import { Types, ClientSession } from 'mongoose';

export const NOTIFICATIONS_REPOSITORY = 'NOTIFICATIONS_REPOSITORY';

/**
 * F4 seam: transactional flows (accept application, withdraw accepted
 * application, verify submission) persist in-app notifications INSIDE the
 * same Mongo transaction, not over the EventEmitter bus. The notifications
 * module (Session 9) owns the `notifications` collection and swaps this
 * provider for a real implementation; until then the default is inert so S7
 * sessions stay order-independent and no collection is created implicitly
 * inside a transaction.
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

@Injectable()
export class InertNotificationsRepository implements NotificationsRepository {
  async createInSession(): Promise<void> {
    /* No-op until Session 9 swaps in the real repository. */
  }
}
