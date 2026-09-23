import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  ObjectMetadata,
  StorageProvider,
  UploadIntent,
} from './storage-provider.interface';

export interface SupabaseStorageOptions {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  bucket: string;
}

/** Signed read URLs expire in 15 minutes (S19 hardening; roadmap bound). */
const SIGNED_URL_TTL_SECONDS = 900;

/**
 * Production provider: Supabase Storage on the free tier (§7 decision 3).
 * Uses the service-role key so `info()` (ground-truth metadata, F17) and
 * signed URLs work without per-bucket RLS gymnastics. The `anonKey` is
 * accepted for forward-compat with client-side usage.
 */
export class SupabaseStorageProvider implements StorageProvider {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(options: SupabaseStorageOptions) {
    this.client = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = options.bucket;
  }

  async createPresignedUpload(
    storageKey: string,
    _mimeType: string,
  ): Promise<UploadIntent> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(storageKey, { upsert: false });
    if (error || !data) {
      this.fail(error?.message);
    }
    return { uploadUrl: data.signedUrl };
  }

  async objectMetadata(storageKey: string): Promise<ObjectMetadata> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .info(storageKey);
    if (error || !data) {
      this.fail(error?.message);
    }
    return { size: data.size ?? 0, mimeType: data.contentType ?? '' };
  }

  async createSignedReadUrl(storageKey: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      this.fail(error?.message);
    }
    return data.signedUrl;
  }

  private fail(reason?: string): never {
    throw new BusinessException(
      'STORAGE_PROVIDER_ERROR',
      reason ? `Object storage error: ${reason}` : 'Object storage error',
      502,
    );
  }
}
