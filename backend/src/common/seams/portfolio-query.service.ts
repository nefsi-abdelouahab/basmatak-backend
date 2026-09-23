import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessException } from '../exceptions/business.exception';
import { MediaCollection, MediaModel } from '../../media/schemas/media.schema';
import {
  PortfolioItemModel,
  PortfolioItemsCollection,
} from '../../portfolio/schemas/portfolio-item.schema';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../../volunteers/schemas/volunteer-profile.schema';

/** Media metadata safe for public display (non-deleted, `visibility=public`). */
export interface PublicMediaShape {
  mediaId: string;
  type: string;
  mimeType: string | null;
  filename: string | null;
  url: string | null;
}

export interface PortfolioItemShape {
  id: string;
  mediaId?: string;
  title?: string;
  description?: string;
  media?: PublicMediaShape[];
}

export interface PublicPortfolio {
  items: PortfolioItemShape[];
}

export interface PublicExperienceShape {
  id: string;
  title: string;
  summary: string;
  verifiedAt: string;
}

/**
 * Extension seam for public portfolio/experience reads (roadmap F9), upgraded
 * by Session 14 into the real read. Served by the global
 * `GET /volunteers/:username/portfolio` route: an unknown username or a
 * profile whose `publicProfile.enabled=false` surfaces as `404` (A5); for an
 * enabled profile only `visibility=public` items (in `order` sequence) with
 * media metadata restricted to non-deleted `visibility=public` rows are
 * returned. The public interface stays source-compatible, so S12 consumers
 * (`VolunteersService.getPublicProfile`) are unaffected.
 */
@Injectable()
export class PortfolioQueryService {
  constructor(
    @InjectModel(VolunteerProfilesCollection)
    private readonly profileModel: Model<VolunteerProfileModel>,
    @InjectModel(PortfolioItemsCollection)
    private readonly portfolioModel: Model<PortfolioItemModel>,
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
  ) {}

  async getPublicPortfolio(username: string): Promise<PublicPortfolio> {
    const profile = await this.profileModel.findOne({ username }).exec();
    if (!profile || !profile.publicProfile.enabled) {
      throw new BusinessException(
        'VOLUNTEER_NOT_FOUND',
        'Volunteer not found',
        404,
      );
    }
    const items = await this.portfolioModel
      .find({
        volunteerId: profile.userId,
        visibility: 'public',
      })
      .sort({ order: 1 })
      .exec();

    const mediaIds = items.flatMap((item) =>
      item.mediaIds.map((id) => id.toString()),
    );
    const mediaRows = mediaIds.length
      ? await this.mediaModel
          .find({
            _id: { $in: mediaIds },
            deletedAt: { $exists: false },
            visibility: 'public',
          })
          .exec()
      : [];
    const byId = new Map(
      mediaRows.map((media) => [media._id.toString(), media]),
    );

    const shapes: PortfolioItemShape[] = items.map((item) => {
      const visibleIds = item.mediaIds.filter((id) => byId.has(id.toString()));
      const media: PublicMediaShape[] = visibleIds.map((id) => {
        const row = byId.get(id.toString())!;
        return {
          mediaId: row._id.toString(),
          type: row.type,
          mimeType: row.mimeType ?? null,
          filename: row.filename ?? null,
          url: row.type === 'link' ? (row.url ?? null) : null,
        };
      });
      const shape: PortfolioItemShape = {
        id: item._id.toString(),
        title: item.title,
        description: item.description ?? undefined,
        media,
      };
      const first = visibleIds[0];
      if (first) {
        shape.mediaId = first.toString();
      }
      return shape;
    });

    return { items: shapes };
  }

  async getPublicExperiences(
    _username: string,
  ): Promise<{ experiences: PublicExperienceShape[] }> {
    return { experiences: [] };
  }
}
