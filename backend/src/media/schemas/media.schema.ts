import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';
import {
  MEDIA_PURPOSES,
  MediaPurpose,
  MediaType,
  MediaVisibility,
} from '../media.constants';

/**
 * Media row (inventory §3, roadmap S8). Metadata ONLY — file bytes live in
 * object storage behind the `StorageProvider`; Mongo never holds content.
 * `storageKey` is absent for `type=link` rows (unique-sparse index below).
 */
export interface Media {
  ownerId: Types.ObjectId;
  purpose: MediaPurpose;
  visibility: MediaVisibility;
  type: MediaType;
  storageKey?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  submissionId?: Types.ObjectId;
  portfolioItemId?: Types.ObjectId;
  confirmedAt?: Date;
  deletedAt?: Date;
}

export class MediaModel extends Document implements Media {
  ownerId!: Types.ObjectId;
  purpose!: MediaPurpose;
  visibility!: MediaVisibility;
  type!: MediaType;
  storageKey?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  submissionId?: Types.ObjectId;
  portfolioItemId?: Types.ObjectId;
  confirmedAt?: Date;
  deletedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const MediaCollection = 'media';

export const MediaSchema: Schema<MediaModel> = createSchema({
  ownerId: { type: Schema.Types.ObjectId, required: true },
  purpose: {
    type: String,
    required: true,
    enum: MEDIA_PURPOSES,
  },
  visibility: {
    type: String,
    required: true,
    enum: ['public', 'private'],
    default: 'public',
  },
  type: { type: String, required: true, enum: ['file', 'link'] },
  storageKey: { type: String, trim: true },
  filename: { type: String, trim: true },
  mimeType: { type: String, trim: true },
  size: { type: Number },
  url: { type: String, trim: true },
  submissionId: { type: Schema.Types.ObjectId },
  portfolioItemId: { type: Schema.Types.ObjectId },
  confirmedAt: { type: Date },
  deletedAt: { type: Date },
});

MediaSchema.index({ storageKey: 1 }, { unique: true, sparse: true });
MediaSchema.index({ ownerId: 1 });
MediaSchema.index({ submissionId: 1 });
MediaSchema.index({ portfolioItemId: 1 });
