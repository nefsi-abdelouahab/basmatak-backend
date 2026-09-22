import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import { MediaOwnership } from '../common/seams/media-ownership';
import {
  PortfolioQueryService,
  PublicPortfolio,
} from '../common/seams/portfolio-query.service';
import { MediaCollection, MediaModel } from '../media/schemas/media.schema';
import {
  VolunteerExperiencesCollection,
  VolunteerExperienceModel,
} from '../verifications/schemas/volunteer-experience.schema';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  buildCursor,
  decodeCursor,
  MAX_LIMIT,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { TalentsQueryDto } from './dto/talents.dto';
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

/** A skill on a public profile / talent card, joined to the catalog (A5-gated). */
export interface TalentSkill {
  skillId: string;
  nameAr: string;
  nameFr: string;
  level: number;
  isPrimary: boolean;
}

/** Public-safety projection of an enabled volunteer profile (talents feed). */
export interface TalentCard {
  username: string;
  firstName: string | null;
  bio: string | null;
  location: { wilayaId: string } | null;
  skills: TalentSkill[] | null;
  avatar: string | null;
}

/** Evidence metadata restricted to `visibility=public` media (A6). */
export interface PublicExperienceEvidence {
  mediaId: string;
  type: string;
  mimeType: string | null;
  filename: string | null;
  url: string | null;
}

/** Public snapshot of one `volunteer_experiences` row (publicVisibility=public). */
export interface PublicExperienceCard {
  id: string;
  title: string;
  description: string;
  duration: number;
  skills: string[];
  evidence: PublicExperienceEvidence[];
}

/** Public-read view (S2 seams; populated by Session 12). */
export interface PublicVolunteerProfile {
  username: string;
  firstName: string | null;
  avatar: string | null;
  bio: string | null;
  location: VolunteerProfile['location'] | null;
  skills: TalentSkill[] | null;
  experiences: PublicExperienceCard[] | null;
  availability: WeeklySchedule | null;
  portfolio: unknown | null;
}

export interface VolunteerDashboard {
  completionPercent: number;
  stats: VolunteerProfile['stats'];
  latestVerifiedExperience: null;
}

const FILLABLE_COUNT = 7;

