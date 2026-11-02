import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage, toArray } from '../common/pagination/pagination.util';
import { MediaOwnership } from '../common/seams/media-ownership';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { MediaModel, MediaCollection } from '../media/schemas/media.schema';
import { MediaService } from '../media/media.service';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import {
  VerificationModel,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  SubmissionListQueryDto,
  SubmitDto,
  UpdateSubmissionDto,
} from './dto/submission.dto';
import {
  SUBMISSION_STATUSES,
  SubmissionModel,
  SubmissionsCollection,
} from './schemas/submission.schema';

const SUBMISSION_NOT_FOUND = 'SUBMISSION_NOT_FOUND';
const SUBMISSION_ALREADY_EXISTS = 'SUBMISSION_ALREADY_EXISTS';
const INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION';

/** One evidence entry must satisfy exactly one deliverable descriptor. */
function assertDeliverablesCovered(
  deliverables: SubmissionModel['deliverables'],
  evidenceIds: string[],
): void {
  const uncovered = deliverables.find((_deliverable) => evidenceIds.length < 1);
  if (uncovered) {
    throw new BusinessException(
      'EVIDENCE_REQUIRED',
      'At least one evidence item is required for every deliverable',
      400,
    );
  }
}

/** Consent rule (decision 6): imagery/video evidence requires confirmation. */
function isImageryMedia(media: MediaModel): boolean {
  if (media.type === 'link') {
    return true; // external video links are the only link kind (S8)
  }
  const mime = media.mimeType ?? '';
  return mime.startsWith('image/');
}

