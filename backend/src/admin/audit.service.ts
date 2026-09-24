import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import {
  AuditLogModel,
  AuditLogsCollection,
} from '../core/audit/audit-log.schema';
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
import { ReportModel, ReportsCollection } from '../reports/report.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import { AuditLogsQueryDto } from './dto/admin-part-b.dto';
import {
  adminCursor,
  adminLimit,
  escapeRegex,
  idSort,
  AdminSortDef,
} from './admin-list.util';

export interface AdminAuditRow {
  log: AuditLogModel;
  actorName: string | null;
  targetName: string | null;
}

/**
 * Admin audit browsing (inventory §2.20): read-only, cursor-paginated access
 * to `audit_logs`. Filters map onto the existing indexes (actorId,
 * entityType+entityId, createdAt); `date` is an end-of-day bound on createdAt.
 * Session 10 embeds actor/target display names (batched per page) and adds
 * `q` + whitelisted sorts.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AuditLogsCollection)
    private readonly auditModel: Model<AuditLogModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(ReportsCollection)
    private readonly reportModel: Model<ReportModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
  ) {}

  async list(query: AuditLogsQueryDto): Promise<CursorPage<AdminAuditRow>> {
    const baseFilter: FilterQuery<AuditLogModel> = {};
    if (query.actor) {
      baseFilter.actorId = new Types.ObjectId(query.actor);
    }
    if (query.entityType) {
      baseFilter.entityType = query.entityType;
    }
    if (query.entityId) {
      baseFilter.entityId = new Types.ObjectId(query.entityId);
    }
    if (query.date) {
      const end = new Date(query.date);
      end.setUTCHours(23, 59, 59, 999);
      baseFilter.createdAt = { $lte: end };
    }
    if (query.q) {
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      baseFilter.$or = [{ action: pattern }, { path: pattern }];
    }
    const token = query.sort ?? 'newest';
    const sortDef: AdminSortDef =
      token === 'oldest' ? idSort('oldest') : idSort('newest');
    return execPage(
      this.auditModel,
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

  private async enrich(rows: AuditLogModel[]): Promise<AdminAuditRow[]> {
    const actorIds = [
      ...new Set(
        rows
          .map((row) => row.actorId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
    const targetsByType = new Map<string, Types.ObjectId[]>();
    for (const row of rows) {
      if (row.entityType && row.entityId) {
        const list = targetsByType.get(row.entityType) ?? [];
        list.push(row.entityId);
        targetsByType.set(row.entityType, list);
      }
    }
    const [
      actors,
      profiles,
      orgs,
      opportunities,
      users,
      orgTargets,
      reports,
      submissions,
    ] = await Promise.all([
      actorIds.length > 0
        ? this.userModel
            .find({ _id: { $in: actorIds } })
            .select('email')
            .lean()
            .exec()
        : Promise.resolve([]),
      actorIds.length > 0
        ? this.profileModel
            .find({ userId: { $in: actorIds } })
            .select('userId username firstName lastName')
            .lean()
            .exec()
        : Promise.resolve([]),
      actorIds.length > 0
        ? this.organizationModel
            .find({ userId: { $in: actorIds } })
            .select('userId slug nameFr nameAr')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('opportunities') ?? []).length > 0 ||
      (targetsByType.get('opportunity') ?? []).length > 0
        ? this.opportunityModel
            .find({
              _id: {
                $in: [
                  ...(targetsByType.get('opportunities') ?? []),
                  ...(targetsByType.get('opportunity') ?? []),
                ],
              },
            })
            .select('title slug')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('users') ?? []).length > 0 ||
      (targetsByType.get('user') ?? []).length > 0
        ? this.userModel
            .find({
              _id: {
                $in: [
                  ...(targetsByType.get('users') ?? []),
                  ...(targetsByType.get('user') ?? []),
                ],
              },
            })
            .select('email')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('organizations') ?? []).length > 0 ||
      (targetsByType.get('organization') ?? []).length > 0
        ? this.organizationModel
            .find({
              _id: {
                $in: [
                  ...(targetsByType.get('organizations') ?? []),
                  ...(targetsByType.get('organization') ?? []),
                ],
              },
            })
            .select('slug nameFr nameAr')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('reports') ?? []).length > 0
        ? this.reportModel
            .find({ _id: { $in: targetsByType.get('reports') } })
            .select('title reason')
            .lean()
            .exec()
        : Promise.resolve([]),
      (targetsByType.get('submissions') ?? []).length > 0 ||
      (targetsByType.get('submission') ?? []).length > 0
        ? this.submissionModel
            .find({
              _id: {
                $in: [
                  ...(targetsByType.get('submissions') ?? []),
                  ...(targetsByType.get('submission') ?? []),
                ],
              },
            })
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);
    const emailByUserId = new Map(
      actors.map((user) => [user._id.toString(), user.email]),
    );
    const profileByUserId = new Map(
      profiles.map((profile) => [profile.userId.toString(), profile]),
    );
    const orgByUserId = new Map(
      orgs.map((org) => [org.userId.toString(), org]),
    );
    const targetNameByKey = new Map<string, string>();
    for (const opp of opportunities) {
      targetNameByKey.set(`opportunity:${opp._id.toString()}`, opp.title);
      targetNameByKey.set(`opportunities:${opp._id.toString()}`, opp.title);
    }
    for (const user of users) {
      targetNameByKey.set(`user:${user._id.toString()}`, user.email);
      targetNameByKey.set(`users:${user._id.toString()}`, user.email);
    }
    for (const org of orgTargets) {
      const name = org.nameFr ?? org.nameAr ?? org.slug;
      targetNameByKey.set(`organization:${org._id.toString()}`, name);
      targetNameByKey.set(`organizations:${org._id.toString()}`, name);
    }
    for (const report of reports) {
      targetNameByKey.set(
        `reports:${report._id.toString()}`,
        report.title ?? report.reason,
      );
    }
    for (const submission of submissions as Array<
      { _id: Types.ObjectId } & Record<string, any>
    >) {
      const name = String(
        submission.title ?? submission.status ?? submission._id.toString(),
      );
      targetNameByKey.set(`submission:${submission._id.toString()}`, name);
      targetNameByKey.set(`submissions:${submission._id.toString()}`, name);
    }
    return rows.map((row) => {
      const actorId = row.actorId?.toString();
      const profile = actorId ? profileByUserId.get(actorId) : undefined;
      const org = actorId ? orgByUserId.get(actorId) : undefined;
      const profileName = profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
          profile.username
        : null;
      return {
        log: row,
        actorName:
          profileName ??
          org?.nameFr ??
          org?.slug ??
          (actorId ? emailByUserId.get(actorId) : undefined) ??
          null,
        targetName:
          row.entityType && row.entityId
            ? (targetNameByKey.get(
                `${row.entityType}:${row.entityId.toString()}`,
              ) ?? null)
            : null,
      };
    });
  }
}
