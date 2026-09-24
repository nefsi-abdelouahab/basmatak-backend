import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { CursorPage } from '../common/pagination/paginated.interface';
import { execPage, toArray } from '../common/pagination/pagination.util';
import {
  ADMIN_EXPERIENCE_DISPLAY,
  AdminExperienceDisplayProvider,
} from '../common/seams/admin-experience-display';
import { UserModel, UsersCollection } from '../users/schemas/user.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../volunteers/schemas/volunteer-skill.schema';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  LocationModel,
  LocationsCollection,
} from '../locations/schemas/location.schema';
import { VolunteersQueryDto } from './dto/admin-query.dto';
import {
  adminCursor,
  adminLimit,
  escapeRegex,
  fieldSort,
  idSort,
  AdminSortDef,
} from './admin-list.util';

export interface AdminVolunteerRow {
  profile: VolunteerProfileModel;
  user: Pick<
    UserModel,
    | '_id'
    | 'email'
    | 'phone'
    | 'role'
    | 'status'
    | 'createdAt'
    | 'lastActivityAt'
    | 'emailVerifiedAt'
  > | null;
  skillNames: string[];
  wilayaName: string | null;
  municipalityName: string | null;
}

/**
 * Admin volunteer listing (inventory §2.20). Each page joins the paginated
 * `volunteer_profiles` with their linked `users` in one `$in` fetch, plus
 * skill names and location labels — constant queries per page, never N+1.
 * Session 10 adds `q`/location/skill/time filters and whitelisted sorts.
 */
@Injectable()
export class AdminVolunteersService {
  constructor(
    @InjectModel(VolunteerProfilesCollection)
    private readonly volunteerModel: Model<VolunteerProfileModel>,
    @InjectModel(UsersCollection)
    private readonly userModel: Model<UserModel>,
    @InjectModel(VolunteerSkillsCollection)
    private readonly volunteerSkillModel: Model<VolunteerSkillModel>,
    @InjectModel(SkillsCollection)
    private readonly skillModel: Model<SkillModel>,
    @InjectModel(LocationsCollection)
    private readonly locationModel: Model<LocationModel>,
    @Inject(ADMIN_EXPERIENCE_DISPLAY)
    private readonly experienceDisplay: AdminExperienceDisplayProvider,
  ) {}

  async list(
    query: VolunteersQueryDto,
  ): Promise<CursorPage<AdminVolunteerRow>> {
    const baseFilter: FilterQuery<VolunteerProfileModel> =
      await this.buildFilter(query);
    const sortDef = this.sortDef(query.sort ?? 'newest');
    return execPage(
      this.volunteerModel,
      baseFilter,
      {
        limit: adminLimit(query),
        cursor: adminCursor(query),
        sort: sortDef.sort,
        sortToken: sortDef.token,
        ...(sortDef.cursorFilter ? { cursorFilter: sortDef.cursorFilter } : {}),
        ...(sortDef.valueExtractor
          ? { valueExtractor: sortDef.valueExtractor }
          : {}),
      },
      (profiles) => this.enrich(profiles),
    );
  }

  /**
   * Latest verified engagement (RP §3.2#9): served through the
   * `AdminExperienceDisplay` seam so `experience-enrichment` can fill real
   * rows later without touching this module.
   */
  async experiences(
    volunteerId: string,
  ): Promise<CursorPage<Record<string, unknown>>> {
    const profile = Types.ObjectId.isValid(volunteerId)
      ? await this.volunteerModel
          .findOne({ userId: new Types.ObjectId(volunteerId) })
          .select('_id')
          .lean()
          .exec()
      : null;
    if (!profile) {
      throw new BusinessException(
        'VOLUNTEER_NOT_FOUND',
        'Volunteer not found',
        404,
      );
    }
    return this.experienceDisplay.getVolunteerExperiences(volunteerId);
  }

  private sortDef(token: string): AdminSortDef {
    if (token === 'oldest') {
      return idSort('oldest');
    }
    if (token === 'name') {
      return fieldSort('name', 'username', 1);
    }
    return idSort('newest');
  }

