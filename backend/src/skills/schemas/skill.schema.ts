import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface Skill {
  slug: string;
  categoryId: Types.ObjectId;
  nameAr: string;
  nameFr: string;
  order: number;
  active: boolean;
}

export class SkillModel extends Document implements Skill {
  slug!: string;
  categoryId!: Types.ObjectId;
  nameAr!: string;
  nameFr!: string;
  order!: number;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SkillsCollection = 'skills';

export const SkillSchema: Schema<SkillModel> = createSchema({
  slug: { type: String, required: true },
  categoryId: { type: Schema.Types.ObjectId, required: true },
  nameAr: { type: String, required: true, trim: true },
  nameFr: { type: String, required: true, trim: true },
  order: { type: Number, required: true, min: 0 },
  active: { type: Boolean, required: true, default: true },
});

SkillSchema.index({ slug: 1 }, { unique: true });
SkillSchema.index({ categoryId: 1 });
