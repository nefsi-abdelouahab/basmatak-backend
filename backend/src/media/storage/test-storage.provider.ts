import {
  ObjectMetadata,
  StorageProvider,
  UploadIntent,
} from './storage-provider.interface';

/**
 * In-memory storage double (task 2.4) used by unit + e2e tests. Records every
 * interaction for spies and lets tests force metadata mismatches (F17) or
 * missing objects — no network, no disk, no Supabase credentials.
 */
export class TestStorageProvider implements StorageProvider {
  readonly uploads: Array<{ storageKey: string; mimeType: string }> = [];
  readonly signedReads: string[] = [];
  private readonly objectInfo: Map<string, ObjectMetadata> = new Map();
  defaultObjectMetadata: ObjectMetadata = {
    size: 42_000,
    mimeType: 'image/png',
  };
  uploadUrl = 'https://storage.test/upload';
  readUrl = 'https://storage.test/read';

  /** Declare the "real" metadata of an object (what `objectMetadata` returns). */
  setObjectMetadata(storageKey: string, metadata: ObjectMetadata): void {
    this.objectInfo.set(storageKey, metadata);
  }

  /** Reset recorded interactions + declared object metadata between tests. */
  clear(): void {
    this.uploads.length = 0;
    this.signedReads.length = 0;
    this.objectInfo.clear();
  }

  async createPresignedUpload(
    storageKey: string,
    mimeType: string,
  ): Promise<UploadIntent> {
    this.uploads.push({ storageKey, mimeType });
    return { uploadUrl: this.uploadUrl };
  }

  async objectMetadata(storageKey: string): Promise<ObjectMetadata> {
    const declared = this.objectInfo.get(storageKey);
    if (declared) {
      return declared;
    }
    return { ...this.defaultObjectMetadata };
  }

  async createSignedReadUrl(storageKey: string): Promise<string> {
    this.signedReads.push(storageKey);
    return `${this.readUrl}/${storageKey}`;
  }
}
