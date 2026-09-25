const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LANGUAGES = ['fr', 'ar', 'en'] as const;
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStrictBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function boundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return (
    typeof value === 'string' && value.length >= min && value.length <= max
  );
}

/**
 * Canonical `system_settings` whitelist (settings-expansion, Session 13).
 * `publishGate.maxPendingOpportunities` keeps its v1 numeric contract;
 * `notifications.digest.*` promote Session 3's flag-only keys to
 * admin-writable with identical shapes; `maintenance.enabled` is the
 * canonical key Session 8's queue already reads (same name/shape).
 */
export const KNOWN_SETTING_KEYS = [
  'publishGate.maxPendingOpportunities',
  'platform.name',
  'platform.summary',
  'platform.contactEmail',
  'locale.defaultLanguage',
  'locale.defaultTimezone',
  'locale.dateFormat',
  'auth.adminSessionDurationDays',
  'moderation.requireVerifiedEmail',
  'moderation.suspendOnReport',
  'ops.registrationEnabled',
  'ops.publishingEnabled',
  'maintenance.enabled',
  'maintenance.message',
  'notifications.digest.enabled',
  'notifications.digest.intervalDays',
] as const;

export type KnownSettingKey = (typeof KNOWN_SETTING_KEYS)[number];

/** Absent-only boot defaults, keyed by canonical key (see D1). */
export const SETTING_DEFAULTS: Record<KnownSettingKey, unknown> = {
  'publishGate.maxPendingOpportunities': 3,
  'platform.name': 'Basmatak Tatatoua',
  'platform.summary': '',
  'platform.contactEmail': '',
  'locale.defaultLanguage': 'fr',
  'locale.defaultTimezone': 'Africa/Algiers',
  'locale.dateFormat': 'DD/MM/YYYY',
  'auth.adminSessionDurationDays': 30,
  'moderation.requireVerifiedEmail': true,
  'moderation.suspendOnReport': false,
  'ops.registrationEnabled': true,
  'ops.publishingEnabled': true,
  'maintenance.enabled': false,
  'maintenance.message': '',
  'notifications.digest.enabled': false,
  'notifications.digest.intervalDays': 7,
};

export const SETTING_VALIDATORS: Record<
  KnownSettingKey,
  (value: unknown) => boolean
> = {
  'publishGate.maxPendingOpportunities': isFiniteNumber,
  'platform.name': (v) => boundedString(v, 1, 120),
  'platform.summary': (v) => boundedString(v, 0, 500),
  'platform.contactEmail': (v) =>
    v === '' || (boundedString(v, 0, 254) && EMAIL_RE.test(v)),
  'locale.defaultLanguage': (v): v is string =>
    typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v),
  'locale.defaultTimezone': (v) => boundedString(v, 1, 100),
  'locale.dateFormat': (v): v is string =>
    typeof v === 'string' && (DATE_FORMATS as readonly string[]).includes(v),
  'auth.adminSessionDurationDays': (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 90,
  'moderation.requireVerifiedEmail': isStrictBoolean,
  'moderation.suspendOnReport': isStrictBoolean,
  'ops.registrationEnabled': isStrictBoolean,
  'ops.publishingEnabled': isStrictBoolean,
  'maintenance.enabled': isStrictBoolean,
  'maintenance.message': (v) => boundedString(v, 0, 500),
  'notifications.digest.enabled': isStrictBoolean,
  'notifications.digest.intervalDays': (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 365,
};
