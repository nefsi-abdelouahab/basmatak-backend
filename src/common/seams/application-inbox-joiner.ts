import { Types } from 'mongoose';

export const APPLICATION_INBOX_JOINER = 'APPLICATION_INBOX_JOINER';

/**
 * A single row of the org aggregate application inbox after pagination. Holds
 * the application document's own plain fields only; display-name embeds are
 * added by the joiner (see below).
 */
export interface ApplicationInboxRow {
  _id: Types.ObjectId;
  opportunityId: Types.ObjectId;
  positionId: Types.ObjectId;
  volunteerId: Types.ObjectId;
  organizationId: Types.ObjectId;
  status: string;
  message?: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Session 19 display joins (all optional; absent until the real joiner
   * enriches the row — the inert default leaves rows name-free).
   */
  volunteer?: {
    userId: string;
    username: string;
    fullName: string | null;
    avatarMediaId: string | null;
  } | null;
  organization?: {
    id: string;
    slug: string;
    nameFr: string | null;
    nameAr: string | null;
  } | null;
  opportunity?: { id: string; title: string; slug: string } | null;
  position?: { id: string; title: string } | null;
  decidedBy?: { userId: string; displayName: string | null } | null;
}

/**
 * Seam (S1 convention): the org aggregate inbox routes its result rows through
 * `enrich` before returning them. Session 19 (`org-embed-labels`) binds the
 * real implementation that joins volunteer / organization / opportunity /
 * position display names onto the rows; the applications module consumes the
 * token unchanged.
 */
export interface ApplicationInboxJoiner {
  enrich(
    organizationId: Types.ObjectId | string,
    rows: ApplicationInboxRow[],
  ): Promise<ApplicationInboxRow[]>;
}

/** Inert default: passes the rows through name-free until Session 17. */
export class InertApplicationInboxJoiner implements ApplicationInboxJoiner {
  async enrich(
    _organizationId: Types.ObjectId | string,
    rows: ApplicationInboxRow[],
  ): Promise<ApplicationInboxRow[]> {
    return rows;
  }
}
