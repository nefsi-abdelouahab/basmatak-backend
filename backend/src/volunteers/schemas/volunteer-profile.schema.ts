import { Schema, Document, Types } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface VolunteerProfileStats {
  completedTasks: number;
  verifiedExperiences: number;
  volunteerHours: number;
}

export interface VolunteerPublicProfile {
  enabled: boolean;
  showAvatar: boolean;
  showBiography: boolean;
  showLocation: boolean;
  showSkills: boolean;
  showExperiences: boolean;
  showAvailability: boolean;
  showPortfolio: boolean;
}

export interface VolunteerLocation {
  wilayaId?: string;
  municipalityId?: string;
}

export interface VolunteerProfile {
  userId: Types.ObjectId;
  username: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  location?: VolunteerLocation;
  avatar?: Types.ObjectId;
  banner?: Types.ObjectId;
  stats: VolunteerProfileStats;
  publicProfile: VolunteerPublicProfile;
}

export class VolunteerProfileModel
  extends Document
  implements VolunteerProfile
{
  userId!: Types.ObjectId;
  username!: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  location?: VolunteerLocation;
  avatar?: Types.ObjectId;
  banner?: Types.ObjectId;
  stats!: VolunteerProfileStats;
  publicProfile!: VolunteerPublicProfile;
  createdAt!: Date;
  updatedAt!: Date;
}

export const VolunteerProfilesCollection = 'volunteer_profiles';

/** A5 defaults: the profile is private until the owner deliberately enables it. */
export function defaultPublicProfile(): VolunteerPublicProfile {
  return {
    enabled: false,
    showAvatar: false,
    showBiography: false,
    showLocation: false,
    showSkills: false,
    showExperiences: false,
    showAvailability: false,
    showPortfolio: false,
  };
}

export function defaultStats(): VolunteerProfileStats {
  return { completedTasks: 0, verifiedExperiences: 0, volunteerHours: 0 };
}

const publicProfileSchema = new Schema<VolunteerPublicProfile>(
  {
    enabled: { type: Boolean, default: false },
    showAvatar: { type: Boolean, default: false },
    showBiography: { type: Boolean, default: false },
    showLocation: { type: Boolean, default: false },
    showSkills: { type: Boolean, default: false },
    showExperiences: { type: Boolean, default: false },
    showAvailability: { type: Boolean, default: false },
    showPortfolio: { type: Boolean, default: false },
  },
  { _id: false },
);

const statsSchema = new Schema<VolunteerProfileStats>(
  {
    completedTasks: { type: Number, default: 0, min: 0 },
    verifiedExperiences: { type: Number, default: 0, min: 0 },
    volunteerHours: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const locationSchema = new Schema<VolunteerLocation>(
  {
    wilayaId: { type: String, trim: true },
    municipalityId: { type: String, trim: true },
  },
  { _id: false },
);

export const VolunteerProfileSchema: Schema<VolunteerProfileModel> =
  createSchema({
    userId: { type: Schema.Types.ObjectId, required: true },
    username: { type: String, required: true, trim: true, maxlength: 80 },
    firstName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 2000 },
    birthDate: { type: Date },
    location: { type: locationSchema },
    avatar: { type: Schema.Types.ObjectId },
    banner: { type: Schema.Types.ObjectId },
    stats: { type: statsSchema, default: () => defaultStats() },
    publicProfile: {
      type: publicProfileSchema,
      default: () => defaultPublicProfile(),
    },
  });

VolunteerProfileSchema.index({ userId: 1 }, { unique: true });
VolunteerProfileSchema.index({ username: 1 }, { unique: true });
VolunteerProfileSchema.index({ 'location.municipalityId': 1 });
VolunteerProfileSchema.index({ 'publicProfile.enabled': 1 });
