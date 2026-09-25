## MODIFIED Requirements

### Requirement: System settings service
The system SHALL provide a `SettingsService` that reads and writes keys in the `system_settings` collection, with a per-key in-memory cache whose entries expire after 30 seconds; a unique index on `key` enforces key uniqueness. `ensureDefaults` SHALL seed every canonical default (the 16 keys whitelisted for admin write, including `publishGate.maxPendingOpportunities = 3`) only when absent — it SHALL never overwrite a stored value.

#### Scenario: Read cached setting
- **WHEN** a setting key is read and was cached within the last 30 seconds
- **THEN** the cached value is returned without a database read

#### Scenario: Cache expiry triggers reload
- **WHEN** a setting key is read after its cache entry has expired
- **THEN** the service reads the current value from `system_settings` and refreshes the cache

#### Scenario: Missing key returns default
- **WHEN** a setting key does not exist in `system_settings`
- **THEN** the service returns the provided default value (and does not write it to the database unless upserting)

#### Scenario: Upsert updates value
- **WHEN** a setting value is set through the service
- **THEN** the document is upserted by `key` and the cache is refreshed

#### Scenario: Boot defaults never overwrite stored values
- **WHEN** `ensureDefaults` runs and a canonical key already has a stored value
- **THEN** the stored value is preserved and only absent keys are seeded with their defaults

### Requirement: Admin settings controller
The system SHALL expose an admin controller over `system_settings`: `GET /admin/settings` returning every settings row (`key` + `value`), and `PUT /admin/settings/:key` upserting a known key's value through `SettingsService.set` (which refreshes the per-key in-memory cache, so a subsequent read — including the publish-gate threshold read — reflects the new value immediately). Both routes are `@Roles('admin')` and audited by the S1 interceptor. Known keys (16): `publishGate.maxPendingOpportunities` (number); `platform.name`, `platform.summary`, `platform.contactEmail` (strings); `locale.defaultLanguage`, `locale.defaultTimezone`, `locale.dateFormat` (strings, language/format whitelisted); `auth.adminSessionDurationDays` (positive integer); `moderation.requireVerifiedEmail`, `moderation.suspendOnReport` (booleans); `ops.registrationEnabled`, `ops.publishingEnabled` (booleans); `maintenance.enabled` (boolean); `maintenance.message` (string); `notifications.digest.enabled` (boolean); `notifications.digest.intervalDays` (positive integer). An unknown key SHALL be rejected `400` (business code `UNKNOWN_SETTING_KEY`); a wrong-shaped value SHALL be rejected `400` (business code `INVALID_SETTING_VALUE`).

#### Scenario: List all settings
- **WHEN** an admin calls `GET /admin/settings`
- **THEN** every `system_settings` row is returned with its `key` and `value`

#### Scenario: Upsert refreshes cache immediately
- **WHEN** an admin sets `publishGate.maxPendingOpportunities` to `1` via `PUT /admin/settings/:key`
- **THEN** the row is upserted, the cache reflects `1`, and an immediate `SettingsService.get(...)` returns `1`

#### Scenario: Unknown key and wrong shape rejected
- **WHEN** an admin writes an unknown key or a non-numeric value for the numeric threshold
- **THEN** the response is `400` and nothing is stored

#### Scenario: Boolean kill-switch round-trips
- **WHEN** an admin sets `ops.publishingEnabled` to `false` via `PUT /admin/settings/:key`
- **THEN** the row is upserted, the cache reflects `false` immediately, and the publish enforcement observes it without a restart

#### Scenario: Digest keys are admin-writable with Session 3 shapes
- **WHEN** an admin sets `notifications.digest.enabled` to `true` or `notifications.digest.intervalDays` to `10`
- **THEN** the values are stored, and Session 3's tolerant readers (`isDigestEnabled`, `digestIntervalDays`) observe them with unchanged defaults (`false`, `7`) when absent

## ADDED Requirements

### Requirement: Canonical maintenance settings keys
The system SHALL own `maintenance.enabled` (boolean, default `false`) and `maintenance.message` (string, max 500 chars, default empty) as the canonical, admin-writable maintenance settings in `system_settings`. The key name and boolean shape of `maintenance.enabled` SHALL stay identical to the provisional read-only flag consumed by the Session 8 analytics queue (`GET /admin/analytics/queue` → `maintenanceMode`), which keeps reading it with fallback `false` and is not modified by this change.

#### Scenario: Queue read stays compatible
- **WHEN** an admin toggles maintenance on through this change's write surface
- **THEN** `GET /admin/analytics/queue` reports `maintenanceMode: true` with no change to the analytics code

#### Scenario: Maintenance message validated
- **WHEN** an admin writes `maintenance.message` longer than 500 characters or a non-string value
- **THEN** the response is `400` (`INVALID_SETTING_VALUE`) and nothing is stored
