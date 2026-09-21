import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Extension seam for media ownership checks (roadmap F9).
 * Owned by Session 8. Until then it only validates ObjectId format so routes
 * accepting `mediaId` (S4/S5) can validate the shape; existence/ownership
 * enforcement is added in S8 via `canReadMedia(actor, media)`.
 */
@Injectable()
export class MediaOwnership {
  isValidIdFormat(value: unknown): value is string {
    return typeof value === 'string' && Types.ObjectId.isValid(value);
  }

  /**
   * Inert default: returns `unknown` for any well-formed id. Session 8 swaps
   * in the real existence/ownership check (enum MediaPurpose/MediaVisibility,
   * delete blocks per inventory §7/F6).
   */
  async resolveOwner(_mediaId: string): Promise<unknown> {
    return undefined;
  }
}
