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
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import { UsersQueryDto } from './dto/admin-query.dto';

const PUBLIC_USER_SELECT = '-passwordHash';

/**
 * Admin users listing/control (inventory §2.20 first half). Status changes go
 * through StatusTransitionService so `status_histories` records every admin
 * decision; a `deleted` account is terminal (no transition off it).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    private readonly statusTransitions: StatusTransitionService,
  ) {}

  async list(query: UsersQueryDto): Promise<CursorPage<UserModel>> {
    const filter: FilterQuery<UserModel> = {};
    if (query.role) {
      filter.role = query.role;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.q) {
      filter.email = { $regex: escapeRegex(query.q), $options: 'i' };
    }
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const pageFilter: FilterQuery<UserModel> = { ...filter };
    if (cursor && Types.ObjectId.isValid(cursor)) {
      pageFilter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.userModel
      .find(pageFilter)
      .select(PUBLIC_USER_SELECT)
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

  async getById(userId: string): Promise<UserModel> {
    const user = await this.userModel
      .findById(userId)
      .select(PUBLIC_USER_SELECT)
      .exec();
    if (!user) {
      throw new BusinessException('USER_NOT_FOUND', 'User not found', 404);
    }
    return user;
  }

  async setStatus(
    account: AccountToken,
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<UserModel> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new BusinessException('USER_NOT_FOUND', 'User not found', 404);
    }
    if (user.status === 'deleted') {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        'A deleted account cannot be restored',
        409,
      );
    }
    if (user.status === status) {
      throw new BusinessException(
        'INVALID_STATUS_TRANSITION',
        `User is already ${status}`,
        409,
      );
    }
    await this.statusTransitions.assert({
      entityType: 'user',
      entityId: user._id,
      from: user.status,
      to: status,
      actor: account.sub,
    });
    await this.userModel
      .updateOne({ _id: user._id }, { $set: { status } })
      .exec();
    return this.getById(user._id.toString());
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
