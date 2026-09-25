import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { FavoritesService } from '../favorites/favorites.service';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../skills/schemas/skill-category.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
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
  execPage,
  MAX_LIMIT,
  normalizeLimit,
  toArray,
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
import {
  PortfolioItemModel,
  PortfolioItemsCollection,
} from '../portfolio/schemas/portfolio-item.schema';
import {
  enrichExperiences,
  EnrichedExperience,
} from '../verifications/experience-enrichment';
import {
  VerificationModel,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';

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
  registryId: string;
  firstName: string | null;
  bio: string | null;
  location: { wilayaId: string } | null;
  skills: TalentSkill[] | null;
  avatar: string | null;
  /** Present only when `showStats` is true (Session 9). */
  stats: VolunteerProfile['stats'] | null;
  /** Session 19 favorites card state (counts public; `isFavorited` per viewer). */
  isFavorited: boolean;
  favoriteCount: number;
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
  registryId: string;
  title: string;
  description: string | null;
  duration: number;
  skills: string[];
  organization: {
    id: string;
    slug: string;
    nameFr: string | null;
    nameAr: string | null;
  } | null;
  verifiedAt: Date;
  verificationCode: string;
  /** Neutral reviewer notes; only `status=visible` reviews surface publicly. */
  review: { rating: number; notes: string | null } | null;
  evidence: PublicExperienceEvidence[];
}

/** One derived contribution area: category label + share of verified experiences. */
export interface AreaOfContribution {
  categoryId: string;
  nameAr: string;
  nameFr: string;
  /** Share of the volunteer's visible verified experiences, 1-decimal percent. */
  percent: number;
  count: number;
}

/** Public-read view (S2 seams; populated by Session 12). */
export interface PublicVolunteerProfile {
  username: string;
  registryId: string;
  fullName: string | null;
  firstName: string | null;
  avatar: string | null;
  bio: string | null;
  headline: string | null;
  availabilityNote: string | null;
  preferredDomains: string[];
  geographicBase: string | null;
  createdAt: Date;
  stats: VolunteerProfile['stats'] | null;
  areasOfContribution: AreaOfContribution[] | null;
  location: VolunteerProfile['location'] | null;
  skills: TalentSkill[] | null;
  experiences: PublicExperienceCard[] | null;
  availability: WeeklySchedule | null;
  portfolio: unknown | null;
  /** Session 19 favorites card state (counts public; `isFavorited` per viewer). */
  isFavorited: boolean;
  favoriteCount: number;
}

/** Neutral public review card with the writing-organization identity. */
export interface PublicReviewCard {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  organization: {
    id: string;
    slug: string;
    nameAr: string | null;
    nameFr: string | null;
  } | null;
}

