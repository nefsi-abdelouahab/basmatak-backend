import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { JobRegistry } from '../core/jobs/job-registry';
import {
  OrganizationModel,
  OrganizationReliability,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VerificationModel,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';

/** Statuses that count as "uploaded" for `responseRate` (decision 6). */
const UPLOADED_STATUSES = ['submitted', 'under_review', 'approved', 'rejected'];
/** Statuses that count as "decided" for the ratios. */
const DECIDED_STATUSES = ['approved', 'rejected'];

/** Settle delay before an event-triggered refresh hits Mongo (decisions 6-7). */
const REFRESH_SETTLE_MS = 250;

/** Computed reliability metrics before zero-metric trimming. */
interface ComputedReliability {
  responseRate?: number;
  decidedRatio?: number;
  medianDecisionMs?: number;
  anomaly?: boolean;
}

/**
 * Reliability read model (roadmap F8, decisions 6-7). `computeFor(orgId)` is a
 * pure aggregation over the org's own `submissions`, `verifications` and
 * `reviews` rows; results are cached into `organizations.reliability` with a
 * `lastRefreshedAt` stamp, refreshed on the submission events that change the
 * inputs and recomputed for every org by the `reliabilityRecompute` job
 * handler registered here (like `opportunityStartTicker`).
 */
@Injectable()
export class ReliabilityService implements OnModuleInit, OnModuleDestroy {
  /** Pending event-triggered refresh timers, cleared on module destroy. */
  private readonly pendingRefreshes = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    private readonly jobRegistry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.jobRegistry.register('reliabilityRecompute', () =>
      this.recomputeAll(),
    );
  }

  /** Recomputes the reliability cache for every organization (idempotent). */
  async recomputeAll(): Promise<void> {
    const organizations = await this.organizationModel
      .find({})
      .select('_id')
      .lean()
      .exec();
    for (const organization of organizations) {
      await this.refresh(organization._id);
    }
  }

  /** Computes the reliability metrics for an org (pure over the org's rows). */
  async computeFor(orgId: Types.ObjectId): Promise<OrganizationReliability> {
    const [submissions, verifications, reviews, platformReviews] =
      await Promise.all([
        this.submissionModel.find({ organizationId: orgId }).lean().exec(),
        this.verificationModel.find({ organizationId: orgId }).lean().exec(),
        this.reviewModel
          .find({ organizationId: orgId })
          .select('rating')
          .lean()
          .exec(),
        this.reviewModel.find({}).select('rating').lean().exec(),
      ]);

    const computed = this.deriveMetrics(
      submissions,
      verifications,
      reviews,
      platformReviews,
    );
    const reliability: OrganizationReliability = {
      responseRate: computed.responseRate,
      decidedRatio: computed.decidedRatio,
      anomaly: computed.anomaly,
      // PERSISTENCE RECONCILIATION: the computation is specified in
      // milliseconds (`medianDecisionMs`), the org schema stores hours.
      ...(computed.medianDecisionMs !== undefined
        ? { medianDecisionHours: computed.medianDecisionMs / 3_600_000 }
        : {}),
      lastRefreshedAt: new Date(),
    };
    return reliability;
  }

  /**
   * Pure metric derivation (unit-testable, decision 6): zero-divisor metrics
   * are omitted rather than stored as 0; even-length medians average the two
   * middle values; `anomaly` needs reviews on both sides.
   */
  deriveMetrics(
    submissions: Array<{ status: string; createdAt: Date }>,
    verifications: Array<{ submissionId: Types.ObjectId; decidedAt: Date }>,
    reviews: Array<{ rating: number }>,
    platformReviews: Array<{ rating: number }>,
  ): ComputedReliability {
    const computed: ComputedReliability = {};

    const uploaded = submissions.filter((row) =>
      UPLOADED_STATUSES.includes(row.status),
    ).length;
    const decided = submissions.filter((row) =>
      DECIDED_STATUSES.includes(row.status),
    ).length;
    const allSubmissions = submissions.length;

    if (uploaded > 0) {
      computed.responseRate = decided / uploaded;
      const medianDecisionMs = this.medianDecisionMs(
        submissions,
        verifications,
      );
      if (medianDecisionMs !== null) {
        computed.medianDecisionMs = medianDecisionMs;
      }
    }
    if (allSubmissions > 0 && uploaded > 0) {
      computed.decidedRatio = decided / allSubmissions;
    }

    computed.anomaly = this.anomalyFlag(reviews, platformReviews);
    return computed;
  }

  /**
   * Median of `decidedAt − submission.createdAt` over the org's verification
   * rows (never negative). Returns `null` when there are no rows to measure.
   */
  private medianDecisionMs(
    submissions: Array<{ _id?: unknown; createdAt: Date }>,
    verifications: Array<{ submissionId: Types.ObjectId; decidedAt: Date }>,
  ): number | null {
    const createdAtBySubmission = new Map<string, Date>(
      submissions.map((row) => [
        (row._id as Types.ObjectId).toString(),
        row.createdAt,
      ]),
    );
    const durations: number[] = [];
    for (const verification of verifications) {
      const createdAt = createdAtBySubmission.get(
        verification.submissionId.toString(),
      );
      if (!createdAt) {
        continue;
      }
      const ms = verification.decidedAt.getTime() - createdAt.getTime();
      if (ms >= 0) {
        durations.push(ms);
      }
    }
    if (durations.length === 0) {
      return null;
    }
    durations.sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    if (durations.length % 2 === 1) {
      return durations[middle];
    }
    return (durations[middle - 1] + durations[middle]) / 2;
  }

  /** True when the org's avg rating exceeds the platform avg and both have ≥1 review. */
  private anomalyFlag(
    reviews: Array<{ rating: number }>,
    platformReviews: Array<{ rating: number }>,
  ): boolean {
    if (reviews.length === 0 || platformReviews.length === 0) {
      return false;
    }
    const average = (rows: Array<{ rating: number }>): number =>
      rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
    return average(reviews) > average(platformReviews);
  }

  /** Recomputes and persists the cache (`$set`, last write wins, D7). */
  async refresh(orgId: Types.ObjectId): Promise<OrganizationReliability> {
    const reliability = await this.computeFor(orgId);
    await this.organizationModel
      .updateOne({ _id: orgId }, { $set: { reliability } })
      .exec();
    return reliability;
  }

  /***************************************************************************
   * Event subscriptions (D7)
   **************************************************************************/

  @OnEvent(DomainEvents.SubmissionSubmitted)
  onSubmissionSubmitted(payload: unknown): void {
    this.scheduleRefreshFromPayload(payload);
  }

  @OnEvent(DomainEvents.SubmissionVerified)
  onSubmissionVerified(payload: unknown): void {
    this.scheduleRefreshFromPayload(payload);
  }

  @OnEvent(DomainEvents.SubmissionRejected)
  onSubmissionRejected(payload: unknown): void {
    this.scheduleRefreshFromPayload(payload);
  }

  private scheduleRefreshFromPayload(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const record = payload as { submission?: { organizationId?: unknown } };
    const organizationId = record.submission?.organizationId;
    if (!organizationId) {
      return;
    }
    const orgId =
      organizationId instanceof Types.ObjectId
        ? organizationId
        : new Types.ObjectId(organizationId as string);
    const timer = setTimeout(() => {
      this.pendingRefreshes.delete(timer);
      void this.refresh(orgId);
    }, REFRESH_SETTLE_MS);
    timer.unref();
    this.pendingRefreshes.add(timer);
  }

  onModuleDestroy(): void {
    for (const timer of this.pendingRefreshes) {
      clearTimeout(timer);
    }
    this.pendingRefreshes.clear();
  }
}
