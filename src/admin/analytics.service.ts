import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import { SettingsService } from '../core/settings/settings.service';
import {
  StatusHistoryCollection,
  StatusHistoryModel,
} from '../core/status-transitions/status-histories.schema';
import {
  OrganizationVerificationsCollection,
  OrganizationVerificationModel,
} from '../organizations/schemas/organization-verification.schema';
import {
  OrganizationsCollection,
  OrganizationModel,
} from '../organizations/schemas/organization.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import { ReportsCollection, ReportModel } from '../reports/report.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  VerificationModel,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import { AdminStatsService } from './stats.service';

export interface DeltaCount {
  current: number;
  previous: number;
  deltaPercent: number | null;
}

export interface AdminAnalyticsOverview {
  totals: {
    users: DeltaCount;
    organizations: DeltaCount;
    opportunities: DeltaCount;
    applications: DeltaCount;
    submissions: DeltaCount;
  };
  activeParticipants: number;
  perStatus: {
    users: Record<string, number>;
    organizations: {
      byStatus: Record<string, number>;
      byVerificationStatus: Record<string, number>;
    };
    opportunities: Record<string, number>;
    applications: Record<string, number>;
    submissions: Record<string, number>;
  };
  verificationReady: {
    total: number;
    byOrganization: Array<{ organizationId: string; count: number }>;
  };
  gateFreezes: number;
  medianDecisionHours: number | null;
}

export interface AnalyticsSeriesPoint {
  date: string;
  signups: number;
  applications: number;
  verifications: number;
}

export interface AdminAnalyticsSeries {
  days: number;
  points: AnalyticsSeriesPoint[];
}

export interface AdminAnalyticsQueue {
  pendingVerifications: number;
  openReports: number;
  underReviewSubmissions: number;
  suspendedUsers: number;
  suspendedOrganizations: number;
  maintenanceMode: boolean;
}

/** Submissions counting toward the verification-ready queue (publish-gate definition). */
const READY_STATUSES = ['submitted', 'under_review'] as const;
/** Owner-approved windows: current = last 30d, previous = days 31–60 back. */
const CURRENT_WINDOW_DAYS = 30;
const PREVIOUS_WINDOW_DAYS = 30;
/** Median window + minimum sample (owner-approved). */
const MEDIAN_WINDOW_DAYS = 90;
const MEDIAN_MIN_SAMPLES = 5;
/** Series `days` bound (roadmap) with a 30-day default. */
const SERIES_MIN_DAYS = 1;
const SERIES_MAX_DAYS = 90;
const SERIES_DEFAULT_DAYS = 30;
/**
 * Provisional read-only maintenance flag key. `settings-expansion` owns the
 * canonical maintenance key and toggle; this read uses a fallback of `false`
 * and writes nothing, so the later session only needs to align the key name.
 */
const MAINTENANCE_KEY = 'maintenance.enabled';

