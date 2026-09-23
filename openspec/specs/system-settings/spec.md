# system-settings Specification

## Purpose
A typed `SettingsService` over the `system_settings` collection, exposing admin read/overwrite and a value-provider interface consumed by feature code (e.g. the publish gate threshold).
## Requirements
### Requirement: System settings service
The system SHALL provide a `SettingsService` that reads and writes keys in the `system_settings` collection, with a per-key in-memory cache whose entries expire after 30 seconds; a unique index on `key` enforces key uniqueness.

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

### Requirement: Admin settings controller
The system SHALL expose an admin controller over `system_settings` (the Session 1 deferral is now resolved): `GET /admin/settings` returning every settings row (`key` + `value`), and `PUT /admin/settings/:key` upserting a known key's value through `SettingsService.set` (which refreshes the per-key in-memory cache, so a subsequent read — including the publish-gate threshold read — reflects the new value immediately). Both routes are `@Roles('admin')` and audited by the S1 interceptor. Known keys: `publishGate.maxPendingOpportunities` (numeric). An unknown key SHALL be rejected `400` (business code `UNKNOWN_SETTING_KEY`); a wrong-shaped value SHALL be rejected by validation.

#### Scenario: List all settings
- **WHEN** an admin calls `GET /admin/settings`
- **THEN** every `system_settings` row is returned with its `key` and `value`

#### Scenario: Upsert refreshes cache immediately
- **WHEN** an admin sets `publishGate.maxPendingOpportunities` to `1` via `PUT /admin/settings/:key`
- **THEN** the row is upserted, the cache reflects `1`, and an immediate `SettingsService.get(...)` returns `1`

#### Scenario: Unknown key and wrong shape rejected
- **WHEN** an admin writes an unknown key or a non-numeric value for the numeric threshold
- **THEN** the response is `400` and nothing is stored

