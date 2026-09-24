import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  decodePageCursor,
  encodePageCursor,
  execPage,
} from '../common/pagination/pagination.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { ReportModel, ReportsCollection } from '../reports/report.schema';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OpportunityModel,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import { ReportStatusDto, ReportsQueryDto } from './dto/admin-part-b.dto';
import {
  adminCursor,
  adminLimit,
  escapeRegex,
  idSort,
  AdminSortDef,
} from './admin-list.util';

export interface ReporterSummary {
  id: string;
  name: string;
}

export interface ReportTargetSummary {
  type: string;
  id: string;
  title: string | null;
}

export interface AdminReportRow {
  report: ReportModel;
  reporterSummary: ReporterSummary | null;
  targetSummary: ReportTargetSummary | null;
}

/**
 * Admin report triage (inventory §2.20): list the queue with filters, sorts,
 * and joined summaries, resolve/dismiss through the `report` whitelist, and
 * assign dossiers to admins.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    @InjectModel(ReportsCollection)
    private readonly reportModel: Model<ReportModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    private readonly statusTransitions: StatusTransitionService,
  ) {}

  async list(query: ReportsQueryDto): Promise<CursorPage<AdminReportRow>> {
    const baseFilter = this.buildFilter(query);
    const token = query.sort ?? 'newest';
    if (token === 'priority') {
      return this.listByPriority(baseFilter, query);
    }
    const sortDef: AdminSortDef =
      token === 'oldest' ? idSort('oldest') : idSort('newest');
    return execPage(
      this.reportModel,
      baseFilter,
      {
        limit: adminLimit(query),
        cursor: adminCursor(query),
        sort: sortDef.sort,
        sortToken: sortDef.token,
        ...(sortDef.cursorFilter ? { cursorFilter: sortDef.cursorFilter } : {}),
      },
      (rows) => this.enrich(rows),
    );
  }

  private buildFilter(query: ReportsQueryDto): FilterQuery<ReportModel> {
    const and: FilterQuery<ReportModel>[] = [];
    if (query.status) {
      and.push({ status: query.status });
    }
    if (query.targetType) {
      and.push({ targetType: query.targetType });
    }
    if (query.priority) {
      and.push({ priority: query.priority });
    }
    if (query.assignedAdminId) {
      and.push({ assignedAdminId: new Types.ObjectId(query.assignedAdminId) });
    }
    if (query.q) {
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      and.push({ $or: [{ title: pattern }, { reason: pattern }] });
    }
    if (query.from || query.to) {
      const window: { $gte?: Date; $lte?: Date } = {};
      if (query.from) {
        window.$gte = new Date(query.from);
      }
      if (query.to) {
        window.$lte = new Date(query.to);
      }
      and.push({ createdAt: window });
    }
    return and.length > 0 ? { $and: and } : {};
  }

  /**
   * Priority-ordered page (high → normal → low, `_id` tie-break). MongoDB
   * cannot sort the string enum in triage order with a plain `find().sort()`,
   * so this token runs a small pipeline with a computed weight.
   */
  private async listByPriority(
    baseFilter: FilterQuery<ReportModel>,
    query: ReportsQueryDto,
  ): Promise<CursorPage<AdminReportRow>> {
    const limit = adminLimit(query);
    const decoded = decodePageCursor(adminCursor(query) ?? undefined);
    const page = decoded?.page ?? 1;
    const cursorStage: Record<string, unknown> = {};
    if (decoded?.value) {
      const [weightRaw, idRaw] = decoded.value.split(':');
      const weight = Number(weightRaw);
      if (Number.isFinite(weight) && Types.ObjectId.isValid(idRaw ?? '')) {
        const id = new Types.ObjectId(idRaw);
        cursorStage.$or = [
          { __pw: { $gt: weight } },
          { __pw: weight, _id: { $gt: id } },
        ];
      }
    }
    const total = await this.reportModel.countDocuments(baseFilter).exec();
    const pages = total === 0 ? 0 : Math.ceil(total / limit);
    const rows = await this.reportModel
      .aggregate([
        { $match: baseFilter },
        {
          $addFields: {
            __pw: {
              $switch: {
                branches: [
                  { case: { $eq: ['$priority', 'high'] }, then: 0 },
                  { case: { $eq: ['$priority', 'low'] }, then: 2 },
                ],
                default: 1,
              },
            },
          },
        },
        ...(Object.keys(cursorStage).length > 0
          ? [{ $match: cursorStage }]
          : []),
        { $sort: { __pw: 1, _id: 1 } },
        { $limit: limit + 1 },
      ])
      .exec();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.enrich(slice as unknown as ReportModel[]);
    const last = slice.length > 0 ? slice[slice.length - 1] : null;
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodePageCursor({
              id: String(last._id),
              page: page + 1,
              sort: 'priority',
              value: `${Number(last.__pw)}:${String(last._id)}`,
            })
          : null,
      limit,
      total,
      page,
      pages,
    };
  }

  private async enrich(rows: ReportModel[]): Promise<AdminReportRow[]> {
    const reporterIds = [
      ...new Set(rows.map((row) => row.reporterId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const targetsByType = new Map<string, Types.ObjectId[]>();
    for (const row of rows) {
      const list = targetsByType.get(row.targetType) ?? [];
      list.push(row.targetId);
      targetsByType.set(row.targetType, list);
    }
    const [
      reporterUsers,
      profiles,
      reporterOrgs,
      opportunities,
      reviews,
      submissions,
    ] = await Promise.all([
      reporterIds.length > 0
        ? this.userModel
            .find({ _id: { $in: reporterIds } })
            .select('email')
            .lean()
            .exec()
        : Promise.resolve([]),
      reporterIds.length > 0
        ? this.profileModel
            .find({ userId: { $in: reporterIds } })
            .select('userId username firstName lastName')
            .lean()
            .exec()
        : Promise.resolve([]),
      reporterIds.length > 0
        ? this.organizationModel
            .find({ userId: { $in: reporterIds } })
            .select('userId slug nameFr nameAr')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('opportunity') ?? []).length > 0
        ? this.opportunityModel
            .find({ _id: { $in: targetsByType.get('opportunity') } })
            .select('title slug')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('review') ?? []).length > 0
        ? this.reviewModel
            .find({ _id: { $in: targetsByType.get('review') } })
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('submission') ?? []).length > 0
        ? this.submissionModel
            .find({ _id: { $in: targetsByType.get('submission') } })
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);
    const emailByUserId = new Map(
      reporterUsers.map((user) => [user._id.toString(), user.email]),
    );
    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const orgByUserId = new Map(
      reporterOrgs.map((org) => [org.userId.toString(), org]),
    );
    const titleById = new Map<string, string | null>();
    for (const opp of opportunities) {
      titleById.set(`opportunity:${opp._id.toString()}`, opp.title ?? null);
    }
    for (const review of reviews as Array<
      { _id: Types.ObjectId } & Record<string, any>
    >) {
      titleById.set(
        `review:${review._id.toString()}`,
        (review.title ?? review.comment ?? null) as string | null,
      );
    }
    for (const submission of submissions as Array<
      { _id: Types.ObjectId } & Record<string, any>
    >) {
      titleById.set(
        `submission:${submission._id.toString()}`,
        (submission.title ?? submission.status ?? null) as string | null,
      );
    }
    const userTargets = await this.resolveUserTargets(
      targetsByType.get('user') ?? [],
    );
    const orgTargets = await this.resolveOrgTargets(
      targetsByType.get('organization') ?? [],
    );
    for (const [key, title] of userTargets) {
      titleById.set(key, title);
    }
    for (const [key, title] of orgTargets) {
      titleById.set(key, title);
    }
    return rows.map((row) => {
      const reporterId = row.reporterId.toString();
      const profile = profileByUserId.get(reporterId);
      const org = orgByUserId.get(reporterId);
      const profileName = profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
          profile.username
        : null;
      return {
        report: row,
        reporterSummary: {
          id: reporterId,
          name:
            profileName ??
            org?.nameFr ??
            org?.slug ??
            emailByUserId.get(reporterId) ??
            reporterId,
        },
        targetSummary: {
          type: row.targetType,
          id: row.targetId.toString(),
          title:
            titleById.get(`${row.targetType}:${row.targetId.toString()}`) ??
            null,
        },
      };
    });
  }

  private async resolveUserTargets(
    ids: Types.ObjectId[],
  ): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (ids.length === 0) {
      return out;
    }
    const [users, profiles] = await Promise.all([
      this.userModel
        .find({ _id: { $in: ids } })
        .select('email')
        .lean()
        .exec(),
      this.profileModel
        .find({ userId: { $in: ids } })
        .select('userId username')
        .lean()
        .exec(),
    ]);
    const nameByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile.username]),
    );
    for (const user of users) {
      const id = user._id.toString();
      out.set(`user:${id}`, nameByUserId.get(id) ?? user.email ?? null);
    }
    return out;
  }

  private async resolveOrgTargets(
    ids: Types.ObjectId[],
  ): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (ids.length === 0) {
      return out;
    }
    const orgs = await this.organizationModel
      .find({ _id: { $in: ids } })
      .select('slug nameFr nameAr')
      .lean()
      .exec();
    for (const org of orgs) {
      out.set(
        `organization:${org._id.toString()}`,
        org.nameFr ?? org.nameAr ?? org.slug ?? null,
      );
    }
    return out;
  }

  async assign(
    reportId: string,
    assignedAdminId: string,
  ): Promise<ReportModel> {
    const report = Types.ObjectId.isValid(reportId)
      ? await this.reportModel.findById(reportId).exec()
      : null;
    if (!report) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    const assignee = await this.userModel.findById(assignedAdminId).exec();
    if (!assignee || assignee.role !== 'admin') {
      throw new BusinessException(
        'INVALID_ASSIGNEE',
        'Assignee must be an existing admin account',
        400,
      );
    }
    await this.reportModel
      .updateOne(
        { _id: report._id },
        { $set: { assignedAdminId: assignee._id } },
      )
      .exec();
    const updated = await this.reportModel.findById(report._id).exec();
    if (!updated) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    return updated;
  }

  async resolve(
    account: AccountToken,
    reportId: string,
    dto: ReportStatusDto,
  ): Promise<ReportModel> {
    const report = await this.reportModel.findById(reportId).exec();
    if (!report) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    await this.statusTransitions.assert({
      entityType: 'report',
      entityId: report._id,
      from: report.status,
      to: dto.status,
      actor: account.sub,
    });
    await this.reportModel
      .updateOne(
        { _id: report._id },
        {
          $set: {
            status: dto.status,
            ...(dto.resolution ? { resolution: dto.resolution } : {}),
          },
        },
      )
      .exec();
    const updated = await this.reportModel.findById(report._id).exec();
    if (!updated) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    return updated;
  }
}
