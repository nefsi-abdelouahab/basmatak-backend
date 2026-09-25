import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { DomainEvents } from '../common/constants/domain-events';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { SettingsService } from '../core/settings/settings.service';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import { ReportModel, ReportsCollection } from '../reports/report.schema';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  MODERATION_ACTION_TARGETS,
  ModerationActionDto,
} from './dto/moderation-action.dto';
import { ReportStatusDto } from './dto/admin-part-b.dto';

/** Session 13 moderation flag re-checked by the composite path (default off). */
export const SUSPEND_ON_REPORT_KEY = 'moderation.suspendOnReport';

/**
 * Moderation actions (Session 20, RP §3.5#10/#11, §3.2#10, §3.4#8). One admin
 * decision resolves a report AND applies its platform consequence in a single
 * Mongo transaction. Every transition goes through `StatusTransitionService`
 * (session-aware `assert`), so `status_histories` records the full trail with
 * the report `resolution` as reason; `audit_logs` stay with the S1
 * interceptor. Standalone `setStatus` services are intentionally not reused
 * here — they write outside transactions and have no session parameter.
 */
@Injectable()
export class ModerationActionsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(ReportsCollection)
    private readonly reportModel: Model<ReportModel>,
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    private readonly statusTransitions: StatusTransitionService,
    private readonly notifications: NotificationsService,
    private readonly prefs: NotificationPrefsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resolve a report with a moderation consequence, atomically. Without an
   * explicit action, a `moderation.suspendOnReport=true` policy applies
   * `suspend_target` to user/organization targets as the default; otherwise
   * the report resolves plainly (same outcome as the Session 10 path).
   */
  async resolveWithAction(
    account: AccountToken,
    reportId: string,
    dto: ReportStatusDto,
  ): Promise<ReportModel> {
    const report = await this.reportModel.findById(reportId).exec();
    if (!report) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    let action = dto.action;
    if (dto.status !== 'resolved' && action) {
      throw new BusinessException(
        'MODERATION_ACTION_REQUIRES_RESOLVED',
        'A moderation action requires status resolved',
        400,
      );
    }
    if (action && !dto.resolution) {
      throw new BusinessException(
        'MODERATION_RESOLUTION_REQUIRED',
        'A moderation action requires a resolution reason',
        400,
      );
    }
    if (!action && dto.status === 'resolved') {
      action = await this.policyDefault(report);
    }
    if (action) {
      this.assertCompatible(report.targetType, action);
    }
    const resolution = dto.resolution as string | undefined;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async (txn) => {
        const current = await this.reportModel
          .findById(report._id)
          .session(txn)
          .exec();
        if (!current) {
          throw new BusinessException(
            'REPORT_NOT_FOUND',
            'Report not found',
            404,
          );
        }
        await this.statusTransitions.assert({
          entityType: 'report',
          entityId: current._id,
          from: current.status,
          to: 'resolved',
          actor: account.sub,
          ...(resolution !== undefined ? { reason: resolution } : {}),
          session: txn,
        });
        const bumped = await this.reportModel
          .updateOne(
            { _id: current._id, status: current.status },
            {
              $set: {
                status: 'resolved',
                ...(resolution ? { resolution } : {}),
              },
            },
          )
          .session(txn)
          .exec();
        if (bumped.matchedCount !== 1) {
          throw new BusinessException(
            'INVALID_STATUS_TRANSITION',
            'The report is no longer decisionable',
            409,
          );
        }
        if (action) {
          await this.applyAction(
            account,
            current,
            action,
            resolution ?? '',
            txn,
          );
        }
      });
    } finally {
      await session.endSession();
    }
    const updated = await this.reportModel.findById(report._id).exec();
    if (!updated) {
      throw new BusinessException('REPORT_NOT_FOUND', 'Report not found', 404);
    }
    return updated;
  }

  /**
   * Standalone neutral system notice (RP §3.2#10). Prefs-gated through the
   * `system` bucket: a suppressed recipient yields `{ delivered: false }`
   * with a success status, never an error.
   */
  async sendNotice(
    userId: string,
    message: string,
  ): Promise<{ delivered: boolean }> {
    const user = Types.ObjectId.isValid(userId)
      ? await this.userModel.findById(userId).exec()
      : null;
    if (!user) {
      throw new BusinessException('USER_NOT_FOUND', 'User not found', 404);
    }
    await this.notifications.createForRecipientIfEnabled(
      user._id,
      DomainEvents.AdminNotice,
      this.noticePayload(message),
    );
    const enabled = await this.prefs.enabledFor(
      user._id.toString(),
      DomainEvents.AdminNotice,
    );
    return { delivered: enabled };
  }

  /** O1 policy default: flag on + user/org target + no explicit action. */
  private async policyDefault(
    report: ReportModel,
  ): Promise<ModerationActionDto | undefined> {
    if (report.targetType !== 'user' && report.targetType !== 'organization') {
      return undefined;
    }
    const flag = await this.settings.get<boolean>(SUSPEND_ON_REPORT_KEY, false);
    if (flag !== true) {
      return undefined;
    }
    return { type: 'suspend_target' };
  }

  private assertCompatible(
    targetType: string,
    action: ModerationActionDto,
  ): void {
    const allowed = MODERATION_ACTION_TARGETS[action.type];
    if (!allowed || !allowed.includes(targetType)) {
      throw new BusinessException(
        'INCOMPATIBLE_MODERATION_ACTION',
        `Action ${action.type} cannot run against a ${targetType} report target`,
        400,
      );
    }
    if (
      action.type !== 'notice' &&
      (action as { payload?: unknown }).payload !== undefined
    ) {
      throw new BusinessException(
        'INVALID_MODERATION_ACTION',
        'Only the notice action accepts a payload',
        400,
      );
    }
    if (action.type === 'notice' && !action.payload) {
      throw new BusinessException(
        'INVALID_MODERATION_ACTION',
        'The notice action requires a payload with userId and message',
        400,
      );
    }
  }

  private async applyAction(
    account: AccountToken,
    report: ReportModel,
    action: ModerationActionDto,
    resolution: string,
    txn: ClientSession,
  ): Promise<void> {
    switch (action.type) {
      case 'unpublish_opportunity':
        await this.closeOpportunity(
          account,
          report,
          ['published'],
          resolution,
          txn,
        );
        break;
      case 'close_opportunity':
        await this.closeOpportunity(
          account,
          report,
          ['published', 'in_progress'],
          resolution,
          txn,
        );
        break;
      case 'suspend_target':
        await this.suspendTarget(account, report, resolution, txn);
        break;
      case 'notice':
        await this.noticeInSession(
          action.payload!.userId,
          action.payload!.message,
          report._id.toString(),
          txn,
        );
        break;
      default:
        throw new BusinessException(
          'INVALID_MODERATION_ACTION',
          `Unknown moderation action ${(action as { type: string }).type}`,
          400,
        );
    }
  }

  /** `unpublish` = published→closed ("Remove from public listing"); no `unpublished` status exists. */
  private async closeOpportunity(
    account: AccountToken,
    report: ReportModel,
    allowedFrom: string[],
    resolution: string,
    txn: ClientSession,
  ): Promise<void> {
    const opportunity = await this.opportunityModel
      .findById(report.targetId)
      .session(txn)
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    if (!allowedFrom.includes(opportunity.status)) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `Opportunity in status ${opportunity.status} cannot be closed by moderation`,
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'opportunity',
      entityId: opportunity._id,
      from: opportunity.status,
      to: 'closed',
      actor: account.sub,
      reason: resolution,
      session: txn,
    });
    const closed = await this.opportunityModel
      .updateOne(
        { _id: opportunity._id, status: opportunity.status },
        { $set: { status: 'closed' } },
      )
      .session(txn)
      .exec();
    if (closed.matchedCount !== 1) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        'The opportunity is no longer closeable',
        409,
      );
    }
  }

  private async suspendTarget(
    account: AccountToken,
    report: ReportModel,
    resolution: string,
    txn: ClientSession,
  ): Promise<void> {
    if (report.targetType === 'user') {
      const user = await this.userModel
        .findById(report.targetId)
        .session(txn)
        .exec();
      if (!user) {
        throw new BusinessException('USER_NOT_FOUND', 'User not found', 404);
      }
      this.assertSuspendable(
        user.status,
        'A deleted account cannot be restored',
      );
      await this.statusTransitions.assert({
        entityType: 'user',
        entityId: user._id,
        from: user.status,
        to: 'suspended',
        actor: account.sub,
        reason: resolution,
        session: txn,
      });
      const suspended = await this.userModel
        .updateOne(
          { _id: user._id, status: user.status },
          { $set: { status: 'suspended' } },
        )
        .session(txn)
        .exec();
      if (suspended.matchedCount !== 1) {
        throw new BusinessException(
          'INVALID_STATUS_TRANSITION',
          'The account is no longer suspendable',
          409,
        );
      }
      return;
    }
    const organization = await this.organizationModel
      .findById(report.targetId)
      .session(txn)
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    this.assertSuspendable(
      organization.status,
      'A deleted organization cannot be restored',
    );
    await this.statusTransitions.assert({
      entityType: 'organization',
      entityId: organization._id,
      from: organization.status,
      to: 'suspended',
      actor: account.sub,
      reason: resolution,
      session: txn,
    });
    const suspendedOrg = await this.organizationModel
      .updateOne(
        { _id: organization._id, status: organization.status },
        { $set: { status: 'suspended' } },
      )
      .session(txn)
      .exec();
    if (suspendedOrg.matchedCount !== 1) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        'The account is no longer suspendable',
        409,
      );
    }
  }

  /** Mirrors the standalone setStatus guards: deleted is terminal, suspend is idempotent-rejected. */
  private assertSuspendable(
    currentStatus: string,
    deletedMessage: string,
  ): void {
    if (currentStatus === 'deleted') {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        deletedMessage,
        409,
      );
    }
    if (currentStatus === 'suspended') {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        'Account is already suspended',
        409,
      );
    }
  }

  private async noticeInSession(
    userId: string,
    message: string,
    reportId: string,
    txn: ClientSession,
  ): Promise<void> {
    const user = Types.ObjectId.isValid(userId)
      ? await this.userModel.findById(userId).session(txn).exec()
      : null;
    if (!user) {
      throw new BusinessException('USER_NOT_FOUND', 'User not found', 404);
    }
    const enabled = await this.prefs.enabledFor(
      user._id.toString(),
      DomainEvents.AdminNotice,
    );
    if (!enabled) {
      return;
    }
    await this.notifications.createInSession(
      {
        recipientId: user._id,
        type: DomainEvents.AdminNotice,
        payload: this.noticePayload(message, reportId),
      },
      txn,
    );
  }

  private noticePayload(
    message: string,
    reportId?: string,
  ): Record<string, unknown> {
    return {
      message,
      ...(reportId ? { reportId } : {}),
      sentAt: new Date().toISOString(),
    };
  }
}
