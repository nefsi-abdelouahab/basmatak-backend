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
}

/**
 * Seam (S1 convention): the org aggregate inbox routes its result rows through
 * `enrich` before returning them. Session 17 (`org-embed-labels`) overrides
 * the token with the real implementation that joins volunteer / organization /
 * opportunity / position display names onto the rows; the applications module
 * is unchanged.
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