export interface VolunteerDashboard {
  completionPercent: number;
  stats: VolunteerProfile['stats'];
  /** Newest verified experience (any visibility), enriched — null when none. */
  latestVerifiedExperience: EnrichedExperience | null;
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
    @InjectModel(SkillCategoriesCollection)
    private readonly skillCategoryModel: Model<SkillCategoryModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(PortfolioItemsCollection)
    private readonly portfolioItemModel: Model<PortfolioItemModel>,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    private readonly mediaOwnership: MediaOwnership,
    private readonly portfolioQuery: PortfolioQueryService,
    private readonly favorites: FavoritesService,
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
    if (dto.headline !== undefined) {
      set.headline = dto.headline;
    }
    if (dto.availabilityNote !== undefined) {
      set.availabilityNote = dto.availabilityNote;
    }
    if (dto.preferredDomains !== undefined) {
      set.preferredDomains = dto.preferredDomains;
    }
    if (dto.geographicBase !== undefined) {
      set.geographicBase = dto.geographicBase;
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
    if (flags.showStats !== undefined) {
      set['publicProfile.showStats'] = flags.showStats;
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
    const [hasSkill, availabilityRow, latest] = await Promise.all([
      this.volunteerSkillModel.exists({ volunteerId: userId }).exec(),
      this.availabilityModel.findOne({ volunteerId: userId }).lean().exec(),
      this.experienceModel
        .findOne({ volunteerId: new Types.ObjectId(userId) })
        .sort({ _id: -1 })
        .exec(),
    ]);
    const completionPercent = this.computeCompletion(
      profile,
      Boolean(hasSkill),
      availabilityRow?.schedule,
    );
    let latestVerifiedExperience: EnrichedExperience | null = null;
    if (latest) {
      const [enriched] = await this.enrichExperienceRows([latest], {
        publicView: false,
      });
      latestVerifiedExperience = enriched ?? null;
    }
    return {
      completionPercent,
      stats: profile.stats,
      latestVerifiedExperience,
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
   * Session 9 adds `fullName`/`createdAt`/headline fields, the `showStats`-gated
   * stats block, and read-time `areasOfContribution` (gated by `showExperiences`,
   * its data source). No free-form contributions list exists (FCD #4 cut).
   */
  async getPublicProfile(
    username: string,
    viewerUserId?: string,
  ): Promise<PublicVolunteerProfile | null> {
    const profile = await this.findEnabledProfile(username);
    if (!profile) {
      return null;
    }
    const flags = profile.publicProfile;
    const userId = profile.userId.toString();

    const [skills, experiences, availability, avatar, portfolio, areas] =
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
        flags.showExperiences
          ? this.deriveAreasOfContribution(userId)
          : Promise.resolve([]),
      ]);

    const fullName = [profile.firstName, profile.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');

    // Session 19: favorites card state via the shared lookup mechanism
    // (guests receive counts with `isFavorited: false`).
    const favoriteMap = await this.talentFavoriteMap([username], viewerUserId);
    const favorite = favoriteMap.get(username) ?? {
      favorited: false,
      favoriteCount: 0,
    };

    return {
      username: profile.username,
      registryId: profile.registryId,
      fullName: fullName ? fullName : null,
      firstName: flags.showBiography ? (profile.firstName ?? null) : null,
      avatar: flags.showAvatar && profile.avatar ? avatar : null,
      bio: flags.showBiography ? (profile.bio ?? null) : null,
      headline: flags.showBiography ? (profile.headline ?? null) : null,
      availabilityNote: flags.showBiography
        ? (profile.availabilityNote ?? null)
        : null,
      preferredDomains: flags.showBiography
        ? (profile.preferredDomains ?? [])
        : [],
      geographicBase: flags.showBiography
        ? (profile.geographicBase ?? null)
        : null,
      createdAt: profile.createdAt,
      stats: flags.showStats ? profile.stats : null,
      areasOfContribution: flags.showExperiences ? areas : null,
      location: flags.showLocation ? (profile.location ?? null) : null,
      skills: flags.showSkills ? skills : null,
      experiences: flags.showExperiences ? experiences : null,
      availability: flags.showAvailability ? availability : null,
      portfolio,
      isFavorited: favorite.favorited,
      favoriteCount: favorite.favoriteCount,
    };
  }

  /**
   * Talents feed over enabled profiles (D2 + Session 7): bounded `q`,
   * skill/category/wilaya facet filters, `minExperiences` / `hasAvailability` /
   * `portfolio` thresholds, comma-separated multi-select, validated `sort`,
   * counted cursor paging, skill/wilaya facets from the filtered population,
   * public-safety projection only. Card mapping stays batched (no N+1).
   */
  async listPublicTalents(
    query: TalentsQueryDto,
    viewerUserId?: string,
  ): Promise<
    CursorPage<TalentCard> & {
      facets: {
        skills: Array<{ skillId: string; count: number }>;
        wilayas: Array<{ wilayaId: string; count: number }>;
      };
    }
  > {
    const filter: FilterQuery<VolunteerProfileModel> = {
      'publicProfile.enabled': true,
    };

    const wilayaIds = [...toArray(query.wilayaId), ...toArray(query.wilayaIds)];
    if (wilayaIds.length === 1) {
      filter['location.wilayaId'] = wilayaIds[0];
    } else if (wilayaIds.length > 1) {
      filter['location.wilayaId'] = { $in: wilayaIds };
    }

    const skillUserIds = await this.resolveSkillUserIds(
      [...toArray(query.skillId), ...toArray(query.skillIds)],
      toArray(query.categoryId),
    );
    const userIdSets: Set<string>[] = [];
    if (skillUserIds) {
      userIdSets.push(skillUserIds);
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

    if (query.minExperiences !== undefined) {
      const min = Number.parseInt(String(query.minExperiences), 10);
      if (!Number.isFinite(min) || min < 0) {
        throw new BusinessException(
          'INVALID_FILTER',
          'minExperiences must be a non-negative integer',
          400,
        );
      }
      if (min > 0) {
        userIdSets.push(await this.volunteerIdsWithMinExperiences(min));
      }
    }

    if (query.hasAvailability === 'true') {
      userIdSets.push(await this.volunteerIdsWithAvailability());
    }

    if (query.portfolio === 'true') {
      userIdSets.push(await this.volunteerIdsWithPortfolio());
    }

    if (userIdSets.length > 0) {
      let intersection = userIdSets[0];
      for (const set of userIdSets.slice(1)) {
        intersection = new Set([...intersection].filter((id) => set.has(id)));
      }
      filter.userId = {
        $in: [...intersection].map((id) => new Types.ObjectId(id)),
      };
    }

    const sortToken = query.sort ?? 'newest';
    const sort: Record<string, 1 | -1> =
      sortToken === 'oldest'
        ? { _id: 1 }
        : sortToken === 'experiences_desc'
          ? { 'stats.verifiedExperiences': -1, _id: -1 }
          : { _id: -1 };

    const page = await execPage(
      this.profileModel,
      filter,
      {
        limit: query.limit,
        cursor: query.cursor,
        sort,
        sortToken,
        cursorFilter: (decoded) => {
          if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
            return {};
          }
          const id = new Types.ObjectId(decoded.id);
          if (sortToken === 'oldest') {
            return { _id: { $gt: id } };
          }
          if (sortToken === 'experiences_desc' && decoded.value !== undefined) {
            const value = Number.parseInt(decoded.value, 10);
            if (Number.isFinite(value)) {
              return {
                $or: [
                  { 'stats.verifiedExperiences': { $lt: value } },
                  {
                    'stats.verifiedExperiences': value,
                    _id: { $lt: id },
                  },
                ],
              };
            }
          }
          return { _id: { $lt: id } };
        },
        valueExtractor: (item: VolunteerProfileModel) => {
          if (sortToken === 'experiences_desc') {
            return String(item.stats?.verifiedExperiences ?? 0);
          }
          return undefined;
        },
      },
      async (rows) => this.mapTalentCards(rows, viewerUserId),
    );

    const facets = await this.talentFacets(filter);

    return { ...page, facets };
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

  /**
   * Public reviews addressed to a volunteer (Session 9): only `status=visible`
   * rows, newest-first, counted cursor paging, with the writing-organization
   * identity. The caller resolves the enabled profile first (404 otherwise).
   */
  async getPublicReviews(
    volunteerId: string,
    limit?: string | number,
    rawCursor?: string,
  ): Promise<CursorPage<PublicReviewCard>> {
    const baseFilter: FilterQuery<ReviewModel> = {
      volunteerId: new Types.ObjectId(volunteerId),
      status: 'visible',
    };
    return execPage(
      this.reviewModel,
      baseFilter,
      {
        limit,
        cursor: rawCursor,
        sort: { _id: -1 },
        sortToken: 'newest',
      },
      async (rows) => {
        const orgIds = [
          ...new Set(rows.map((row) => row.organizationId.toString())),
        ];
        const orgs =
          orgIds.length > 0
            ? await this.organizationModel
                .find({
                  _id: { $in: orgIds.map((id) => new Types.ObjectId(id)) },
                })
                .select('slug nameAr nameFr')
                .lean()
                .exec()
            : [];
        const byId = new Map(orgs.map((org) => [org._id.toString(), org]));
        return rows.map((row) => {
          const org = byId.get(row.organizationId.toString());
          return {
            id: row._id.toString(),
            rating: row.rating,
            comment: row.comment ?? null,
            createdAt: row.createdAt,
            organization: org
              ? {
                  id: row.organizationId.toString(),
                  slug: org.slug,
                  nameAr: org.nameAr ?? null,
                  nameFr: org.nameFr ?? null,
                }
              : null,
          };
        });
      },
    );
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

  /**
   * Read-time areas of contribution (FCD #4, owner-confirmed): count-based
   * share per skill category over the volunteer's caller-visible (`public`)
   * verified experiences. Each experience contributes weight 1 split equally
   * across its distinct mapped categories, so shares sum to ~100. Experiences
   * with no active-category skill are excluded from numerator and denominator.
   * Sorted by share desc (ties: category `order`, then `nameFr`), capped at 8.
   * Batched in three bounded queries — never stored, no N+1.
   */
  private async deriveAreasOfContribution(
    userId: string,
  ): Promise<AreaOfContribution[]> {
    const experiences = await this.experienceModel
      .find({
        volunteerId: new Types.ObjectId(userId),
        publicVisibility: 'public',
      })
      .select('skills')
      .lean()
      .exec();
    const skillIds = [
      ...new Set(
        experiences.flatMap((row) => row.skills.map((id) => id.toString())),
      ),
    ];
    if (skillIds.length === 0) {
      return [];
    }
    const catalog = await this.skillsCatalogModel
      .find({
        _id: { $in: skillIds.map((id) => new Types.ObjectId(id)) },
        active: true,
      })
      .select('categoryId')
      .lean()
      .exec();
    const categoryBySkill = new Map(
      catalog.map((skill) => [
        skill._id.toString(),
        skill.categoryId.toString(),
      ]),
    );
    const touches = new Map<string, number>();
    const weights = new Map<string, number>();
    let attributed = 0;
    for (const row of experiences) {
      const categories = [
        ...new Set(
          row.skills
            .map((id) => categoryBySkill.get(id.toString()))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (categories.length === 0) {
        continue;
      }
      attributed += 1;
      const weight = 1 / categories.length;
      for (const categoryId of categories) {
        touches.set(categoryId, (touches.get(categoryId) ?? 0) + 1);
        weights.set(categoryId, (weights.get(categoryId) ?? 0) + weight);
      }
    }
    if (attributed === 0) {
      return [];
    }
    const categories = await this.skillCategoryModel
      .find({
        _id: {
          $in: [...weights.keys()].map((id) => new Types.ObjectId(id)),
        },
      })
      .lean()
      .exec();
    const areas: Array<AreaOfContribution & { order: number }> = [];
    for (const category of categories) {
      const categoryId = category._id.toString();
      const weight = weights.get(categoryId);
      if (weight === undefined) {
        continue;
      }
      areas.push({
        categoryId,
        nameAr: category.nameAr,
        nameFr: category.nameFr,
        percent: Math.round((weight / attributed) * 1000) / 10,
        count: touches.get(categoryId) ?? 0,
        order: category.order,
      });
    }
    return areas
      .sort(
        (a, b) =>
          b.percent - a.percent ||
          a.order - b.order ||
          (a.nameFr < b.nameFr ? -1 : a.nameFr > b.nameFr ? 1 : 0),
      )
      .slice(0, 8)
      .map(({ order: _order, ...area }) => area);
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
    viewerUserId?: string,
  ): Promise<TalentCard[]> {
    const avatarIds = profiles
      .filter((profile) => profile.publicProfile.showAvatar && profile.avatar)
      .map((profile) => profile.avatar as Types.ObjectId);
    const publicAvatars = await this.resolvePublicMediaIds(avatarIds);

    // S19 N+1 pass: load skills for the whole page in two bounded queries
    // instead of awaiting `loadPublicSkills` once per card.
    const skillOwners = profiles
      .filter((profile) => profile.publicProfile.showSkills)
      .map((profile) => profile.userId);
    const skillsByOwner = await this.loadPublicSkillsForOwners(skillOwners);

    // Session 19: favorites card state for the page in one shared lookup
    // (guests receive counts with `isFavorited: false`).
    const usernames = profiles.map((profile) => profile.username);
    const favoriteByUsername = await this.talentFavoriteMap(
      usernames,
      viewerUserId,
    );

    const cards: TalentCard[] = [];
    for (const profile of profiles) {
      const flags = profile.publicProfile;
      const favorite = favoriteByUsername.get(profile.username) ?? {
        favorited: false,
        favoriteCount: 0,
      };
      cards.push({
        username: profile.username,
        registryId: profile.registryId,
        firstName: flags.showBiography ? (profile.firstName ?? null) : null,
        bio: flags.showBiography ? (profile.bio ?? null) : null,
        location:
          flags.showLocation && profile.location?.wilayaId
            ? { wilayaId: profile.location.wilayaId }
            : null,
        skills: flags.showSkills
          ? (skillsByOwner.get(profile.userId.toString()) ?? [])
          : null,
        avatar:
          flags.showAvatar &&
          profile.avatar &&
          publicAvatars.has(profile.avatar.toString())
            ? profile.avatar.toString()
            : null,
        stats: flags.showStats ? profile.stats : null,
        isFavorited: favorite.favorited,
        favoriteCount: favorite.favoriteCount,
      });
    }
    return cards;
  }

  /**
   * Session 19 favorites state via the shared lookup mechanism (no duplicated
   * counting logic). Usernames containing commas are excluded defensively
   * (lookup splits keys on commas) and resolve to the zero state.
   */
  private async talentFavoriteMap(
    usernames: string[],
    viewerUserId?: string,
  ): Promise<Map<string, { favorited: boolean; favoriteCount: number }>> {
    const safe = [...new Set(usernames)].filter(
      (username) => username.length > 0 && !username.includes(','),
    );
    if (safe.length === 0) {
      return new Map();
    }
    const lookup = await this.favorites.lookup(
      { targetType: 'talent', targetIds: safe.join(',') },
      viewerUserId,
    );
    return new Map(
      safe.map((username) => [
        username,
        lookup[username] ?? { favorited: false, favoriteCount: 0 },
      ]),
    );
  }

  /**
   * Batch skill loading for a page of talent cards (S19): one `volunteer_skills`
   * query for the whole page plus one `skills` catalog query for the distinct
   * ids — a constant query count regardless of page size. Per-owner ordering
   * (`isPrimary` then `createdAt`) is preserved by the grouped global sort.
   */
  private async loadPublicSkillsForOwners(
    userIds: Types.ObjectId[],
  ): Promise<Map<string, TalentSkill[]>> {
    const owners = Array.from(new Set(userIds.map((id) => id.toString())));
    if (owners.length === 0) {
      return new Map();
    }
    const rows = await this.volunteerSkillModel
      .find({
        volunteerId: { $in: owners.map((id) => new Types.ObjectId(id)) },
      })
      .sort({ volunteerId: 1, isPrimary: -1, createdAt: 1 })
      .exec();
    if (rows.length === 0) {
      return new Map();
    }
    const catalog = await this.skillsCatalogModel
      .find({
        _id: { $in: rows.map((row) => row.skillId) },
        active: true,
      })
      .exec();
    const catalogById = new Map(
      catalog.map((skill) => [skill._id.toString(), skill]),
    );
    const skillsByOwner = new Map<string, TalentSkill[]>();
    for (const row of rows) {
      const skill = catalogById.get(row.skillId.toString());
      if (!skill) {
        continue;
      }
      const ownerKey = row.volunteerId.toString();
      const list = skillsByOwner.get(ownerKey) ?? [];
      list.push({
        skillId: row.skillId.toString(),
        nameAr: skill.nameAr,
        nameFr: skill.nameFr,
        level: row.level,
        isPrimary: row.isPrimary,
      });
      skillsByOwner.set(ownerKey, list);
    }
    return skillsByOwner;
  }

  /** Skilled-user intersection: skill ids (OR within) AND category ids narrow the set. */
  private async resolveSkillUserIds(
    skillIds: string[],
    categoryIds: string[],
  ): Promise<Set<string> | null> {
    const sets: Set<string>[] = [];
    const validSkillIds = skillIds.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BusinessException(
          'INVALID_FILTER',
          `Invalid skillId filter: ${id}`,
          400,
        );
      }
      return id;
    });
    if (validSkillIds.length > 0) {
      sets.push(await this.volunteerSkillUserIds(validSkillIds));
    }
    const validCategoryIds = categoryIds.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BusinessException(
          'INVALID_FILTER',
          `Invalid categoryId filter: ${id}`,
          400,
        );
      }
      return id;
    });
    for (const categoryId of validCategoryIds) {
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

  /** Volunteer userIds with at least `min` experience rows (indexed lookup). */
  private async volunteerIdsWithMinExperiences(
    min: number,
  ): Promise<Set<string>> {
    const counts = await this.experienceModel
      .aggregate([
        { $group: { _id: '$volunteerId', count: { $sum: 1 } } },
        { $match: { count: { $gte: min } } },
        { $project: { _id: 1 } },
      ])
      .exec();
    return new Set(
      counts.map((row: { _id: Types.ObjectId }) => row._id.toString()),
    );
  }

  /** Volunteer userIds with at least one availability slot set. */
  private async volunteerIdsWithAvailability(): Promise<Set<string>> {
    const rows = await this.availabilityModel
      .find({
        $or: [
          { 'schedule.monday.0': { $exists: true } },
          { 'schedule.tuesday.0': { $exists: true } },
          { 'schedule.wednesday.0': { $exists: true } },
          { 'schedule.thursday.0': { $exists: true } },
          { 'schedule.friday.0': { $exists: true } },
          { 'schedule.saturday.0': { $exists: true } },
          { 'schedule.sunday.0': { $exists: true } },
        ],
      })
      .select('volunteerId')
      .lean()
      .exec();
    return new Set(rows.map((row) => row.volunteerId.toString()));
  }

  /** Volunteer userIds with at least one public portfolio item. */
  private async volunteerIdsWithPortfolio(): Promise<Set<string>> {
    const rows = await this.portfolioItemModel
      .find({ visibility: 'public' })
      .select('volunteerId')
      .lean()
      .exec();
    return new Set(rows.map((row) => row.volunteerId.toString()));
  }

  /**
   * Skill/wilaya facet counts from the filtered talent population (one
   * bounded aggregation per dimension, consistent with the filtered total).
   */
  private async talentFacets(
    filter: FilterQuery<VolunteerProfileModel>,
  ): Promise<{
    skills: Array<{ skillId: string; count: number }>;
    wilayas: Array<{ wilayaId: string; count: number }>;
  }> {
    const profiles = await this.profileModel
      .find(filter)
      .select('_id userId location.wilayaId')
      .lean()
      .exec();
    const userIds = profiles.map((row) => row.userId.toString());
    const wilayaCounts = new Map<string, number>();
    for (const row of profiles) {
      const wilaya = (row.location as { wilayaId?: string } | undefined)
        ?.wilayaId;
      if (!wilaya) {
        continue;
      }
      wilayaCounts.set(wilaya, (wilayaCounts.get(wilaya) ?? 0) + 1);
    }
    let skillFacets: Array<{ skillId: string; count: number }> = [];
    if (userIds.length > 0) {
      const skillRows = await this.volunteerSkillModel
        .aggregate([
          {
            $match: {
              volunteerId: {
                $in: userIds.map((id) => new Types.ObjectId(id)),
              },
            },
          },
          { $group: { _id: '$skillId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 50 },
        ])
        .exec();
      skillFacets = skillRows.map(
        (row: { _id: Types.ObjectId; count: number }) => ({
          skillId: row._id.toString(),
          count: row.count,
        }),
      );
    }
    return {
      skills: skillFacets,
      wilayas: [...wilayaCounts.entries()]
        .map(([wilayaId, count]) => ({ wilayaId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
    };
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
    const baseFilter: FilterQuery<VolunteerExperienceModel> = {
      volunteerId: new Types.ObjectId(volunteerId),
      publicVisibility: 'public',
    };
    return execPage(
      this.experienceModel,
      baseFilter,
      {
        limit,
        cursor: rawCursor,
        sort: { _id: -1 },
        sortToken: 'newest',
        cursorFilter: (decoded) => {
          if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
            return {};
          }
          return { _id: { $lt: new Types.ObjectId(decoded.id) } };
        },
      },
      async (rows) => {
        const enriched = await this.enrichExperienceRows(rows, {
          publicView: true,
        });
        const evidenceIds = rows.flatMap((row) => row.evidenceIds);
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
        return enriched.map((entry, index) => ({
          ...entry,
          evidence: rows[index].evidenceIds.flatMap((id) => {
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
      },
    );
  }

  /**
   * Session 15 enrichment reads over this module's models (organizations,
   * verifications for `verifiedAt`, reviews for neutral notes): three bounded
   * `$in` queries per call, never per-row. Shared by the public cards and the
   * dashboard card so both surfaces carry the same identity fields.
   */
  private async enrichExperienceRows(
    rows: VolunteerExperienceModel[],
    opts: { publicView: boolean },
  ): Promise<EnrichedExperience[]> {
    if (rows.length === 0) {
      return [];
    }
    const organizationIds = [
      ...new Set(rows.map((row) => row.organizationId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const submissionIds = [
      ...new Set(rows.map((row) => row.submissionId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const [organizations, verifications, reviews] = await Promise.all([
      this.organizationModel
        .find({ _id: { $in: organizationIds } })
        .select('slug nameFr nameAr')
        .lean()
        .exec(),
      this.verificationModel
        .find({ submissionId: { $in: submissionIds } })
        .select('submissionId decidedAt')
        .lean()
        .exec(),
      this.reviewModel
        .find({ submissionId: { $in: submissionIds } })
        .select('submissionId rating comment status')
        .lean()
        .exec(),
    ]);
    return enrichExperiences(
      rows,
      new Map(
        organizations.map((organization) => [
          organization._id.toString(),
          organization,
        ]),
      ),
      new Map(
        verifications.map((verification) => [
          verification.submissionId.toString(),
          verification,
        ]),
      ),
      new Map(
        reviews.map((review) => [review.submissionId.toString(), review]),
      ),
      opts,
    );
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