/** `{ current, previous, deltaPercent }` with `null` avoiding divide-by-zero. */
export function toDeltaCount(current: number, previous: number): DeltaCount {
  return {
    current,
    previous,
    deltaPercent:
      previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

/** Even-length medians average the two middle values (existing convention). */
export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/** UTC `YYYY-MM-DD` day key for series bucketing. */
export function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Defensive `days` normalization; the DTO enforces the 1–90 bound. */
export function normalizeSeriesDays(days?: number): number {
  if (!Number.isInteger(days)) {
    return SERIES_DEFAULT_DAYS;
  }
  return Math.min(SERIES_MAX_DAYS, Math.max(SERIES_MIN_DAYS, days as number));
}

/**
 * Admin analytics (Session 8): overview with previous-period deltas, UTC time
 * series, and the attention queue — all derived from real database data, none
 * hardcoded. Read-only: no writes, no new collections, no CSV export.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OrganizationVerificationsCollection)
    private readonly orgVerificationModel: Model<OrganizationVerificationModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(VerificationsCollection)
    private readonly verificationModel: Model<VerificationModel>,
    @InjectModel(ReportsCollection)
    private readonly reportModel: Model<ReportModel>,
    @InjectModel(StatusHistoryCollection)
    private readonly historyModel: Model<StatusHistoryModel>,
    private readonly settings: SettingsService,
    private readonly stats: AdminStatsService,
  ) {}

  async getOverview(now = new Date()): Promise<AdminAnalyticsOverview> {
    const currentSince = new Date(
      now.getTime() - CURRENT_WINDOW_DAYS * 24 * 3_600_000,
    );
    const previousSince = new Date(
      currentSince.getTime() - PREVIOUS_WINDOW_DAYS * 24 * 3_600_000,
    );

    const [
      totals,
      perStatus,
      activeParticipants,
      verificationReady,
      gateFreezes,
      medianDecisionHours,
    ] = await Promise.all([
      this.deltaTotals(currentSince, previousSince),
      this.perStatusCounts(),
      this.countActiveParticipants(currentSince),
      this.verificationReadyCounts(),
      this.stats.countGateFreezes(),
      this.medianVerificationDecisionHours(now),
    ]);

    return {
      totals,
      activeParticipants,
      perStatus,
      verificationReady,
      gateFreezes,
      medianDecisionHours,
    };
  }

  async getSeries(
    days = SERIES_DEFAULT_DAYS,
    now = new Date(),
  ): Promise<AdminAnalyticsSeries> {
    const bounded = normalizeSeriesDays(days);
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        (bounded - 1) * 24 * 3_600_000,
    );
    const [signups, applications, verifications] = await Promise.all([
      this.countByUtcDay(this.userModel, start),
      this.countByUtcDay(this.applicationModel, start),
      this.countByUtcDay(this.verificationModel, start),
    ]);
    const points: AnalyticsSeriesPoint[] = [];
    for (let offset = 0; offset < bounded; offset += 1) {
      const date = toUtcDayKey(
        new Date(start.getTime() + offset * 24 * 3_600_000),
      );
      points.push({
        date,
        signups: signups.get(date) ?? 0,
        applications: applications.get(date) ?? 0,
        verifications: verifications.get(date) ?? 0,
      });
    }
    return { days: bounded, points };
  }

  async getQueue(): Promise<AdminAnalyticsQueue> {
    const [
      pendingVerifications,
      openReports,
      underReviewSubmissions,
      suspendedUsers,
      suspendedOrganizations,
      maintenanceMode,
    ] = await Promise.all([
      this.countPendingVerifications(),
      this.reportModel.countDocuments({ status: 'open' }).exec(),
      this.submissionModel.countDocuments({ status: 'under_review' }).exec(),
      this.userModel.countDocuments({ status: 'suspended' }).exec(),
      this.organizationModel.countDocuments({ status: 'suspended' }).exec(),
      this.settings.get<boolean>(MAINTENANCE_KEY, false),
    ]);
    return {
      pendingVerifications,
      openReports,
      underReviewSubmissions,
      suspendedUsers,
      suspendedOrganizations,
      maintenanceMode: maintenanceMode === true,
    };
  }

  /** Single source of truth for the pending-verification count (RP §3.1#9). */
  private async countPendingVerifications(): Promise<number> {
    return this.orgVerificationModel
      .countDocuments({ status: 'pending' })
      .exec();
  }

  private async deltaTotals(
    currentSince: Date,
    previousSince: Date,
  ): Promise<AdminAnalyticsOverview['totals']> {
    const models: Record<string, Model<any>> = {
      users: this.userModel,
      organizations: this.organizationModel,
      opportunities: this.opportunityModel,
      applications: this.applicationModel,
      submissions: this.submissionModel,
    };
    const entries = await Promise.all(
      Object.keys(models).map(async (key) => {
        const model = models[key];
        const [current, previous] = await Promise.all([
          model.countDocuments({ createdAt: { $gte: currentSince } }).exec(),
          model
            .countDocuments({
              createdAt: { $gte: previousSince, $lt: currentSince },
            })
            .exec(),
        ]);
        return [key, toDeltaCount(current, previous)] as const;
      }),
    );
    return Object.fromEntries(entries) as AdminAnalyticsOverview['totals'];
  }

  private async perStatusCounts(): Promise<
    AdminAnalyticsOverview['perStatus']
  > {
    const byStatus = async (
      model: Model<any>,
      match: Record<string, unknown> = {},
    ): Promise<Record<string, number>> => {
      const rows = await model
        .aggregate<{ _id: string; count: number }>([
          { $match: match },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec();
      return Object.fromEntries(rows.map((row) => [row._id, row.count]));
    };
    const orgVerification = async (): Promise<Record<string, number>> => {
      const rows = await this.organizationModel
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
        ])
        .exec();
      return Object.fromEntries(rows.map((row) => [row._id, row.count]));
    };
    const [
      users,
      orgByStatus,
      orgByVerification,
      opportunities,
      applications,
      submissions,
    ] = await Promise.all([
      byStatus(this.userModel),
      byStatus(this.organizationModel),
      orgVerification(),
      byStatus(this.opportunityModel),
      byStatus(this.applicationModel),
      byStatus(this.submissionModel),
    ]);
    return {
      users,
      organizations: {
        byStatus: orgByStatus,
        byVerificationStatus: orgByVerification,
      },
      opportunities,
      applications,
      submissions,
    };
  }

  /**
   * Distinct volunteers active in the window: an application created/updated, a
   * `task_participant` status change in `status_histories`, or a submission
   * created/updated (owner-approved definition).
   */
  private async countActiveParticipants(since: Date): Promise<number> {
    const [applicationIds, submissionIds, participantHistories] =
      await Promise.all([
        this.applicationModel.distinct('volunteerId', {
          $or: [{ createdAt: { $gte: since } }, { updatedAt: { $gte: since } }],
        }),
        this.submissionModel.distinct('volunteerId', {
          $or: [{ createdAt: { $gte: since } }, { updatedAt: { $gte: since } }],
        }),
        this.historyModel
          .find({ entityType: 'task_participant', createdAt: { $gte: since } })
          .select('entityId')
          .lean()
          .exec(),
      ]);
    const participantIds = [
      ...new Set(participantHistories.map((row) => String(row.entityId))),
    ].map((id) => new Types.ObjectId(id));
    const participantVolunteers =
      participantIds.length > 0
        ? await this.participantModel.distinct('volunteerId', {
            _id: { $in: participantIds },
          })
        : [];
    return new Set([
      ...applicationIds.map(String),
      ...submissionIds.map(String),
      ...participantVolunteers.map(String),
    ]).size;
  }

  private async verificationReadyCounts(): Promise<
    AdminAnalyticsOverview['verificationReady']
  > {
    const rows = await this.submissionModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { status: { $in: [...READY_STATUSES] } } },
        { $group: { _id: '$organizationId', count: { $sum: 1 } } },
      ])
      .exec();
    return {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      byOrganization: rows.map((row) => ({
        organizationId: String(row._id),
        count: row.count,
      })),
    };
  }

  /**
   * Median of (`verification.decidedAt` − `submission.createdAt`) in hours over
   * verifications decided in the last 90 days; `null` when fewer than 5 exist
   * (owner-approved definition; `submissions` has no `submittedAt` field).
   */
  private async medianVerificationDecisionHours(
    now: Date,
  ): Promise<number | null> {
    const since = new Date(now.getTime() - MEDIAN_WINDOW_DAYS * 24 * 3_600_000);
    const verifications = await this.verificationModel
      .find({ decidedAt: { $gte: since } })
      .select('submissionId decidedAt')
      .lean()
      .exec();
    if (verifications.length < MEDIAN_MIN_SAMPLES) {
      return null;
    }
    const submissions = await this.submissionModel
      .find({ _id: { $in: verifications.map((row) => row.submissionId) } })
      .select('createdAt')
      .lean()
      .exec();
    const createdAtBySubmission = new Map(
      submissions.map((row) => [String(row._id), row.createdAt as Date]),
    );
    const hours: number[] = [];
    for (const verification of verifications) {
      const createdAt = createdAtBySubmission.get(
        String(verification.submissionId),
      );
      if (!createdAt) {
        continue;
      }
      const ms =
        (verification.decidedAt as Date).getTime() - createdAt.getTime();
      if (ms >= 0) {
        hours.push(ms / 3_600_000);
      }
    }
    if (hours.length < MEDIAN_MIN_SAMPLES) {
      return null;
    }
    return median(hours);
  }

  private async countByUtcDay(
    model: Model<any>,
    start: Date,
  ): Promise<Map<string, number>> {
    const rows = await model
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'UTC',
              },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id, row.count]));
  }
}
