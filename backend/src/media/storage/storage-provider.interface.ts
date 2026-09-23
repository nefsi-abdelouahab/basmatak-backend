/**
 * Object storage abstraction (roadmap S8, §7 decision 3). Media bytes are
 * never stored in MongoDB; everything storage-related goes through this
 * interface so Supabase can be swapped for a local dev provider or a test
 * double without touching the media service.
 */
export interface ObjectMetadata {
  size: number;
  mimeType: string;
}

export interface UploadIntent {
  uploadUrl: string;
  expiresAt?: Date;
}

export interface StorageProvider {
  /**
   * Presigned (or fake dev) URL the client PUTs bytes to. The signed URL must
   * expire within 15 minutes of issuance; where the provider API exposes no
   * expiry knob (Supabase `createSignedUploadUrl`), that TTL is documented
   * contract-level and enforced for read URLs (S19).
   */
  createPresignedUpload(
    storageKey: string,
    mimeType: string,
  ): Promise<UploadIntent>;
  /** Ground-truth size/mime read back from storage (F17 confirm). */
  objectMetadata(storageKey: string): Promise<ObjectMetadata>;
  /** Signed (or fake dev) read URL for authorized viewers, expiring ≤ 900s. */
  createSignedReadUrl(storageKey: string): Promise<string>;
}

/** DI token selecting the active provider (supabase | local | test double). */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
