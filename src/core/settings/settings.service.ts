import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SystemSettingModel,
  SystemSettingsCollection,
} from './system-setting.schema';

const CACHE_TTL_MS = 30_000;

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

/**
 * Reads/writes `system_settings` with a per-key in-memory cache (30s TTL).
 * The admin settings controller ships in Session 16; this session exposes the
 * service only. Keys are created lazily via upsert.
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

  /** Bumps `publishGate.maxPendingOpportunities` default into settings (S6+ reads it). */
  async ensureDefaults(): Promise<void> {
    await this.set('publishGate.maxPendingOpportunities', 3);
  }
}
