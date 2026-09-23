import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
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
  OpportunityModel,
  OpportunitiesCollection,
} from '../opportunities/schemas/opportunity.schema';
import { OpportunitiesQueryDto } from './dto/admin-part-b.dto';

/**
 * Admin opportunity control (inventory §2.20 second half). Listing is a
 * read-only newest-first projection; status changes (force close/cancel) go
 * through StatusTransitionService using the S6 opportunity whitelist, writing
 * a status_histories row.
 */
@Injectable()
export class AdminOpportunitiesService {
  constructor(
    @InjectModel(OpportunitiesCollection)
    private readonly opportunityModel: Model<OpportunityModel>,
    private readonly statusTransitions: StatusTransitionService,
  ) {}

  async list(
    query: OpportunitiesQueryDto,
  ): Promise<CursorPage<OpportunityModel>> {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const filter: FilterQuery<OpportunityModel> = {};
    if (cursor && Types.ObjectId.isValid(cursor)) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.opportunityModel
      .find(filter)
      .select(
        '_id organizationId slug title description categoryId status startDate applicationDeadline createdAt updatedAt',
      )
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1]._id.toString()
        : null;
    return { items, nextCursor: buildCursor(lastId).cursor, limit };
  }

  async setStatus(
    account: AccountToken,
    opportunityId: string,
    status: 'closed' | 'cancelled',
  ): Promise<OpportunityModel> {
    const opportunity = await this.opportunityModel
      .findById(opportunityId)
      .exec();
    if (!opportunity) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    if (opportunity.status === status) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `Opportunity is already ${status}`,
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'opportunity',
      entityId: opportunity._id,
      from: opportunity.status,
      to: status,
      actor: account.sub,
    });
    await this.opportunityModel
      .updateOne({ _id: opportunity._id }, { $set: { status } })
      .exec();
    const updated = await this.opportunityModel
      .findById(opportunity._id)
      .exec();
    if (!updated) {
      throw new BusinessException(
        'OPPORTUNITY_NOT_FOUND',
        'Opportunity not found',
        404,
      );
    }
    return updated;
  }
}
