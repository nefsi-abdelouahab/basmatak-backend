import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminLocationsController } from './admin-locations.controller';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationsCollection, LocationSchema } from './schemas/location.schema';

/**
 * Locations feature module (inventory §2.3): public wilaya/municipality reads
 * and admin maintenance. `MongooseModule` is exported so the seed dispatcher
 * can resolve the `locations` model token from the app context.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationsCollection, schema: LocationSchema },
    ]),
  ],
  controllers: [LocationsController, AdminLocationsController],
  providers: [LocationsService],
  exports: [MongooseModule, LocationsService],
})
export class LocationsModule {}
