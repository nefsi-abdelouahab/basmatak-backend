import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  AddVolunteerSkillDto,
  UpdateVolunteerSkillDto,
} from './dto/volunteer-skill.dto';
import {
  UpdatePublicSettingsDto,
  UpdateVolunteerProfileDto,
} from './dto/volunteer-profile.dto';
import {
  VolunteerProfile,
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from './schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from './schemas/volunteer-skill.schema';
import {
  emptySchedule,
  VolunteerAvailabilitiesCollection,
  VolunteerAvailabilityModel,
  WeeklySchedule,
} from './schemas/volunteer-availability.schema';

/** Public-read view (S2 seams; consumed by Session 12, inert until then). */
export interface PublicVolunteerProfile {
  username: string;
  firstName: string | null;
  avatar: string | null;
  bio: string | null;
  location: VolunteerProfile['location'] | null;
  skills: unknown[] | null;
  experiences: unknown[] | null;
  availability: unknown | null;
  portfolio: unknown | null;
}

export interface VolunteerDashboard {
  completionPercent: number;
  stats: VolunteerProfile['stats'];
  latestVerifiedExperience: null;
}

const FILLABLE_COUNT = 7;

@Injectable()
export class VolunteersService {
  constructor(
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(VolunteerSkillsCollection)
    private readonly volunteerSkillModel: Model<VolunteerSkillModel>,
    @InjectModel(VolunteerAvailabilitiesCollection)
    private readonly availabilityModel: Model<VolunteerAvailabilityModel>,
    @InjectModel(SkillsCollection)
    private readonly skillsCatalogModel: Model<SkillModel>,
  ) {}

  async requireProfile(userId: string): Promise<VolunteerProfileModel> {
    const profile = await this.profileModel.findOne({ userId }).exec();
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return profile;
  }

  async getMyProfile(userId: string): Promise<VolunteerProfileModel> {
    return this.requireProfile(userId);
  }

  async updateProfile(
    userId: string,
    dto: UpdateVolunteerProfileDto,
  ): Promise<VolunteerProfileModel> {
    const set: Record<string, unknown> = {};
    if (dto.firstName !== undefined) {
      set.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      set.lastName = dto.lastName;
    }
    if (dto.bio !== undefined) {
      set.bio = dto.bio;
    }
    if (dto.birthDate !== undefined) {
      set.birthDate = new Date(dto.birthDate);
    }
    if (dto.location !== undefined) {
      set.location = dto.location;
    }
    if (dto.avatar !== undefined) {
      set.avatar = new Types.ObjectId(dto.avatar);
    }
    if (dto.banner !== undefined) {
      set.banner = new Types.ObjectId(dto.banner);
    }
    const updated = await this.profileModel
      .findOneAndUpdate({ userId }, { $set: set }, { new: true })
      .exec();
    if (!updated) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return updated;
  }

  async updatePublicSettings(
    userId: string,
    dto: UpdatePublicSettingsDto,
  ): Promise<VolunteerProfileModel> {
    const flags = dto.publicProfile;
    const set: Record<string, boolean | undefined> = {};
    if (flags.enabled !== undefined) {
      set['publicProfile.enabled'] = flags.enabled;
    }
    if (flags.showAvatar !== undefined) {
      set['publicProfile.showAvatar'] = flags.showAvatar;
    }
    if (flags.showBiography !== undefined) {
      set['publicProfile.showBiography'] = flags.showBiography;
    }
    if (flags.showLocation !== undefined) {
      set['publicProfile.showLocation'] = flags.showLocation;
    }
    if (flags.showSkills !== undefined) {
      set['publicProfile.showSkills'] = flags.showSkills;
    }
    if (flags.showExperiences !== undefined) {
      set['publicProfile.showExperiences'] = flags.showExperiences;
    }
    if (flags.showAvailability !== undefined) {
      set['publicProfile.showAvailability'] = flags.showAvailability;
    }
    if (flags.showPortfolio !== undefined) {
      set['publicProfile.showPortfolio'] = flags.showPortfolio;
    }
    const updated = await this.profileModel
      .findOneAndUpdate({ userId }, { $set: set }, { new: true })
      .exec();
    if (!updated) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    return updated;
  }

  async listMySkills(userId: string): Promise<VolunteerSkillModel[]> {
    await this.requireProfile(userId);
    return this.volunteerSkillModel
      .find({ volunteerId: userId })
      .sort({ isPrimary: -1, createdAt: 1 })
      .exec();
  }

  async addSkill(
    userId: string,
    dto: AddVolunteerSkillDto,
  ): Promise<VolunteerSkillModel> {
    await this.requireProfile(userId);
    const catalogSkill = await this.skillsCatalogModel
      .findOne({ _id: dto.skillId })
      .exec();
    if (!catalogSkill || !catalogSkill.active) {
      throw new BusinessException(
        'SKILL_NOT_FOUND',
        'The skill is unknown or inactive',
        404,
      );
    }
    const exists = await this.volunteerSkillModel
      .exists({ volunteerId: userId, skillId: dto.skillId })
      .exec();
    if (exists) {
      throw new BusinessException(
        'SKILL_ALREADY_ADDED',
        'This skill is already on the profile',
        409,
      );
    }
    if (dto.isPrimary) {
      await this.clearPrimary(userId);
    }
    try {
      return await this.volunteerSkillModel.create({
        volunteerId: new Types.ObjectId(userId),
        skillId: new Types.ObjectId(dto.skillId),
        level: dto.level,
        yearsOfExperience: dto.yearsOfExperience ?? 0,
        isPrimary: dto.isPrimary ?? false,
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new BusinessException(
          'SKILL_ALREADY_ADDED',
          'This skill is already on the profile',
          409,
        );
      }
      throw error;
    }
  }

  async updateSkill(
    userId: string,
    skillId: string,
    dto: UpdateVolunteerSkillDto,
  ): Promise<VolunteerSkillModel> {
    await this.requireProfile(userId);
    if (!Types.ObjectId.isValid(skillId)) {
      throw new BusinessException(
        'VOLUNTEER_SKILL_NOT_FOUND',
        'Volunteer skill not found',
        404,
      );
    }
    if (dto.isPrimary === true) {
      await this.clearPrimary(userId);
    }
    const set: Record<string, unknown> = {};
    if (dto.level !== undefined) {
      set.level = dto.level;
    }
    if (dto.yearsOfExperience !== undefined) {
      set.yearsOfExperience = dto.yearsOfExperience;
    }
    if (dto.isPrimary !== undefined) {
      set.isPrimary = dto.isPrimary;
    }
    const updated = await this.volunteerSkillModel
      .findOneAndUpdate(
        { volunteerId: userId, _id: skillId },
        { $set: set },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessException(
        'VOLUNTEER_SKILL_NOT_FOUND',
        'Volunteer skill not found',
        404,
      );
    }
    return updated;
  }

  async deleteSkill(userId: string, skillId: string): Promise<void> {
    await this.requireProfile(userId);
    if (!Types.ObjectId.isValid(skillId)) {
      throw new BusinessException(
        'VOLUNTEER_SKILL_NOT_FOUND',
        'Volunteer skill not found',
        404,
      );
    }
    const result = await this.volunteerSkillModel
      .deleteOne({ volunteerId: userId, _id: skillId })
      .exec();
    if (result.deletedCount === 0) {
      throw new BusinessException(
        'VOLUNTEER_SKILL_NOT_FOUND',
        'Volunteer skill not found',
        404,
      );
    }
  }

  async getAvailability(userId: string): Promise<WeeklySchedule> {
    await this.requireProfile(userId);
    const row = await this.availabilityModel
      .findOne({ volunteerId: userId })
      .lean()
      .exec();
    return row ? row.schedule : emptySchedule();
  }

  async setAvailability(
    userId: string,
    schedule: WeeklySchedule,
  ): Promise<WeeklySchedule> {
    await this.requireProfile(userId);
    const updated = await this.availabilityModel
      .findOneAndUpdate(
        { volunteerId: userId },
        { $set: { schedule } },
        { upsert: true, new: true },
      )
      .exec();
    return (updated as VolunteerAvailabilityModel).schedule;
  }

  async getDashboard(userId: string): Promise<VolunteerDashboard> {
    const profile = await this.requireProfile(userId);
    const [hasSkill, availabilityRow] = await Promise.all([
      this.volunteerSkillModel.exists({ volunteerId: userId }).exec(),
      this.availabilityModel.findOne({ volunteerId: userId }).lean().exec(),
    ]);
    const completionPercent = this.computeCompletion(
      profile,
      Boolean(hasSkill),
      availabilityRow?.schedule,
    );
    return {
      completionPercent,
      stats: profile.stats,
      latestVerifiedExperience: null,
    };
  }

  async getPublicProfile(
    username: string,
  ): Promise<PublicVolunteerProfile | null> {
    const profile = await this.profileModel.findOne({ username }).exec();
    if (!profile || !profile.publicProfile.enabled) {
      return null;
    }
    const flags = profile.publicProfile;
    return {
      username: profile.username,
      firstName: flags.showBiography ? (profile.firstName ?? null) : null,
      avatar: flags.showAvatar
        ? profile.avatar
          ? profile.avatar.toString()
          : null
        : null,
      bio: flags.showBiography ? (profile.bio ?? null) : null,
      location: flags.showLocation ? (profile.location ?? null) : null,
      skills: flags.showSkills ? [] : null,
      experiences: flags.showExperiences ? [] : null,
      availability: flags.showAvailability ? null : null,
      portfolio: flags.showPortfolio ? null : null,
    };
  }

  async listPublicTalents(
    _filters: Record<string, unknown>,
  ): Promise<unknown[]> {
    return [];
  }

  async getPublicExperiences(_volunteerId: string): Promise<unknown[]> {
    return [];
  }

  private async clearPrimary(userId: string): Promise<void> {
    await this.volunteerSkillModel
      .updateMany(
        { volunteerId: userId, isPrimary: true },
        { $set: { isPrimary: false } },
      )
      .exec();
  }

  private computeCompletion(
    profile: VolunteerProfileModel,
    hasSkill: boolean,
    schedule?: WeeklySchedule,
  ): number {
    const hasNames = Boolean(profile.firstName && profile.lastName);
    const hasLocation = Boolean(
      profile.location?.wilayaId && profile.location?.municipalityId,
    );
    const hasAvailability = Object.values(schedule ?? {}).some(
      (slots) => slots.length > 0,
    );
    const filled = [
      hasNames,
      Boolean(profile.bio),
      Boolean(profile.birthDate),
      hasLocation,
      Boolean(profile.avatar),
      hasSkill,
      hasAvailability,
    ].filter(Boolean).length;
    return Math.round((filled / FILLABLE_COUNT) * 100);
  }
}
