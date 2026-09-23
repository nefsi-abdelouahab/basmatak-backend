import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const PORTFOLIO_VISIBILITIES = ['public', 'private'] as const;
export type PortfolioVisibility = (typeof PORTFOLIO_VISIBILITIES)[number];

/**
 * Portfolio item row (inventory §3, roadmap S14). The volunteer's curated
 * showcase: `mediaIds` reference `media` rows whose `portfolioItemId` is set
 * to this item (linkage maintained transactionally by the portfolio service).
 * `order` is the portal position under the `(volunteerId, order)` index.
 */
export interface PortfolioItem {
  volunteerId: Types.ObjectId;
  title: string;
  description?: string;
  mediaIds: Types.ObjectId[];
  visibility: PortfolioVisibility;
  order: number;
}

export class PortfolioItemModel extends Document implements PortfolioItem {
  volunteerId!: Types.ObjectId;
  title!: string;
  description?: string;
  mediaIds!: Types.ObjectId[];
  visibility!: PortfolioVisibility;
  order!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const PortfolioItemsCollection = 'portfolio_items';

export const PortfolioItemSchema: Schema<PortfolioItemModel> = createSchema({
  volunteerId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000 },
  mediaIds: { type: [Schema.Types.ObjectId], default: [] },
  visibility: {
    type: String,
    required: true,
    enum: PORTFOLIO_VISIBILITIES,
    default: 'public',
  },
  order: { type: Number, required: true, default: 0, min: 0 },
});

PortfolioItemSchema.index({ volunteerId: 1, order: 1 });
