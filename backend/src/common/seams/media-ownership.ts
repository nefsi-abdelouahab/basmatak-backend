import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaCollection, MediaModel } from '../../media/schemas/media.schema';
import { MediaPurpose } from '../../media/media.constants';
import { BusinessException } from '../exceptions/business.exception';

/**
 * Media ownership seam (roadmap F9), upgraded by Session 8 from the S1
 * ObjectId-format checker into the real existence/ownership/purpose assertion.
 * Global, so session 4/5 routes (and later S10+ evidence routes) inject it
 * without importing the media module; invalid media surfaces as `404`, foreign
 * ownership surfaces as `404` (resource hidden), purpose mismatch as `409`.
 */
@Injectable()
export class MediaOwnership {
  constructor(
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
  ) {}

  isValidIdFormat(value: unknown): value is string {
    return typeof value === 'string' && Types.ObjectId.isValid(value);
  }

  /** Non-deleted media row, or null when absent / malformed / soft-deleted. */
  async findById(mediaId: string): Promise<MediaModel | null> {
    if (!this.isValidIdFormat(mediaId)) {
      return null;
    }
    return this.mediaModel
      .findOne({ _id: mediaId, deletedAt: { $exists: false } })
      .exec();
  }

  /**
   * Owner-scoped resolution (404 semantics): the media must exist, be live,
   * and belong to `actorId`. Used by confirm/delete so foreign ids read as
   * "not found" to the caller.
   */
  async assertOwned(mediaId: string, actorId: string): Promise<MediaModel> {
    const media = await this.findById(mediaId);
    if (!media) {
      throw new BusinessException('MEDIA_NOT_FOUND', 'Media not found', 404);
    }
    if (media.ownerId.toString() !== actorId) {
      throw new BusinessException('MEDIA_NOT_FOUND', 'Media not found', 404);
    }
    return media;
  }

  /** Retrofit contract (design D5): ownership + optional purpose assertion. */
  async assertFor(
    mediaId: string,
    actorId: string,
    purpose?: MediaPurpose,
  ): Promise<MediaModel> {
    const media = await this.assertOwned(mediaId, actorId);
    if (purpose !== undefined && media.purpose !== purpose) {
      throw new BusinessException(
        'MEDIA_PURPOSE_MISMATCH',
        `Media purpose must be "${purpose}"`,
        409,
      );
    }
    return media;
  }
}
