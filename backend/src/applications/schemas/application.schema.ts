import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const ApplicationsCollection = 'applications';

export const APPLICATION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  opportunityId: Types.ObjectId;
  positionId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  organizationId: Types.ObjectId;
  status: ApplicationStatus;
  message?: string;
  reason?: string;
}

export class ApplicationModel extends Document implements Application {
  opportunityId!: Types.ObjectId;
  positionId!: Types.ObjectId;
  volunteerId!: Types.ObjectId;
  organizationId!: Types.ObjectId;
  status!: ApplicationStatus;
  message?: string;
  reason?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Applications collection (inventory §2.9, roadmap S7). `positionId`
 * references the embedded position `_id` inside the opportunity document; the
 * seat counters stay on the opportunity. The partial unique index enforces
 * "one live application per (position, volunteer)" where a live application is
 * `pending` or `accepted` (inventory §3); rejected/withdrawn rows are history
 * and never block re-applying.
 */
export const ApplicationSchema: Schema<ApplicationModel> = createSchema({
  opportunityId: { type: Schema.Types.ObjectId, required: true },
  positionId: { type: Schema.Types.ObjectId, required: true },
  volunteerId: { type: Schema.Types.ObjectId, required: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  status: {
    type: String,
    enum: APPLICATION_STATUSES,
    required: true,
    default: 'pending',
  },
  message: { type: String, trim: true, maxlength: 2000 },
  reason: { type: String, trim: true, maxlength: 2000 },
});

ApplicationSchema.index(
  { positionId: 1, volunteerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'accepted'] },
    },
  },
);
ApplicationSchema.index({ opportunityId: 1, status: 1 });
ApplicationSchema.index({ volunteerId: 1, status: 1 });
