import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const NotificationPrefsCollection = 'notification_prefs';

export const NOTIFICATION_PREF_KEYS = [
  'applicationUpdates',
  'reviews',
  'verification',
  'system',
  'digest',
  'recordIssued',
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationPrefKey, boolean> =
  {
    applicationUpdates: true,
    reviews: true,
    verification: true,
    system: true,
    digest: true,
    recordIssued: true,
  };

export interface NotificationPrefs {
  applicationUpdates: boolean;
  reviews: boolean;
  verification: boolean;
  system: boolean;
  digest: boolean;
  recordIssued: boolean;
}

export interface NotificationPref {
  userId: Types.ObjectId;
  prefs: NotificationPrefs;
}

export class NotificationPrefModel
  extends Document
  implements NotificationPref
{
  userId!: Types.ObjectId;
  prefs!: NotificationPrefs;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Per-user notification preferences (roadmap S9, inventory §3). One row per
 * user — enforced by the unique `userId` index — lazily created on first read
 * with all six defaults ON. `digest` is also surfaced as a global
 * `system_settings` flag (Session 16 exposes the admin toggle); the row key is
 * the per-user override.
 */
export const NotificationPrefSchema = createSchema({
  userId: { type: Schema.Types.ObjectId, required: true },
  prefs: {
    type: {
      applicationUpdates: {
        type: Boolean,
        required: true,
        default: DEFAULT_NOTIFICATION_PREFS.applicationUpdates,
      },
      reviews: {
        type: Boolean,
        required: true,
        default: DEFAULT_NOTIFICATION_PREFS.reviews,
      },
      verification: {
        type: Boolean,
        required: true,
        default: DEFAULT_NOTIFICATION_PREFS.verification,
      },
      system: {
        type: Boolean,
        required: true,
        default: DEFAULT_NOTIFICATION_PREFS.system,
      },
      digest: {
        type: Boolean,
        required: true,
        default: DEFAULT_NOTIFICATION_PREFS.digest,
      },
      recordIssued: {
        type: Boolean,
        required: true,
        default: DEFAULT_NOTIFICATION_PREFS.recordIssued,
      },
    },
    _id: false,
    required: true,
    default: () => ({ ...DEFAULT_NOTIFICATION_PREFS }),
  },
});

NotificationPrefSchema.index({ userId: 1 }, { unique: true });
