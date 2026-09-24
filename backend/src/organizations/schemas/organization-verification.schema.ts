import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';
import { OrganizationVerificationStatus } from './organization.schema';

export interface OrganizationVerification {
  organizationId: Types.ObjectId;
  status: OrganizationVerificationStatus;
  documents: Types.ObjectId[];
  rejectionReason?: string;
  /** Owning admin account for triage (Session 10 `backend-v2-admin-lists`). */
  assignedAdminId?: Types.ObjectId;
  submittedAt: Date;
  decidedAt?: Date;
  decidedBy?: Types.ObjectId;
}

export class OrganizationVerificationModel
  extends Document
  implements OrganizationVerification
{
  organizationId!: Types.ObjectId;
  status!: OrganizationVerificationStatus;
  documents!: Types.ObjectId[];
  rejectionReason?: string;
  assignedAdminId?: Types.ObjectId;
  submittedAt!: Date;
  decidedAt?: Date;
  decidedBy?: Types.ObjectId;
  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationVerificationsCollection = 'organization_verifications';

export const OrganizationVerificationSchema: Schema<OrganizationVerificationModel> =
  createSchema({
    organizationId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    documents: { type: [Schema.Types.ObjectId], required: true },
    rejectionReason: { type: String, trim: true },
    assignedAdminId: { type: Schema.Types.ObjectId },
    submittedAt: { type: Date, required: true },
    decidedAt: { type: Date },
    decidedBy: { type: Schema.Types.ObjectId },
  });

OrganizationVerificationSchema.index({ organizationId: 1, status: 1 });
OrganizationVerificationSchema.index({ organizationId: 1, submittedAt: -1 });
OrganizationVerificationSchema.index({ assignedAdminId: 1, status: 1 });
