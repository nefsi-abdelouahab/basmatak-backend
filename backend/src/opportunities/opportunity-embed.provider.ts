import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FavoritesService } from '../favorites/favorites.service';
import {
  LocationModel,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../skills/schemas/skill-category.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import { OpportunityModel, PositionModel } from './schemas/opportunity.schema';

/** Application statuses that occupy a seat-request (counted per position). */
const COUNTED_APPLICATION_STATUSES = ['pending', 'under_review', 'accepted'];

/** Participant statuses that render as assigned volunteer names. */
const ASSIGNED_PARTICIPANT_STATUSES = ['active', 'accepted', 'completed'];

/** Minimal structural refs (lean-query shaped; never the full documents). */
interface OrgRef {
  _id: Types.ObjectId;
  slug: string;
  nameFr?: string | null;
  nameAr?: string | null;
  logoMediaId?: Types.ObjectId | null;
  verificationStatus: string;
}

interface NamedRef {
  _id: Types.ObjectId;
  nameAr: string;
  nameFr: string;
}

export interface OrganizationEmbed {
  id: string;
  slug: string;
  nameFr: string | null;
  nameAr: string | null;
  logoMediaId: string | null;
  verificationStatus: string;
}

export interface LabelText {
  nameAr: string;
  nameFr: string;
}

function fullName(
  firstName?: string | null,
  lastName?: string | null,
  username?: string,
): string | null {
  const joined = [firstName, lastName].filter(Boolean).join(' ');
  return joined ? joined : (username ?? null);
}

function toPlain<T>(doc: T): Record<string, unknown> {
  if (doc !== null && typeof doc === 'object' && 'toObject' in doc) {
    return (doc as { toObject: () => Record<string, unknown> }).toObject();
  }
  return { ...(doc as Record<string, unknown>) };
}

function positionIdOf(position: Record<string, unknown>): string | null {
  const id = position['_id'];
  if (id instanceof Types.ObjectId) {
    return id.toString();
  }
  return typeof id === 'string' ? id : null;
}

/**
 * Shared read-path embed assembler (Session 19 `backend-v2-org-embed-labels`).
 * Joins organization identity, category/location/skill labels, per-position
 * application counts, assigned volunteer names and favorites card state onto
 * opportunity payloads. Every join is page-batched (one query per joined
 * entity); unknown references degrade to `null`/empty. Existing fields are
 * never renamed or removed — enrichment only adds sibling keys.
 */
@Injectable()
export class OpportunityEmbedProvider {
  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(SkillCategoriesCollection)
    private readonly categoryModel: Model<SkillCategoryModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    @InjectModel(LocationsCollection)
    private readonly locationModel: Model<LocationModel>,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    private readonly favorites: FavoritesService,
  ) {}

  /**
   * Card-level enrichment for feed rows: org embed + labels + favorites.
   * No counts, no assigned names (keeps the guest feed light).
   */
  async embedCards(
    items: OpportunityModel[],
    viewerUserId?: string,
  ): Promise<Record<string, unknown>[]> {
    if (items.length === 0) {
      return [];
    }
    const context = await this.loadContext(items, {
      withCounts: false,
      withAssigned: false,
    });
    const favorites = await this.favoriteState(items, viewerUserId);
    return items.map((item) =>
      this.assemble(item, context, favorites, {
        withCounts: false,
        withAssigned: false,
      }),
    );
  }

  /**
   * Full enrichment for detail, org own list/single-read and slug-archive
   * rows: everything in `embedCards` plus per-position `applicationCount`
   * and `assigned` volunteer names.
   */
  async embedFull(
    items: OpportunityModel[],
    viewerUserId?: string,
  ): Promise<Record<string, unknown>[]> {
    if (items.length === 0) {
      return [];
    }
    const context = await this.loadContext(items, {
      withCounts: true,
      withAssigned: true,
    });
    const favorites = await this.favoriteState(items, viewerUserId);
    return items.map((item) =>
      this.assemble(item, context, favorites, {
        withCounts: true,
        withAssigned: true,
      }),
    );
  }

  /**
   * Public label helper for sibling read paths (participations roster):
   * resolves location codes to `{nameAr, nameFr}` in one bounded query.
   */
  async resolveLocationLabels(
    codes: string[],
  ): Promise<Map<string, LabelText>> {
    const distinct = [...new Set(codes.filter(Boolean))].slice(0, 100);
    if (distinct.length === 0) {
      return new Map();
    }
    const rows = await this.locationModel
      .find({ code: { $in: distinct } })
      .select('code nameAr nameFr')
      .lean()
      .exec();
    return new Map(
      rows.map((row) => [row.code, { nameAr: row.nameAr, nameFr: row.nameFr }]),
    );
  }

  /***************************************************************************
   * Internals
   **************************************************************************/

  private async favoriteState(
    items: OpportunityModel[],
    viewerUserId?: string,
  ): Promise<Record<string, { favorited: boolean; favoriteCount: number }>> {
    const ids = items.map((item) => item._id.toString());
    if (ids.length === 0) {
      return {};
    }
    // Reuses the Session 17 lookup mechanism service-to-service (no
    // duplicated counting logic); guests receive counts + favorited:false.
    return this.favorites.lookup(
      { targetType: 'opportunity', targetIds: ids.join(',') },
      viewerUserId,
    );
  }

  private async loadContext(
    items: OpportunityModel[],
    opts: { withCounts: boolean; withAssigned: boolean },
  ): Promise<{
    orgById: Map<string, OrgRef>;
    categoryById: Map<string, NamedRef>;
    skillById: Map<string, NamedRef>;
    locationByCode: Map<string, LabelText>;
    countsByPosition: Map<string, number>;
    assignedByPosition: Map<
      string,
      Array<{
        volunteerId: string;
        fullName: string | null;
        username: string | null;
        avatarMediaId: string | null;
      }>
    >;
  }> {
    const orgIds = [
      ...new Set(items.map((item) => item.organizationId.toString())),
    ];
    const categoryIds = [
      ...new Set(
        items
          .map((item) => item.categoryId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const skillIds = [
      ...new Set(
        items.flatMap((item) =>
          (item.positions ?? []).flatMap((position) =>
            (position.requiredSkills ?? []).map((id) => id.toString()),
          ),
        ),
      ),
    ];
    const locationCodes = [
      ...new Set(
        items
          .flatMap((item) => [
            item.location?.wilayaId,
            item.location?.municipalityId,
          ])
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    const opportunityIds = items.map((item) => item._id);

    const [orgs, categories, skills, locations] = await Promise.all([
      orgIds.length > 0
        ? this.organizationModel
            .find({ _id: { $in: orgIds } })
            .select('slug nameFr nameAr logoMediaId verificationStatus')
            .lean()
            .exec()
        : Promise.resolve([]),
      categoryIds.length > 0
        ? this.categoryModel
            .find({
              _id: {
                $in: categoryIds.map((id) => new Types.ObjectId(id)),
              },
            })
            .select('nameAr nameFr')
            .lean()
            .exec()
        : Promise.resolve([]),
      skillIds.length > 0
        ? this.skillModel
            .find({
              _id: { $in: skillIds.map((id) => new Types.ObjectId(id)) },
            })
            .select('nameAr nameFr')
            .lean()
            .exec()
        : Promise.resolve([]),
      this.resolveLocationLabels(locationCodes),
    ]);

    let countsByPosition = new Map<string, number>();
    let assignedByPosition = new Map<
      string,
      Array<{
        volunteerId: string;
        fullName: string | null;
        username: string | null;
        avatarMediaId: string | null;
      }>
    >();
    if (opts.withCounts || opts.withAssigned) {
      const grouped = await this.applicationModel
        .aggregate<{ _id: string; n: number }>([
          {
            $match: {
              opportunityId: { $in: opportunityIds },
              status: { $in: COUNTED_APPLICATION_STATUSES },
            },
          },
          { $group: { _id: '$positionId', n: { $sum: 1 } } },
        ])
        .exec();
      countsByPosition = new Map(
        grouped.map((row) => [row._id.toString(), row.n]),
      );
    }
    if (opts.withAssigned) {
      assignedByPosition = await this.loadAssigned(opportunityIds);
    }

    return {
      orgById: new Map(orgs.map((org) => [org._id.toString(), org])),
      categoryById: new Map(
        categories.map((category) => [category._id.toString(), category]),
      ),
      skillById: new Map(skills.map((skill) => [skill._id.toString(), skill])),
      locationByCode: locations,
      countsByPosition,
      assignedByPosition,
    };
  }

  private async loadAssigned(opportunityIds: Types.ObjectId[]): Promise<
    Map<
      string,
      Array<{
        volunteerId: string;
        fullName: string | null;
        username: string | null;
        avatarMediaId: string | null;
      }>
    >
  > {
    const participants = await this.participantModel
      .find({
        opportunityId: { $in: opportunityIds },
        status: { $in: ASSIGNED_PARTICIPANT_STATUSES },
      })
      .select('opportunityId positionId volunteerId')
      .lean()
      .exec();
    if (participants.length === 0) {
      return new Map();
    }
    const volunteerIds = [
      ...new Set(participants.map((row) => row.volunteerId.toString())),
    ];
    const profiles = await this.profileModel
      .find({
        userId: { $in: volunteerIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('userId username firstName lastName avatar')
      .lean()
      .exec();
    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const out = new Map<
      string,
      Array<{
        volunteerId: string;
        fullName: string | null;
        username: string | null;
        avatarMediaId: string | null;
      }>
    >();
    for (const row of participants) {
      const key = `${row.opportunityId.toString()}:${row.positionId.toString()}`;
      const profile = profileByUserId.get(row.volunteerId.toString());
      const list = out.get(key) ?? [];
      list.push({
        volunteerId: row.volunteerId.toString(),
        fullName: profile
          ? fullName(profile.firstName, profile.lastName, profile.username)
          : null,
        username: profile?.username ?? null,
        avatarMediaId: profile?.avatar ? profile.avatar.toString() : null,
      });
      out.set(key, list);
    }
    return out;
  }

  private assemble(
    item: OpportunityModel,
    context: Awaited<ReturnType<typeof this.loadContext>>,
    favorites: Record<string, { favorited: boolean; favoriteCount: number }>,
    opts: { withCounts: boolean; withAssigned: boolean },
  ): Record<string, unknown> {
    const raw = toPlain(item);
    const org = context.orgById.get(item.organizationId.toString()) ?? null;
    const category = item.categoryId
      ? (context.categoryById.get(item.categoryId.toString()) ?? null)
      : null;
    const wilayaCode = item.location?.wilayaId ?? null;
    const municipalityCode = item.location?.municipalityId ?? null;
    const favorite = favorites[item._id.toString()] ?? {
      favorited: false,
      favoriteCount: 0,
    };

    const positions = (
      (raw['positions'] as Record<string, unknown>[]) ?? []
    ).map((position) => {
      const positionId = positionIdOf(position);
      const skillEntries = (
        (position['requiredSkills'] as unknown[] | undefined) ?? []
      ).map((entry) => entry?.toString() ?? String(entry));
      const skillNames = skillEntries.flatMap((skillId) => {
        const skill = context.skillById.get(skillId);
        return skill
          ? [{ skillId, nameAr: skill.nameAr, nameFr: skill.nameFr }]
          : [];
      });
      const key = positionId ? `${item._id.toString()}:${positionId}` : null;
      return {
        ...position,
        skillNames,
        ...(opts.withCounts
          ? {
              applicationCount: positionId
                ? (context.countsByPosition.get(positionId) ?? 0)
                : 0,
            }
          : {}),
        ...(opts.withAssigned
          ? {
              assigned: key ? (context.assignedByPosition.get(key) ?? []) : [],
            }
          : {}),
      };
    });

    const organization: OrganizationEmbed | null = org
      ? {
          id: org._id.toString(),
          slug: org.slug,
          nameFr: org.nameFr ?? null,
          nameAr: org.nameAr ?? null,
          logoMediaId: org.logoMediaId ? org.logoMediaId.toString() : null,
          verificationStatus: org.verificationStatus,
        }
      : null;

    return {
      ...raw,
      positions,
      organization,
      categoryName: category
        ? { nameAr: category.nameAr, nameFr: category.nameFr }
        : null,
      locationLabels: {
        wilaya:
          wilayaCode != null
            ? (context.locationByCode.get(wilayaCode) ?? null)
            : null,
        municipality:
          municipalityCode != null
            ? (context.locationByCode.get(municipalityCode) ?? null)
            : null,
      },
      isFavorited: favorite.favorited,
      favoriteCount: favorite.favoriteCount,
    };
  }
}

export type { PositionModel };
