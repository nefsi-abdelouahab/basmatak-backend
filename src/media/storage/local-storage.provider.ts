import { promises as fs } from 'fs';
import * as path from 'path';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  ObjectMetadata,
  StorageProvider,
  UploadIntent,
} from './storage-provider.interface';

/**
 * Dev-only provider (roadmap §8 fallback): `STORAGE_PROVIDER=local` writes to
 * a gitignored `./storage` directory with fake signed URLs — enough for every
 * pre-deploy session. `objectMetadata` reads the real byte size from disk;
 * mime is not derivable locally, so it reports a generic value (F17's mime
 * re-read is exercised properly by Supabase / the test double).
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootDir = 'storage') {}

  private buildPath(storageKey: string): string {
    return path.join(this.rootDir, storageKey);
  }

  async createPresignedUpload(
    storageKey: string,
    _mimeType: string,
  ): Promise<UploadIntent> {
    const filePath = this.buildPath(storageKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return { uploadUrl: `/storage/${storageKey}` };
  }

  async objectMetadata(storageKey: string): Promise<ObjectMetadata> {
    try {
      const stat = await fs.stat(this.buildPath(storageKey));
      return { size: stat.size, mimeType: 'application/octet-stream' };
    } catch {
      throw new BusinessException(
        'STORAGE_OBJECT_NOT_FOUND',
        `Object "${storageKey}" was not uploaded yet`,
        404,
      );
    }
  }

  async createSignedReadUrl(storageKey: string): Promise<string> {
    return `/storage/${storageKey}`;
  }
}
