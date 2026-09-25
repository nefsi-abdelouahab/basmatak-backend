import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OpportunitiesCollection,
  OpportunitySchema,
} from '../opportunities/schemas/opportunity.schema';
import {
  VolunteerProfileSchema,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { FavoriteSchema, FavoritesCollection } from './schemas/favorite.schema';

/**
 * Favorites feature module (Session 17 `backend-v2-favorites`). Owns the
 * `favorites` collection; the opportunity and volunteer-profile models below
 * are read-only references to peer-owned collections (same pattern as the
 * activity module). No peer module is imported or modified.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FavoritesCollection, schema: FavoriteSchema },
      { name: OpportunitiesCollection, schema: OpportunitySchema },
      { name: VolunteerProfilesCollection, schema: VolunteerProfileSchema },
    ]),
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
