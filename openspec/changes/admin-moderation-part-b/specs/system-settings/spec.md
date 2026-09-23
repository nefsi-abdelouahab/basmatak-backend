## ADDED Requirements

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

## REMOVED Requirements

### Requirement: No settings controller in foundation
**Reason**: Session 1 deferred the admin settings controller to Session 16; that controller now ships with this change.
**Migration**: Admin settings are now managed through `GET /admin/settings` and `PUT /admin/settings/:key` (admin role), described in the added "Admin settings controller" requirement.