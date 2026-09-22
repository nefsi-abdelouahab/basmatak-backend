import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { CursorPage } from '../common/pagination/paginated.interface';
import {
  buildCursor,
  decodeCursor,
  normalizeLimit,
} from '../common/pagination/pagination.util';
import { MediaModel, MediaCollection } from '../media/schemas/media.schema';
import { MediaService } from '../media/media.service';
import { ReviewModel, ReviewsCollection } from '../reviews/review.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import {
  ExperienceListQueryDto,
  UpdateExperienceVisibilityDto,
} from './dto/verification.dto';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from './schemas/volunteer-experience.schema';

const EXPERIENCE_NOT_FOUND = 'EXPERIENCE_NOT_FOUND';

/**
 * Experiences service (inventory §2.14, roadmap S11 Part B): the volunteer's
 * own `me`/detail/visibility routes and the public A6 proof. Rows are created
 * only by the verify transaction — no create/edit route.
 */
@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(VolunteerExperiencesCollection)
    private readonly experienceModel: Model<VolunteerExperienceModel>,
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    @InjectModel(ReviewsCollection)
    private readonly reviewModel: Model<ReviewModel>,
    private readonly media: MediaService,
  ) {}

  /***************************************************************************
   * Volunteer reads
   **************************************************************************/

  async listMine(
    account: AccountToken,
    query: ExperienceListQueryDto,
  ): Promise<CursorPage<VolunteerExperienceModel>> {
    const filter: FilterQuery<VolunteerExperienceModel> = {
      volunteerId: new Types.ObjectId(account.sub),
    };
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const pageFilter: FilterQuery<VolunteerExperienceModel> = { ...filter };
    if (cursor) {
      pageFilter._id = { $lt: new Types.ObjectId(cursor) };
    }
    const rows = await this.experienceModel
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
    return { items, nextCursor: buildCursor(lastId).cursor, limit };
  }

  async getDetail(
    account: AccountToken,
    experienceId: string,
  ): Promise<Record<string, unknown>> {
    const experience = await this.requireOwned(account, experienceId);

    const evidence = [];
    for (const mediaId of experience.evidenceIds) {
      try {
        const read = await this.media.read(account, mediaId.toString());
        evidence.push({
          mediaId: mediaId.toString(),
          media: read.media,
          url: read.url,
        });
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          (error as { status?: number }).status === 403
        ) {
          evidence.push({
            mediaId: mediaId.toString(),
            media: null,
            url: null,
          });
        } else {
          throw error;
        }
      }
    }

    const review = await this.reviewModel
      .findOne({ submissionId: experience.submissionId })
      .exec();

    return { ...experience.toObject(), evidence, review };
  }

  async updateVisibility(
    account: AccountToken,
    experienceId: string,
    dto: UpdateExperienceVisibilityDto,
  ): Promise<VolunteerExperienceModel> {
    await this.requireOwned(account, experienceId);
    const updated = await this.experienceModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(experienceId), volunteerId: account.sub },
        { $set: { publicVisibility: dto.publicVisibility } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    return updated;
  }

  private async requireOwned(
    account: AccountToken,
    experienceId: string,
  ): Promise<VolunteerExperienceModel> {
    if (!Types.ObjectId.isValid(experienceId)) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    const experience = await this.experienceModel
      .findOne({
        _id: new Types.ObjectId(experienceId),
        volunteerId: new Types.ObjectId(account.sub),
      })
      .exec();
    if (!experience) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }
    return experience;
  }

  /***************************************************************************
   * Public proof (A6, D16)
   **************************************************************************/

  async getPublicProof(
    verificationCode: string,
  ): Promise<Record<string, unknown>> {
    const experience = await this.experienceModel
      .findOne({ verificationCode: verificationCode.trim().toUpperCase() })
      .exec();
    if (!experience) {
      throw new BusinessException(
        EXPERIENCE_NOT_FOUND,
        'Experience not found',
        404,
      );
    }

    const profile = await this.profileModel
      .findOne({ userId: experience.volunteerId })
      .exec();
    const volunteer = profile
      ? {
          handle: profile.username,
          firstName: profile.publicProfile.showBiography
            ? (profile.firstName ?? null)
            : null,
        }
      : null;

    // Evidence metadata limited to `visibility: public` only (D16); guests
    // never get signed URLs, so `type=link` rows expose their public URL and
    // file rows return metadata without a storage URL.
    const publicMedia = await this.mediaModel
      .find({
        _id: { $in: experience.evidenceIds },
        deletedAt: { $exists: false },
        visibility: 'public',
      })
      .exec();
    const evidence = publicMedia.map((media) => ({
      mediaId: media._id.toString(),
      type: media.type,
      mimeType: media.mimeType ?? null,
      filename: media.filename ?? null,
      url: media.type === 'link' ? (media.url ?? null) : null,
    }));

    return {
      title: experience.title,
      description: experience.description ?? null,
      skills: experience.skills,
      duration: experience.duration,
      volunteer,
      evidence,
    };
  }
}
