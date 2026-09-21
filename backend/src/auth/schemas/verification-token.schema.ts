import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export type VerificationTokenType = 'email_verify' | 'password_reset';

export interface VerificationToken {
  userId: Types.ObjectId;
  tokenHash: string;
  type: VerificationTokenType;
  expiresAt: Date;
  consumedAt?: Date;
}

export class VerificationTokenModel
  extends Document
  implements VerificationToken
{
  userId!: Types.ObjectId;
  tokenHash!: string;
  type!: VerificationTokenType;
  expiresAt!: Date;
  consumedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const VerificationTokensCollection = 'verification_tokens';

export const VerificationTokenSchema: Schema<VerificationTokenModel> =
  createSchema({
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['email_verify', 'password_reset'],
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    consumedAt: { type: Date },
  });

VerificationTokenSchema.index({ userId: 1, type: 1 });
