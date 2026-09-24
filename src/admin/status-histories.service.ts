import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import {
  StatusHistoryModel,
  StatusHistoryCollection,
} from '../core/status-transitions/status-histories.schema';
import { StatusHistoriesQueryDto } from './dto/admin-part-b.dto';
import { adminCursor, adminLimit } from './admin-list.util';

/**
 * Admin status-history reads (Session 10 `backend-v2-admin-lists`).
 * Read-only access to `status_histories` per entity; writes stay owned by
 * `StatusTransitionService`. Rows return oldest-first so the audit trail
 * reads chronologically. Reads are audited by the admin interceptor but
 * never write history rows themselves.
 */
@Injectable()
export class AdminStatusHistoriesService {
  constructor(
    @InjectModel(StatusHistoryCollection)
    private readonly historyModel: Model<StatusHistoryModel>,
  ) {}

  async list(
    query: StatusHistoriesQueryDto,
  ): Promise<CursorPage<StatusHistoryModel>> {
    if (!query.entityType || !query.entityId) {
      throw new BusinessException(
        'MISSING_HISTORY_FILTER',
        'entityType and entityId are required',
        400,
      );
    }
    if (!Types.ObjectId.isValid(query.entityId)) {
      throw new BusinessException(
        'INVALID_HISTORY_FILTER',
        'entityId must be a valid ObjectId',
        400,
      );
    }
    return execPage(
      this.historyModel,
      {
        entityType: query.entityType,
        entityId: new Types.ObjectId(query.entityId),
      },
      {
        limit: adminLimit(query),
        cursor: adminCursor(query),
        sort: { createdAt: 1, _id: 1 },
        sortToken: 'oldest',
      },
    );
  }
}
