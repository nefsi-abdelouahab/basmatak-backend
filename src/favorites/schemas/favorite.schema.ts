import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const FavoritesCollection = 'favorites';

export const FAVORITE_TARGET_TYPES = [
  'opportunity',
  'talent',
  'organization',
] as const;

export type FavoriteTargetType = (typeof FAVORITE_TARGET_TYPES)[number];

export interface Favorite {
  userId: Types.ObjectId;
  targetType: FavoriteTargetType;
  targetId: string;
}

export class FavoriteModel extends Document implements Favorite {
  userId!: Types.ObjectId;
  targetType!: FavoriteTargetType;
  targetId!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Saved/bookmark rows (Session 17 `backend-v2-favorites`, RP Part 7 favorites
 * row). One row per `(userId, targetType, targetId)` triple — enforced by the
 * unique index, which is also the concurrency arbiter for double-POST races.
 * `targetId` is a string by design: the opportunity ObjectId hex for
 * `opportunity`, the volunteer `userId` hex for `talent`, and the organization
 * `userId` hex for `organization` (usernames/slugs resolve server-side at
 * write time so renames never orphan rows).
 */
export const FavoriteSchema = createSchema({
  userId: { type: Schema.Types.ObjectId, required: true },
  targetType: {
    type: String,
    required: true,
    enum: FAVORITE_TARGET_TYPES,
  },
  targetId: { type: String, required: true, trim: true },
});

FavoriteSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
FavoriteSchema.index({ userId: 1, targetType: 1, createdAt: -1 });
FavoriteSchema.index({ targetType: 1, targetId: 1 });
