import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { normalizeLimit } from '../common/pagination/pagination.util';
import {
  ApplicationModel,
  ApplicationsCollection,
} from '../applications/schemas/application.schema';
import {
  StatusHistoryModel,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import {
  NotificationModel,
  NotificationsCollection,
} from '../notifications/schemas/notification.schema';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  ActivityItem,
  LeanApplicationRef,
  LeanOpportunityRef,
  LeanParticipantRef,
  LeanProfileRef,
  LeanSubmissionRef,
  MergeCandidate,
  SummaryMaps,
  buildCorrelatedEntity,
  buildHistoryEntity,
  decodeFeedCursor,
  encodeFeedCursor,
  extractNotificationEntityId,
  feedDedupeKey,
  feedEntityFor,
  isSuppressedNotification,
  mergeFeedItems,
  normalizeTerminal,
  notificationToFeedKey,
  titleFor,
} from './activity-feed.item';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';

interface Scope {
  kind: 'org' | 'volunteer';
  userId: Types.ObjectId;
  organizationId: Types.ObjectId | null;
  organizationName: string;
  organizationSlug?: string;
  historyFilter: FilterQuery<StatusHistoryModel>;
  notificationFilter: FilterQuery<NotificationModel>;
  applicationFilter: FilterQuery<ApplicationModel>;
}

interface LeanApplicationDoc {
  _id: Types.ObjectId;
  opportunityId?: Types.ObjectId;
  status?: string;
  volunteerId?: Types.ObjectId;
}

interface LeanSubmissionDoc {
  _id: Types.ObjectId;
  title?: string;
  status?: string;
  opportunityId?: Types.ObjectId;
  volunteerId?: Types.ObjectId;
}

interface LeanOpportunityDoc {
  _id: Types.ObjectId;
  title?: string;
  slug?: string;
  status?: string;
  organizationId?: Types.ObjectId;
}

interface LeanProfileDoc {
  userId?: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  username?: string;
}

interface LeanParticipantDoc {
  _id: Types.ObjectId;
  opportunityId?: Types.ObjectId;
  status?: string;
  volunteerId?: Types.ObjectId;
}

/**
 * Per-account activity streams (Session 12). Computed reads over
 * `status_histories` + `notifications` + recent `applications`, merged
 * newest-first with transactional dedupe. Writes nothing, creates no
 * collection, applies no ranking.
 */
