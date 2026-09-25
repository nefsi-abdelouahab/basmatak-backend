import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
import {
  enrichExperiences,
  EnrichedExperience,
  ExperienceLike,
  ExperienceOrganizationLike,
  ExperienceReviewLike,
  ExperienceVerificationLike,
} from './experience-enrichment';
import {
  VerificationModel,
  VerificationsCollection,
} from './schemas/verification.schema';

/**
 * Module-scoped enrichment reads (Session 15). Runs the three bounded `$in`
 * lookups (organizations, verifications for `verifiedAt`, reviews for neutral
 * notes) and maps rows via the shared pure assembler — constant queries per
 * page, never per-row. The admin provider cannot inject this service (it is
 * instantiated in the admin injector scope), so it reuses `enrichExperiences`
 * with its own reads instead.
 */
@Injectable()
export class ExperienceEnrichmentService {
  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
  ) {}

  async enrich(
    experiences: ExperienceLike[],
    opts?: { publicView?: boolean },
  ): Promise<EnrichedExperience[]> {
    if (experiences.length === 0) {
      return [];
    }
    const organizationIds = [
      ...new Set(
        experiences.map((experience) => experience.organizationId.toString()),
      ),
    ].map((id) => new Types.ObjectId(id));
    const submissionIds = [
      ...new Set(
        experiences.map((experience) => experience.submissionId.toString()),
      ),
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
    const organizationsById = new Map<string, ExperienceOrganizationLike>(
      organizations.map((organization) => [
        organization._id.toString(),
        organization as ExperienceOrganizationLike,
      ]),
    );
    const verificationsBySubmission = new Map<
      string,
      ExperienceVerificationLike
    >(
      verifications.map((verification) => [
        verification.submissionId.toString(),
        verification as ExperienceVerificationLike,
      ]),
    );
    const reviewsBySubmission = new Map<string, ExperienceReviewLike>(
      reviews.map((review) => [
        review.submissionId.toString(),
        review as ExperienceReviewLike,
      ]),
    );
    return enrichExperiences(
      experiences,
      organizationsById,
      verificationsBySubmission,
      reviewsBySubmission,
      opts,
    );
  }
}
