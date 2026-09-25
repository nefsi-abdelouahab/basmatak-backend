import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SystemSettingModel,
  SystemSettingsCollection,
} from './system-setting.schema';
import { SETTING_DEFAULTS } from './setting-keys';

const CACHE_TTL_MS = 30_000;

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

/**
 * Reads/writes `system_settings` with a per-key in-memory cache (30s TTL).
 * Canonical defaults live in `setting-keys.ts`; the admin module owns the
 * write whitelist. Keys are created lazily via upsert.
 */
@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectModel(SystemSettingsCollection)
    private readonly settingModel: Model<SystemSettingModel>,
  ) {}

  async get<T = unknown>(key: string, fallback?: T): Promise<T | undefined> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    const doc = await this.settingModel.findOne({ key }).lean().exec();
    const value = (doc ? (doc.value as T) : fallback) as T;
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.settingModel.updateOne(
      { key },
      { $set: { value } },
      { upsert: true },
    );
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /**
   * Seeds every canonical default into settings (S6+ reads the gate
   * threshold; settings-expansion owns the full set). Absent-only: stored
   * values are never overwritten, so admin edits survive restarts.
   */
  async ensureDefaults(): Promise<void> {
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
      const existing = await this.settingModel.findOne({ key }).lean().exec();
      if (!existing) {
        await this.set(key, value);
      }
    }
  }
}
