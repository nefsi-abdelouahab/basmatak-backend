import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage } from '../common/pagination/pagination.util';
import { StatusTransitionService } from '../core/status-transitions/status-transition.service';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import { UsersQueryDto } from './dto/admin-query.dto';
import {
  adminCursor,
  adminLimit,
  escapeRegex,
  idSort,
} from './admin-list.util';

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
    const sortDef = idSort(query.sort ?? 'newest');
    return execPage(
      this.userModel,
      filter,
      {
        limit: adminLimit(query),
        cursor: adminCursor(query),
        sort: sortDef.sort,
        sortToken: sortDef.token,
        ...(sortDef.cursorFilter ? { cursorFilter: sortDef.cursorFilter } : {}),
      },
      (rows) =>
        rows.map((row) => {
          const plain = row.toJSON() as Record<string, unknown>;
          delete plain.passwordHash;
          return plain as unknown as UserModel;
        }),
    );
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
    meta?: { reason?: string; notes?: string },
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
      ...(meta?.reason !== undefined ? { reason: meta.reason } : {}),
      ...(meta?.notes !== undefined ? { notes: meta.notes } : {}),
    });
    await this.userModel
      .updateOne({ _id: user._id }, { $set: { status } })
      .exec();
    return this.getById(user._id.toString());
  }
}
