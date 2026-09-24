import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  decodePageCursor,
  encodePageCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { CursorPage } from '../common/pagination/paginated.interface';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { VolunteersQueryDto } from './dto/admin-query.dto';

export interface AdminVolunteerRow {
  profile: VolunteerProfileModel;
  user: Pick<
    UserModel,
    '_id' | 'email' | 'phone' | 'role' | 'status' | 'createdAt'
  > | null;
}

/**
 * Admin volunteer listing (inventory §2.20). Each page joins the paginated
 * `volunteer_profiles` with their linked `users` in one `$in` fetch (design
 * D3) — constant per page, never N+1.
 */
@Injectable()
export class AdminVolunteersService {
  constructor(
    @InjectModel(VolunteerProfilesCollection)
    private readonly volunteerModel: Model<VolunteerProfileModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
  ) {}

  async list(
    query: VolunteersQueryDto,
  ): Promise<CursorPage<AdminVolunteerRow>> {
    const limit = normalizeLimit(query.limit);
    const decoded = decodePageCursor(query.cursor);
    const page = decoded?.page ?? 1;
    const baseFilter: FilterQuery<VolunteerProfileModel> = {};
    const pageFilter: FilterQuery<VolunteerProfileModel> = { ...baseFilter };
    if (decoded?.id && Types.ObjectId.isValid(decoded.id)) {
      pageFilter._id = { $lt: new Types.ObjectId(decoded.id) };
    }
    const total = await this.volunteerModel.countDocuments(baseFilter).exec();
    const pages = total === 0 ? 0 : Math.ceil(total / limit);
    const profiles = await this.volunteerModel
      .find(pageFilter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = profiles.length > limit;
    const sliced = hasMore ? profiles.slice(0, limit) : profiles;

    const users = await this.userModel
      .find({ _id: { $in: sliced.map((profile) => profile.userId) } })
      .select('_id email phone role status createdAt')
      .exec();
    const userById = new Map(users.map((user) => [user._id.toString(), user]));

    const items = sliced.map((profile) => ({
      profile,
      user: userById.get(profile.userId.toString()) ?? null,
    }));
    const lastId =
      hasMore && items.length > 0
        ? items[items.length - 1].profile._id.toString()
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