@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(StatusHistoryCollection)
    private readonly historyModel: Model<StatusHistoryModel>,
    @InjectModel(NotificationsCollection)
    private readonly notificationModel: Model<NotificationModel>,
    @InjectModel(ApplicationsCollection)
    private readonly applicationModel: Model<ApplicationModel>,
    @InjectModel(SubmissionsCollection)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(TaskParticipantsCollection)
    private readonly participantModel: Model<TaskParticipantModel>,
  ) {}

  async getOrgActivity(
    account: AccountToken,
    query: ActivityFeedQueryDto,
  ): Promise<CursorPage<ActivityItem>> {
    const organization = await this.organizationModel
      .findOne({ userId: new Types.ObjectId(account.sub) })
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    const organizationId = organization._id as Types.ObjectId;
    const [opportunityIds, applicationIds, submissionIds] = await Promise.all([
      this.opportunityModel.distinct('_id', { organizationId }).exec(),
      this.applicationModel.distinct('_id', { organizationId }).exec(),
      this.submissionModel.distinct('_id', { organizationId }).exec(),
    ]);
    const clauses: FilterQuery<StatusHistoryModel>[] = [];
    if (opportunityIds.length > 0) {
      clauses.push({
        entityType: 'opportunity',
        entityId: { $in: opportunityIds },
      });
    }
    if (applicationIds.length > 0) {
      clauses.push({
        entityType: 'application',
        entityId: { $in: applicationIds },
      });
    }
    if (submissionIds.length > 0) {
      clauses.push({
        entityType: 'submission',
        entityId: { $in: submissionIds },
      });
    }
    const scope: Scope = {
      kind: 'org',
      userId: new Types.ObjectId(account.sub),
      organizationId,
      organizationName:
        organization.nameFr || organization.nameAr || 'Organization',
      organizationSlug: organization.slug,
      historyFilter:
        clauses.length > 0 ? { $or: clauses } : { entityType: '__none__' },
      notificationFilter: { userId: new Types.ObjectId(account.sub) },
      applicationFilter: { organizationId },
    };
    return this.paginate(scope, query);
  }

  async getVolunteerActivity(
    account: AccountToken,
    query: ActivityFeedQueryDto,
  ): Promise<CursorPage<ActivityItem>> {
    const profile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(account.sub) })
      .exec();
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_NOT_FOUND',
        'Volunteer profile not found',
        404,
      );
    }
    const volunteerId = new Types.ObjectId(account.sub);
    const [applicationIds, submissionIds, participantIds] = await Promise.all([
      this.applicationModel.distinct('_id', { volunteerId }).exec(),
      this.submissionModel.distinct('_id', { volunteerId }).exec(),
      this.participantModel.distinct('_id', { volunteerId }).exec(),
    ]);
    const clauses: FilterQuery<StatusHistoryModel>[] = [];
    if (applicationIds.length > 0) {
      clauses.push({
        entityType: 'application',
        entityId: { $in: applicationIds },
      });
    }
    if (submissionIds.length > 0) {
      clauses.push({
        entityType: 'submission',
        entityId: { $in: submissionIds },
      });
    }
    if (participantIds.length > 0) {
      clauses.push({
        entityType: 'task_participant',
        entityId: { $in: participantIds },
      });
    }
    const scope: Scope = {
      kind: 'volunteer',
      userId: volunteerId,
      organizationId: null,
      organizationName: 'Organization',
      historyFilter:
        clauses.length > 0 ? { $or: clauses } : { entityType: '__none__' },
      notificationFilter: { userId: volunteerId },
      applicationFilter: { volunteerId },
    };
    return this.paginate(scope, query);
  }

  private async paginate(
    scope: Scope,
    query: ActivityFeedQueryDto,
  ): Promise<CursorPage<ActivityItem>> {
    const limit = normalizeLimit(query.limit);
    const window = limit + 1;
    const cursor = decodeFeedCursor(query.cursor);
    const page = cursor?.p ?? 1;
    const at = cursor ? new Date(cursor.t) : null;

    const [histories, notifications, applications] = await Promise.all([
      this.historyModel
        .find(this.legFilter(scope.historyFilter, at, cursor?.h))
        .sort({ createdAt: -1, _id: -1 })
        .limit(window)
        .lean()
        .exec(),
      this.notificationModel
        .find(this.legFilter(scope.notificationFilter, at, cursor?.n))
        .sort({ createdAt: -1, _id: -1 })
        .limit(window)
        .lean()
        .exec(),
      this.applicationModel
        .find(this.legFilter(scope.applicationFilter, at, cursor?.a))
        .sort({ createdAt: -1, _id: -1 })
        .limit(window)
        .lean()
        .exec(),
    ]);

    const maps = await this.loadSummaries(histories, applications);
    const candidates: MergeCandidate[] = [
      ...histories.map((row) => this.historyCandidate(row, maps)),
      ...notifications.flatMap((row) => {
        const candidate = this.notificationCandidate(row, maps, scope);
        return candidate ? [candidate] : [];
      }),
      ...applications.map((doc) => this.applicationCandidate(doc, maps)),
    ];
    const merged = mergeFeedItems(candidates);
    const legHasMore =
      histories.length === window ||
      notifications.length === window ||
      applications.length === window;
    const hasMore = merged.length > limit || (merged.length > 0 && legHasMore);
    const items = merged.slice(0, limit);
    const last = items.length > 0 ? items[items.length - 1] : null;
    // Exact total: union of dedupe keys over lightweight projections (not the
    // window), so the total is stable regardless of page size. Pilot-scale
    // cheap: indexed filters, key fields only.
    const total = await this.exactTotal(scope);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeFeedCursor({
              t: last.ts,
              h: lastId(histories),
              n: lastId(notifications),
              a: lastId(applications),
              p: page + 1,
            })
          : null,
      limit,
      total,
      page,
      pages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  /**
   * Exact feed total: union of dedupe keys over lightweight key-only
   * projections of the three legs. Stable across page sizes (unlike a
   * window-derived estimate, which undercounts pairs split across windows).
   */
  private async exactTotal(scope: Scope): Promise<number> {
    const [historyKeys, notificationKeys, applicationIds] = await Promise.all([
      this.historyModel
        .find(scope.historyFilter)
        .select('_id entityType entityId to')
        .lean()
        .exec(),
      this.notificationModel
        .find(scope.notificationFilter)
        .select('_id type payload')
        .lean()
        .exec(),
      this.applicationModel.distinct('_id', scope.applicationFilter).exec(),
    ]);
    const keys = new Set<string>();
    for (const row of historyKeys as Array<Record<string, unknown>>) {
      const historyType = String(row.entityType ?? '');
      keys.add(
        feedDedupeKey(
          feedEntityFor(historyType),
          String(
            (row.entityId as Types.ObjectId | undefined)?.toString?.() ??
              row.entityId ??
              '',
          ),
          normalizeTerminal(historyType, String(row.to ?? '')),
        ),
      );
    }
    for (const row of notificationKeys as Array<Record<string, unknown>>) {
      const type = String(row.type ?? '');
      if (isSuppressedNotification(type)) {
        continue;
      }
      const entityId = extractNotificationEntityId(row.payload);
      const mapped = notificationToFeedKey(type, entityId);
      keys.add(mapped ? mapped.key : `notification:${String(row._id ?? '')}`);
    }
    for (const id of applicationIds as Types.ObjectId[]) {
      keys.add(feedDedupeKey('application', String(id), 'applied'));
    }
    return keys.size;
  }

  private legFilter<T>(
    base: FilterQuery<T>,
    at: Date | null,
    lastId: string | undefined,
  ): FilterQuery<T> {
    if (!at) {
      return { ...base };
    }
    const cursorClause =
      lastId && Types.ObjectId.isValid(lastId)
        ? {
            $or: [
              { createdAt: { $lt: at } },
              {
                createdAt: at,
                _id: { $lt: new Types.ObjectId(lastId) },
              },
            ],
          }
        : { createdAt: { $lt: at } };
    return { $and: [base, cursorClause] } as FilterQuery<T>;
  }

  private async loadSummaries(
    histories: Array<Record<string, unknown>>,
    applications: Array<Record<string, unknown>>,
  ): Promise<SummaryMaps> {
    const applicationIds = new Set<string>();
    const submissionIds = new Set<string>();
    const opportunityIds = new Set<string>();
    const volunteerIds = new Set<string>();
    const participantIds = new Set<string>();

    for (const row of histories) {
      const id = String(row.entityId ?? '');
      if (!Types.ObjectId.isValid(id)) {
        continue;
      }
      if (row.entityType === 'application') {
        applicationIds.add(id);
      } else if (row.entityType === 'submission') {
        submissionIds.add(id);
      } else if (row.entityType === 'opportunity') {
        opportunityIds.add(id);
      } else if (row.entityType === 'task_participant') {
        participantIds.add(id);
      }
    }
    for (const doc of applications) {
      applicationIds.add(String(doc._id));
    }

    const toIds = (ids: Set<string>): Types.ObjectId[] =>
      [...ids].map((id) => new Types.ObjectId(id));

    const [appDocs, subDocs, participantDocs] = await Promise.all([
      applicationIds.size > 0
        ? this.applicationModel
            .find({ _id: { $in: toIds(applicationIds) } })
            .select('_id opportunityId status volunteerId')
            .lean()
            .exec()
        : [],
      submissionIds.size > 0
        ? this.submissionModel
            .find({ _id: { $in: toIds(submissionIds) } })
            .select('_id title status opportunityId volunteerId')
            .lean()
            .exec()
        : [],
      participantIds.size > 0
        ? this.participantModel
            .find({ _id: { $in: toIds(participantIds) } })
            .select('_id opportunityId status volunteerId')
            .lean()
            .exec()
        : [],
    ]);
    for (const doc of appDocs as LeanApplicationDoc[]) {
      if (doc.opportunityId) {
        opportunityIds.add(String(doc.opportunityId));
      }
      if (doc.volunteerId) {
        volunteerIds.add(String(doc.volunteerId));
      }
    }
    for (const doc of subDocs as LeanSubmissionDoc[]) {
      if (doc.opportunityId) {
        opportunityIds.add(String(doc.opportunityId));
      }
      if (doc.volunteerId) {
        volunteerIds.add(String(doc.volunteerId));
      }
    }
    for (const doc of participantDocs as LeanParticipantDoc[]) {
      if (doc.opportunityId) {
        opportunityIds.add(String(doc.opportunityId));
      }
      if (doc.volunteerId) {
        volunteerIds.add(String(doc.volunteerId));
      }
    }

    const [oppDocs, profileDocs] = await Promise.all([
      opportunityIds.size > 0
        ? this.opportunityModel
            .find({ _id: { $in: toIds(opportunityIds) } })
            .select('_id title slug status organizationId')
            .lean()
            .exec()
        : [],
      volunteerIds.size > 0
        ? this.profileModel
            .find({ userId: { $in: toIds(volunteerIds) } })
            .select('userId firstName lastName username')
            .lean()
            .exec()
        : [],
    ]);

    const maps: SummaryMaps = {
      applications: new Map(),
      submissions: new Map(),
      opportunities: new Map(),
      volunteers: new Map(),
      participants: new Map(),
    };
    for (const doc of appDocs as LeanApplicationDoc[]) {
      const ref: LeanApplicationRef = { status: doc.status };
      if (doc.opportunityId) {
        ref.opportunityId = String(doc.opportunityId);
      }
      if (doc.volunteerId) {
        ref.volunteerId = String(doc.volunteerId);
      }
      maps.applications.set(String(doc._id), ref);
    }
    for (const doc of subDocs as LeanSubmissionDoc[]) {
      const ref: LeanSubmissionRef = { title: doc.title, status: doc.status };
      if (doc.opportunityId) {
        ref.opportunityId = String(doc.opportunityId);
      }
      if (doc.volunteerId) {
        ref.volunteerId = String(doc.volunteerId);
      }
      maps.submissions.set(String(doc._id), ref);
    }
    for (const doc of oppDocs as LeanOpportunityDoc[]) {
      const ref: LeanOpportunityRef = {
        title: doc.title,
        slug: doc.slug,
        status: doc.status,
      };
      maps.opportunities.set(String(doc._id), ref);
    }
    for (const doc of profileDocs as LeanProfileDoc[]) {
      if (doc.userId) {
        maps.volunteers.set(String(doc.userId), {
          firstName: doc.firstName,
          lastName: doc.lastName,
          username: doc.username,
        } as LeanProfileRef);
      }
    }
    for (const doc of participantDocs as LeanParticipantDoc[]) {
      const ref: LeanParticipantRef = { status: doc.status };
      if (doc.opportunityId) {
        ref.opportunityId = String(doc.opportunityId);
      }
      if (doc.volunteerId) {
        ref.volunteerId = String(doc.volunteerId);
      }
      maps.participants.set(String(doc._id), ref);
    }
    return maps;
  }

  private historyCandidate(
    row: Record<string, unknown>,
    maps: SummaryMaps,
  ): MergeCandidate {
    const historyType = String(row.entityType ?? '');
    const entity = feedEntityFor(historyType);
    const terminal = normalizeTerminal(historyType, String(row.to ?? ''));
    const entityId = String(
      (row.entityId as Types.ObjectId | undefined)?.toString?.() ??
        row.entityId ??
        '',
    );
    const key = feedDedupeKey(entity, entityId, terminal);
    const itemType = `${entity}.${terminal}`;
    const ts = toDate(row.createdAt);
    return {
      key,
      ts,
      tie: String(row._id ?? ''),
      item: {
        type: itemType,
        title: titleFor(itemType),
        ts: ts.toISOString(),
        entity: buildHistoryEntity(historyType, entityId, terminal, maps),
      },
    };
  }

  private notificationCandidate(
    row: Record<string, unknown>,
    maps: SummaryMaps,
    scope: Scope,
  ): MergeCandidate | null {
    const type = String(row.type ?? '');
    if (isSuppressedNotification(type)) {
      return null;
    }
    const ts = toDate(row.createdAt);
    const tie = String(row._id ?? '');
    const entityId = extractNotificationEntityId(row.payload);
    const mapped = notificationToFeedKey(type, entityId);
    if (!mapped || !entityId) {
      return {
        key: `notification:${tie}`,
        ts,
        tie,
        item: this.genericNotificationItem(type, tie, ts, scope),
      };
    }
    const [entity, terminal] = mapped.itemType.split('.') as [string, string];
    return {
      key: mapped.key,
      ts,
      tie,
      item: {
        type: mapped.itemType,
        title: titleFor(mapped.itemType),
        ts: ts.toISOString(),
        entity: buildCorrelatedEntity(entity, entityId, terminal, maps),
      },
    };
  }

  private genericNotificationItem(
    type: string,
    tie: string,
    ts: Date,
    scope: Scope,
  ): ActivityItem {
    const title = titleFor(type);
    if (type === 'org.verification.updated') {
      return {
        type,
        title,
        ts: ts.toISOString(),
        entity: {
          type: 'organization',
          id: scope.organizationId?.toString() ?? 'organization',
          name: scope.organizationName,
          ...(scope.organizationSlug ? { slug: scope.organizationSlug } : {}),
          summary: title,
        },
      };
    }
    return {
      type,
      title,
      ts: ts.toISOString(),
      entity: {
        type: 'system',
        id: 'system',
        name: 'Platform',
        summary: title,
      },
    };
  }

  private applicationCandidate(
    doc: Record<string, unknown>,
    maps: SummaryMaps,
  ): MergeCandidate {
    const id = String(doc._id ?? '');
    const ts = toDate(doc.createdAt);
    const status = String(
      doc.status ?? maps.applications.get(id)?.status ?? 'pending',
    );
    return {
      key: feedDedupeKey('application', id, 'applied'),
      ts,
      tie: id,
      item: {
        type: 'application.applied',
        title: titleFor('application.applied'),
        ts: ts.toISOString(),
        entity: buildCorrelatedEntity('application', id, status, maps),
      },
    };
  }
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function lastId(rows: Array<Record<string, unknown>>): string | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  const last = rows[rows.length - 1];
  return last?._id ? String(last._id) : undefined;
}
