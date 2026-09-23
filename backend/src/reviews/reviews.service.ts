import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  buildCursor,
  decodeCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrganizationModel } from '../organizations/schemas/organization.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { CreateReviewDto, ReviewListQueryDto } from './dto/review.dto';
import { ReviewModel, ReviewsCollection } from './review.schema';

const SUBMISSION_NOT_FOUND = 'SUBMISSION_NOT_FOUND';
const REVIEW_NOT_ALLOWED = 'REVIEW_NOT_ALLOWED';
const REVIEW_ALREADY_EXISTS = 'REVIEW_ALREADY_EXISTS';

/**
 * Reviews service (inventory §2.16, roadmap S13): the owning organization's
 * write route for a verified submission, and the two cursor-paginated list
 * routes — the reviews a volunteer received and the reviews an organization
 * gave. The schema/model and the atomic in-transaction write during verify are
 * owned by Session 11 (F16); this session adds the read write path.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    private readonly organizations: OrganizationsService,
  ) {}

  /***************************************************************************
   * Identity helpers
   **************************************************************************/

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

  private async paginate(
    filter: FilterQuery<ReviewModel>,
    query: ReviewListQueryDto,
  ): Promise<CursorPage<ReviewModel>> {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const pageFilter: FilterQuery<ReviewModel> = { ...filter };
    if (cursor) {
      pageFilter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.reviewModel
      .find(pageFilter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return { items, nextCursor: buildCursor(lastId).cursor, limit };
  }

  /***************************************************************************
   * Write route
   **************************************************************************/

  async writeReview(
    account: AccountToken,
    submissionId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewModel> {
    const organization = await this.requireOwnOrganization(account);
    const submission = await this.requireSubmission(submissionId);
    if (submission.organizationId.toString() !== organization._id.toString()) {
      throw new BusinessException(
        SUBMISSION_NOT_FOUND,
        'Submission not found',
        404,
      );
    }
    if (submission.status !== 'approved') {
      throw new BusinessException(
        REVIEW_NOT_ALLOWED,
        `A submission in status '${submission.status}' cannot be reviewed`,
        409,
      );
    }

    try {
      return await this.reviewModel.create({
        submissionId: submission._id,
        organizationId: organization._id,
        volunteerId: submission.volunteerId,
        rating: dto.rating,
        comment: dto.comment,
      });
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

  /***************************************************************************
   * List routes
   **************************************************************************/

  async listReceived(
    account: AccountToken,
    query: ReviewListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const filter: FilterQuery<ReviewModel> = {
      volunteerId: new Types.ObjectId(account.sub),
    };
    const page = await this.paginate(filter, query);
    return this.withOrganizationContext(page);
  }

  async listGiven(
    account: AccountToken,
    query: ReviewListQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const organization = await this.requireOwnOrganization(account);
    const filter: FilterQuery<ReviewModel> = {
      organizationId: organization._id,
    };
    const page = await this.paginate(filter, query);
    return this.withSubmissionAndVolunteerContext(page);
  }

  /***************************************************************************
   * Rendering context joins
   **************************************************************************/

  /**
   * Attaches the writing organization (id + display fields) to each row so a
   * volunteer list renders who reviewed the work.
   */
  private async withOrganizationContext(
    page: CursorPage<ReviewModel>,
  ): Promise<CursorPage<Record<string, unknown>>> {
    if (page.items.length === 0) {
      return {
        items: [] as Record<string, unknown>[],
        nextCursor: page.nextCursor,
        limit: page.limit,
        total: page.total,
      };
    }
    const organizationIds = [
      ...new Set(page.items.map((row) => row.organizationId.toString())),
    ];
    const organizations = await this.organizations.listForIds(organizationIds);
    const byId = new Map(organizations.map((org) => [org._id.toString(), org]));
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row.toObject(),
        organization: byId.get(row.organizationId.toString())
          ? {
              _id: row.organizationId.toString(),
              slug: byId.get(row.organizationId.toString())!.slug,
              nameAr: byId.get(row.organizationId.toString())!.nameAr ?? null,
              nameFr: byId.get(row.organizationId.toString())!.nameFr ?? null,
            }
          : null,
      })),
    };
  }

  /**
   * Attaches the reviewed submission and the volunteer profile (id + display
   * fields) so an organization list renders what was reviewed and by whom.
   */
  private async withSubmissionAndVolunteerContext(
    page: CursorPage<ReviewModel>,
  ): Promise<CursorPage<Record<string, unknown>>> {
    if (page.items.length === 0) {
      return {
        items: [] as Record<string, unknown>[],
        nextCursor: page.nextCursor,
        limit: page.limit,
        total: page.total,
      };
    }
    const submissionIds = [
      ...new Set(page.items.map((row) => row.submissionId.toString())),
    ];
    const volunteerIds = [
      ...new Set(page.items.map((row) => row.volunteerId.toString())),
    ];
    const submissions = await this.submissionModel
      .find({ _id: { $in: submissionIds } })
      .lean()
      .exec();
    const opportunityIds = [
      ...new Set(submissions.map((sub) => sub.opportunityId.toString())),
    ];
    const [volunteers, opportunities] = await Promise.all([
      this.profileModel
        .find({ userId: { $in: volunteerIds } })
        .lean()
        .exec(),
      this.opportunityModel
        .find({ _id: { $in: opportunityIds } })
        .lean()
        .exec(),
    ]);
    const submissionById = new Map(
      submissions.map((sub) => [sub._id.toString(), sub]),
    );
    const volunteerByUser = new Map(
      volunteers.map((profile) => [profile.userId.toString(), profile]),
    );
    const opportunityById = new Map(
      opportunities.map((opportunity) => [
        opportunity._id.toString(),
        opportunity,
      ]),
    );

    return {
      ...page,
      items: page.items.map((row) => {
        const submission = submissionById.get(row.submissionId.toString());
        const volunteer = volunteerByUser.get(row.volunteerId.toString());
        const opportunity = submission
          ? opportunityById.get(submission.opportunityId.toString())
          : undefined;
        return {
          ...row.toObject(),
          submission: submission
            ? {
                _id: submission._id.toString(),
                status: submission.status,
                description: submission.description ?? null,
                opportunityId: submission.opportunityId.toString(),
              }
            : null,
          opportunity: opportunity
            ? {
                _id: opportunity._id.toString(),
                title: opportunity.title,
                slug: opportunity.slug,
              }
            : null,
          volunteer: volunteer
            ? {
                userId: volunteer.userId.toString(),
                username: volunteer.username,
                firstName: volunteer.firstName ?? null,
                lastName: volunteer.lastName ?? null,
              }
            : null,
        };
      }),
    };
  }
}