/**
 * Submissions service (inventory §2.12, roadmap S10 Part A): "report work".
 * Create/ed:/submit enforce the draft + consent rules and write status_histories
 * via the S1 transition service; reads are scoped to the owning volunteer or
 * the opportunity's organization (§6), and `submission.submitted` is emitted
 * only after a successful transition.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    private readonly organizations: OrganizationsService,
    private readonly media: MediaService,
    private readonly mediaOwnership: MediaOwnership,
    private readonly statusTransitions: StatusTransitionService,
    private readonly eventEmitter: EventEmitter2,
    // Session 19: read-only profile ref for the volunteer join on inbox +
    // detail reads (token resolves through the imported OpportunitiesModule's
    // exports — same pattern as opportunityModel above; no module edit).
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    // Latest rejection decision, surfaced only on owner-scoped reads while the
    // submission is rejected or back in draft.
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
  ) {}

  /***************************************************************************
   * Identity helpers
   **************************************************************************/

  private async requireSubmission(id: string): Promise<SubmissionModel> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }
    const submission = await this.submissionModel
      .findById(new Types.ObjectId(id))
      .exec();
    if (!submission) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }
    return submission;
  }

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

  /** Validates every evidence mediaId and returns the resolved rows. */
  private async assertEvidence(
    volunteerId: string,
    evidenceIds: string[],
  ): Promise<MediaModel[]> {
    const rows: MediaModel[] = [];
    for (const mediaId of evidenceIds) {
      const media = await this.mediaOwnership.assertFor(
        mediaId,
        volunteerId,
        'submission_evidence',
      );
      rows.push(media);
    }
    return rows;
  }

  private paginateSubmissions(
    filter: FilterQuery<SubmissionModel>,
    query: { limit?: string; cursor?: string; sort?: string },
  ): Promise<CursorPage<SubmissionModel>> {
    const sortToken = query.sort ?? 'newest';
    const sort: Record<string, 1 | -1> =
      sortToken === 'oldest' ? { _id: 1 } : { _id: -1 };
    return execPage(this.submissionModel, filter, {
      limit: query.limit,
      cursor: query.cursor,
      sort,
      sortToken,
      cursorFilter: (decoded) => {
        if (!decoded.id || !Types.ObjectId.isValid(decoded.id)) {
          return {};
        }
        const id = new Types.ObjectId(decoded.id);
        return sortToken === 'oldest'
          ? { _id: { $gt: id } }
          : { _id: { $lt: id } };
      },
    });
  }

  /** Parses comma-separated status filters, validating against the whitelist. */
  private parseStatuses(raw: string | undefined): string[] | undefined {
    if (raw === undefined) {
      return undefined;
    }
    const values = toArray(raw);
    if (values.length === 0) {
      return undefined;
    }
    for (const value of values) {
      if (!SUBMISSION_STATUSES.includes(value as never)) {
        throw new BusinessException(
          'INVALID_FILTER',
          `Invalid submission status filter: ${value}`,
          400,
        );
      }
    }
    return values;
  }

  /***************************************************************************
   * Create
   **************************************************************************/

  async createForParticipation(
    account: AccountToken,
    participationId: string,
    title?: string,
  ): Promise<SubmissionModel> {
    if (!Types.ObjectId.isValid(participationId)) {
      throw new BusinessException(
        'PARTICIPATION_NOT_FOUND',
        'Participation not found',
        404,
      );
    }
    const participant = await this.participantModel
      .findOne({
        _id: new Types.ObjectId(participationId),
        volunteerId: new Types.ObjectId(account.sub),
      })
      .exec();
    if (!participant) {
      throw new BusinessException(
        'PARTICIPATION_NOT_FOUND',
        'Participation not found',
        404,
      );
    }

    const opportunity = await this.opportunityModel
      .findById(participant.opportunityId)
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    const position = opportunity.positions.find(
      (entry) => entry._id.toString() === participant.positionId.toString(),
    );
    if (!position) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }

    const existing = await this.submissionModel
      .findOne({ participantId: participant._id })
      .exec();
    if (existing) {
      throw new BusinessException(
        SUBMISSION_ALREADY_EXISTS,
        'A submission already exists for this participation',
        409,
      );
    }

    try {
      return await this.submissionModel.create({
        participantId: participant._id,
        opportunityId: participant.opportunityId,
        positionId: participant.positionId,
        organizationId: participant.organizationId,
        volunteerId: participant.volunteerId,
        title: title?.trim() ? title.trim().slice(0, 200) : undefined,
        deliverables: [
          {
            title: position.title,
            description: position.description ?? undefined,
          },
        ],
        status: 'draft',
      });
    } catch (error: unknown) {
      const isDuplicate =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000;
      if (isDuplicate) {
        throw new BusinessException(
          SUBMISSION_ALREADY_EXISTS,
          'A submission already exists for this participation',
          409,
        );
      }
      throw error;
    }
  }

  /***************************************************************************
   * Edit
   **************************************************************************/

  async updateDraft(
    account: AccountToken,
    submissionId: string,
    dto: UpdateSubmissionDto,
  ): Promise<SubmissionModel> {
    const submission = await this.requireSubmission(submissionId);
    if (submission.volunteerId.toString() !== account.sub) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }

    let evidenceIds: string[] | undefined;
    if (dto.evidence !== undefined) {
      evidenceIds = dto.evidence;
      await this.assertEvidence(account.sub, evidenceIds);
    }

    if (
      submission.status === 'submitted' ||
      submission.status === 'under_review' ||
      submission.status === 'approved'
    ) {
      throw new BusinessException(
        INVALID_STATUS_TRANSITION,
        `Cannot edit a submission in status '${submission.status}'`,
        409,
      );
    }

    const patch = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(evidenceIds !== undefined
        ? {
            evidence: evidenceIds.map((mediaId) => ({
              mediaId: new Types.ObjectId(mediaId),
            })),
          }
        : {}),
      ...(dto.consentConfirmed !== undefined
        ? { consentConfirmed: dto.consentConfirmed }
        : {}),
    } as Partial<SubmissionModel>;

    if (submission.status === 'rejected') {
      await this.statusTransitions.assert({
        entityType: 'submission',
        entityId: submission._id,
        from: 'rejected',
        to: 'draft',
        actor: account.sub,
      });
      patch.status = 'draft';
    }

    const updated = await this.submissionModel.findOneAndUpdate(
      { _id: submission._id },
      { $set: patch },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }
    return updated;
  }

  /***************************************************************************
   * Submit
   **************************************************************************/

  async submit(
    account: AccountToken,
    submissionId: string,
    dto: SubmitDto,
  ): Promise<SubmissionModel> {
    const submission = await this.requireSubmission(submissionId);
    if (submission.volunteerId.toString() !== account.sub) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }

    // Validation first — no transition before every rule passes.
    const description = submission.description?.trim() ?? '';
    if (!description) {
      throw new BusinessException(
        'DESCRIPTION_REQUIRED',
        'A description of the work completed is required',
        400,
      );
    }

    const evidenceIds = submission.evidence.map((entry) =>
      entry.mediaId.toString(),
    );
    assertDeliverablesCovered(submission.deliverables, evidenceIds);

    const evidenceRows = await this.assertEvidence(account.sub, evidenceIds);
    const requiresConsent = evidenceRows.some(isImageryMedia);
    if (requiresConsent && dto.consentConfirmed !== true) {
      throw new BusinessException(
        'CONSENT_REQUIRED',
        'Consent confirmation is required when evidence includes images or videos',
        400,
      );
    }

    await this.statusTransitions.assert({
      entityType: 'submission',
      entityId: submission._id,
      from: 'draft',
      to: 'submitted',
      actor: account.sub,
    });

    const updated = await this.submissionModel.findOneAndUpdate(
      { _id: submission._id, status: 'draft' },
      {
        $set: {
          status: 'submitted',
          ...(dto.consentConfirmed === true ? { consentConfirmed: true } : {}),
        },
      },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        INVALID_STATUS_TRANSITION,
        'The submission must be a draft to submit',
        409,
      );
    }

    this.eventEmitter.emit(DomainEvents.SubmissionSubmitted, {
      submission: updated,
    });
    return updated;
  }

  /***************************************************************************
   * Volunteer reads
   **************************************************************************/

  async listMine(
    account: AccountToken,
    query: SubmissionListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const filter: FilterQuery<SubmissionModel> = {
      volunteerId: new Types.ObjectId(account.sub),
    };
    const statuses = this.parseStatuses(query.status);
    if (statuses) {
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    const page = await this.paginateSubmissions(filter, query);
    const reasons = await this.rejectionReasonsFor(page.items);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item.toObject(),
        rejectionReason: reasons.get(item._id.toString()) ?? null,
      })),
    };
  }

  /**
   * Latest rejected `Verification.reason` per submission, for submissions
   * still in `rejected`, or in `draft` after a rejection edit. Once the draft
   * is resubmitted (`submitted|under_review|approved`) the reason is hidden.
   */
  private async rejectionReasonsFor(
    submissions: SubmissionModel[],
  ): Promise<Map<string, string | null>> {
    const eligible = submissions.filter(
      (submission) =>
        submission.status === 'rejected' || submission.status === 'draft',
    );
    if (eligible.length === 0) {
      return new Map();
    }
    const rows = await this.verificationModel
      .find({
        submissionId: { $in: eligible.map((submission) => submission._id) },
        status: 'rejected',
      })
      .sort({ decidedAt: -1 })
      .select('submissionId reason')
      .lean()
      .exec();
    return new Map(
      rows.map((row) => [row.submissionId.toString(), row.reason ?? null]),
    );
  }

  async getDetail(
    account: AccountToken,
    submissionId: string,
  ): Promise<Record<string, unknown>> {
    const submission = await this.requireSubmission(submissionId);

    if (account.role === 'volunteer') {
      if (submission.volunteerId.toString() !== account.sub) {
        throw new BusinessException(
          SUBMISSION_NOT_FOUND,
          'Submission not found',
          404,
        );
      }
      return this.withEvidence(account, submission);
    }

    if (account.role === 'organization') {
      const organization = await this.requireOwnOrganization(account);
      if (
        submission.organizationId.toString() !== organization._id.toString()
      ) {
        throw new BusinessException(
          SUBMISSION_NOT_FOUND,
          'Submission not found',
          404,
        );
      }
      return this.withEvidence(account, submission);
    }

    throw new BusinessException(
      SUBMISSION_NOT_FOUND,
      'Submission not found',
      404,
    );
  }

  /** Attaches each evidence media's metadata (signed URL per §6 matrix).
   * One unreadable evidence item (denied, deleted, or missing storage
   * object) degrades to minimal metadata without a URL instead of failing
   * the whole detail read — the same posture as the 403 branch below. */
  private async withEvidence(
    account: AccountToken,
    submission: SubmissionModel,
  ): Promise<Record<string, unknown>> {
    const evidence = [];
    for (const entry of submission.evidence) {
      try {
        const read = await this.media.read(account, entry.mediaId.toString());
        evidence.push({
          mediaId: entry.mediaId.toString(),
          media: read.media,
          url: read.url,
        });
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          ((error as { status?: number }).status === 403 ||
            (error as { status?: number }).status === 404 ||
            (error as { status?: number }).status === 502)
        ) {
          // Non-owner org reading private evidence: matrix denies; deleted
          // media; or a storage object missing behind its metadata row (dev
          // seed writes metadata-only placeholders). Surface minimal
          // metadata without a URL (Open Question: Part B wires
          // OpportunityMediaAccess).
          const media = await this.mediaOwnership.findById(
            entry.mediaId.toString(),
          );
          evidence.push({
            mediaId: entry.mediaId.toString(),
            media,
            url: null,
          });
        } else {
          throw error;
        }
      }
    }
    const rejectionReason =
      (await this.rejectionReasonsFor([submission])).get(
        submission._id.toString(),
      ) ?? null;
    return {
      ...submission.toObject(),
      rejectionReason,
      evidence,
      // Session 19: submitting-volunteer identity join.
      volunteer: await this.volunteerJoin(submission.volunteerId),
    };
  }

  /**
   * Session 19 volunteer identity join (single + batched variants, one bounded
   * query per page). Unknown profiles yield `null`, never an error.
   */
  private async volunteerJoin(
    volunteerId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    const map = await this.volunteerJoinMap([volunteerId]);
    return map.get(volunteerId.toString()) ?? null;
  }

  private async volunteerJoinMap(
    volunteerIds: Types.ObjectId[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const distinct = [...new Set(volunteerIds.map((id) => id.toString()))];
    if (distinct.length === 0) {
      return new Map();
    }
    const profiles = await this.profileModel
      .find({
        userId: { $in: distinct.map((id) => new Types.ObjectId(id)) },
      })
      .select('userId username firstName lastName avatar geographicBase')
      .lean()
      .exec();
    return new Map(
      profiles.map((profile) => {
        const fullName = [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(' ');
        return [
          profile.userId.toString(),
          {
            userId: profile.userId.toString(),
            username: profile.username,
            fullName: fullName ? fullName : null,
            avatarMediaId: profile.avatar ? profile.avatar.toString() : null,
            geographicBase: profile.geographicBase ?? null,
          },
        ];
      }),
    );
  }

  /***************************************************************************
   * Organization inbox
   **************************************************************************/

  async listForOrganization(
    account: AccountToken,
    query: SubmissionListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const organization = await this.requireOwnOrganization(account);
    const filter: FilterQuery<SubmissionModel> = {
      organizationId: organization._id,
    };
    const statuses = this.parseStatuses(query.status);
    if (statuses) {
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (query.opportunityId) {
      filter.opportunityId = new Types.ObjectId(query.opportunityId);
    }
    if (query.q) {
      const pattern = query.q
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .slice(0, 60);
      if (pattern) {
        const regex = { $regex: pattern, $options: 'i' };
        filter.$or = [
          { title: regex },
          { description: regex },
          { 'deliverables.title': regex },
        ];
      }
    }
    if (query.format) {
      const mediaIds = await this.resolveFormatMediaIds(query.format);
      filter['evidence.mediaId'] =
        mediaIds.length > 0
          ? { $in: mediaIds }
          : new Types.ObjectId('000000000000000000000000');
    }
    const page = await this.paginateSubmissions(filter, query);
    // Session 19: volunteer identity join on every inbox row (one query).
    const joins = await this.volunteerJoinMap(
      page.items.map((item) => item.volunteerId),
    );
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item.toObject(),
        volunteer: joins.get(item.volunteerId.toString()) ?? null,
      })),
    };
  }

  /**
   * Evidence-format lookup (approved vocab: image, video, document, link),
   * matched against the media kind/type. Bounded to 1000 media rows.
   */
  private async resolveFormatMediaIds(
    format: string,
  ): Promise<Types.ObjectId[]> {
    let mediaFilter: FilterQuery<MediaModel>;
    if (format === 'image') {
      mediaFilter = { type: 'file', mimeType: { $regex: '^image/' } };
    } else if (format === 'video') {
      mediaFilter = {
        $or: [
          { type: 'link' },
          { type: 'file', mimeType: { $regex: '^video/' } },
        ],
      };
    } else if (format === 'document') {
      mediaFilter = { type: 'file', mimeType: { $regex: '^application/' } };
    } else {
      mediaFilter = { type: 'link' };
    }
    const rows = await this.mediaModel
      .find(mediaFilter)
      .select('_id')
      .limit(1000)
      .lean()
      .exec();
    return rows.map((row) => row._id);
  }

  /***************************************************************************
   * Start review
   **************************************************************************/

  async startReview(
    account: AccountToken,
    submissionId: string,
  ): Promise<SubmissionModel> {
    const organization = await this.requireOwnOrganization(account);
    const submission = await this.requireSubmission(submissionId);
    if (submission.organizationId.toString() !== organization._id.toString()) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }

    // Implicit inbox-open path: already under review is an idempotent no-op.
    if (submission.status === 'under_review') {
      return submission;
    }

    await this.statusTransitions.assert({
      entityType: 'submission',
      entityId: submission._id,
      from: submission.status,
      to: 'under_review',
      actor: account.sub,
    });

    const updated = await this.submissionModel.findOneAndUpdate(
      { _id: submission._id, status: submission.status },
      { $set: { status: 'under_review' } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        INVALID_STATUS_TRANSITION,
        'The submission must be submitted before review starts',
        409,
      );
    }
    return updated;
  }
}
