import { Model, Types } from 'mongoose';
import { MediaOwnership } from '../common/seams/media-ownership';
import { AccountToken } from '../common/interfaces/account-token.interface';
import {
  startMemoryConnection,
  stopMemoryConnection,
  MemoryConnectionHandle,
} from '../../test/utils/memory-connection';
import {
  MediaModel,
  MediaCollection,
  MediaSchema,
} from './schemas/media.schema';
import { MediaAccessService, OpportunityMediaAccess } from './media-access';
import { MediaDeletionPolicy } from './deletion-policy';
import { MediaService } from './media.service';
import { TestStorageProvider } from './storage/test-storage.provider';

describe('MediaService (S8 F6/F17)', () => {
  let handle: MemoryConnectionHandle;
  let mediaModel: Model<MediaModel>;
  let storage: TestStorageProvider;
  let service: MediaService;

  const ownerId = new Types.ObjectId().toString();

  function actor(
    sub = ownerId,
    role: AccountToken['role'] = 'volunteer',
  ): AccountToken {
    return {
      sub,
      role,
      sessionId: '64b000000000000000000020',
    };
  }

  beforeAll(async () => {
    handle = await startMemoryConnection();
    mediaModel = handle.connection.model<MediaModel>(
      MediaCollection,
      MediaSchema,
    );
    storage = new TestStorageProvider();
    const ownership = new MediaOwnership(mediaModel);
    const access = new MediaAccessService(new OpportunityMediaAccess());
    service = new MediaService(
      mediaModel,
      storage,
      ownership,
      access,
      new MediaDeletionPolicy(),
    );
  });

  afterAll(async () => {
    if (handle) {
      await stopMemoryConnection(handle);
    }
  });

  afterEach(async () => {
    await handle.connection.collection(MediaCollection).deleteMany({});
    storage.clear();
  });

  describe('createUploadIntent', () => {
    it('rejects non-allowlisted mimes and oversized uploads', async () => {
      await expect(
        service.createUploadIntent(ownerId, {
          filename: 'x.gif',
          mimeType: 'image/gif',
          size: 1024,
          purpose: 'avatar',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'MEDIA_TYPE_NOT_ALLOWED' });
      await expect(
        service.createUploadIntent(ownerId, {
          filename: 'x.png',
          mimeType: 'image/png',
          size: 5 * 1024 * 1024 + 1,
          purpose: 'avatar',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'MEDIA_TYPE_NOT_ALLOWED' });
    });

    it('stores a metadata row and returns { mediaId, uploadUrl }', async () => {
      const intent = await service.createUploadIntent(ownerId, {
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'avatar',
      });
      expect(intent.mediaId).toBeTruthy();
      expect(intent.uploadUrl).toContain('upload');
      expect(storage.uploads).toHaveLength(1);

      const row = await mediaModel.findById(intent.mediaId).exec();
      expect(row).toMatchObject({
        ownerId: new Types.ObjectId(ownerId),
        purpose: 'avatar',
        visibility: 'public',
        type: 'file',
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
      });
    });
  });

  describe('createLink', () => {
    it('registers allowlisted hosts and rejects everyone else', async () => {
      const ok = await service.createLink(actor(), {
        url: 'https://www.youtube.com/watch?v=abc',
        purpose: 'submission_evidence',
        visibility: 'public',
      });
      expect(ok.type).toBe('link');
      expect(ok.url).toBe('https://www.youtube.com/watch?v=abc');

      await expect(
        service.createLink(actor(), {
          url: 'https://evil.example.com/x',
          purpose: 'submission_evidence',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'LINK_HOST_NOT_ALLOWED' });
    });
  });

  describe('confirm (F17)', () => {
    it('confirms an upload whose real metadata matches the declaration', async () => {
      const { mediaId } = await service.createUploadIntent(ownerId, {
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'avatar',
      });
      const confirmed = await service.confirm(actor(), mediaId);
      expect(confirmed.confirmedAt).toBeInstanceOf(Date);
      expect(await service.confirm(actor(), mediaId)).toMatchObject({
        confirmedAt: confirmed.confirmedAt,
      });
    });

    it('rejects a size or mime mismatch with 409', async () => {
      const { mediaId } = await service.createUploadIntent(ownerId, {
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'avatar',
      });
      storage.setObjectMetadata(storage.uploads[0].storageKey, {
        size: 1,
        mimeType: 'image/png',
      });
      await expect(service.confirm(actor(), mediaId)).rejects.toMatchObject({
        status: 409,
        code: 'MEDIA_METADATA_MISMATCH',
      });
    });

    it('refuses to confirm links and hides foreign media as 404', async () => {
      const link = await service.createLink(actor(), {
        url: 'https://youtu.be/abc',
        purpose: 'avatar',
      });
      await expect(
        service.confirm(actor(), link._id.toString()),
      ).rejects.toMatchObject({ status: 400, code: 'MEDIA_NOT_CONFIRMABLE' });
      await expect(
        service.confirm(
          actor(new Types.ObjectId().toString()),
          link._id.toString(),
        ),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
    });
  });

  describe('read (§6 matrix)', () => {
    it('answers 404 to guests and unknown ids', async () => {
      await expect(service.read(undefined, ownerId)).rejects.toMatchObject({
        status: 404,
        code: 'MEDIA_NOT_FOUND',
      });
      await expect(
        service.read(actor(), new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });
    });

    it('serves public media to any actor and hides private media from strangers', async () => {
      const { mediaId } = await service.createUploadIntent(ownerId, {
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'avatar',
      });
      const stranger = new Types.ObjectId().toString();

      const publicRead = await service.read(actor(stranger), mediaId);
      expect(publicRead.url).toContain('read');

      await mediaModel
        .updateOne({ _id: mediaId }, { $set: { visibility: 'private' } })
        .exec();
      await expect(
        service.read(actor(stranger), mediaId),
      ).rejects.toMatchObject({ status: 403, code: 'MEDIA_ACCESS_DENIED' });
      const ownerRead = await service.read(actor(), mediaId);
      expect(ownerRead.url).toContain('read');
    });

    it('treats soft-deleted media as not found', async () => {
      const { mediaId } = await service.createUploadIntent(ownerId, {
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'avatar',
      });
      await service.softDelete(actor(), mediaId);
      await expect(service.read(actor(), mediaId)).rejects.toMatchObject({
        status: 404,
        code: 'MEDIA_NOT_FOUND',
      });
    });
  });

  describe('softDelete (F6 guard)', () => {
    it('soft-deletes unattached owned media and 404s foreigners', async () => {
      const { mediaId } = await service.createUploadIntent(ownerId, {
        filename: 'photo.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'avatar',
      });
      await expect(
        service.softDelete(actor(new Types.ObjectId().toString()), mediaId),
      ).rejects.toMatchObject({ status: 404, code: 'MEDIA_NOT_FOUND' });

      await service.softDelete(actor(), mediaId);
      const row = await mediaModel.findById(mediaId).exec();
      expect(row!.deletedAt).toBeInstanceOf(Date);
    });

    it('blocks deleting media attached to a submission (409)', async () => {
      const { mediaId } = await service.createUploadIntent(ownerId, {
        filename: 'evidence.png',
        mimeType: 'image/png',
        size: 42000,
        purpose: 'submission_evidence',
      });
      await mediaModel
        .updateOne(
          { _id: mediaId },
          { $set: { submissionId: new Types.ObjectId() } },
        )
        .exec();
      await expect(service.softDelete(actor(), mediaId)).rejects.toMatchObject({
        status: 409,
        code: 'MEDIA_DELETION_BLOCKED',
      });
    });
  });
});
