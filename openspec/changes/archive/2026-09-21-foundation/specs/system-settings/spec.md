## ADDED Requirements

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

### Requirement: No settings controller in foundation
The system SHALL expose `SettingsService` only; the admin settings controller is deferred to Session 16.

#### Scenario: No admin settings route
- **WHEN** the foundation application is booted
- **THEN** no `GET/PUT /admin/settings(?:/:key)` route exists