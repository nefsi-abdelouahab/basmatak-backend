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

export interface OrganizationLocation {
  wilayaId?: string;
  municipalityId?: string;
  address?: string;
}

export interface OrganizationContact {
  email?: string;
  phone?: string;
}

export interface OrganizationPublicProfile {
  enabled: boolean;
}

export interface Organization {
  userId: Types.ObjectId;
  slug: string;
  registryId: string;
  nameAr?: string;
  nameFr?: string;
  description?: string;
  logoMediaId?: Types.ObjectId;
  coverMediaId?: Types.ObjectId;
  type?: string;
  registrationNumber?: string;
  location?: OrganizationLocation;
  website?: string;
  foundedYear?: number;
  contact?: OrganizationContact;
  focusDisciplines?: Types.ObjectId[];
  operatingScope?: string;
  publicProfile?: OrganizationPublicProfile;
  annualReportMediaId?: Types.ObjectId | null;
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
  coverMediaId?: Types.ObjectId;
  type?: string;
  registrationNumber?: string;
  location?: OrganizationLocation;
  website?: string;
  foundedYear?: number;
  contact?: OrganizationContact;
  focusDisciplines?: Types.ObjectId[];
  operatingScope?: string;
  publicProfile?: OrganizationPublicProfile;
  annualReportMediaId?: Types.ObjectId | null;
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
  // Organization fact sheet (Session 14 `backend-v2-org-facts`): all fields
  // optional/nullable so legacy rows read back null-safe. `type` and
  // `operatingScope` stay bounded free-form short texts (owner-confirmed Q1/Q2
  // — no invented enum). No perks-equivalent marketing paths beyond the bare
  // `annualReportMediaId` attach (owner-confirmed cut, FCD #2).
  coverMediaId: { type: Schema.Types.ObjectId },
  type: { type: String, trim: true, maxlength: 80 },
  registrationNumber: { type: String, trim: true, maxlength: 80 },
  location: {
    wilayaId: { type: String, trim: true },
    municipalityId: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 500 },
  },
  website: { type: String, trim: true, maxlength: 500 },
  foundedYear: { type: Number, min: 1800 },
  contact: {
    email: { type: String, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
  },
  focusDisciplines: {
    type: [Schema.Types.ObjectId],
    default: [],
  },
  operatingScope: { type: String, trim: true, maxlength: 120 },
  publicProfile: {
    enabled: { type: Boolean, default: true },
  },
  annualReportMediaId: { type: Schema.Types.ObjectId, default: null },
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
