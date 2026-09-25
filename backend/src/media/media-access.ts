import { Injectable } from '@nestjs/common';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { MediaModel } from './schemas/media.schema';

/**
 * Organization read branch for §6 private evidence media: the owning
 * organization (opportunity owner) may read private `submission_evidence`
 * attached to submissions on its own opportunities. Bound app-wide to
 * `OrganizationOpportunityMediaAccess` (backend-v2-media-org-read); this base
 * class remains the inert default, importable for unit tests.
 */
@Injectable()
export class OpportunityMediaAccess {
  async allows(_actor: AccountToken, _media: MediaModel): Promise<boolean> {
    return false;
  }
}

/**
 * The single §6 private-media matrix gate (inventory §6, roadmap S8 F6):
 * - deleted media: never readable
 * - guest (no actor): never readable (unauthenticated `GET` → 404)
 * - `visibility=public`: any authenticated actor
 * - `visibility=private`: owner, admin, or the owning-opportunity org
 */
@Injectable()
export class MediaAccessService {
  constructor(private readonly opportunityAccess: OpportunityMediaAccess) {}

  async canRead(
    actor: AccountToken | undefined,
    media: MediaModel,
  ): Promise<boolean> {
    if (media.deletedAt) {
      return false;
    }
    // Guests SHALL read `visibility=public` media (inventory §6, design d4/3.1):
    // the public check precedes the guest deny so an unauthenticated read of
    // public media is allowed (guest × private still 404 — see `read()`).
    if (media.visibility === 'public') {
      return true;
    }
    if (!actor || !actor.sub) {
      return false;
    }
    if (actor.role === 'admin') {
      return true;
    }
    if (media.ownerId.toString() === actor.sub) {
      return true;
    }
    return this.opportunityAccess.allows(actor, media);
  }
}
