import { Global, Module } from '@nestjs/common';
import { AppLogger } from './logger/app.logger';
import { PublishGateService } from './seams/publish-gate.service';
import { PortfolioQueryService } from './seams/portfolio-query.service';
import { MediaOwnership } from './seams/media-ownership';

/**
 * Cross-cutting providers: seams (inert defaults until their owning sessions)
 * and the app logger. Guards/filters/pipes are registered at the app level.
 */
@Global()
@Module({
  providers: [
    AppLogger,
    PublishGateService,
    PortfolioQueryService,
    MediaOwnership,
  ],
  exports: [
    AppLogger,
    PublishGateService,
    PortfolioQueryService,
    MediaOwnership,
  ],
})
export class CommonModule {}
