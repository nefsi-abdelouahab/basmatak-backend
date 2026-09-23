import { Types } from 'mongoose';
import { ReviewsService } from './reviews.service';
import { ReviewModel, ReviewsCollection, ReviewSchema } from './review.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
  SubmissionSchema,
} from '../submissions/schemas/submission.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
  VolunteerProfileSchema,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

describe('ReviewsService (S13 F16)', () => {
  let handle: MemoryConnectionHandle;
  let service: ReviewsService;

  const volunteerId = new Types.ObjectId();
  const orgUserId = new Types.ObjectId();
  const organizationId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();

  function orgAccount() {
    return {
      sub: orgUserId.toString(),
      role: 'organization' as const,
      sessionId: 's1',
    };
  }

  function volunteerAccount() {
    return {
      sub: volunteerId.toString(),
      role: 'volunteer' as const,
      sessionId: 's2',
    };
  }

  async function seedOrganization(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    slug: string,
  ): Promise<void> {
    const model = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    await model.create({
      _id: id,
      userId,
      slug,
      verificationStatus: 'verified',
      status: 'active',
    });
  }

  async function seedSubmission(
    submissionId: Types.ObjectId,
    organization: Types.ObjectId,
    status: string,
  ): Promise<void> {
    const model = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    await model.create({
      _id: submissionId,
      participantId: new Types.ObjectId(),
      opportunityId: new Types.ObjectId(),
      positionId: new Types.ObjectId(),
      organizationId: organization,
      volunteerId,
      deliverables: [{ title: 'Litter picker', description: 'Collect litter' }],
      description: 'Done',
      consentConfirmed: true,
      evidence: [],
      status,
    });
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const reviewModel = handle.connection.model<ReviewModel>(
      ReviewsCollection,
      ReviewSchema,
    );
    const submissionModel = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    const profileModel = handle.connection.model<VolunteerProfileModel>(
      VolunteerProfilesCollection,
      VolunteerProfileSchema,
    );
    const opportunityModel = handle.connection.model<OpportunityModel>(
      OpportunitiesCollection,
      OpportunitySchema,
    );
    const organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );

    const organizations = {
      findByUserId: async (userId: string) =>
        organizationModel.findOne({ userId }).exec(),
      listForIds: async (ids: string[]) =>
        organizationModel.find({ _id: { $in: ids } }).exec(),
    } as never;

    service = new ReviewsService(
      reviewModel,
      submissionModel,
      profileModel,
      opportunityModel,
      organizations,
    );

    await seedOrganization(organizationId, orgUserId, 'org-a');
    await seedOrganization(otherOrgId, new Types.ObjectId(), 'org-b');

    await profileModel.create({
      _id: new Types.ObjectId(),
      userId: volunteerId,
      username: 'volunteer-a',
      stats: { completedTasks: 0, verifiedExperiences: 0, volunteerHours: 0 },
    });
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await Promise.all([
      handle.connection.collection(ReviewsCollection).deleteMany({}),
      handle.connection.collection(SubmissionsCollection).deleteMany({}),
    ]);
  });

  describe('1 write route', () => {
    it('writes a review for an approved owned submission', async () => {
      const submissionId = new Types.ObjectId();
      await seedSubmission(submissionId, organizationId, 'approved');

      const review = await service.writeReview(
        orgAccount(),
        submissionId.toString(),
        {
          rating: 5,
          comment: 'Great work',
        },
      );
      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Great work');
      expect(review.volunteerId.toString()).toBe(volunteerId.toString());
      expect(review.organizationId.toString()).toBe(organizationId.toString());
    });

    it('hides foreign and absent submissions as 404', async () => {
      const foreignId = new Types.ObjectId();
      await seedSubmission(foreignId, otherOrgId, 'approved');

      await expect(
        service.writeReview(orgAccount(), foreignId.toString(), { rating: 4 }),
      ).rejects.toMatchObject({ status: 404, code: 'SUBMISSION_NOT_FOUND' });

      await expect(
        service.writeReview(orgAccount(), new Types.ObjectId().toString(), {
          rating: 4,
        }),
      ).rejects.toMatchObject({ status: 404, code: 'SUBMISSION_NOT_FOUND' });
    });

    it('blocks submissions that are not yet decided', async () => {
      for (const status of ['submitted', 'under_review', 'draft', 'rejected']) {
        const submissionId = new Types.ObjectId();
        await seedSubmission(submissionId, organizationId, status);
        await expect(
          service.writeReview(orgAccount(), submissionId.toString(), {
            rating: 3,
          }),
        ).rejects.toMatchObject({ status: 409, code: 'REVIEW_NOT_ALLOWED' });
      }
    });

    it('rejects a duplicate review as 409 REVIEW_ALREADY_EXISTS', async () => {
      const submissionId = new Types.ObjectId();
      await seedSubmission(submissionId, organizationId, 'approved');
      await service.writeReview(orgAccount(), submissionId.toString(), {
        rating: 4,
      });

      await expect(
        service.writeReview(orgAccount(), submissionId.toString(), {
          rating: 2,
        }),
      ).rejects.toMatchObject({ status: 409, code: 'REVIEW_ALREADY_EXISTS' });
    });
  });

  describe('2 list routes', () => {
    it('lists only the reviews the volunteer received, newest first', async () => {
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      await seedSubmission(a, organizationId, 'approved');
      await seedSubmission(b, organizationId, 'approved');
      await service.writeReview(orgAccount(), a.toString(), { rating: 4 });
      await service.writeReview(orgAccount(), b.toString(), { rating: 5 });

      const page = await service.listReceived(volunteerAccount(), {});
      const items = page.items as Array<Record<string, unknown>>;
      expect(items.map((row) => row.rating)).toEqual([5, 4]);
      expect(items[0]).toHaveProperty('organization');
    });

    it('returns an empty page for a volunteer that received nothing', async () => {
      const page = await service.listReceived(volunteerAccount(), {});
      expect(page.items).toHaveLength(0);
      expect(page.nextCursor).toBeNull();
    });

    it('enforces org isolation on the org list and joins context', async () => {
      const submissionId = new Types.ObjectId();
      await seedSubmission(submissionId, organizationId, 'approved');
      await service.writeReview(orgAccount(), submissionId.toString(), {
        rating: 4,
        comment: 'Nice',
      });

      const page = await service.listGiven(orgAccount(), {});
      const items = page.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].rating).toBe(4);
      expect(items[0]).toHaveProperty('submission');
      expect(items[0]).toHaveProperty('volunteer');
      expect((items[0].volunteer as { userId: string }).userId).toBe(
        volunteerId.toString(),
      );
    });

    it('404s the org list when the account has no organization row', async () => {
      await seedSubmission(new Types.ObjectId(), organizationId, 'approved');
      await expect(
        service.listGiven(
          {
            sub: new Types.ObjectId().toString(),
            role: 'organization',
            sessionId: 's3',
          },
          {},
        ),
      ).rejects.toMatchObject({ status: 404, code: 'ORGANIZATION_NOT_FOUND' });
    });
  });
});