  private async buildFilter(
    query: VolunteersQueryDto,
  ): Promise<FilterQuery<VolunteerProfileModel>> {
    const filter: FilterQuery<VolunteerProfileModel> = {};
    const and: FilterQuery<VolunteerProfileModel>[] = [];

    if (query.q) {
      const pattern = { $regex: escapeRegex(query.q), $options: 'i' };
      const or: FilterQuery<VolunteerProfileModel>[] = [
        { username: pattern },
        { firstName: pattern },
        { lastName: pattern },
      ];
      const emailUsers = await this.userModel
        .find({ email: pattern })
        .select('_id')
        .lean()
        .exec();
      if (emailUsers.length > 0) {
        or.push({ userId: { $in: emailUsers.map((user) => user._id) } });
      }
      and.push({ $or: or });
    }
    if (query.wilayaId) {
      and.push({ 'location.wilayaId': query.wilayaId });
    }
    if (query.municipalityId) {
      and.push({ 'location.municipalityId': query.municipalityId });
    }
    const skillIds = toArray(query.skillId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (skillIds.length > 0) {
      const links = await this.volunteerSkillModel
        .find({ skillId: { $in: skillIds } })
        .select('volunteerId')
        .lean()
        .exec();
      // `volunteer_skills.volunteerId` references the `users` row (same value
      // as `volunteer_profiles.userId`).
      and.push({ userId: { $in: links.map((link) => link.volunteerId) } });
    }
    if (query.from || query.to) {
      const window: { $gte?: Date; $lte?: Date } = {};
      if (query.from) {
        window.$gte = new Date(query.from);
      }
      if (query.to) {
        window.$lte = new Date(query.to);
      }
      and.push({ createdAt: window });
    }
    if (and.length > 0) {
      filter.$and = and;
    }
    return filter;
  }

  private async enrich(
    profiles: VolunteerProfileModel[],
  ): Promise<AdminVolunteerRow[]> {
    const userIds = profiles.map((profile) => profile.userId);
    const [users, skillLinks] = await Promise.all([
      this.userModel
        .find({ _id: { $in: userIds } })
        .select(
          '_id email phone role status createdAt lastActivityAt emailVerifiedAt',
        )
        .lean()
        .exec(),
      this.volunteerSkillModel
        .find({ volunteerId: { $in: userIds } })
        .select('volunteerId skillId')
        .lean()
        .exec(),
    ]);
    const userById = new Map(users.map((user) => [user._id.toString(), user]));
    const skillIds = [
      ...new Set(skillLinks.map((link) => link.skillId.toString())),
    ].map((id) => new Types.ObjectId(id));
    const codes = [
      ...new Set(
        profiles.flatMap((profile) => [
          profile.location?.wilayaId,
          profile.location?.municipalityId,
        ]),
      ),
    ].filter((code): code is string => Boolean(code));
    const [catalog, locations] = await Promise.all([
      skillIds.length > 0
        ? this.skillModel
            .find({ _id: { $in: skillIds } })
            .lean()
            .exec()
        : Promise.resolve([]),
      codes.length > 0
        ? this.locationModel
            .find({ code: { $in: codes } })
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);
    const skillNameById = new Map(
      catalog.map((skill) => [skill._id.toString(), skill.nameFr]),
    );
    const locationNameByCode = new Map(
      locations.map((location) => [location.code, location.nameFr]),
    );
    const skillsByUser = new Map<string, string[]>();
    for (const link of skillLinks) {
      const name = skillNameById.get(link.skillId.toString());
      if (!name) {
        continue;
      }
      const key = link.volunteerId.toString();
      const list = skillsByUser.get(key) ?? [];
      list.push(name);
      skillsByUser.set(key, list);
    }
    return profiles.map((profile) => {
      const key = profile.userId.toString();
      return {
        profile,
        user: (userById.get(key) as AdminVolunteerRow['user']) ?? null,
        skillNames: skillsByUser.get(key) ?? [],
        wilayaName:
          locationNameByCode.get(profile.location?.wilayaId ?? '') ?? null,
        municipalityName:
          locationNameByCode.get(profile.location?.municipalityId ?? '') ??
          null,
      };
    });
  }
}
