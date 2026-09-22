import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const VerificationsCollection = 'verifications';

export const VERIFICATION_STATUSES = ['verified', 'rejected'] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface Verification {
  submissionId: Types.ObjectId;
  organizationId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  status: VerificationStatus;
  notes?: string;
  reason?: string;
  decidedAt: Date;
  decidedBy: Types.ObjectId;
}

export class VerificationModel extends Document implements Verification {
  submissionId!: Types.ObjectId;
  organizationId!: Types.ObjectId;
  volunteerId!: Types.ObjectId;
  status!: VerificationStatus;
  notes?: string;
  reason?: string;
  decidedAt!: Date;
  decidedBy!: Types.ObjectId;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Verifications collection (inventory §2.13, roadmap S11 Part B). One row per
 * submission (unique `submissionId`, reused/updated on resubmission); rows are
 * created terminal only (`verified` on approve, `rejected` on reject) — no
 * `pending` state ever exists (F12). `decidedBy` is the deciding org account's
 * user id.
 */
export const VerificationSchema: Schema<VerificationModel> = createSchema({
  submissionId: { type: Schema.Types.ObjectId, required: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  volunteerId: { type: Schema.Types.ObjectId, required: true },
  status: {
    type: String,
    enum: VERIFICATION_STATUSES,
    required: true,
  },
  notes: { type: String, trim: true, maxlength: 2000 },
  reason: { type: String, trim: true, maxlength: 2000 },
  decidedAt: { type: Date, required: true, default: () => new Date() },
  decidedBy: { type: Schema.Types.ObjectId, required: true },
});

// Indexes (inventory §3): one verification row per submission; the org read
// filters `(organizationId, status)`.
VerificationSchema.index({ submissionId: 1 }, { unique: true });
VerificationSchema.index({ organizationId: 1, status: 1 });
