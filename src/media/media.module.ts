import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaAccessService, OpportunityMediaAccess } from './media-access';
import { MediaController } from './media.controller';
import { MediaDeletionPolicy } from './deletion-policy';
import { MediaService } from './media.service';
import { MediaCollection, MediaSchema } from './schemas/media.schema';
import { storageProviderFactory } from './storage/storage-provider.factory';

/**
 * Media feature module (inventory §2.11/§3, roadmap S8). `MediaOwnership`,
 * `OpportunityMediaAccess` and `MediaDeletionPolicy` are the seams consumed by
 * earlier sessions (F9 retrofit) and upgraded by S10/S11. The storage provider
 * is bound through the `STORAGE_PROVIDER` token (supabase | local | test).
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: MediaCollection, schema: MediaSchema }]),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaAccessService,
    OpportunityMediaAccess,
    MediaDeletionPolicy,
    storageProviderFactory,
  ],
  exports: [MongooseModule, MediaService],
})
export class MediaModule {}
