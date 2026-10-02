import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import {
  LocationModel,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import { OpportunitiesQueryDto } from './dto/admin-part-b.dto';
import {
  adminCursor,
  adminLimit,
  escapeRegex,
  fieldSort,
  idSort,
  AdminSortDef,
} from './admin-list.util';

export interface AdminOpportunityRow {
  opportunity: OpportunityModel;
  organizationName: string | null;
  positionsCount: number;
  capacity: number;
  filled: number;
  /** Total applications across all statuses for the opportunity. */
  applicationCount: number;
  locationName: string | null;
  /** Public volunteer names assigned via active participations. */
  assignedNames: string[];
}

/**
 * One row of the per-opportunity verification-status read: the participant's
 * roster state joined with their submission state (if any) and the minted
 * experience proof (if the submission was approved). Every nullable field is
 * a genuine absence (no submission yet, not yet approved) — never invented.
 */
export interface AdminOpportunityVerificationRow {
  participantId: string;
  volunteerName: string | null;
  username: string | null;
  volunteerRegistryId: string | null;
  positionTitle: string | null;
  participationStatus: string;
  submissionStatus: string | null;
  submissionTitle: string | null;
  verificationCode: string | null;
  experienceRegistryId: string | null;
  /** ISO timestamp of the experience mint (= verification time). */
  verifiedAt: string | null;
}

/**
 * Admin opportunity control (inventory §2.20 second half). Listing is a
 * read-only enriched projection (positions/capacity, application counts,
 * location labels, assigned volunteer names); status changes (force
 * close/cancel) go through StatusTransitionService using the S6 opportunity
 * whitelist, writing a status_histories row.
 */
@Injectable()
export class AdminOpportunitiesService {
  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(LocationsCollection)
    private readonly locationModel: Model<LocationModel>,
    private readonly statusTransitions: StatusTransitionService,
  ) {}

  async list(
    query: OpportunitiesQueryDto,
  ): Promise<CursorPage<AdminOpportunityRow>> {
    const filter: FilterQuery<OpportunityModel> = {};
    const and: FilterQuery<OpportunityModel>[] = [];
    if (query.q) {
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      and.push({
        $or: [{ title: pattern }, { slug: pattern }, { registryId: pattern }],
      });
    }
    if (query.status) {
      and.push({ status: query.status });
    }
    if (query.organizationId) {
      and.push({
        organizationId: new Types.ObjectId(query.organizationId),
      });
    }
    if (and.length > 0) {
      filter.$and = and;
    }
    const token = query.sort ?? 'newest';
    const sortDef: AdminSortDef =
      token === 'oldest'
        ? idSort('oldest')
        : token === 'title'
          ? fieldSort('title', 'title', 1)
          : idSort('newest');
    return execPage(
      this.opportunityModel,
      filter,
      {
        limit: adminLimit(query),
        cursor: adminCursor(query),
        sort: sortDef.sort,
        sortToken: sortDef.token,
        ...(sortDef.cursorFilter ? { cursorFilter: sortDef.cursorFilter } : {}),
        ...(sortDef.valueExtractor
          ? { valueExtractor: sortDef.valueExtractor }
          : {}),
      },
      (rows) => this.enrich(rows),
    );
  }

  private async enrich(
    rows: OpportunityModel[],
  ): Promise<AdminOpportunityRow[]> {
    const oppIds = rows.map((row) => row._id);
    const [organizations, applications, participants] = await Promise.all([
      this.organizationModel
        .find({ _id: { $in: rows.map((row) => row.organizationId) } })
        .select('slug nameFr nameAr')
        .lean()
        .exec(),
      this.applicationModel
        .find({ opportunityId: { $in: oppIds } })
        .select('opportunityId')
        .lean()
        .exec(),
      this.participantModel
        .find({
          opportunityId: { $in: oppIds },
          status: { $in: ['accepted', 'active', 'completed'] },
        })
        .select('opportunityId volunteerId')
        .lean()
        .exec(),
    ]);
    const orgById = new Map(
      organizations.map((org) => [org._id.toString(), org]),
    );
    const appsByOpp = new Map<string, number>();
    for (const app of applications) {
      const key = app.opportunityId.toString();
      appsByOpp.set(key, (appsByOpp.get(key) ?? 0) + 1);
    }
    const volunteersByOpp = new Map<string, Set<string>>();
    for (const participant of participants) {
      const key = participant.opportunityId.toString();
      const set = volunteersByOpp.get(key) ?? new Set<string>();
      set.add(participant.volunteerId.toString());
      volunteersByOpp.set(key, set);
    }
    const volunteerIds = [
      ...new Set([...volunteersByOpp.values()].flatMap((set) => [...set])),
    ].map((id) => new Types.ObjectId(id));
    const codes = [
      ...new Set(
        rows.flatMap((row) => [
          row.location?.wilayaId,
          row.location?.municipalityId,
        ]),
      ),
    ].filter((code): code is string => Boolean(code));
    const [profiles, locations] = await Promise.all([
      volunteerIds.length > 0
        ? this.profileModel
            .find({ userId: { $in: volunteerIds } })
            .select('userId username firstName lastName')
            .lean()
            .exec()
        : Promise.resolve([]),
      codes.length > 0
        ? this.locationModel
            .find({ code: { $in: codes } })
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);
    const nameByUserId = new Map(
      profiles.map((profile) => {
        const full = [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(' ');
        return [profile.userId.toString(), full || profile.username];
      }),
    );
    const locationNameByCode = new Map(
      locations.map((location) => [location.code, location.nameFr]),
    );
    return rows.map((row) => {
      const key = row._id.toString();
      const org = orgById.get(row.organizationId.toString());
      const positions = row.positions ?? [];
      const capacity = positions.reduce(
        (sum, position) => sum + (position.requiredCount ?? 0),
        0,
      );
      const filled = positions.reduce(
        (sum, position) => sum + (position.filledCount ?? 0),
        0,
      );
      const assigned = [...(volunteersByOpp.get(key) ?? [])]
        .map((id) => nameByUserId.get(id))
        .filter((name): name is string => Boolean(name));
      const locationName = [
        locationNameByCode.get(row.location?.wilayaId ?? ''),
        locationNameByCode.get(row.location?.municipalityId ?? ''),
      ]
        .filter(Boolean)
        .join(' / ');
      return {
        opportunity: row,
        organizationName: org?.nameFr ?? org?.nameAr ?? org?.slug ?? null,
        positionsCount: positions.length,
        capacity,
        filled,
        applicationCount: appsByOpp.get(key) ?? 0,
        locationName: locationName || null,
        assignedNames: assigned,
      };
    });
  }

  /**
   * Per-participant submission/verification state for one opportunity (admin
   * read for the Manage Opportunities detail panel). Participants come from
   * `task_participants`; each row joins the volunteer's public profile
   * (name/username/registryId), the embedded position title, the submission
   * state by `participantId` (unique), and the minted experience proof by
   * `submissionId` (one row per approved submission). `404` when the id is
   * not a known opportunity; an empty `items` array when nobody was accepted
   * yet. Read-only: no writes, no new collections.
   */
  async getVerificationStatus(
    opportunityId: string,
  ): Promise<{ items: AdminOpportunityVerificationRow[] }> {
    if (!Types.ObjectId.isValid(opportunityId)) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    const opportunity = await this.opportunityModel
      .findById(opportunityId)
      .lean()
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    const participants = await this.participantModel
      .find({ opportunityId: opportunity._id })
      .sort({ _id: 1 })
      .lean()
      .exec();
    if (participants.length === 0) {
      return { items: [] };
    }
    const participantIds = participants.map((item) => item._id);
    const volunteerIds = [
      ...new Set(participants.map((item) => item.volunteerId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const [submissions, experiences, profiles] = await Promise.all([
      this.submissionModel
        .find({ participantId: { $in: participantIds } })
        .select('participantId status title')
        .lean()
        .exec(),
      this.experienceModel
        .find({ opportunityId: opportunity._id })
        .select('submissionId verificationCode registryId createdAt')
        .lean()
        .exec(),
      this.profileModel
        .find({ userId: { $in: volunteerIds } })
        .select('userId username firstName lastName registryId')
        .lean()
        .exec(),
    ]);
    const submissionByParticipant = new Map(
      submissions.map((submission) => [
        submission.participantId.toString(),
        submission,
      ]),
    );
    const experienceBySubmission = new Map(
      experiences.map((experience) => [
        experience.submissionId.toString(),
        experience,
      ]),
    );
    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const positionTitleById = new Map(
      (opportunity.positions ?? []).map((position) => [
        (position as { _id?: Types.ObjectId })._id?.toString() ?? '',
        position.title ?? null,
      ]),
    );
    return {
      items: participants.map((item) => {
        const profile = profileByUserId.get(item.volunteerId.toString());
        const fullName = [profile?.firstName, profile?.lastName]
          .filter(Boolean)
          .join(' ');
        const submission =
          submissionByParticipant.get(item._id.toString()) ?? null;
        const experience =
          submission != null
            ? (experienceBySubmission.get(
                submission._id.toString(),
              ) ?? null)
            : null;
        return {
          participantId: item._id.toString(),
          volunteerName: fullName !== '' ? fullName : (profile?.username ?? null),
          username: profile?.username ?? null,
          volunteerRegistryId: profile?.registryId ?? null,
          positionTitle:
            positionTitleById.get(item.positionId.toString()) ?? null,
          participationStatus: item.status,
          submissionStatus: submission?.status ?? null,
          submissionTitle: submission?.title ?? null,
          verificationCode: experience?.verificationCode ?? null,
          experienceRegistryId: experience?.registryId ?? null,
          verifiedAt:
            experience?.createdAt != null
              ? new Date(experience.createdAt).toISOString()
              : null,
        };
      }),
    };
  }

  async setStatus(
    account: AccountToken,
    opportunityId: string,
    status: 'closed' | 'cancelled',
    meta?: { reason?: string; notes?: string },
  ): Promise<OpportunityModel> {
    const opportunity = await this.opportunityModel
      .findById(opportunityId)
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    if (opportunity.status === status) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `Opportunity is already ${status}`,
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'opportunity',
      entityId: opportunity._id,
      from: opportunity.status,
      to: status,
      actor: account.sub,
      ...(meta?.reason !== undefined ? { reason: meta.reason } : {}),
      ...(meta?.notes !== undefined ? { notes: meta.notes } : {}),
    });
    await this.opportunityModel
      .updateOne({ _id: opportunity._id }, { $set: { status } })
      .exec();
    const updated = await this.opportunityModel
      .findById(opportunity._id)
      .exec();
    if (!updated) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return updated;
  }
}
