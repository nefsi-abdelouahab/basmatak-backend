import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import {
  NOTIFICATION_PREF_KEYS,
  NotificationPrefKey,
} from '../schemas/notification-pref.schema';

/**
 * Six prefs in one nested object (design D1/D3). All keys optional so a PATCH
 * may send a partial selection; the global `AppValidationPipe`
 * (whitelist + forbidNonWhitelisted + transform) rejects unknown keys and
 * non-boolean values with 400 (design D4).
 */
export class NotificationPrefsDto {
  @IsOptional()
  @IsBoolean()
  applicationUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  reviews?: boolean;

  @IsOptional()
  @IsBoolean()
  verification?: boolean;

  @IsOptional()
  @IsBoolean()
  system?: boolean;

  @IsOptional()
  @IsBoolean()
  digest?: boolean;

  @IsOptional()
  @IsBoolean()
  recordIssued?: boolean;
}

/** PATCH body: `{ prefs: { <key>: boolean } }` (design D4). */
export class PatchNotificationPrefsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationPrefsDto)
  prefs!: NotificationPrefsDto;
}

/** Type-safe (compile-time only) helper for service-side key iteration. */
export function assertPrefKey(key: string): NotificationPrefKey {
  if (!(NOTIFICATION_PREF_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown notification pref key: ${key}`);
  }
  return key as NotificationPrefKey;
}
