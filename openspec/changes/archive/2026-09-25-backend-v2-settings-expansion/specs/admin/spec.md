## MODIFIED Requirements

### Requirement: Admin settings write
The system SHALL expose `PUT /admin/settings/:key` (admin) accepting a JSON body `{ value }` and upserting the setting through the existing `SettingsService.set`, which refreshes the per-key cache so a subsequent read (including the S13 publish-gate threshold read) reflects the new value immediately. Only known keys SHALL be writable (the 16-key whitelist: `publishGate.maxPendingOpportunities`, `platform.*`, `locale.*`, `auth.adminSessionDurationDays`, `moderation.*`, `ops.*`, `maintenance.*`, `notifications.digest.*`); each key SHALL be validated against its declared type (numbers finite, booleans strict, strings bounded, language/format whitelisted). An unknown key SHALL return `400` with business code `UNKNOWN_SETTING_KEY`, and a `value` of the wrong shape (e.g. a non-number for a numeric threshold, a non-boolean for a kill-switch) SHALL return `400` with business code `INVALID_SETTING_VALUE`. The updated setting SHALL be returned, and the write SHALL be audited by the S1 interceptor.

#### Scenario: Upsert a known numeric threshold
- **WHEN** an admin calls `PUT /admin/settings/publishGate.maxPendingOpportunities` with `{ value: 1 }`
- **THEN** the setting is upserted, the cache reflects `1` immediately, and the updated setting is returned

#### Scenario: Unknown key rejected
- **WHEN** an admin writes a key outside the known set
- **THEN** the response is `400` and nothing is stored

#### Scenario: Wrong value shape rejected
- **WHEN** an admin sends a non-numeric value for the numeric publish-gate threshold
- **THEN** the request is rejected by validation and nothing is stored

#### Scenario: Wrong boolean shape rejected
- **WHEN** an admin sends a non-boolean value for `maintenance.enabled` or `ops.registrationEnabled`
- **THEN** the response is `400` (`INVALID_SETTING_VALUE`) and nothing is stored

## ADDED Requirements

### Requirement: Admin maintenance toggle
The system SHALL expose `POST /admin/ops/maintenance` (admin-only, audited by the S1 interceptor) accepting `{ enabled: boolean, message?: string }` (`whitelist` + `forbidNonWhitelisted` + transform). It SHALL write `maintenance.enabled` (and `maintenance.message` when provided) through `SettingsService.set` so the runtime gate and the Session 8 queue observe the change immediately, and SHALL return `{ enabled, message }`. Concurrent calls SHALL be single-flight (mirroring the `internal/jobs` mutex): overlapping toggles execute the write exactly once and all callers receive the same result.

#### Scenario: Maintenance switched on
- **WHEN** an admin posts `{ enabled: true, message: "Upgrading search" }`
- **THEN** `maintenance.enabled` is `true`, `maintenance.message` is stored, and the response is `{ enabled: true, message: "Upgrading search" }`

#### Scenario: Concurrent toggles collapse to one write
- **WHEN** two admins post conflicting toggles concurrently
- **THEN** the underlying setting write executes exactly once and both callers receive the same result

#### Scenario: Non-admin rejected
- **WHEN** a volunteer or organization user posts to `/admin/ops/maintenance`
- **THEN** the system returns 403 Forbidden and nothing is stored

#### Scenario: Invalid body rejected
- **WHEN** an admin posts a non-boolean `enabled` or an over-long `message`
- **THEN** the request fails `400` and nothing is stored
