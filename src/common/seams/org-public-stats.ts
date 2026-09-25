import { Types } from 'mongoose';

/** DI token for the public organization-stats aggregate provider. */
export const ORG_PUBLIC_STATS_PROVIDER = 'ORG_PUBLIC_STATS_PROVIDER';

/** Per-domain slice of the public stats ribbon (filled by Session 16). */
export interface OrgPublicStatsDomain {
  domain: string;
  share: number;
}

/**
 * Public aggregates on the organization profile (Session 14 `org-facts` scope,
 * consumed by `GET /organizations/:slug`). Numeric fields only — `activeSince`
 * is derived by the organizations service from `foundedYear`, not the seam.
 * Kept distinct from `OrgFootprint` (admin-analytics seam): different consumer
 * (public payload vs admin analytics) and different shape.
 */
export interface OrgPublicStats {
  volunteers: number;
  initiativesActive: number;
  initiativesCompleted: number;
  verifiedHours: number;
  responseRate: number;
  perDomain: OrgPublicStatsDomain[];
}

/**
 * Seam (S1 convention): Session 14 defines the interface + inert default;
 * `org-dashboard` (Session 16) overrides the token with the real aggregation
 * implementation computed from database data. The organizations module is
 * unchanged by that swap.
 */
export interface OrgPublicStatsProvider {
  getStats(organizationId: Types.ObjectId | string): Promise<OrgPublicStats>;
}

/** Inert default: zeroed stats until Session 16 provides the real one. */
export class InertOrgPublicStatsProvider implements OrgPublicStatsProvider {
  async getStats(
    _organizationId: Types.ObjectId | string,
  ): Promise<OrgPublicStats> {
    return {
      volunteers: 0,
      initiativesActive: 0,
      initiativesCompleted: 0,
      verifiedHours: 0,
      responseRate: 0,
      perDomain: [],
    };
  }
}
