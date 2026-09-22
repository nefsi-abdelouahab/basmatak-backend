import { Schema, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface SkillCategory {
  slug: string;
  nameAr: string;
  nameFr: string;
  order: number;
  active: boolean;
}

export class SkillCategoryModel extends Document implements SkillCategory {
  slug!: string;
  nameAr!: string;
  nameFr!: string;
  order!: number;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SkillCategoriesCollection = 'skill_categories';

export const SkillCategorySchema: Schema<SkillCategoryModel> = createSchema({
  slug: { type: String, required: true },
  nameAr: { type: String, required: true, trim: true },
  nameFr: { type: String, required: true, trim: true },
  order: { type: Number, required: true, min: 0 },
  active: { type: Boolean, required: true, default: true },
});

SkillCategorySchema.index({ slug: 1 }, { unique: true });
SkillCategorySchema.index({ order: 1 });
