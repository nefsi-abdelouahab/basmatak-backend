import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationInboxJoiner,
  ApplicationInboxRow,
} from '../common/seams/application-inbox-joiner';
import {
  StatusHistoryCollection,
  StatusHistoryModel,
} from '../core/status-transitions/status-histories.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';

function displayNameOf(profile: {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
}): string {
  const joined = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(' ');
  return joined ? joined : profile.username;
}

/** Normalizes a Mongoose document or lean row to a plain object. */
function toPlain<T>(row: T): Record<string, unknown> {
  if (row !== null && typeof row === 'object' && 'toObject' in row) {
    return (row as { toObject: () => Record<string, unknown> }).toObject();
  }
  return { ...(row as Record<string, unknown>) };
}

/**
 * Real `ApplicationInboxJoiner` (Session 19 `backend-v2-org-embed-labels`).
 * Fills the Session 5 seam: volunteer / organization / opportunity / position
 * display names plus the decision actor on the org aggregate inbox rows.
 * All lookups are page-batched (one query per joined entity); org scoping and
 * pagination are owned by the caller (`ApplicationsService`), this joiner only
 * decorates the rows it receives.
 */
@Injectable()
export class ApplicationInboxJoinerImpl implements ApplicationInboxJoiner {
  constructor(
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(StatusHistoryCollection)
    private readonly historyModel: Model<StatusHistoryModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
  ) {}

  async enrich(
    _organizationId: Types.ObjectId | string,
    rows: ApplicationInboxRow[],
  ): Promise<ApplicationInboxRow[]> {
    if (rows.length === 0) {
      return rows;
    }
    const volunteerIds = [
      ...new Set(rows.map((row) => row.volunteerId.toString())),
    ];
    const orgIds = [
      ...new Set(rows.map((row) => row.organizationId.toString())),
    ];
    const opportunityIds = [
      ...new Set(rows.map((row) => row.opportunityId.toString())),
    ];
    const decidedIds = rows
      .filter((row) => row.status === 'accepted' || row.status === 'rejected')
      .map((row) => row._id);

    const [profiles, orgs, opportunities, histories] = await Promise.all([
      this.profileModel
        .find({
          userId: { $in: volunteerIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('userId username firstName lastName avatar')
        .lean()
        .exec(),
      this.organizationModel
        .find({ _id: { $in: orgIds.map((id) => new Types.ObjectId(id)) } })
        .select('slug nameFr nameAr')
        .lean()
        .exec(),
      this.opportunityModel
        .find({
          _id: { $in: opportunityIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('title slug positions')
        .lean()
        .exec(),
      decidedIds.length > 0
        ? this.historyModel
            .find({
              entityType: 'application',
              entityId: { $in: decidedIds },
              to: { $in: ['accepted', 'rejected'] },
            })
            .sort({ createdAt: -1 })
            .select('entityId to actor createdAt')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const actorIds = [
      ...new Set(histories.map((history) => history.actor.toString())),
    ];
    const [actorOrgs, actorUsers] = await Promise.all([
      actorIds.length > 0
        ? this.organizationModel
            .find({
              userId: { $in: actorIds.map((id) => new Types.ObjectId(id)) },
            })
            .select('userId slug nameFr nameAr')
            .lean()
            .exec()
        : Promise.resolve([]),
      actorIds.length > 0
        ? this.userModel
            .find({
              _id: { $in: actorIds.map((id) => new Types.ObjectId(id)) },
            })
            .select('email')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const orgById = new Map(orgs.map((org) => [org._id.toString(), org]));
    const opportunityById = new Map(
      opportunities.map((opportunity) => [
        opportunity._id.toString(),
        opportunity,
      ]),
    );
    const latestHistoryByApp = new Map<string, (typeof histories)[number]>();
    for (const history of histories) {
      const key = history.entityId.toString();
      if (!latestHistoryByApp.has(key)) {
        latestHistoryByApp.set(key, history);
      }
    }
    const actorOrgByUserId = new Map(
      actorOrgs.map((org) => [org.userId.toString(), org]),
    );
    const actorEmailByUserId = new Map(
      actorUsers.map((user) => [user._id.toString(), user.email]),
    );

    return rows.map((row) => {
      // Plain-object base (documents normalized; lean rows spread as-is) so
      // no Mongoose internals leak into the response; the cast restores the
      // row type for the additive join fields below.
      const base = toPlain(row) as unknown as ApplicationInboxRow;
      const volunteerId = row.volunteerId.toString();
      const organizationId = row.organizationId.toString();
      const opportunityId = row.opportunityId.toString();
      const positionId = row.positionId.toString();
      const profile = profileByUserId.get(volunteerId) ?? null;
      const org = orgById.get(organizationId) ?? null;
      const opportunity = opportunityById.get(opportunityId) ?? null;
      const position =
        opportunity?.positions?.find(
          (entry) =>
            (entry as { _id?: Types.ObjectId })._id?.toString() === positionId,
        ) ?? null;
      const history = latestHistoryByApp.get(row._id.toString()) ?? null;
      const actorId = history?.actor?.toString() ?? null;
      const actorOrg = actorId ? actorOrgByUserId.get(actorId) : undefined;
      const decidedBy =
        actorId === null
          ? null
          : {
              userId: actorId,
              displayName:
                actorOrg?.nameFr ??
                actorOrg?.slug ??
                (actorId ? actorEmailByUserId.get(actorId) : undefined) ??
                null,
            };
      return {
        ...base,
        volunteer: profile
          ? {
              userId: profile.userId.toString(),
              username: profile.username,
              fullName: displayNameOf(profile),
              avatarMediaId: profile.avatar ? profile.avatar.toString() : null,
            }
          : null,
        organization: org
          ? {
              id: org._id.toString(),
              slug: org.slug,
              nameFr: org.nameFr ?? null,
              nameAr: org.nameAr ?? null,
            }
          : null,
        opportunity: opportunity
          ? {
              id: opportunity._id.toString(),
              title: opportunity.title,
              slug: opportunity.slug,
            }
          : null,
        position: position
          ? {
              id: (position as { _id: Types.ObjectId })._id.toString(),
              title: position.title,
            }
          : null,
        decidedBy,
      };
    });
  }
}
