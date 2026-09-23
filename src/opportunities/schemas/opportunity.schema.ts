import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const OpportunitiesCollection = 'opportunities';

export const OPPORTUNITY_STATUSES = [
  'draft',
  'published',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export interface OpportunityLocation {
  wilayaId?: string;
  municipalityId?: string;
  coordinates?: [number, number];
}

export interface Position {
  title: string;
  description: string;
  requiredCount: number;
  filledCount: number;
  requiredSkills: Types.ObjectId[];
}

export class PositionModel extends Document implements Position {
  _id!: Types.ObjectId;
  title!: string;
  description!: string;
  requiredCount!: number;
  filledCount!: number;
  requiredSkills!: Types.ObjectId[];
}

export interface Opportunity {
  organizationId: Types.ObjectId;
  slug: string;
  title: string;
  description: string;
  categoryId: Types.ObjectId;
  status: OpportunityStatus;
  startDate?: Date;
  applicationDeadline?: Date;
  location?: OpportunityLocation;
  positions: Position[];
}

export class OpportunityModel extends Document implements Opportunity {
  organizationId!: Types.ObjectId;
  slug!: string;
  title!: string;
  description!: string;
  categoryId!: Types.ObjectId;
  status!: OpportunityStatus;
  startDate?: Date;
  applicationDeadline?: Date;
  location?: OpportunityLocation;
  positions!: Types.DocumentArray<PositionModel>;
  createdAt!: Date;
  updatedAt!: Date;
}

const locationSchema = new Schema<OpportunityLocation>(
  {
    wilayaId: { type: String, trim: true },
    municipalityId: { type: String, trim: true },
    coordinates: { type: [Number], default: undefined },
  },
  { _id: false },
);

/**
 * Embedded position sub-document (inventory §2.8, §3). Owned by the
 * opportunity aggregate so seat counts update atomically with the document.
 */
export const PositionSchema: Schema<PositionModel> = new Schema<PositionModel>({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000 },
  requiredCount: { type: Number, required: true, min: 1 },
  filledCount: { type: Number, required: true, default: 0, min: 0 },
  requiredSkills: { type: [Schema.Types.ObjectId], default: [] },
});

export const OpportunitySchema: Schema<OpportunityModel> = createSchema({
  organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
  slug: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  categoryId: { type: Schema.Types.ObjectId },
  status: {
    type: String,
    enum: OPPORTUNITY_STATUSES,
    required: true,
    default: 'draft',
  },
  startDate: { type: Date },
  applicationDeadline: { type: Date },
  location: { type: locationSchema },
  positions: { type: [PositionSchema], default: [] },
});

// Indexes (inventory §3). Text and 2dsphere are mutually exclusive in a
// single query (F11); Session 19 records the canonical feed choice: keyword
// via bounded $regex with an early status/category bound, geo via the indexed
// `location` equality fields. The text index stays reserved (unqueried) and
// the `(status, …)` compounds serve feed/geo/startDate lookups.
OpportunitySchema.index({ slug: 1 }, { unique: true });
OpportunitySchema.index({ status: 1, startDate: 1 });
OpportunitySchema.index({ status: 1, categoryId: 1 });
OpportunitySchema.index({ status: 1, 'location.wilayaId': 1 });
OpportunitySchema.index({ status: 1, 'location.municipalityId': 1 });
OpportunitySchema.index({ organizationId: 1, status: 1 });
OpportunitySchema.index({ 'location.coordinates': '2dsphere' });
OpportunitySchema.index({ title: 'text', description: 'text' });
OpportunitySchema.index({ 'positions.requiredSkills': 1 });
