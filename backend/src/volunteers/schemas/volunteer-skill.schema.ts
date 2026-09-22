import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

/** A skill attached to a volunteer profile (catalog `skills` row + level). */
export interface VolunteerSkill {
  volunteerId: Types.ObjectId;
  skillId: Types.ObjectId;
  level: number;
  yearsOfExperience: number;
  isPrimary: boolean;
}

export class VolunteerSkillModel extends Document implements VolunteerSkill {
  volunteerId!: Types.ObjectId;
  skillId!: Types.ObjectId;
  level!: number;
  yearsOfExperience!: number;
  isPrimary!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const VolunteerSkillsCollection = 'volunteer_skills';

export const VolunteerSkillSchema: Schema<VolunteerSkillModel> = createSchema({
  volunteerId: { type: Schema.Types.ObjectId, required: true },
  skillId: { type: Schema.Types.ObjectId, required: true },
  level: { type: Number, required: true, min: 1, max: 5 },
  yearsOfExperience: { type: Number, default: 0, min: 0, max: 100 },
  isPrimary: { type: Boolean, default: false },
});

VolunteerSkillSchema.index({ volunteerId: 1, skillId: 1 }, { unique: true });
