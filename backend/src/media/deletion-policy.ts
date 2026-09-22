import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business.exception';
import { MediaModel } from './schemas/media.schema';

/**
 * F6 deletion guard seam (inventory §2.11, roadmap S8): soft delete is blocked
 * when media is referenced by a verified experience or by a submission not in
 * a terminal (`rejected`/`withdrawn`) state. The `submissions`/`verifications`/
 * `volunteer_experiences` collections arrive in S10/S11, so this default is
 * deliberately conservative — ANY attached reference blocks deletion. S10/S11
 * swap in a collection-aware policy proving terminality. Today every row this
 * module can create is unattached, so the default is exact for reachable data.
 */
@Injectable()
export class MediaDeletionPolicy {
  async assertDeletable(media: MediaModel): Promise<void> {
    if (media.submissionId || media.portfolioItemId) {
      throw new BusinessException(
        'MEDIA_DELETION_BLOCKED',
        'Media attached to a submission or portfolio item cannot be deleted',
        409,
      );
    }
  }
}
