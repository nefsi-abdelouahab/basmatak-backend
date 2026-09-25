import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import { OpportunityEmbedProvider } from '../opportunities/opportunity-embed.provider';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VerificationModel,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { OrgParticipantsQueryDto } from './dto/org-dashboard.dto';
import {
  countInitiatives,
  readReliability,
  sumVerifiedHours,
} from './org-dashboard.aggregates';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from './schemas/task-participant.schema';

/** Trailing window for the private "decisions" aggregate (owner-confirmed Q4). */
const DECISIONS_WINDOW_MS = 30 * 24 * 3_600_000;

/** Escape a free-text query into a safe case-insensitive match (S14 precedent). */
function toSafePattern(raw: string): string {
  return raw
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .slice(0, 60);
}

/**
 * Organization dashboard reads (Session 16 `org-dashboard`): the
 * cross-opportunity participant roster and the private stats object. Read-only;
 * every query is scoped to the caller's own organization so rows can never leak
 * across orgs. Roster joins are page-capped and id-batched (N+1 guard).
 */
@Injectable()
export class OrgDashboardService {
  constructor(
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    private readonly organizations: OrganizationsService,
    // Session 19: location-label helper for roster opportunity embeds.
    private readonly embeds: OpportunityEmbedProvider,
  ) {}

  private async requireOwnOrganization(
    account: AccountToken,
  ): Promise<OrganizationModel> {
    const organization = await this.organizations.findByUserId(account.sub);
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    return organization;
  }

