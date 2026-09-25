import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { RegistryIdService } from '../common/counters/registry-id.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { MediaCollection, MediaModel } from '../media/schemas/media.schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { VerifyDto, RejectDto } from './dto/verification.dto';
import {
  VerificationModel,
  VerificationsCollection,
} from './schemas/verification.schema';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from './schemas/volunteer-experience.schema';
import { createWithUniqueVerificationCode } from './verification-code.util';

const SUBMISSION_NOT_FOUND = 'SUBMISSION_NOT_FOUND';
const VERIFICATION_NOT_FOUND = 'VERIFICATION_NOT_FOUND';
const INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION';
const REVIEW_ALREADY_EXISTS = 'REVIEW_ALREADY_EXISTS';

/**
 * Real duration source for an experience (Session 15 `experience-enrichment`).
 * Opportunities carry the configured `durationMinutes` (Session 11); positions
 * have no duration field, so position-level math is impossible and a
 * wall-clock `endDate − startDate` span would conflate scheduling with
 * volunteered hours. Legacy opportunities predating Session 11 fields mint `0`
 * (roadmap-defined fallback; stored rows are never backfilled).
 */
function experienceDuration(opportunity: OpportunityModel): number {
  return opportunity.durationMinutes ?? 0;
}

/**
 * Verifications service (inventory §2.13, roadmap S11 Part B): the owning
 * organization's verify (transactional) and reject flows. Verify mirrors the
 * S7 accept transaction — status histories, the participant `completed`
 * transition, the verification row, the experience snapshot + proof code, the
 * optional review, the stats `$inc` and the volunteer notification all commit
 * atomically; `submission.verified` is emitted only after commit.
 */
