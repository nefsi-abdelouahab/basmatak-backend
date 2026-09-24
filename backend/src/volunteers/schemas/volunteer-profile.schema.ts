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
  /** Gates the public `stats` block (Session 9 opt-out addition). */
  showStats: boolean;
}

export interface VolunteerLocation {
  wilayaId?: string;
  municipalityId?: string;
}

export interface VolunteerProfile {
  userId: Types.ObjectId;
  username: string;
  registryId: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  location?: VolunteerLocation;
  avatar?: Types.ObjectId;
  banner?: Types.ObjectId;
  /** Short public tagline (Session 9, max 120). */
  headline?: string;
  /** Free-text availability note complementing the weekly schedule (Session 9, max 500). */
  availabilityNote?: string;
  /** Preferred contribution domains, free text (Session 9, max 10 x 60). */
  preferredDomains?: string[];
  /** Geographic base, free text (Session 9, max 120). */
  geographicBase?: string;
  stats: VolunteerProfileStats;
  publicProfile: VolunteerPublicProfile;
}

export class VolunteerProfileModel
  extends Document
  implements VolunteerProfile
{
  userId!: Types.ObjectId;
  username!: string;
  registryId!: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  location?: VolunteerLocation;
  avatar?: Types.ObjectId;
  banner?: Types.ObjectId;
  headline?: string;
  availabilityNote?: string;
  preferredDomains?: string[];
  geographicBase?: string;
  stats!: VolunteerProfileStats;
  publicProfile!: VolunteerPublicProfile;
  createdAt!: Date;
  updatedAt!: Date;
}

export const VolunteerProfilesCollection = 'volunteer_profiles';

/** Decision 5 opt-out defaults: the profile is public until the owner disables it. */
export function defaultPublicProfile(): VolunteerPublicProfile {
  return {
    enabled: true,
    showAvatar: false,
    showBiography: true,
    showLocation: false,
    showSkills: true,
    showExperiences: true,
    showAvailability: false,
    showPortfolio: true,
    showStats: true,
  };
}

export function defaultStats(): VolunteerProfileStats {
  return { completedTasks: 0, verifiedExperiences: 0, volunteerHours: 0 };
}

const publicProfileSchema = new Schema<VolunteerPublicProfile>(
  {
    enabled: { type: Boolean, default: true },
    showAvatar: { type: Boolean, default: false },
    showBiography: { type: Boolean, default: true },
    showLocation: { type: Boolean, default: false },
    showSkills: { type: Boolean, default: true },
    showExperiences: { type: Boolean, default: true },
    showAvailability: { type: Boolean, default: false },
    showPortfolio: { type: Boolean, default: true },
    showStats: { type: Boolean, default: true },
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
    // Server-minted neutral registry id (VOL-…); owned by the registry-ids
    // session — never accepted from client input and never updated.
    registryId: { type: String, trim: true, maxlength: 32 },
    firstName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 2000 },
    birthDate: { type: Date },
    location: { type: locationSchema },
    avatar: { type: Schema.Types.ObjectId },
    banner: { type: Schema.Types.ObjectId },
    headline: { type: String, trim: true, maxlength: 120 },
    availabilityNote: { type: String, trim: true, maxlength: 500 },
    preferredDomains: { type: [String], default: undefined },
    geographicBase: { type: String, trim: true, maxlength: 120 },
    stats: { type: statsSchema, default: () => defaultStats() },
    publicProfile: {
      type: publicProfileSchema,
      default: () => defaultPublicProfile(),
    },
  });

VolunteerProfileSchema.index({ userId: 1 }, { unique: true });
VolunteerProfileSchema.index({ username: 1 }, { unique: true });
VolunteerProfileSchema.index({ 'location.municipalityId': 1 });
// The compound single leading `publicProfile.enabled` serves the talents
// feed's enabled-only filter and its prefix search; it replaces the lone
// `publicProfile.enabled` index (S19 index review).
VolunteerProfileSchema.index({
  'publicProfile.enabled': 1,
  'location.municipalityId': 1,
});