  async listOrgParticipants(
    account: AccountToken,
    query: OrgParticipantsQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const organization = await this.requireOwnOrganization(account);
    const orgId = organization._id;

    const filter: FilterQuery<TaskParticipantModel> = {
      organizationId: orgId,
    };
    if (query.status) {
      filter.status = query.status;
    }
    if (query.opportunityId) {
      if (!Types.ObjectId.isValid(query.opportunityId)) {
        throw new BusinessException(
          'OPPORTUNITY_NOT_FOUND',
          'Opportunity not found',
          404,
        );
      }
      const owned = await this.opportunityModel
        .findOne({
          _id: new Types.ObjectId(query.opportunityId),
          organizationId: orgId,
        })
        .select('_id')
        .lean()
        .exec();
      if (!owned) {
        throw new BusinessException(
          'OPPORTUNITY_NOT_FOUND',
          'Opportunity not found',
          404,
        );
      }
      filter.opportunityId = owned._id;
    }
    if (query.q !== undefined && query.q.trim() !== '') {
      await this.applyTextFilter(filter, orgId, query.q);
    }

    return execPage(
      this.participantModel,
      filter,
      {
        limit: query.limit,
        cursor: query.cursor,
        sort: { _id: -1 },
        sortToken: 'newest',
        cursorFilter: (decoded) => {
          if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
            return {};
          }
          return { _id: { $lt: new Types.ObjectId(decoded.id) } };
        },
      },
      (items) => this.enrichRoster(items),
    );
  }

  /**
   * Two-phase text filter: resolve matching volunteers / opportunities /
   * positions first, then constrain participants by id so cursor pagination
   * still counts the right base set. A query matching nothing yields an empty
   * page via an unsatisfiable `_id` clause.
   */
  private async applyTextFilter(
    filter: FilterQuery<TaskParticipantModel>,
    orgId: Types.ObjectId,
    raw: string,
  ): Promise<void> {
    const pattern = toSafePattern(raw);
    if (!pattern) {
      return;
    }
    const regex = { $regex: pattern, $options: 'i' };
    const jsRegex = new RegExp(pattern, 'i');
    const [profiles, opportunities] = await Promise.all([
      this.profileModel
        .find({
          $or: [{ username: regex }, { firstName: regex }, { lastName: regex }],
        })
        .select('userId')
        .lean()
        .exec(),
      this.opportunityModel
        .find({ organizationId: orgId })
        .select('title positions')
        .lean()
        .exec(),
    ]);
    const clauses: FilterQuery<TaskParticipantModel>[] = [];
    if (profiles.length > 0) {
      clauses.push({
        volunteerId: { $in: profiles.map((profile) => profile.userId) },
      });
    }
    const opportunityIds: Types.ObjectId[] = [];
    const positionIds: Types.ObjectId[] = [];
    for (const opportunity of opportunities) {
      if (jsRegex.test(opportunity.title)) {
        opportunityIds.push(opportunity._id);
      }
      for (const position of opportunity.positions ?? []) {
        const positionId = (position as { _id?: Types.ObjectId })._id;
        if (positionId && jsRegex.test(position.title)) {
          positionIds.push(positionId);
          opportunityIds.push(opportunity._id);
        }
      }
    }
    if (opportunityIds.length > 0) {
      clauses.push({
        opportunityId: {
          $in: [...new Set(opportunityIds.map((id) => id.toString()))].map(
            (id) => new Types.ObjectId(id),
          ),
        },
      });
    }
    if (positionIds.length > 0) {
      clauses.push({ positionId: { $in: positionIds } });
    }
    if (clauses.length === 0) {
      filter._id = { $in: [] };
    } else {
      filter.$or = clauses;
    }
  }

  private async enrichRoster(
    items: TaskParticipantModel[],
  ): Promise<Record<string, unknown>[]> {
    const participantIds = items.map((item) => item._id);
    const volunteerIds = [
      ...new Set(items.map((item) => item.volunteerId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const opportunityIds = [
      ...new Set(items.map((item) => item.opportunityId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const [profiles, opportunities, submissions, experiences] =
      await Promise.all([
        this.profileModel
          .find({ userId: { $in: volunteerIds } })
          .lean()
          .exec(),
        this.opportunityModel
          .find({ _id: { $in: opportunityIds } })
          .lean()
          .exec(),
        this.submissionModel
          .find({ participantId: { $in: participantIds } })
          .sort({ createdAt: -1 })
          .lean()
          .exec(),
        this.experienceModel
          .find({
            volunteerId: { $in: volunteerIds },
            opportunityId: { $in: opportunityIds },
          })
          .select('volunteerId opportunityId duration')
          .lean()
          .exec(),
      ]);
    const profileByUser = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const opportunityById = new Map(
      opportunities.map((opportunity) => [
        opportunity._id.toString(),
        opportunity,
      ]),
    );
    const submissionByParticipant = new Map<
      string,
      (typeof submissions)[number]
    >();
    for (const submission of submissions) {
      const key = submission.participantId.toString();
      if (!submissionByParticipant.has(key)) {
        submissionByParticipant.set(key, submission);
      }
    }
    const hoursByKey = new Map<string, number>();
    for (const experience of experiences) {
      const key = `${experience.volunteerId.toString()}:${experience.opportunityId.toString()}`;
      hoursByKey.set(
        key,
        (hoursByKey.get(key) ?? 0) + (experience.duration ?? 0),
      );
    }
    // Session 19: opportunity location labels for the roster (one query).
    const locationLabels = await this.embeds.resolveLocationLabels(
      opportunities
        .flatMap((opportunity) => [
          opportunity.location?.wilayaId,
          opportunity.location?.municipalityId,
        ])
        .filter((code): code is string => Boolean(code)),
    );
    return items.map((item) => {
      const profile = profileByUser.get(item.volunteerId.toString()) ?? null;
      const opportunity =
        opportunityById.get(item.opportunityId.toString()) ?? null;
      const position =
        opportunity?.positions?.find(
          (row) =>
            (row as { _id?: Types.ObjectId })._id?.toString() ===
            item.positionId.toString(),
        ) ?? null;
      const submission =
        submissionByParticipant.get(item._id.toString()) ?? null;
      const wilayaCode = opportunity?.location?.wilayaId ?? null;
      const municipalityCode = opportunity?.location?.municipalityId ?? null;
      return {
        _id: item._id,
        status: item.status,
        volunteer: profile
          ? {
              username: profile.username,
              firstName: profile.firstName ?? null,
              lastName: profile.lastName ?? null,
              avatarMediaId: profile.avatar ?? null,
              geographicBase: profile.geographicBase ?? null,
            }
          : null,
        position: position
          ? {
              id: (position as { _id: Types.ObjectId })._id,
              title: position.title,
              // Session 19: deliverables on the roster position embed.
              deliverables: [...(position.deliverables ?? [])],
            }
          : null,
        opportunity: opportunity
          ? {
              id: opportunity._id,
              title: opportunity.title,
              slug: opportunity.slug,
              status: opportunity.status,
              // Session 19: location labels on the roster opportunity embed.
              locationLabels: {
                wilaya:
                  wilayaCode != null
                    ? (locationLabels.get(wilayaCode) ?? null)
                    : null,
                municipality:
                  municipalityCode != null
                    ? (locationLabels.get(municipalityCode) ?? null)
                    : null,
              },
            }
          : null,
        submission: submission
          ? {
              state: submission.status,
              mediaIds: (submission.evidence ?? []).map(
                (entry) => entry.mediaId,
              ),
            }
          : null,
        hourlyTotal:
          hoursByKey.get(
            `${item.volunteerId.toString()}:${item.opportunityId.toString()}`,
          ) ?? 0,
      };
    });
  }

  async getOrgStats(account: AccountToken): Promise<Record<string, unknown>> {
    const organization = await this.requireOwnOrganization(account);
    const orgId = organization._id;
    const [
      initiatives,
      applicationsPending,
      applicationsUnderReview,
      participantsActive,
      participantsCompleted,
      verifiedHours,
      decisionsLast30d,
      reliability,
    ] = await Promise.all([
      countInitiatives(this.opportunityModel, orgId),
      this.applicationModel
        .countDocuments({ organizationId: orgId, status: 'pending' })
        .exec(),
      this.applicationModel
        .countDocuments({ organizationId: orgId, status: 'under_review' })
        .exec(),
      this.participantModel
        .countDocuments({
          organizationId: orgId,
          status: { $in: ['accepted', 'active'] },
        })
        .exec(),
      this.participantModel
        .countDocuments({ organizationId: orgId, status: 'completed' })
        .exec(),
      sumVerifiedHours(this.experienceModel, orgId),
      this.verificationModel
        .countDocuments({
          organizationId: orgId,
          decidedAt: { $gte: new Date(Date.now() - DECISIONS_WINDOW_MS) },
        })
        .exec(),
      readReliability(this.organizationModel, orgId),
    ]);
    return {
      opportunitiesActive: initiatives.active,
      opportunitiesCompleted: initiatives.completed,
      applicationsPending,
      applicationsUnderReview,
      participantsActive,
      participantsCompleted,
      verifiedHours,
      decisionsLast30d,
      ...(reliability?.decidedRatio !== undefined
        ? { decidedRatio: reliability.decidedRatio }
        : {}),
      ...(reliability?.medianDecisionHours !== undefined
        ? { medianDecisionHours: reliability.medianDecisionHours }
        : {}),
    };
  }
}
