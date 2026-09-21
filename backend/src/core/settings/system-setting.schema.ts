import { Schema, Document } from 'mongoose';
import { createSchema } from '../../common/schema/base.schema';

export interface SystemSetting {
  key: string;
  value: unknown;
}

export class SystemSettingModel extends Document implements SystemSetting {
  key!: string;
  value!: unknown;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SystemSettingsCollection = 'system_settings';

export const SystemSettingSchema: Schema<SystemSettingModel> = createSchema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
});
