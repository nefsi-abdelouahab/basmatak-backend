import { Schema, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export type LocationType = 'wilaya' | 'municipality';

export interface Location {
  code: string;
  type: LocationType;
  parentCode?: string;
  nameAr: string;
  nameFr: string;
  legacyId?: string;
}

export class LocationModel extends Document implements Location {
  code!: string;
  type!: LocationType;
  parentCode?: string;
  nameAr!: string;
  nameFr!: string;
  legacyId?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const LocationsCollection = 'locations';

export const LocationSchema: Schema<LocationModel> = createSchema({
  code: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['wilaya', 'municipality'] },
  parentCode: { type: String, trim: true },
  nameAr: { type: String, required: true, trim: true },
  nameFr: { type: String, required: true, trim: true },
  legacyId: { type: String },
});

LocationSchema.index({ code: 1 }, { unique: true });
LocationSchema.index({ type: 1, parentCode: 1 });
