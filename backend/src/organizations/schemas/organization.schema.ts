import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export type OrganizationVerificationStatus =
  'pending' | 'verified' | 'rejected';
export type OrganizationStatus = 'active' | 'suspended' | 'deleted';

export interface OrganizationReliability {
  score?: number;
  responseRate?: number;
  decidedRatio?: number;
  medianDecisionHours?: number;
  anomaly?: boolean;
  lastRefreshedAt?: Date;
}

export interface Organization {
  userId: Types.ObjectId;
  slug: string;
  registryId: string;
  nameAr?: string;
  nameFr?: string;
  description?: string;
  logoMediaId?: Types.ObjectId;
  verificationStatus: OrganizationVerificationStatus;
  status: OrganizationStatus;
  reliability?: OrganizationReliability;
}

export class OrganizationModel extends Document implements Organization {
  userId!: Types.ObjectId;
  slug!: string;
  registryId!: string;
  nameAr?: string;
  nameFr?: string;
  description?: string;
  logoMediaId?: Types.ObjectId;
  verificationStatus!: OrganizationVerificationStatus;
  status!: OrganizationStatus;
  reliability?: OrganizationReliability;
  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationsCollection = 'organizations';

export const OrganizationSchema: Schema<OrganizationModel> = createSchema({
  userId: { type: Schema.Types.ObjectId, required: true },
  slug: { type: String, required: true, trim: true },
  // Server-minted neutral registry id (ORG-…); owned by the registry-ids
  // session — never accepted from client input and never updated.
  registryId: { type: String, trim: true, maxlength: 32 },
  nameAr: { type: String, trim: true },
  nameFr: { type: String, trim: true },
  description: { type: String, trim: true },
  logoMediaId: { type: Schema.Types.ObjectId },
  verificationStatus: {
    type: String,
    required: true,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  },
  reliability: { type: Schema.Types.Mixed },
});

OrganizationSchema.index({ userId: 1 }, { unique: true });
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ verificationStatus: 1, status: 1 });
