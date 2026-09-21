import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface Session {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  expiresAt: Date;
  lastUsedAt?: Date;
}

export class SessionModel extends Document implements Session {
  userId!: Types.ObjectId;
  refreshTokenHash!: string;
  expiresAt!: Date;
  lastUsedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SessionsCollection = 'sessions';

export const SessionSchema: Schema<SessionModel> = createSchema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  refreshTokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  lastUsedAt: { type: Date },
});
