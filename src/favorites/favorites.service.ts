import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage, toArray } from '../common/pagination/pagination.util';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationsCollection,
  OrganizationModel,
} from '../organizations/schemas/organization.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  FavoriteModel,
  FavoritesCollection,
  FavoriteTargetType,
} from './schemas/favorite.schema';
import {
  FavoritesListQueryDto,
  FavoritesLookupQueryDto,
} from './dto/favorites-query.dto';

/** Maximum keys per `lookup` call (bounded card-state batch). */
export const MAX_LOOKUP_KEYS = 50;

export interface OpportunityFavoriteSummary {
  title: string;
  slug: string;
  status: string;
  applicationDeadline: Date | null;
  organization: {
    slug: string;
    nameAr: string | null;
    nameFr: string | null;
  } | null;
}

export interface TalentFavoriteSummary {
  username: string;
  fullName: string | null;
}

export interface OrganizationFavoriteSummary {
  slug: string;
  nameAr: string | null;
  nameFr: string | null;
  status: string;
}

export type FavoriteSummary =
  | OpportunityFavoriteSummary
  | TalentFavoriteSummary
  | OrganizationFavoriteSummary
  | null;

export interface FavoriteItem {
  targetType: FavoriteTargetType;
  targetId: string;
  createdAt: Date;
  summary: FavoriteSummary;
}

export interface LookupEntry {
  favorited: boolean;
  favoriteCount: number;
}

interface OrganizationSummaryRow {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  slug: string;
  nameAr?: string | null;
  nameFr?: string | null;
  status: string;
}

