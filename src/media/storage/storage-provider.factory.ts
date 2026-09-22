import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from './storage-provider.interface';
import { SupabaseStorageProvider } from './supabase-storage.provider';

/**
 * Selects the active provider from `STORAGE_PROVIDER` (supabase default):
 * - `STORAGE_PROVIDER=local` → local disk provider (dev) regardless of creds;
 * - Supabase creds present and local NOT requested → Supabase (the default);
 * - no creds and no explicit provider → local fallback (tests/dev boot fine —
 *   `createTestApp` runs with a bare env, so unset must never crash the app);
 * - explicit `STORAGE_PROVIDER=supabase` without creds → fail fast (misconfig).
 * Tests override the `STORAGE_PROVIDER` token with the `TestStorageProvider`
 * double when they read/confirm real metadata.
 */
export const storageProviderFactory = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): StorageProvider => {
    const requested = String(
      config.get<string>('STORAGE_PROVIDER') ?? '',
    ).toLowerCase();
    const url = config.get<string>('SUPABASE_URL');
    const anonKey = config.get<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseConfigured = Boolean(url && anonKey && serviceRoleKey);

    if (requested === 'supabase' && !supabaseConfigured) {
      throw new Error(
        'STORAGE_PROVIDER=supabase was set but SUPABASE_URL / SUPABASE_ANON_KEY / ' +
          'SUPABASE_SERVICE_ROLE_KEY are missing. Set them or use STORAGE_PROVIDER=local.',
      );
    }
    if (supabaseConfigured && requested !== 'local') {
      return new SupabaseStorageProvider({
        url: url as string,
        anonKey: anonKey as string,
        serviceRoleKey: serviceRoleKey as string,
        bucket: config.get<string>('SUPABASE_BUCKET') ?? 'basmatak',
      });
    }
    return new LocalStorageProvider(
      config.get<string>('STORAGE_LOCAL_DIR') ?? 'storage',
    );
  },
};
