import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CursorPage } from '../common/pagination/paginated.interface';
import { AdminExperienceDisplayProvider } from '../common/seams/admin-experience-display';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
import {
  enrichExperiences,
  ExperienceOrganizationLike,
  ExperienceReviewLike,
  ExperienceVerificationLike,
} from './experience-enrichment';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from './schemas/volunteer-experience.schema';
import {
  VerificationModel,
  VerificationsCollection,
} from './schemas/verification.schema';

/**
 * Real `AdminExperienceDisplay` provider (Session 15 fills the Session 10
 * seam: RP §3.2#9 "Latest Verified Engagement"). Reads the volunteer's
 * verified-experience rows newest-first as a single counted page of enriched
 * rows (any `publicVisibility`; admin is not gated by it). Instantiated in the
 * admin injector scope, so it carries its own model reads and shares only the
 * pure `enrichExperiences` assembler — no DI cycle with the verifications
 * module. The admin route/service/controller files are unchanged; only the
 * `ADMIN_EXPERIENCE_DISPLAY` binding in `AdminModule` points here.
 */
@Injectable()
export class ExperienceAdminDisplayProvider implements AdminExperienceDisplayProvider {
  constructor(
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
  ) {}

  async getVolunteerExperiences(
    volunteerId: string,
  ): Promise<CursorPage<Record<string, unknown>>> {
    if (!Types.ObjectId.isValid(volunteerId)) {
      return ExperienceAdminDisplayProvider.emptyPage();
    }
    const rows = await this.experienceModel
      .find({ volunteerId: new Types.ObjectId(volunteerId) })
      .sort({ _id: -1 })
      .exec();
    if (rows.length === 0) {
      return ExperienceAdminDisplayProvider.emptyPage();
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
    const enriched = enrichExperiences(
      rows,
      new Map<string, ExperienceOrganizationLike>(
        organizations.map((organization) => [
          organization._id.toString(),
          organization as ExperienceOrganizationLike,
        ]),
      ),
      new Map<string, ExperienceVerificationLike>(
        verifications.map((verification) => [
          verification.submissionId.toString(),
          verification as ExperienceVerificationLike,
        ]),
      ),
      new Map<string, ExperienceReviewLike>(
        reviews.map((review) => [
          review.submissionId.toString(),
          review as ExperienceReviewLike,
        ]),
      ),
    );
    const items: Record<string, unknown>[] = enriched.map((entry) => ({
      ...entry,
    }));
    return {
      items,
      nextCursor: null,
      limit: items.length,
      total: items.length,
      page: 1,
      pages: 1,
    };
  }

  private static emptyPage(): CursorPage<Record<string, unknown>> {
    return {
      items: [],
      nextCursor: null,
      limit: 20,
      total: 0,
      page: 1,
      pages: 0,
    };
  }
}
