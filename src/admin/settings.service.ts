import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessException } from '../common/exceptions/business.exception';
import {
  SystemSettingModel,
  SystemSettingsCollection,
} from '../core/settings/system-setting.schema';
import { SettingsService } from '../core/settings/settings.service';
import {
  KNOWN_SETTING_KEYS,
  KnownSettingKey,
  SETTING_VALIDATORS,
} from '../core/settings/setting-keys';

export { KNOWN_SETTING_KEYS };
export type { KnownSettingKey };

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
    const validator = SETTING_VALIDATORS[key as KnownSettingKey];
    if (!validator(value)) {
      throw new BusinessException(
        'INVALID_SETTING_VALUE',
        `Setting '${key}' has an invalid value shape`,
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
