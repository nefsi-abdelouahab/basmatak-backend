import { Schema, Types, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export const VolunteerExperiencesCollection = 'volunteer_experiences';

export const EXPERIENCE_VISIBILITIES = ['public', 'private'] as const;

export type ExperienceVisibility = (typeof EXPERIENCE_VISIBILITIES)[number];

export interface VolunteerExperience {
  submissionId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  organizationId: Types.ObjectId;
  opportunityId: Types.ObjectId;
  positionId: Types.ObjectId;
  title: string;
  registryId: string;
  description?: string;
  skills: Types.ObjectId[];
  duration: number;
  evidenceIds: Types.ObjectId[];
  verificationCode: string;
  publicVisibility: ExperienceVisibility;
}

export class VolunteerExperienceModel
  extends Document
  implements VolunteerExperience
{
  submissionId!: Types.ObjectId;
  volunteerId!: Types.ObjectId;
  organizationId!: Types.ObjectId;
  opportunityId!: Types.ObjectId;
  positionId!: Types.ObjectId;
  title!: string;
  registryId!: string;
  description?: string;
  skills!: Types.ObjectId[];
  duration!: number;
  evidenceIds!: Types.ObjectId[];
  verificationCode!: string;
  publicVisibility!: ExperienceVisibility;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Volunteer experiences collection (inventory §2.14, roadmap S11 Part B). One
 * row per approved submission (unique `submissionId`), created only by the
 * verify transaction — there is no create/edit route. Snapshot fields
 * (title/description/skills/duration) are copied from the position at verify
 * time; `verificationCode` is the unique A12 proof code.
 */
export const VolunteerExperienceSchema: Schema<VolunteerExperienceModel> =
  createSchema({
    submissionId: { type: Schema.Types.ObjectId, required: true },
    volunteerId: { type: Schema.Types.ObjectId, required: true },
    organizationId: { type: Schema.Types.ObjectId, required: true },
    opportunityId: { type: Schema.Types.ObjectId, required: true },
    positionId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Server-minted neutral registry id (EXP-…); owned by the registry-ids
    // session — never accepted from client input and never updated.
    registryId: { type: String, trim: true, maxlength: 32 },
    description: { type: String, trim: true, maxlength: 2000 },
    skills: { type: [Schema.Types.ObjectId], default: [] },
    duration: { type: Number, required: true, default: 0, min: 0 },
    evidenceIds: { type: [Schema.Types.ObjectId], default: [] },
    verificationCode: { type: String, required: true, trim: true },
    publicVisibility: {
      type: String,
      enum: EXPERIENCE_VISIBILITIES,
      required: true,
      default: 'public',
    },
  });

// Indexes (inventory §3): one experience per approved submission; the A12
// proof code is unique (E11000 retry); the volunteer's own list filters
// `(volunteerId, publicVisibility)`.
VolunteerExperienceSchema.index({ submissionId: 1 }, { unique: true });
VolunteerExperienceSchema.index({ verificationCode: 1 }, { unique: true });
VolunteerExperienceSchema.index({ volunteerId: 1, publicVisibility: 1 });
