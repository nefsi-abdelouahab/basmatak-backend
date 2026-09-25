import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainEvents } from '../common/constants/domain-events';
import { isDuplicateKeyError } from '../common/slug/slugify.util';
import { SettingsService } from '../core/settings/settings.service';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefKey,
  NotificationPrefsCollection,
  NOTIFICATION_PREF_KEYS,
  NotificationPrefModel,
} from './schemas/notification-pref.schema';

/** Global digest settings keys (design D5, flag-only — no digest job). */
export const DIGEST_ENABLED_KEY = 'notifications.digest.enabled';
export const DIGEST_INTERVAL_DAYS_KEY = 'notifications.digest.intervalDays';
export const DIGEST_ENABLED_DEFAULT = false;
export const DIGEST_INTERVAL_DAYS_DEFAULT = 7;

/**
 * Per-user notification preferences (design D1–D5, roadmap S9). One row per
 * user (unique `userId`), lazily generated on first read with all six defaults
 * ON. The bus path consults `enabledFor(recipientId, type)` before writing;
 * the transactional `createInSession` path stays ungated (design D2 note).
 */
@Injectable()
export class NotificationPrefsService {
  constructor(
    @InjectModel(NotificationPrefsCollection)
    private readonly prefModel: Model<NotificationPrefModel>,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Event type → pref key (design D1). Defaults to `applicationUpdates` (the
   * safest bucket) for unknown/future event types. Never throws.
   */
  prefsForType(type: string): NotificationPrefKey {
    switch (type) {
      case DomainEvents.ApplicationCreated:
      case DomainEvents.ApplicationAccepted:
      case DomainEvents.ApplicationRejected:
      case DomainEvents.ApplicationWithdrawn:
      case DomainEvents.ParticipationRemoved:
      case DomainEvents.ParticipationWithdrawn:
      case DomainEvents.OpportunityCancelled:
      case DomainEvents.OpportunityStarted:
        return 'applicationUpdates';
      case DomainEvents.OrgVerificationUpdated:
      case DomainEvents.SubmissionSubmitted:
      case DomainEvents.SubmissionVerified:
      case DomainEvents.SubmissionRejected:
        return 'verification';
      case DomainEvents.PublishGateLocked:
        return 'system';
      case DomainEvents.AdminNotice:
        return 'system';
      default:
        return 'applicationUpdates';
    }
  }

  /** The six persisted keys, in stable order (compile-time list). */
  keys(): readonly NotificationPrefKey[] {
    return NOTIFICATION_PREF_KEYS;
  }

  /**
   * Read (and lazily create) the caller's prefs row. A concurrent first read
   * may race the unique `userId` index; the duplicate write is swallowed
   * (idempotent get-or-create, design D5, never throws).
   */
  async getOwn(userId: string): Promise<Record<NotificationPrefKey, boolean>> {
    const owned = await this.prefModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (owned) {
      return owned.prefs;
    }
    try {
      await this.prefModel.create([
        {
          userId: new Types.ObjectId(userId),
          prefs: { ...DEFAULT_NOTIFICATION_PREFS },
        },
      ]);
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
    const row = await this.prefModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    return row ? row.prefs : { ...DEFAULT_NOTIFICATION_PREFS };
  }

  /** Whether event `type` is enabled for `recipientId` (bus gate, design D2). */
  async enabledFor(recipientId: string, type: string): Promise<boolean> {
    const prefs = await this.getOwn(recipientId);
    return prefs[this.prefsForType(type)] !== false;
  }

  /**
   * Merge a whitelisted subset of the six boolean keys into the caller's row
   * (design D4). Only `true`/`false` values are accepted — the DTO layer
   * rejects everything else with 400 before this runs. Returns merged prefs.
   */
  async patchOwn(
    userId: string,
    partial: Partial<Record<NotificationPrefKey, boolean>>,
  ): Promise<Record<NotificationPrefKey, boolean>> {
    await this.getOwn(userId);
    const $set: Record<string, boolean> = {};
    for (const key of NOTIFICATION_PREF_KEYS) {
      const value = partial[key];
      if (typeof value === 'boolean') {
        $set[`prefs.${key}`] = value;
      }
    }
    const updated = await this.prefModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $set },
        { new: true },
      )
      .lean()
      .exec();
    return updated ? updated.prefs : { ...DEFAULT_NOTIFICATION_PREFS };
  }

  /** Seed the two global digest settings keys if absent (design D5, flag-only). */
  async ensureDigestSettings(): Promise<void> {
    const enabled = await this.settings.get(DIGEST_ENABLED_KEY);
    if (enabled === undefined) {
      await this.settings.set(DIGEST_ENABLED_KEY, DIGEST_ENABLED_DEFAULT);
    }
    const interval = await this.settings.get(DIGEST_INTERVAL_DAYS_KEY);
    if (interval === undefined) {
      await this.settings.set(
        DIGEST_INTERVAL_DAYS_KEY,
        DIGEST_INTERVAL_DAYS_DEFAULT,
      );
    }
  }

  /**
   * Read provider for the global digest flag (design D5 flag-only; no digest
   * delivery in S9). Tolerates absent/non-boolean stored values
   * (defaults `DIGEST_ENABLED_DEFAULT`, i.e. `false`).
   */
  async isDigestEnabled(): Promise<boolean> {
    const stored = await this.settings.get(DIGEST_ENABLED_KEY);
    return typeof stored === 'boolean' ? stored : DIGEST_ENABLED_DEFAULT;
  }

  /**
   * Read provider for the global digest interval in days (design D5 flag-only).
   * Tolerates absent/non-numeric stored values (defaults
   * `DIGEST_INTERVAL_DAYS_DEFAULT`, i.e. `7`).
   */
  async digestIntervalDays(): Promise<number> {
    const stored = await this.settings.get(DIGEST_INTERVAL_DAYS_KEY);
    return typeof stored === 'number' && Number.isFinite(stored)
      ? stored
      : DIGEST_INTERVAL_DAYS_DEFAULT;
  }
}
