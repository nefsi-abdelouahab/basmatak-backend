import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import { MediaModel } from './schemas/media.schema';
import { OpportunityMediaAccess } from './media-access';

/**
 * Real owning-organization read branch for the §6 private-media matrix
 * (backend-v2-media-org-read; completes archived backend-v2-media-access
 * task 3.2 intent). Allows an `organization` actor to read
 * `visibility=private` `submission_evidence` attached to a submission on one
 * of its own opportunities. Resolution is submission → organization: the
 * submission is located via the media's `submissionId` when set, otherwise
 * via the `submissions.evidence.mediaId` reverse lookup (indexed); the
 * submission's `organizationId` resolves the organization, which matches iff
 * `organizations.userId` equals the actor's subject. Deny-safe: every lookup
 * miss returns `false` and the seam never throws.
 */
@Injectable()
export class OrganizationOpportunityMediaAccess extends OpportunityMediaAccess {
  constructor(
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
  ) {
    super();
  }

  async allows(actor: AccountToken, media: MediaModel): Promise<boolean> {
    try {
      if (actor.role !== 'organization' || !actor.sub) {
        return false;
      }
      if (
        media.purpose !== 'submission_evidence' ||
        media.visibility !== 'private'
      ) {
        return false;
      }
      const submission = await this.findSubmission(media);
      if (!submission) {
        return false;
      }
      const organization = await this.organizationModel
        .findById(submission.organizationId)
        .select('userId')
        .lean()
        .exec();
      if (!organization) {
        return false;
      }
      return organization.userId.toString() === actor.sub;
    } catch {
      return false;
    }
  }

  private async findSubmission(
    media: MediaModel,
  ): Promise<{ organizationId: Types.ObjectId } | null> {
    if (media.submissionId) {
      const direct = await this.submissionModel
        .findById(media.submissionId)
        .select('organizationId')
        .lean()
        .exec();
      if (direct) {
        return direct;
      }
    }
    return this.submissionModel
      .findOne({ 'evidence.mediaId': media._id })
      .select('organizationId')
      .lean()
      .exec();
  }
}
