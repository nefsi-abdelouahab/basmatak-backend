import { Types } from 'mongoose';
import { JobRegistry } from '../core/jobs/job-registry';
import {
  OrganizationModel,
  OrganizationsCollection,
  OrganizationSchema,
} from '../organizations/schemas/organization.schema';
import {
  ReviewModel,
  ReviewsCollection,
  ReviewSchema,
} from '../reviews/review.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
  SubmissionSchema,
} from '../submissions/schemas/submission.schema';
import {
  VerificationModel,
  VerificationsCollection,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { ReliabilityService } from './reliability.service';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';

const MINUTE_MS = 60_000;

describe('ReliabilityService (D6/D7)', () => {
  let handle: MemoryConnectionHandle;
  let service: ReliabilityService;
  let jobRegistry: JobRegistry;

  const organizationId = new Types.ObjectId();

  function submission(
    index: number,
    status: string,
    createdAt: Date,
  ): { _id: Types.ObjectId; status: string; createdAt: Date } {
    return { _id: new Types.ObjectId(), status, createdAt };
  }

  function verification(
    submissionId: Types.ObjectId,
    decidedAt: Date,
  ): { submissionId: Types.ObjectId; decidedAt: Date } {
    return { submissionId, decidedAt };
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    const submissionModel = handle.connection.model<SubmissionModel>(
      SubmissionsCollection,
      SubmissionSchema,
    );
    const verificationModel = handle.connection.model<VerificationModel>(
      VerificationsCollection,
      VerificationSchema,
    );
    const reviewModel = handle.connection.model<ReviewModel>(
      ReviewsCollection,
      ReviewSchema,
    );
    const organizationModel = handle.connection.model<OrganizationModel>(
      OrganizationsCollection,
      OrganizationSchema,
    );
    jobRegistry = new JobRegistry();
    service = new ReliabilityService(
      submissionModel,
      verificationModel,
      reviewModel,
      organizationModel,
      jobRegistry,
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  beforeEach(async () => {
    await Promise.all([
      handle.connection.collection(SubmissionsCollection).deleteMany({}),
      handle.connection.collection(VerificationsCollection).deleteMany({}),
      handle.connection.collection(ReviewsCollection).deleteMany({}),
      handle.connection.collection(OrganizationsCollection).deleteMany({}),
    ]);
  });

  describe('6.1 ratio fixture', () => {
    it('responseRate 0.5 and decidedRatio 0.4 for 1 draft / 4 uploaded / 2 decided', () => {
      const rows = [
        submission(0, 'draft', new Date()),
        submission(1, 'submitted', new Date()),
        submission(2, 'under_review', new Date()),
        submission(3, 'approved', new Date()),
        submission(4, 'rejected', new Date()),
      ];
      const metrics = service.deriveMetrics(rows, [], [], []);
      expect(metrics.responseRate).toBe(0.5);
      expect(metrics.decidedRatio).toBe(0.4);
    });
  });

  describe('6.1 even-length median', () => {
    it('averages the two middle values: [10,20,40,90] minutes → 30 minutes', () => {
      const base = new Date('2026-01-01T00:00:00.000Z');
      const durations = [10, 20, 40, 90];
      const rows = durations.map((minutes, index) =>
        submission(
          index,
          'approved',
          new Date(base.getTime() - minutes * MINUTE_MS),
        ),
      );
      const verifications = rows.map((row, _index) =>
        verification(row._id, new Date(base.getTime())),
      );
      const metrics = service.deriveMetrics(rows, verifications, [], []);
      expect(metrics.medianDecisionMs).toBe(30 * MINUTE_MS);
    });
  });

  describe('6.1 zero-upload guard', () => {
    it('omits ratio metrics (not 0) when there are no uploaded submissions', () => {
      const rows = [submission(0, 'draft', new Date())];
      const metrics = service.deriveMetrics(rows, [], [], []);
      expect('responseRate' in metrics).toBe(false);
      expect('decidedRatio' in metrics).toBe(false);
    });

    it('omits median when there are no verification rows', () => {
      const metrics = service.deriveMetrics([], [], [], []);
      expect('medianDecisionMs' in metrics).toBe(false);
    });
  });

  describe('6.1 anomaly flag', () => {
    it('true when the org average beats the platform average on ≥1 review each', () => {
      const metrics = service.deriveMetrics(
        [],
        [],
        [{ rating: 5 }, { rating: 5 }],
        [{ rating: 3 }, { rating: 3 }],
      );
      expect(metrics.anomaly).toBe(true);
    });

    it('false when the org average is below the platform average', () => {
      const metrics = service.deriveMetrics(
        [],
        [],
        [{ rating: 2 }],
        [{ rating: 4 }],
      );
      expect(metrics.anomaly).toBe(false);
    });

    it('false when either side has no reviews', () => {
      const noOrg = service.deriveMetrics([], [], [], [{ rating: 4 }]);
      expect(noOrg.anomaly).toBe(false);
      const noPlatform = service.deriveMetrics([], [], [{ rating: 4 }], []);
      expect(noPlatform.anomaly).toBe(false);
    });
  });

  describe('6.4 hidden reviews (S16 admin moderation)', () => {
    it('excludes status=hidden reviews from org and platform averages via computeFor', async () => {
      const anotherOrgId = new Types.ObjectId();
      const reviewModel = handle.connection.model<ReviewModel>(
        ReviewsCollection,
        ReviewSchema,
      );
      await reviewModel.insertMany([
        // org: 4 (visible) + 5 (hidden) → visible-only average 4
        {
          submissionId: new Types.ObjectId(),
          organizationId,
          volunteerId: new Types.ObjectId(),
          rating: 4,
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId,
          volunteerId: new Types.ObjectId(),
          rating: 4,
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId,
          volunteerId: new Types.ObjectId(),
          rating: 5,
          status: 'hidden',
        },
        // platform: 5 (visible) + 1 (hidden) → visible-only average 5
        {
          submissionId: new Types.ObjectId(),
          organizationId: anotherOrgId,
          volunteerId: new Types.ObjectId(),
          rating: 5,
        },
        {
          submissionId: new Types.ObjectId(),
          organizationId: anotherOrgId,
          volunteerId: new Types.ObjectId(),
          rating: 2,
          status: 'hidden',
        },
      ]);

      const reliability = await service.computeFor(organizationId);

      // If hidden reviews leaked in: org avg 4.5 > platform avg 3 → anomaly true.
      // Visible-only: org avg 4 < platform avg 5 → anomaly false.
      expect(reliability.anomaly).toBe(false);
    });
  });

  describe('6.2 persistence + 6.4 job registration', () => {
    it('persists computed metrics into organizations.reliability with lastRefreshedAt', async () => {
      const model = handle.connection.model<OrganizationModel>(
        OrganizationsCollection,
        OrganizationSchema,
      );
      await model.create({
        _id: organizationId,
        userId: new Types.ObjectId(),
        slug: 'org-persist',
        verificationStatus: 'verified',
        status: 'active',
        reliability: { score: 0 },
      });

      const subModel = handle.connection.model<SubmissionModel>(
        SubmissionsCollection,
        SubmissionSchema,
      );
      const approved = await subModel.create({
        _id: new Types.ObjectId(),
        participantId: new Types.ObjectId(),
        opportunityId: new Types.ObjectId(),
        positionId: new Types.ObjectId(),
        organizationId,
        volunteerId: new Types.ObjectId(),
        deliverables: [],
        consentConfirmed: true,
        evidence: [],
        status: 'approved',
      });
      const verificationModel = handle.connection.model<VerificationModel>(
        VerificationsCollection,
        VerificationSchema,
      );
      await verificationModel.create({
        submissionId: approved._id,
        organizationId,
        volunteerId: new Types.ObjectId(),
        status: 'verified',
        decidedBy: new Types.ObjectId(),
        decidedAt: new Date(approved.createdAt.getTime() + 30 * MINUTE_MS),
      });

      await service.refresh(organizationId);

      const stored = await model.findById(organizationId).lean().exec();
      expect(stored!.reliability).toBeDefined();
      expect(stored!.reliability!.responseRate).toBe(1);
      expect(stored!.reliability!.decidedRatio).toBe(1);
      expect(stored!.reliability!.medianDecisionHours).toBe(0.5);
      expect(stored!.reliability!.lastRefreshedAt).toBeInstanceOf(Date);
      expect(stored!.reliability!.score).toBeUndefined();
    });

    it('registers the reliabilityRecompute handler at bootstrap', () => {
      service.onModuleInit();
      expect(
        jobRegistry.handlers.some((h) => h.name === 'reliabilityRecompute'),
      ).toBe(true);
    });

    it('recomputeAll refreshes every org idempotently', async () => {
      const model = handle.connection.model<OrganizationModel>(
        OrganizationsCollection,
        OrganizationSchema,
      );
      const a = new Types.ObjectId();
      const b = new Types.ObjectId();
      await model.insertMany([
        { _id: a, userId: new Types.ObjectId(), slug: 'a', status: 'active' },
        { _id: b, userId: new Types.ObjectId(), slug: 'b', status: 'active' },
      ]);
      await service.recomputeAll();
      const rows = await model.find({}).select('reliability').lean().exec();
      expect(rows.every((row) => row.reliability?.lastRefreshedAt)).toBe(true);
    });
  });
});
