import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  buildCursor,
  decodeCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { CursorPage } from '../common/pagination/paginated.interface';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationsCollection,
} from '../organizations/schemas/organization-verification.schema';
import {
  OrganizationsListQueryDto,
  OrganizationsVerificationsQueryDto,
} from './dto/admin-query.dto';

export interface AdminVerificationDecision {
  organizationId: string;
  verificationStatus: 'verified' | 'rejected';
  decidedAt: Date;
  decidedBy: string;
  rejectionReason?: string;
}

/**
 * Admin organizations control (inventory §2.20). Two status dimensions:
 * `verificationStatus` (pending → verified | rejected, the F1 decision) and
 * `status` (account active ↔ suspended). Both move through
 * StatusTransitionService; approve/reject emit `org.verification.updated` so
 * the S9 handler notifies the organization account.
 */
@Injectable()
export class AdminOrganizationsService {
  constructor(
    @InjectModel(OrganizationsCollection)
    private readonly organizationModel: Model<OrganizationModel>,
    @InjectModel(OrganizationVerificationsCollection)
    private readonly verificationModel: Model<OrganizationVerificationModel>,
    private readonly statusTransitions: StatusTransitionService,
    private readonly emitter: EventEmitter2,
  ) {}

  async list(
    query: OrganizationsListQueryDto,
  ): Promise<CursorPage<OrganizationModel>> {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const filter: FilterQuery<OrganizationModel> = {};
    if (cursor && Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.organizationModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return {
      items,
      nextCursor: buildCursor(lastId).cursor,
      limit,
    };
  }

  /**
   * The moderator triage queue: `organization_verifications` rows (default
   * `status=pending`) oldest-first by `submittedAt`, each enriched with its
   * organization summary via one `$in` fetch.
   */
  async listVerifications(
    query: OrganizationsVerificationsQueryDto,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const status = query.status ?? 'pending';
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    return this.paginateVerifications(status, limit, cursor);
  }

  async setStatus(
    account: AccountToken,
    organizationId: string,
    status: 'active' | 'suspended',
  ): Promise<OrganizationModel> {
    const organization = await this.organizationModel
      .findById(organizationId)
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    if (organization.status === 'deleted') {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        'A deleted organization cannot be restored',
        409,
      );
    }
    if (organization.status === status) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `Organization is already ${status}`,
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'organization',
      entityId: organization._id,
      from: organization.status,
      to: status,
      actor: account.sub,
    });
    await this.organizationModel
      .updateOne({ _id: organization._id }, { $set: { status } })
      .exec();
    return this.getOrganization(organization._id.toString());
  }

  async approve(
    account: AccountToken,
    organizationId: string,
  ): Promise<AdminVerificationDecision> {
    const organization = await this.assertDecidable(organizationId);
    await this.statusTransitions.assert({
      entityType: 'organization',
      entityId: organization._id,
      from: organization.verificationStatus,
      to: 'verified',
      actor: account.sub,
    });
    const now = new Date();
    await this.organizationModel
      .updateOne(
        { _id: organization._id },
        { $set: { verificationStatus: 'verified' } },
      )
      .exec();
    await this.verificationModel
      .updateOne(
        { _id: organization.pendingVerificationId! },
        {
          $set: {
            status: 'verified',
            decidedAt: now,
            decidedBy: new Types.ObjectId(account.sub),
          },
        },
      )
      .exec();
    this.emitter.emit(DomainEvents.OrgVerificationUpdated, {
      organizationId: organization._id,
    });
    return {
      organizationId: organization._id.toString(),
      verificationStatus: 'verified',
      decidedAt: now,
      decidedBy: account.sub,
    };
  }

  async reject(
    account: AccountToken,
    organizationId: string,
    rejectionReason: string,
  ): Promise<AdminVerificationDecision> {
    const organization = await this.assertDecidable(organizationId);
    await this.statusTransitions.assert({
      entityType: 'organization',
      entityId: organization._id,
      from: organization.verificationStatus,
      to: 'rejected',
      actor: account.sub,
    });
    const now = new Date();
    await this.organizationModel
      .updateOne(
        { _id: organization._id },
        { $set: { verificationStatus: 'rejected' } },
      )
      .exec();
    await this.verificationModel
      .updateOne(
        { _id: organization.pendingVerificationId! },
        {
          $set: {
            status: 'rejected',
            rejectionReason,
            decidedAt: now,
            decidedBy: new Types.ObjectId(account.sub),
          },
        },
      )
      .exec();
    this.emitter.emit(DomainEvents.OrgVerificationUpdated, {
      organizationId: organization._id,
    });
    return {
      organizationId: organization._id.toString(),
      verificationStatus: 'rejected',
      decidedAt: now,
      decidedBy: account.sub,
      rejectionReason,
    };
  }

  private async assertDecidable(
    organizationId: string,
  ): Promise<OrganizationModel & { pendingVerificationId?: Types.ObjectId }> {
    const organization = await this.organizationModel
      .findById(organizationId)
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    if (organization.verificationStatus === 'verified') {
      throw new BusinessException(
        'ORG_ALREADY_VERIFIED',
        'This organization is already verified',
        409,
      );
    }
    const pending = await this.verificationModel
      .findOne({
        organizationId: organization._id,
        status: 'pending',
      })
      .sort({ submittedAt: -1 })
      .exec();
    if (!pending) {
      throw new BusinessException(
        'NO_PENDING_VERIFICATION',
        'No pending verification for this organization',
        409,
      );
    }
    return Object.assign(organization, {
      pendingVerificationId: pending._id,
    });
  }

  private async getOrganization(
    organizationId: string,
  ): Promise<OrganizationModel> {
    const organization = await this.organizationModel
      .findById(organizationId)
      .exec();
    if (!organization) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    return organization;
  }

  private async paginateVerifications(
    status: string,
    limit: number,
    rawCursor: string | null,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const baseFilter: FilterQuery<OrganizationVerificationModel> = { status };
    const pageFilter: FilterQuery<OrganizationVerificationModel> = {
      ...baseFilter,
    };
    if (rawCursor && Types.ObjectId.isValid(rawCursor)) {
      const last = await this.verificationModel.findById(rawCursor).exec();
      if (last) {
        pageFilter.$or = [
          { submittedAt: { $gt: last.submittedAt } },
          {
            submittedAt: last.submittedAt,
            _id: { $gt: last._id },
          },
        ];
      }
    }
    const rows = await this.verificationModel
      .find(pageFilter)
      .sort({ submittedAt: 1, _id: 1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const organizations = await this.organizationModel
      .find({
        _id: { $in: page.map((row) => row.organizationId) },
      })
      .exec();
    const organizationById = new Map(
      organizations.map((organization) => [
        organization._id.toString(),
        organization,
      ]),
    );

    const items = page.map((row) => ({
      ...row.toJSON(),
      organization: organizationById.get(row.organizationId.toString()) ?? null,
    }));
    const lastId =
      hasMore && page.length > 0 ? page[page.length - 1]._id.toString() : null;
    return {
      items,
      nextCursor: buildCursor(lastId).cursor,
      limit,
    };
  }
}
