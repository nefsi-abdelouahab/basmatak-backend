import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BusinessException } from '../common/exceptions/business.exception';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { MediaOwnership } from '../common/seams/media-ownership';
import { MediaDeletionPolicy } from './deletion-policy';
import { MediaAccessService } from './media-access';
import {
  isAllowedUpload,
  assertAllowedLinkHost,
  MediaPurpose,
} from './media.constants';
import { PostLinkMediaDto, PostUploadMediaDto } from './dto/media.dto';
import { MediaCollection, MediaModel } from './schemas/media.schema';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from './storage/storage-provider.interface';

export interface MediaReadResult {
  media: MediaModel;
  url: string | null;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(MediaCollection)
    private readonly mediaModel: Model<MediaModel>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
    private readonly ownership: MediaOwnership,
    private readonly access: MediaAccessService,
    private readonly deletionPolicy: MediaDeletionPolicy,
  ) {}

  async createUploadIntent(
    ownerId: string,
    dto: PostUploadMediaDto,
  ): Promise<{ mediaId: string; uploadUrl: string }> {
    if (!isAllowedUpload(dto.mimeType, dto.size)) {
      throw new BusinessException(
        'MEDIA_TYPE_NOT_ALLOWED',
        'Only images (jpeg/png/webp) and PDFs up to 5 MB can be uploaded',
        400,
      );
    }
    const storageKey = this.buildStorageKey(ownerId, dto.purpose, dto.filename);
    const intent = await this.storage.createPresignedUpload(
      storageKey,
      dto.mimeType,
    );
    const row = await this.mediaModel.create({
      ownerId: new Types.ObjectId(ownerId),
      purpose: dto.purpose,
      visibility: dto.visibility ?? 'public',
      type: 'file',
      storageKey,
      filename: dto.filename,
      mimeType: dto.mimeType,
      size: dto.size,
    });
    return { mediaId: row._id.toString(), uploadUrl: intent.uploadUrl };
  }

  /**
   * Confirmation (F17): re-reads the REAL size/mime from storage and rejects
   * a mismatch against the declared (advisory) values. Idempotent once done.
   */
  async confirm(actor: AccountToken, mediaId: string): Promise<MediaModel> {
    const media = await this.ownership.assertOwned(mediaId, actor.sub);
    if (media.type !== 'file' || !media.storageKey) {
      throw new BusinessException(
        'MEDIA_NOT_CONFIRMABLE',
        'Only file uploads can be confirmed',
        400,
      );
    }
    if (media.confirmedAt) {
      return media;
    }
    const actual = await this.storage.objectMetadata(media.storageKey);
    if (actual.size !== media.size || actual.mimeType !== media.mimeType) {
      throw new BusinessException(
        'MEDIA_METADATA_MISMATCH',
        'Uploaded file metadata does not match the declared values',
        409,
      );
    }
    const updated = await this.mediaModel
      .findByIdAndUpdate(
        media._id,
        { $set: { confirmedAt: new Date() } },
        { new: true },
      )
      .exec();
    return updated ?? media;
  }

  async createLink(
    actor: AccountToken,
    dto: PostLinkMediaDto,
  ): Promise<MediaModel> {
    const url = assertAllowedLinkHost(dto.url);
    return this.mediaModel.create({
      ownerId: new Types.ObjectId(actor.sub),
      purpose: dto.purpose,
      visibility: dto.visibility ?? 'public',
      type: 'link',
      url,
    });
  }

  async read(
    actor: AccountToken | undefined,
    mediaId: string,
  ): Promise<MediaReadResult> {
    if (!actor?.sub) {
      throw new BusinessException('MEDIA_NOT_FOUND', 'Media not found', 404);
    }
    const media = await this.ownership.findById(mediaId);
    if (!media) {
      throw new BusinessException('MEDIA_NOT_FOUND', 'Media not found', 404);
    }
    if (!(await this.access.canRead(actor, media))) {
      throw new BusinessException(
        'MEDIA_ACCESS_DENIED',
        'You cannot read this media',
        403,
      );
    }
    const url =
      media.type === 'file' && media.storageKey
        ? await this.storage.createSignedReadUrl(media.storageKey)
        : (media.url ?? null);
    return { media, url };
  }

  async softDelete(actor: AccountToken, mediaId: string): Promise<void> {
    const media = await this.ownership.assertOwned(mediaId, actor.sub);
    await this.deletionPolicy.assertDeletable(media);
    await this.mediaModel
      .updateOne({ _id: media._id }, { $set: { deletedAt: new Date() } })
      .exec();
  }

  private buildStorageKey(
    ownerId: string,
    purpose: MediaPurpose,
    filename: string,
  ): string {
    const extension = extname(filename);
    const unique = randomUUID().replace(/-/g, '');
    return `${purpose}/${ownerId}/${unique}${extension}`;
  }
}
