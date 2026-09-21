import { Injectable } from '@nestjs/common';

export interface PortfolioItemShape {
  id: string;
  mediaId?: string;
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
 * Extension seam for public portfolio/experience reads (roadmap F9).
 * Owned by Sessions 12/14; Session 14 replaces the inert default with reads
 * from `portfolio_items` / `volunteer_experiences`.
 *
 * Default: empty-but-correct shapes, so routes depending on it (S12) compile
 * and return valid payloads before the owning session ships.
 */
@Injectable()
export class PortfolioQueryService {
  async getPublicPortfolio(_username: string): Promise<PublicPortfolio> {
    return { items: [] };
  }

  async getPublicExperiences(
    _username: string,
  ): Promise<{ experiences: PublicExperienceShape[] }> {
    return { experiences: [] };
  }
}
