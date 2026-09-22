import { Response } from 'express';
import { SettingsService } from '../../core/settings/settings.service';

/**
 * Marks the four reference-data reads cacheable (ROADMAP §4 S3). TTL comes from
 * the `cache_policy.referenceData` setting (default 300s); SettingsService
 * serves it with its 30s in-memory cache.
 */
export async function setReferenceCacheHeader(
  res: Response,
  settings: SettingsService,
): Promise<void> {
  const ttl = await settings.get<number>('cache_policy.referenceData', 300);
  res.setHeader('Cache-Control', `public, max-age=${Number(ttl) || 0}`);
}
