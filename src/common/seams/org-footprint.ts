import { Types } from 'mongoose';

/** DI token for the organization-footprint aggregate provider. */
export const ORG_FOOTPRINT_PROVIDER = 'ORG_FOOTPRINT_PROVIDER';

/**
 * Per-organization footprint aggregates (Session 8 `admin-analytics` scope,
 * owner-confirmed definitions): opportunities = the org's opportunities by
 * status; applications = applications across the org's opportunities by
 * status; participants = engaged task participants across the org's
 * opportunities by status; experiences = verified experiences the org issued;
 * hours = documented volunteer hours from the org's verified experiences;
 * reliability = the org's cached reliability snapshot.
 */
export interface OrgFootprint {
  opportunities: number;
  applications: number;
  participants: number;
  experiences: number;
  hours: number;
  reliability: {
    responseRate?: number;
    decidedRatio?: number;
    medianDecisionHours?: number;
    anomaly?: boolean;
  } | null;
}

/**
 * Seam (S1 convention): Session 8 defines the interface + inert default;
 * `org-dashboard` (Session 16) overrides the token with the real
 * implementation that computes the aggregates from database data. The admin
 * analytics module is unchanged by that swap.
 */
export interface OrgFootprintProvider {
  getFootprint(organizationId: Types.ObjectId | string): Promise<OrgFootprint>;
}

/** Inert default: zeroed footprint until Session 16 provides the real one. */
export class InertOrgFootprintProvider implements OrgFootprintProvider {
  async getFootprint(
    _organizationId: Types.ObjectId | string,
  ): Promise<OrgFootprint> {
    return {
      opportunities: 0,
      applications: 0,
      participants: 0,
      experiences: 0,
      hours: 0,
      reliability: null,
    };
  }
}
