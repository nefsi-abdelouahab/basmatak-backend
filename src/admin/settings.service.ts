import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import {
  SystemSettingModel,
  SystemSettingsCollection,
} from '../core/settings/system-setting.schema';
import { SettingsService } from '../core/settings/settings.service';

export const KNOWN_SETTING_KEYS = [
  'publishGate.maxPendingOpportunities',
] as const;

export type KnownSettingKey = (typeof KNOWN_SETTING_KEYS)[number];

/**
 * Admin settings surface (inventory §2.20, roadmap S16; the Session 1 deferral).
 * Read lists every `system_settings` row; write upserts through SettingsService
 * so the per-key cache refreshes and the publish gate picks up new thresholds
 * immediately. Keys and value shapes are whitelisted (design D8).
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    @InjectModel(SystemSettingsCollection)
    private readonly settingModel: Model<SystemSettingModel>,
    private readonly settings: SettingsService,
  ) {}

  async list(): Promise<SystemSettingModel[]> {
    return this.settingModel.find({}).sort({ key: 1 }).exec();
  }

  async upsert(key: string, value: unknown): Promise<SystemSettingModel> {
    if (!KNOWN_SETTING_KEYS.includes(key as KnownSettingKey)) {
      throw new BusinessException(
        'UNKNOWN_SETTING_KEY',
        `Unknown setting key '${key}'`,
        400,
      );
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BusinessException(
        'INVALID_SETTING_VALUE',
        `Setting '${key}' must be a finite number`,
        400,
      );
    }
    await this.settings.set(key, value);
    const doc = await this.settingModel.findOne({ key }).exec();
    if (!doc) {
      throw new BusinessException(
        'SETTING_NOT_FOUND',
        'Setting not found',
        500,
      );
    }
    return doc;
  }
}