@Injectable()
export class VerificationsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
    private readonly organizations: OrganizationsService,
    private readonly statusTransitions: StatusTransitionService,
    private readonly notifications: NotificationsService,
    private readonly registryId: RegistryIdService,
    private readonly eventEmitter: EventEmitter2,
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

  private async requireOwnedSubmission(
    organization: OrganizationModel,
    submissionId: string,
  ): Promise<SubmissionModel> {
    const submission = await this.requireSubmission(submissionId);
    if (submission.organizationId.toString() !== organization._id.toString()) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }
    return submission;
  }

  private assertDecisionable(submission: SubmissionModel): void {
    if (
      submission.status !== 'submitted' &&
      submission.status !== 'under_review'
    ) {
      throw new BusinessException(
        INVALID_STATUS_TRANSITION,
        `A submission in status '${submission.status}' cannot be decided`,
        409,
      );
    }
  }

  /***************************************************************************
   * Verify (transaction, D9)
   **************************************************************************/

  async verify(
    account: AccountToken,
    submissionId: string,
    dto: VerifyDto,
  ): Promise<SubmissionModel> {
    const organization = await this.requireOwnOrganization(account);
    const submission = await this.requireOwnedSubmission(
      organization,
      submissionId,
    );
    this.assertDecisionable(submission);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async (txn) => {
        // In-session re-read + precondition re-check (S7 posture): the guarded
        // updates below stay authoritative under concurrency.
        const current = await this.submissionModel
          .findById(submission._id)
          .session(txn)
          .exec();
        if (!current) {
          throw new BusinessException(
            SUBMISSION_NOT_FOUND,
            'Submission not found',
            404,
          );
        }
        this.assertDecisionable(current);

        if (current.status === 'submitted') {
          await this.statusTransitions.assert({
            entityType: 'submission',
            entityId: current._id,
            from: 'submitted',
            to: 'under_review',
            actor: account.sub,
            session: txn,
          });
        }
        await this.statusTransitions.assert({
          entityType: 'submission',
          entityId: current._id,
          from: 'under_review',
          to: 'approved',
          actor: account.sub,
          session: txn,
        });
        const approved = await this.submissionModel
          .updateOne(
            {
              _id: current._id,
              status: { $in: ['submitted', 'under_review'] },
            },
            { $set: { status: 'approved' } },
          )
          .session(txn)
          .exec();
        if (approved.matchedCount !== 1) {
          throw new BusinessException(
            INVALID_STATUS_TRANSITION,
            'The submission is no longer decisionable',
            409,
          );
        }

        const decidedAt = new Date();
        const decidedBy = new Types.ObjectId(account.sub);

        // Participant → completed (D9 step 3). Re-verify of a resubmitted
        // submission reuses the already-`completed` row (idempotent skip).
        const participant = await this.participantModel
          .findById(current.participantId)
          .session(txn)
          .exec();
        if (!participant) {
          throw new BusinessException(
            'PARTICIPATION_NOT_FOUND',
            'Participation not found',
            404,
          );
        }
        if (participant.status !== 'completed') {
          const completed = await this.participantModel
            .updateOne(
              { _id: participant._id, status: { $in: ['accepted', 'active'] } },
              { $set: { status: 'completed' } },
            )
            .session(txn)
            .exec();
          if (completed.matchedCount !== 1) {
            throw new BusinessException(
              INVALID_STATUS_TRANSITION,
              `Participant status '${participant.status}' cannot be completed`,
              409,
            );
          }
          await this.statusTransitions.assert({
            entityType: 'task_participant',
            entityId: participant._id,
            from: participant.status,
            to: 'completed',
            actor: account.sub,
            session: txn,
          });
        }

        // Evidence liveness re-check (design risks): a media row deleted since
        // submit blocks the approval.
        const evidenceIds = current.evidence.map((entry) => entry.mediaId);
        const liveMedia = await this.mediaModel
          .find({
            _id: { $in: evidenceIds },
            deletedAt: { $exists: false },
          })
          .session(txn)
          .exec();
        if (liveMedia.length !== new Set(evidenceIds.map(String)).size) {
          throw new BusinessException(
            'MEDIA_NOT_FOUND',
            'An evidence item is no longer available',
            404,
          );
        }

        // Verification row: one per submission, reused/updated on re-verify
        // (unique `submissionId`; a rejected row flips back to verified).
        await this.verificationModel
          .findOneAndUpdate(
            { submissionId: current._id },
            {
              $set: {
                organizationId: current.organizationId,
                volunteerId: current.volunteerId,
                status: 'verified',
                ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
                decidedAt,
                decidedBy,
              },
              $unset: { reason: 1 },
            },
            { upsert: true, new: true, session: txn },
          )
          .exec();

        // Experience snapshot + A12 proof code (D13/D14, unique code retry).
        const opportunity = await this.opportunityModel
          .findById(current.opportunityId)
          .session(txn)
          .exec();
        if (!opportunity) {
          throw new BusinessException(
            'OPPORTUNITY_NOT_FOUND',
            'Opportunity not found',
            404,
          );
        }
        const position = opportunity.positions.id(
          current.positionId.toString(),
        );
        if (!position) {
          throw new BusinessException(
            'OPPORTUNITY_NOT_FOUND',
            'Position not found',
            404,
          );
        }
        // Registry id minted inside the txn; `$setOnInsert` means re-verifying
        // a previously-verified submission keeps its EXP- id (D4 immutability).
        const experienceRegistryId = await this.registryId.getNext(
          'experience',
          {
            session: txn,
          },
        );
        const { doc: experience } = await createWithUniqueVerificationCode(
          (verificationCode) =>
            this.experienceModel
              .findOneAndUpdate(
                { submissionId: current._id },
                {
                  $set: {
                    volunteerId: current.volunteerId,
                    organizationId: current.organizationId,
                    opportunityId: current.opportunityId,
                    positionId: current.positionId,
                    title: position.title,
                    description: position.description ?? undefined,
                    skills: position.requiredSkills,
                    duration: experienceDuration(opportunity),
                    evidenceIds,
                    verificationCode,
                  },
                  $setOnInsert: { registryId: experienceRegistryId },
                },
                { upsert: true, new: true, session: txn },
              )
              .exec(),
        );
        const duration = (experience as VolunteerExperienceModel).duration;

        // Optional in-transaction review (F16/D15); a second review for the
        // same submission fails the unique `submissionId` index → 409.
        if (dto.review) {
          try {
            await this.reviewModel.create(
              [
                {
                  submissionId: current._id,
                  organizationId: current.organizationId,
                  volunteerId: current.volunteerId,
                  rating: dto.review.rating,
                  comment: dto.review.comment,
                },
              ],
              { session: txn },
            );
          } catch (error: unknown) {
            if (isDuplicateKeyError(error)) {
              throw new BusinessException(
                REVIEW_ALREADY_EXISTS,
                'A review already exists for this submission',
                409,
              );
            }
            throw error;
          }
        }

        // Volunteer stats $inc (D9 step 7), scoped by the denormalized
        // volunteerId so a stale/missing profile aborts the transaction.
        const stats = await this.profileModel
          .updateOne(
            { userId: current.volunteerId },
            {
              $inc: {
                'stats.completedTasks': 1,
                'stats.verifiedExperiences': 1,
                'stats.volunteerHours': duration,
              },
            },
          )
          .session(txn)
          .exec();
        if (stats.matchedCount !== 1) {
          throw new BusinessException(
            'VOLUNTEER_PROFILE_NOT_FOUND',
            'Volunteer profile not found',
            404,
          );
        }

        // In-transaction volunteer notification (F4): the post-commit
        // `submission.verified` handler derives the same dedupeKey and is
        // swallowed (exactly one row).
        await this.notifications.createInSession(
          {
            recipientId: current.volunteerId,
            type: DomainEvents.SubmissionVerified,
            payload: { submissionId: current._id.toString() },
          },
          txn,
        );
      });
    } finally {
      await session.endSession();
    }

    const updated = await this.requireSubmission(submissionId);
    this.eventEmitter.emit(DomainEvents.SubmissionVerified, {
      submission: updated,
    });
    return updated;
  }

  /***************************************************************************
   * Reject (non-transactional, D11)
   **************************************************************************/

  async reject(
    account: AccountToken,
    submissionId: string,
    dto: RejectDto,
  ): Promise<SubmissionModel> {
    const organization = await this.requireOwnOrganization(account);
    const submission = await this.requireOwnedSubmission(
      organization,
      submissionId,
    );
    this.assertDecisionable(submission);

    if (submission.status === 'submitted') {
      await this.statusTransitions.assert({
        entityType: 'submission',
        entityId: submission._id,
        from: 'submitted',
        to: 'under_review',
        actor: account.sub,
      });
    }
    await this.statusTransitions.assert({
      entityType: 'submission',
      entityId: submission._id,
      from: 'under_review',
      to: 'rejected',
      actor: account.sub,
    });

    const updated = await this.submissionModel.findOneAndUpdate(
      { _id: submission._id, status: { $in: ['submitted', 'under_review'] } },
      { $set: { status: 'rejected' } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessException(
        INVALID_STATUS_TRANSITION,
        'The submission is no longer decisionable',
        409,
      );
    }

    // Rejection reason lives on the terminal `rejected` verification row (D11
    // deviation); the row is one-per-submission, so a repeat rejection replaces
    // the prior decision with the latest reason.
    await this.verificationModel
      .findOneAndUpdate(
        { submissionId: submission._id },
        {
          $set: {
            organizationId: submission.organizationId,
            volunteerId: submission.volunteerId,
            status: 'rejected',
            reason: dto.reason,
            decidedAt: new Date(),
            decidedBy: new Types.ObjectId(account.sub),
          },
          $unset: { notes: 1 },
        },
        { upsert: true, new: true },
      )
      .exec();

    this.eventEmitter.emit(DomainEvents.SubmissionRejected, {
      submission: updated,
      reason: dto.reason,
    });
    return updated;
  }

  /***************************************************************************
   * Verification detail (inventory §2.13, 11.1)
   **************************************************************************/

  async getVerification(
    account: AccountToken,
    verificationId: string,
  ): Promise<VerificationModel> {
    if (!Types.ObjectId.isValid(verificationId)) {
      throw new BusinessException(
        VERIFICATION_NOT_FOUND,
        'Verification not found',
        404,
      );
    }
    const verification = await this.verificationModel
      .findById(new Types.ObjectId(verificationId))
      .exec();
    if (!verification) {
      throw new BusinessException(
        VERIFICATION_NOT_FOUND,
        'Verification not found',
        404,
      );
    }

    if (account.role === 'volunteer') {
      if (verification.volunteerId.toString() !== account.sub) {
        throw new BusinessException(
          VERIFICATION_NOT_FOUND,
          'Verification not found',
          404,
        );
      }
      return verification;
    }

    if (account.role === 'organization') {
      const organization = await this.requireOwnOrganization(account);
      if (
        verification.organizationId.toString() !== organization._id.toString()
      ) {
        throw new BusinessException(
          VERIFICATION_NOT_FOUND,
          'Verification not found',
          404,
        );
      }
      return verification;
    }

    throw new BusinessException(
      VERIFICATION_NOT_FOUND,
      'Verification not found',
      404,
    );
  }
}