/** Escapes regex meta-characters so user input stays a literal match (F11). */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    private readonly mediaOwnership: MediaOwnership,
    private readonly portfolioQuery: PortfolioQueryService,
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
      await this.mediaOwnership.assertFor(dto.avatar, userId, 'avatar');
      set.avatar = new Types.ObjectId(dto.avatar);
    }
    if (dto.banner !== undefined) {
      await this.mediaOwnership.assertFor(dto.banner, userId);
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

  async findEnabledProfileByUsername(
    username: string,
  ): Promise<VolunteerProfileModel | null> {
    return this.findEnabledProfile(username);
  }

  /**
   * A5 public profile resolver (inventory §2.6, roadmap S12): `null` for
   * unknown/disabled profiles, otherwise sections populated only under their
   * `show*` flag. Avatar is resolved only when its media is `visibility=public`.
   */
  async getPublicProfile(
    username: string,
  ): Promise<PublicVolunteerProfile | null> {
    const profile = await this.findEnabledProfile(username);
    if (!profile) {
      return null;
    }
    const flags = profile.publicProfile;
    const userId = profile.userId.toString();

    const [skills, experiences, availability, avatar, portfolio] =
      await Promise.all([
        flags.showSkills ? this.loadPublicSkills(userId) : Promise.resolve([]),
        flags.showExperiences
          ? this.loadPublicExperiences(userId, MAX_LIMIT).then(
              (page) => page.items,
            )
          : Promise.resolve([]),
        flags.showAvailability
          ? this.loadAvailability(userId)
          : Promise.resolve(emptySchedule()),
        flags.showAvatar && profile.avatar
          ? this.resolvePublicAvatar(profile.avatar)
          : Promise.resolve(null),
        flags.showPortfolio
          ? this.portfolioQuery.getPublicPortfolio(username)
          : Promise.resolve(null),
      ]);

    return {
      username: profile.username,
      firstName: flags.showBiography ? (profile.firstName ?? null) : null,
      avatar: flags.showAvatar && profile.avatar ? avatar : null,
      bio: flags.showBiography ? (profile.bio ?? null) : null,
      location: flags.showLocation ? (profile.location ?? null) : null,
      skills: flags.showSkills ? skills : null,
      experiences: flags.showExperiences ? experiences : null,
      availability: flags.showAvailability ? availability : null,
      portfolio,
    };
  }

  /**
   * Talents feed over enabled profiles (D2): bounded `q`, skill/category/wilaya
   * facet filters, S1 cursor paging, public-safety projection only.
   */
  async listPublicTalents(
    query: TalentsQueryDto,
  ): Promise<CursorPage<TalentCard>> {
    const limit = normalizeLimit(query.limit);
    const filter: FilterQuery<VolunteerProfileModel> = {
      'publicProfile.enabled': true,
    };
    if (query.wilayaId) {
      filter['location.wilayaId'] = query.wilayaId;
    }
    const skillUserIds = await this.resolveSkillUserIds(
      query.skillId,
      query.categoryId,
    );
    if (skillUserIds) {
      filter.userId = {
        $in: [...skillUserIds].map((id) => new Types.ObjectId(id)),
      };
    }
    if (query.q) {
      const pattern = escapeRegex(query.q.trim()).slice(0, 60);
      if (pattern) {
        filter.$or = [
          { username: { $regex: pattern, $options: 'i' } },
          { firstName: { $regex: pattern, $options: 'i' } },
          { lastName: { $regex: pattern, $options: 'i' } },
          { bio: { $regex: pattern, $options: 'i' } },
        ];
      }
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }

    const rows = await this.profileModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const cards = await this.mapTalentCards(items);
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return { items: cards, nextCursor: buildCursor(lastId).cursor, limit };
  }

  /**
   * Standalone public experience listing (D4): only `publicVisibility=public`
   * rows, newest-first, S1 cursor paging, evidence restricted to A6 public media.
   */
  async getPublicExperiences(
    volunteerId: string,
    limit?: string | number,
    rawCursor?: string,
  ): Promise<CursorPage<PublicExperienceCard>> {
    return this.loadPublicExperiences(
      volunteerId,
      normalizeLimit(limit),
      rawCursor,
    );
  }

  /** Portfolio served by the unchanged S1 seam (empty `{ items: [] }` until S14). */
  async getPublicPortfolio(username: string): Promise<PublicPortfolio> {
    return this.portfolioQuery.getPublicPortfolio(username);
  }

  /***************************************************************************
   * Public-read internals (A5/A6)
   **************************************************************************/

  private async findEnabledProfile(
    username: string,
  ): Promise<VolunteerProfileModel | null> {
    const profile = await this.profileModel.findOne({ username }).exec();
    if (!profile || !profile.publicProfile.enabled) {
      return null;
    }
    return profile;
  }

  private async loadPublicSkills(userId: string): Promise<TalentSkill[]> {
    const rows = await this.volunteerSkillModel
      .find({ volunteerId: userId })
      .sort({ isPrimary: -1, createdAt: 1 })
      .exec();
    if (rows.length === 0) {
      return [];
    }
    const catalog = await this.skillsCatalogModel
      .find({
        _id: { $in: rows.map((row) => row.skillId) },
        active: true,
      })
      .exec();
    const byId = new Map(catalog.map((skill) => [skill._id.toString(), skill]));
    const skills: TalentSkill[] = [];
    for (const row of rows) {
      const skill = byId.get(row.skillId.toString());
      if (!skill) {
        continue;
      }
      skills.push({
        skillId: row.skillId.toString(),
        nameAr: skill.nameAr,
        nameFr: skill.nameFr,
        level: row.level,
        isPrimary: row.isPrimary,
      });
    }
    return skills;
  }

  private async loadAvailability(userId: string): Promise<WeeklySchedule> {
    const row = await this.availabilityModel
      .findOne({ volunteerId: userId })
      .lean()
      .exec();
    return row ? row.schedule : emptySchedule();
  }

  /** The avatar media id only when its row is live and `visibility=public` (A6). */
  private async resolvePublicAvatar(
    mediaId: Types.ObjectId,
  ): Promise<string | null> {
    const live = await this.mediaModel
      .findOne({
        _id: mediaId,
        visibility: 'public',
        deletedAt: { $exists: false },
      })
      .exec();
    return live ? mediaId.toString() : null;
  }

  private async resolvePublicMediaIds(
    mediaIds: Types.ObjectId[],
  ): Promise<Set<string>> {
    if (mediaIds.length === 0) {
      return new Set();
    }
    const rows = await this.mediaModel
      .find({
        _id: { $in: mediaIds },
        visibility: 'public',
        deletedAt: { $exists: false },
      })
      .exec();
    return new Set(rows.map((row) => row._id.toString()));
  }

  private async mapTalentCards(
    profiles: VolunteerProfileModel[],
  ): Promise<TalentCard[]> {
    const avatarIds = profiles
      .filter((profile) => profile.publicProfile.showAvatar && profile.avatar)
      .map((profile) => profile.avatar as Types.ObjectId);
    const publicAvatars = await this.resolvePublicMediaIds(avatarIds);

    const cards: TalentCard[] = [];
    for (const profile of profiles) {
      const flags = profile.publicProfile;
      cards.push({
        username: profile.username,
        firstName: flags.showBiography ? (profile.firstName ?? null) : null,
        bio: flags.showBiography ? (profile.bio ?? null) : null,
        location:
          flags.showLocation && profile.location?.wilayaId
            ? { wilayaId: profile.location.wilayaId }
            : null,
        skills: flags.showSkills
          ? await this.loadPublicSkills(profile.userId.toString())
          : null,
        avatar:
          flags.showAvatar &&
          profile.avatar &&
          publicAvatars.has(profile.avatar.toString())
            ? profile.avatar.toString()
            : null,
      });
    }
    return cards;
  }

  /** Skilled-user intersection: both `skillId` and `categoryId` narrow the set. */
  private async resolveSkillUserIds(
    skillId: string | undefined,
    categoryId: string | undefined,
  ): Promise<Set<string> | null> {
    const sets: Set<string>[] = [];
    if (skillId) {
      sets.push(await this.volunteerSkillUserIds([skillId]));
    }
    if (categoryId) {
      const catalog = await this.skillsCatalogModel
        .find({ categoryId: new Types.ObjectId(categoryId), active: true })
        .exec();
      sets.push(
        await this.volunteerSkillUserIds(
          catalog.map((skill) => skill._id.toString()),
        ),
      );
    }
    if (sets.length === 0) {
      return null;
    }
    let intersection = sets[0];
    for (const set of sets.slice(1)) {
      intersection = new Set([...intersection].filter((id) => set.has(id)));
    }
    return intersection;
  }

  private async volunteerSkillUserIds(
    skillIds: string[],
  ): Promise<Set<string>> {
    if (skillIds.length === 0) {
      return new Set();
    }
    const rows = await this.volunteerSkillModel
      .find({ skillId: { $in: skillIds } })
      .select('volunteerId')
      .lean()
      .exec();
    return new Set(rows.map((row) => row.volunteerId.toString()));
  }

  private async loadPublicExperiences(
    volunteerId: string,
    limit: number,
    rawCursor?: string,
  ): Promise<CursorPage<PublicExperienceCard>> {
    const cursor = decodeCursor(rawCursor);
    const filter: FilterQuery<VolunteerExperienceModel> = {
      volunteerId: new Types.ObjectId(volunteerId),
      publicVisibility: 'public',
    };
    if (cursor) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.experienceModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const evidenceIds = items.flatMap((row) => row.evidenceIds);
    const publicMedia = evidenceIds.length
      ? await this.mediaModel
          .find({
            _id: { $in: evidenceIds },
            visibility: 'public',
            deletedAt: { $exists: false },
          })
          .exec()
      : [];
    const mediaById = new Map(
      publicMedia.map((media) => [media._id.toString(), media] as const),
    );

    const cards: PublicExperienceCard[] = items.map((row) => ({
      id: row._id.toString(),
      title: row.title,
      description: row.description ?? '',
      duration: row.duration,
      skills: row.skills.map((skill) => skill.toString()),
      evidence: row.evidenceIds.flatMap((id) => {
        const media = mediaById.get(id.toString());
        if (!media) {
          return [];
        }
        return [
          {
            mediaId: media._id.toString(),
            type: media.type,
            mimeType: media.mimeType ?? null,
            filename: media.filename ?? null,
            url: media.type === 'link' ? (media.url ?? null) : null,
          },
        ];
      }),
    }));

    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return { items: cards, nextCursor: buildCursor(lastId).cursor, limit };
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
