import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VolunteersModule } from '../volunteers/volunteers.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import {
  PortfolioItemSchema,
  PortfolioItemsCollection,
} from './schemas/portfolio-item.schema';

/**
 * Portfolio feature module (inventory §2.15, roadmap S14): the volunteer's
 * curated showcase. The schema is also registered in CommonModule (global) so
 * the public-read seam can inject the model; `VolunteersModule` provides the
 * profile model + public portfolio seam call.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PortfolioItemsCollection, schema: PortfolioItemSchema },
    ]),
    VolunteersModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
