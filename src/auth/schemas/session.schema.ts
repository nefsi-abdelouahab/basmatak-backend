import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface SessionDevice {
  browser?: string;
  os?: string;
  device?: string;
}

export interface Session {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  expiresAt: Date;
  lastUsedAt?: Date;
  /** Rotation-consumed tombstone: set when a refresh rotates the row (S19). */
  rotatedAt?: Date;
  /** Coarse device fingerprint parsed from the User-Agent header (org-ops). */
  device?: SessionDevice | null;
  /** Raw User-Agent string captured at session creation (org-ops). */
  userAgent?: string | null;
}

export class SessionModel extends Document implements Session {
  userId!: Types.ObjectId;
  refreshTokenHash!: string;
  expiresAt!: Date;
  lastUsedAt?: Date;
  rotatedAt?: Date;
  device?: SessionDevice | null;
  userAgent?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SessionsCollection = 'sessions';

export const SessionSchema: Schema<SessionModel> = createSchema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  refreshTokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  lastUsedAt: { type: Date },
  rotatedAt: { type: Date },
  device: {
    type: {
      browser: { type: String },
      os: { type: String },
      device: { type: String },
    },
    default: null,
  },
  userAgent: { type: String, trim: true, maxlength: 512, default: null },
});