/**
 * Save/bookmark store (Session 17 `backend-v2-favorites`). Owns the
 * `favorites` collection; peer collections (`opportunities`,
 * `volunteer_profiles`) are read-only lean references registered on this
 * module — no peer module is imported or modified. Plain toggle + list only:
 * no folders, no recommendations, no cross-user visibility of who favorited.
 */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(FavoritesCollection)
    private readonly favoriteModel: Model<FavoriteModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
  ) {}

  /**
   * Save an opportunity for the caller. Idempotent: a repeat (or raced)
   * insert collapses on the unique triple into the already-saved path.
   * Malformed ids map to 404 per the codebase-wide ObjectId convention.
   */
  async saveOpportunity(
    userId: string,
    opportunityId: string,
  ): Promise<{ created: boolean; favoriteCount: number }> {
    const targetId = this.requireOpportunityId(opportunityId);
    const exists = await this.opportunityModel.exists({ _id: targetId });
    if (!exists) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    const created = await this.insertIgnoreDuplicate(
      userId,
      'opportunity',
      targetId,
    );
    return {
      created,
      favoriteCount: await this.countFor('opportunity', targetId),
    };
  }

  /** Remove the caller's save; 204-semantics (no-op when absent). */
  async removeOpportunity(
    userId: string,
    opportunityId: string,
  ): Promise<void> {
    const targetId = this.requireOpportunityId(opportunityId);
    await this.favoriteModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        targetType: 'opportunity',
        targetId,
      })
      .exec();
  }

  /**
   * Save a talent for the caller. The username resolves server-side to the
   * volunteer `userId` (stored as `targetId`); any existing profile matches,
   * regardless of its public visibility, because the row is private to the
   * saver and the saver already holds the username.
   */
  async saveTalent(
    userId: string,
    username: string,
  ): Promise<{ created: boolean; favoriteCount: number }> {
    const profile = await this.profileModel
      .findOne({ username })
      .select('_id userId')
      .lean()
      .exec();
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_PROFILE_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    const targetId = profile.userId.toString();
    const created = await this.insertIgnoreDuplicate(
      userId,
      'talent',
      targetId,
    );
    return {
      created,
      favoriteCount: await this.countFor('talent', targetId),
    };
  }

  /**
   * Remove the caller's talent save; unknown usernames are a silent no-op
   * (nothing could have been stored for them).
   */
  async removeTalent(userId: string, username: string): Promise<void> {
    const profile = await this.profileModel
      .findOne({ username })
      .select('_id userId')
      .lean()
      .exec();
    if (!profile) {
      return;
    }
    await this.favoriteModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        targetType: 'talent',
        targetId: profile.userId.toString(),
      })
      .exec();
  }

  /**
   * Save an organization for the caller. The slug resolves server-side to the
   * organization account `userId` (stored as `targetId`), mirroring the talent
   * path so a rename never orphans the row.
   */
  async saveOrganization(
    userId: string,
    slug: string,
  ): Promise<{ created: boolean; favoriteCount: number }> {
    const organization = await this.organizationModel
      .findOne({ slug })
      .select('_id userId')
      .lean()
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    const targetId = organization.userId.toString();
    const created = await this.insertIgnoreDuplicate(
      userId,
      'organization',
      targetId,
    );
    return {
      created,
      favoriteCount: await this.countFor('organization', targetId),
    };
  }

  /**
   * Remove the caller's organization save; unknown slugs are a silent no-op
   * (nothing could have been stored for them).
   */
  async removeOrganization(userId: string, slug: string): Promise<void> {
    const organization = await this.organizationModel
      .findOne({ slug })
      .select('_id userId')
      .lean()
      .exec();
    if (!organization) {
      return;
    }
    await this.favoriteModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        targetType: 'organization',
        targetId: organization.userId.toString(),
      })
      .exec();
  }

  /**
   * The caller's saves, newest-first, as a counted page. Summaries resolve
   * best-effort in two batched reads; rows whose target is gone keep a `null`
   * summary (no delete-cascades — those would need hooks in archived modules).
   */
  async listOwn(
    userId: string,
    query: FavoritesListQueryDto,
  ): Promise<CursorPage<FavoriteItem>> {
    const baseFilter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (query.targetType) {
      baseFilter.targetType = query.targetType;
    }
    return execPage(
      this.favoriteModel,
      baseFilter,
      {
        limit: query.limit,
        cursor: query.cursor,
        sort: { _id: -1 },
        sortToken: 'newest',
      },
      async (rows) => this.withSummaries(rows),
    );
  }

  /** The caller's per-type totals (tab badges). */
  async countsOwn(
    userId: string,
  ): Promise<{ opportunity: number; talent: number; organization: number }> {
    const owner = new Types.ObjectId(userId);
    const [opportunity, talent, organization] = await Promise.all([
      this.favoriteModel
        .countDocuments({ userId: owner, targetType: 'opportunity' })
        .exec(),
      this.favoriteModel
        .countDocuments({ userId: owner, targetType: 'talent' })
        .exec(),
      this.favoriteModel
        .countDocuments({ userId: owner, targetType: 'organization' })
        .exec(),
    ]);
    return { opportunity, talent, organization };
  }

  /**
   * Batch card state for up to 50 keys. Guests receive counts with
   * `favorited: false` (counts-only public visibility). Unknown or
   * unresolvable keys yield zero entries so the response shape stays total.
   */
  async lookup(
    query: FavoritesLookupQueryDto,
    viewerUserId?: string,
  ): Promise<Record<string, LookupEntry>> {
    const keys = toArray(query.targetIds);
    if (keys.length === 0 || keys.length > MAX_LOOKUP_KEYS) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'targetIds must contain between 1 and 50 keys',
        400,
      );
    }
    if (query.targetType === 'opportunity') {
      return this.lookupOpportunities(keys, viewerUserId);
    }
    if (query.targetType === 'talent') {
      return this.lookupTalents(keys, viewerUserId);
    }
    return this.lookupOrganizations(keys, viewerUserId);
  }

  private async lookupOpportunities(
    keys: string[],
    viewerUserId?: string,
  ): Promise<Record<string, LookupEntry>> {
    const valid = keys.filter((key) => Types.ObjectId.isValid(key));
    const counts = await this.countMany('opportunity', valid);
    const saved = viewerUserId
      ? await this.savedSet(viewerUserId, 'opportunity', valid)
      : new Set<string>();
    const out: Record<string, LookupEntry> = {};
    for (const key of keys) {
      out[key] = {
        favorited: saved.has(key),
        favoriteCount: counts.get(key) ?? 0,
      };
    }
    return out;
  }

  private async lookupTalents(
    usernames: string[],
    viewerUserId?: string,
  ): Promise<Record<string, LookupEntry>> {
    const profiles = await this.profileModel
      .find({ username: { $in: usernames } })
      .select('_id username userId')
      .lean()
      .exec();
    const idByUsername = new Map(
      profiles.map((profile) => [profile.username, profile.userId.toString()]),
    );
    const targetIds = [...idByUsername.values()];
    const counts = await this.countMany('talent', targetIds);
    const saved = viewerUserId
      ? await this.savedSet(viewerUserId, 'talent', targetIds)
      : new Set<string>();
    const out: Record<string, LookupEntry> = {};
    for (const username of usernames) {
      const targetId = idByUsername.get(username);
      out[username] =
        targetId === undefined
          ? { favorited: false, favoriteCount: 0 }
          : {
              favorited: saved.has(targetId),
              favoriteCount: counts.get(targetId) ?? 0,
            };
    }
    return out;
  }

  private async lookupOrganizations(
    slugs: string[],
    viewerUserId?: string,
  ): Promise<Record<string, LookupEntry>> {
    const organizations = await this.organizationModel
      .find({ slug: { $in: slugs } })
      .select('_id slug userId')
      .lean()
      .exec();
    const idBySlug = new Map(
      organizations.map((organization) => [
        organization.slug,
        organization.userId.toString(),
      ]),
    );
    const targetIds = [...idBySlug.values()];
    const counts = await this.countMany('organization', targetIds);
    const saved = viewerUserId
      ? await this.savedSet(viewerUserId, 'organization', targetIds)
      : new Set<string>();
    const out: Record<string, LookupEntry> = {};
    for (const slug of slugs) {
      const targetId = idBySlug.get(slug);
      out[slug] =
        targetId === undefined
          ? { favorited: false, favoriteCount: 0 }
          : {
              favorited: saved.has(targetId),
              favoriteCount: counts.get(targetId) ?? 0,
            };
    }
    return out;
  }

  private async withSummaries(rows: FavoriteModel[]): Promise<FavoriteItem[]> {
    const oppIds = [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.targetType === 'opportunity' &&
              Types.ObjectId.isValid(row.targetId),
          )
          .map((row) => row.targetId),
      ),
    ];
    const talentIds = [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.targetType === 'talent' &&
              Types.ObjectId.isValid(row.targetId),
          )
          .map((row) => row.targetId),
      ),
    ];
    const orgTargetIds = [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.targetType === 'organization' &&
              Types.ObjectId.isValid(row.targetId),
          )
          .map((row) => row.targetId),
      ),
    ];
    const [opps, profiles] = await Promise.all([
      oppIds.length > 0
        ? this.opportunityModel
            .find({ _id: { $in: oppIds.map((id) => new Types.ObjectId(id)) } })
            .select('_id title slug status applicationDeadline organizationId')
            .lean()
            .exec()
        : [],
      talentIds.length > 0
        ? this.profileModel
            .find({
              userId: {
                $in: talentIds.map((id) => new Types.ObjectId(id)),
              },
            })
            .select('_id username userId firstName lastName')
            .lean()
            .exec()
        : [],
    ]);
    const oppOrgIds = [
      ...new Set(
        opps
          .map((opp) => opp.organizationId?.toString())
          .filter(
            (id): id is string =>
              typeof id === 'string' && Types.ObjectId.isValid(id),
          ),
      ),
    ];
    const orgClauses: Record<string, unknown>[] = [];
    if (orgTargetIds.length > 0) {
      orgClauses.push({
        userId: { $in: orgTargetIds.map((id) => new Types.ObjectId(id)) },
      });
    }
    if (oppOrgIds.length > 0) {
      orgClauses.push({
        _id: { $in: oppOrgIds.map((id) => new Types.ObjectId(id)) },
      });
    }
    const organizations = (
      orgClauses.length > 0
        ? await this.organizationModel
            .find({ $or: orgClauses })
            .select('_id userId slug nameAr nameFr status')
            .lean()
            .exec()
        : []
    ) as OrganizationSummaryRow[];
    const oppById = new Map(opps.map((opp) => [opp._id.toString(), opp]));
    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const orgByUserId = new Map(
      organizations.map((organization) => [
        organization.userId.toString(),
        organization,
      ]),
    );
    const orgById = new Map(
      organizations.map((organization) => [
        organization._id.toString(),
        organization,
      ]),
    );
    return rows.map((row) => ({
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
      summary: this.summarize(
        row,
        oppById,
        profileByUserId,
        orgByUserId,
        orgById,
      ),
    }));
  }

  private summarize(
    row: FavoriteModel,
    oppById: Map<
      string,
      {
        _id: Types.ObjectId;
        title: string;
        slug: string;
        status?: string;
        applicationDeadline?: Date;
        organizationId?: Types.ObjectId;
      }
    >,
    profileByUserId: Map<
      string,
      {
        username: string;
        firstName?: string;
        lastName?: string;
      }
    >,
    orgByUserId: Map<string, OrganizationSummaryRow>,
    orgById: Map<string, OrganizationSummaryRow>,
  ): FavoriteSummary {
    if (row.targetType === 'opportunity') {
      const opp = oppById.get(row.targetId);
      if (!opp) {
        return null;
      }
      const organization = opp.organizationId
        ? orgById.get(opp.organizationId.toString())
        : undefined;
      return {
        title: opp.title,
        slug: opp.slug,
        status: opp.status ?? 'draft',
        applicationDeadline: opp.applicationDeadline ?? null,
        organization: organization
          ? {
              slug: organization.slug,
              nameAr: organization.nameAr ?? null,
              nameFr: organization.nameFr ?? null,
            }
          : null,
      };
    }
    if (row.targetType === 'organization') {
      const organization = orgByUserId.get(row.targetId);
      if (!organization) {
        return null;
      }
      return {
        slug: organization.slug,
        nameAr: organization.nameAr ?? null,
        nameFr: organization.nameFr ?? null,
        status: organization.status,
      };
    }
    const profile = profileByUserId.get(row.targetId);
    if (!profile) {
      return null;
    }
    const fullName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ');
    return {
      username: profile.username,
      fullName: fullName ? fullName : null,
    };
  }

  private requireOpportunityId(opportunityId: string): string {
    if (!Types.ObjectId.isValid(opportunityId)) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return new Types.ObjectId(opportunityId).toString();
  }

  /**
   * Insert-or-ignore keyed on the unique triple. The index is the arbiter:
   * a concurrent duplicate insert raises a duplicate-key error that collapses
   * into `false` (already saved) instead of a 500.
   */
  private async insertIgnoreDuplicate(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<boolean> {
    try {
      await this.favoriteModel.create([
        {
          userId: new Types.ObjectId(userId),
          targetType,
          targetId,
        },
      ]);
      return true;
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      return false;
    }
  }

  private async countFor(
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<number> {
    return this.favoriteModel.countDocuments({ targetType, targetId }).exec();
  }

  private async countMany(
    targetType: FavoriteTargetType,
    targetIds: string[],
  ): Promise<Map<string, number>> {
    if (targetIds.length === 0) {
      return new Map();
    }
    const grouped = await this.favoriteModel
      .aggregate<{ _id: string; n: number }>([
        { $match: { targetType, targetId: { $in: targetIds } } },
        { $group: { _id: '$targetId', n: { $sum: 1 } } },
      ])
      .exec();
    return new Map(grouped.map((row) => [row._id, row.n]));
  }

  private async savedSet(
    viewerUserId: string,
    targetType: FavoriteTargetType,
    targetIds: string[],
  ): Promise<Set<string>> {
    if (targetIds.length === 0) {
      return new Set();
    }
    const rows = await this.favoriteModel
      .find({
        userId: new Types.ObjectId(viewerUserId),
        targetType,
        targetId: { $in: targetIds },
      })
      .select('_id targetId')
      .lean()
      .exec();
    return new Set(rows.map((row) => row.targetId));
  }
}
