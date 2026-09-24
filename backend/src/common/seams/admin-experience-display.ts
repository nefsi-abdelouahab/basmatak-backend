import { CursorPage } from '../pagination/paginated.interface';

/** DI token for the admin volunteer-experience display provider. */
export const ADMIN_EXPERIENCE_DISPLAY = 'ADMIN_EXPERIENCE_DISPLAY';

/**
 * Seam (S1 convention): Session 10 defines the interface + inert default;
 * `experience-enrichment` (Session 15) overrides the token with the real
 * implementation that reads verified experiences. The admin module is
 * unchanged by that swap.
 */
export interface AdminExperienceDisplayProvider {
  getVolunteerExperiences(
    volunteerId: string,
  ): Promise<CursorPage<Record<string, unknown>>>;
}

/** Inert default: valid empty page until Session 15 provides the real one. */
export class InertAdminExperienceDisplayProvider implements AdminExperienceDisplayProvider {
  async getVolunteerExperiences(
    _volunteerId: string,
  ): Promise<CursorPage<Record<string, unknown>>> {
    return {
      items: [],
      nextCursor: null,
      limit: 20,
      total: 0,
      page: 1,
      pages: 0,
    };
  }
}
