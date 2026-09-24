import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  decodePageCursor,
  encodePageCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  AuditLogModel,
  AuditLogsCollection,
} from '../core/audit/audit-log.schema';
import { AuditLogsQueryDto } from './dto/admin-part-b.dto';

/**
 * Admin audit browsing (inventory §2.20): read-only, cursor-paginated access
 * to `audit_logs`. Filters map onto the existing indexes (actorId,
 * entityType+entityId, createdAt); `date` is an end-of-day bound on createdAt.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AuditLogsCollection)
    private readonly auditModel: Model<AuditLogModel>,
  ) {}

  async list(query: AuditLogsQueryDto): Promise<CursorPage<AuditLogModel>> {
    const limit = normalizeLimit(query.limit);
    const decoded = decodePageCursor(query.cursor);
    const page = decoded?.page ?? 1;
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
    const pageFilter: FilterQuery<AuditLogModel> = { ...baseFilter };
    if (decoded?.id && Types.ObjectId.isValid(decoded.id)) {
      pageFilter._id = { $lt: new Types.ObjectId(decoded.id) };
    }
    const total = await this.auditModel.countDocuments(baseFilter).exec();
    const pages = total === 0 ? 0 : Math.ceil(total / limit);
    const rows = await this.auditModel
      .find(pageFilter)
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
      nextCursor: lastId
        ? encodePageCursor({ id: lastId, page: page + 1, sort: 'newest' })
        : null,
      limit,
      total,
      page,
      pages,
    };
  }
}
