import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  decodePageCursor,
  encodePageCursor,
  execPage,
} from '../common/pagination/pagination.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationsCollection,
} from '../organizations/schemas/organization-verification.schema';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  OrganizationsListQueryDto,
  OrganizationsVerificationsQueryDto,
} from './dto/admin-query.dto';
import {
  adminCursor,
  adminLimit,
  escapeRegex,
  fieldSort,
  idSort,
  AdminSortDef,
} from './admin-list.util';

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
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    private readonly statusTransitions: StatusTransitionService,
    private readonly emitter: EventEmitter2,
  ) {}

  async list(
    query: OrganizationsListQueryDto,
  ): Promise<CursorPage<OrganizationModel>> {
    const baseFilter: FilterQuery<OrganizationModel> = {};
    const and: FilterQuery<OrganizationModel>[] = [];
    if (query.q) {
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      and.push({
        $or: [
          { nameFr: pattern },
          { nameAr: pattern },
          { slug: pattern },
          { registryId: pattern },
        ],
      });
    }
    // `type`/location are `org-facts` fields: read-only here and tolerant of
    // rows that predate them (absent field simply matches nothing extra).
    if (query.type) {
      and.push({ type: query.type });
    }
    if (query.wilayaId) {
      and.push({ 'location.wilayaId': query.wilayaId });
    }
    if (query.municipalityId) {
      and.push({ 'location.municipalityId': query.municipalityId });
    }
    if (query.verificationStatus) {
      and.push({ verificationStatus: query.verificationStatus });
    }
    if (query.status) {
      and.push({ status: query.status });
    }
    if (and.length > 0) {
      baseFilter.$and = and;
    }
    const token = query.sort ?? 'newest';
    const sortDef: AdminSortDef =
      token === 'oldest'
        ? idSort('oldest')
        : token === 'name'
          ? fieldSort('name', 'slug', 1)
          : idSort('newest');
    return execPage(this.organizationModel, baseFilter, {
      limit: adminLimit(query),
      cursor: adminCursor(query),
      sort: sortDef.sort,
      sortToken: sortDef.token,
      ...(sortDef.cursorFilter ? { cursorFilter: sortDef.cursorFilter } : {}),
      ...(sortDef.valueExtractor
        ? { valueExtractor: sortDef.valueExtractor }
        : {}),
    });
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
    const limit = adminLimit(query);
    const baseFilter: FilterQuery<OrganizationVerificationModel> = { status };
    if (query.assignedAdminId) {
      baseFilter.assignedAdminId = new Types.ObjectId(query.assignedAdminId);
    }
    const direction = (query.sort ?? 'oldest') === 'newest' ? -1 : 1;
    return this.paginateVerifications(
      baseFilter,
      limit,
      query.cursor,
      direction as 1 | -1,
      (query.sort ?? 'oldest') as string,
    );
  }

  /**
   * Assign a verification dossier to an admin account. The assignee MUST be
   * an existing `admin`-role user; assignment changes no decision state and
   * is audited by the admin interceptor.
   */
  async assignVerification(
    rowId: string,
    assignedAdminId: string,
  ): Promise<OrganizationVerificationModel> {
    const row = Types.ObjectId.isValid(rowId)
      ? await this.verificationModel.findById(rowId).exec()
      : null;
    if (!row) {
      throw new BusinessException(
        'VERIFICATION_NOT_FOUND',
        'Verification row not found',
        404,
      );
    }
    const assignee = await this.userModel.findById(assignedAdminId).exec();
    if (!assignee || assignee.role !== 'admin') {
      throw new BusinessException(
        'INVALID_ASSIGNEE',
        'Assignee must be an existing admin account',
        400,
      );
    }
    await this.verificationModel
      .updateOne({ _id: row._id }, { $set: { assignedAdminId: assignee._id } })
      .exec();
    const updated = await this.verificationModel.findById(row._id).exec();
    if (!updated) {
      throw new BusinessException(
        'VERIFICATION_NOT_FOUND',
        'Verification row not found',
        404,
      );
    }
    return updated;
  }

  /** Newest verification dossier for one organization (`404` when none). */
  async latestVerification(
    organizationId: string,
  ): Promise<OrganizationVerificationModel> {
    if (!Types.ObjectId.isValid(organizationId)) {
      throw new BusinessException(
        'ORGANIZATION_NOT_FOUND',
        'Organization not found',
        404,
      );
    }
    const row = await this.verificationModel
      .findOne({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ submittedAt: -1, _id: -1 })
      .exec();
    if (!row) {
      throw new BusinessException(
        'VERIFICATION_NOT_FOUND',
        'No verification dossier for this organization',
        404,
      );
    }
    return row;
  }

  async setStatus(
    account: AccountToken,
    organizationId: string,
    status: 'active' | 'suspended',
    meta?: { reason?: string; notes?: string },
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
      ...(meta?.reason !== undefined ? { reason: meta.reason } : {}),
      ...(meta?.notes !== undefined ? { notes: meta.notes } : {}),
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
    baseFilter: FilterQuery<OrganizationVerificationModel>,
    limit: number,
    cursor: string | undefined | null,
    direction: 1 | -1,
    sortToken: string,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const decoded = decodePageCursor(cursor);
    const page = decoded?.page ?? 1;
    const pageFilter: FilterQuery<OrganizationVerificationModel> = {
      ...baseFilter,
    };
    if (decoded?.id && Types.ObjectId.isValid(decoded.id)) {
      const last = await this.verificationModel.findById(decoded.id).exec();
      if (last) {
        const operator = direction === 1 ? '$gt' : '$lt';
        pageFilter.$or = [
          { submittedAt: { [operator]: last.submittedAt } },
          {
            submittedAt: last.submittedAt,
            _id: { [operator]: last._id },
          },
        ];
      }
    }
    const total = await this.verificationModel
      .countDocuments(baseFilter)
      .exec();
    const pages = total === 0 ? 0 : Math.ceil(total / limit);
    const rows = await this.verificationModel
      .find(pageFilter)
      .sort({ submittedAt: direction, _id: direction })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const organizations = await this.organizationModel
      .find({
        _id: { $in: slice.map((row) => row.organizationId) },
      })
      .exec();
    const organizationById = new Map(
      organizations.map((organization) => [
        organization._id.toString(),
        organization,
      ]),
    );

    const items = slice.map((row) => ({
      ...row.toJSON(),
      organization: organizationById.get(row.organizationId.toString()) ?? null,
    }));
    const lastId =
      hasMore && slice.length > 0
        ? slice[slice.length - 1]._id.toString()
        : null;
    return {
      items,
      nextCursor: lastId
        ? encodePageCursor({ id: lastId, page: page + 1, sort: sortToken })
        : null,
      limit,
      total,
      page,
      pages,
    };
  }
}
