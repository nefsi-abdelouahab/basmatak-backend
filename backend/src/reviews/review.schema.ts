import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../common/schema/base.schema';

export const ReviewsCollection = 'reviews';

export interface Review {
  submissionId: Types.ObjectId;
  organizationId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  rating: number;
  comment?: string;
}

export class ReviewModel extends Document implements Review {
  submissionId!: Types.ObjectId;
  organizationId!: Types.ObjectId;
  volunteerId!: Types.ObjectId;
  rating!: number;
  comment?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Reviews data layer (inventory §2.16, roadmap S13 owner-split / F16). A
 * review is distinct from a verification: verification says "done", a review
 * says "how well". The schema/model is shared from here and written inside the
 * verify transaction; the §2.16 review CONTROLLERS are Session 13's work — no
 * controller exists in this change.
 */
export const ReviewSchema: Schema<ReviewModel> = createSchema({
  submissionId: { type: Schema.Types.ObjectId, required: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  volunteerId: { type: Schema.Types.ObjectId, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 2000 },
});

// Indexes (inventory §3): one review per submission; the §2.16 list reads
// (Session 13) filter by `organizationId` and `volunteerId`.
ReviewSchema.index({ submissionId: 1 }, { unique: true });
ReviewSchema.index({ organizationId: 1 });
ReviewSchema.index({ volunteerId: 1 });
