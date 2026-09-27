## ADDED Requirements

### Requirement: Admin settings table of stored validated keys

The system SHALL provide an admin-only settings surface at route `admin/settings` backed by `GET /admin/settings` (every row is a stored key) and `PUT /admin/settings/:key` (`{ value }` upsert) covering exactly the 16 canonical keys — `publishGate.maxPendingOpportunities` (finite number); `platform.name`, `platform.summary`, `platform.contactEmail` (bounded strings); `locale.defaultLanguage`, `locale.defaultTimezone`, `locale.dateFormat` (whitelisted language/format strings); `auth.adminSessionDurationDays` (positive integer); `moderation.requireVerifiedEmail`, `moderation.suspendOnReport` (strict booleans); `ops.registrationEnabled`, `ops.publishingEnabled` (strict booleans); `maintenance.enabled` (strict boolean), `maintenance.message` (string ≤500 chars); `notifications.digest.enabled` (strict boolean), `notifications.digest.intervalDays` (positive integer). The client SHALL validate each value by key shape before any request (unknown keys are never sent; wrong-shaped values are blocked with per-key neutral messages) and SHALL surface backend `UNKNOWN_SETTING_KEY` / `INVALID_SETTING_VALUE` (400) states without storing anything locally. The surface SHALL follow the 4 mandates (theme tokens only, `adminModeration` catalog strings only with en+ar + RTL logical properties, centralized API layer + TanStack Query only, responsive at 1440/1100/390). No civic rows ("DZ-NAT-REG sync", "Statutory Mandate", "100% compliance", "Contact Secretariat") SHALL appear.

#### Scenario: Settings table lists every stored key

- **WHEN** an admin visits `admin/settings`
- **THEN** every settings row renders with its key and typed editor, and the count matches the `GET /admin/settings` payload

#### Scenario: Valid per-key edit persists

- **WHEN** an admin writes a correctly-shaped value for a known key (e.g. `ops.publishingEnabled=false`)
- **THEN** the upsert succeeds and a re-read shows the new value immediately

#### Scenario: Wrong-shaped value blocked before the request

- **WHEN** an admin enters a non-boolean for a boolean kill-switch (or a non-number for the numeric threshold, or an over-long maintenance message)
- **THEN** no request is sent and the per-key neutral validation message shows

#### Scenario: Non-admin is refused

- **WHEN** a guest, volunteer, or organization account visits `admin/settings`
- **THEN** guests redirect to Login and non-admin roles see the shared 403 state with no data fetched

### Requirement: Maintenance toggle with enforced system-status read

The system SHALL expose the maintenance toggle via `POST /admin/ops/maintenance` (`{ enabled: boolean, message?: string ≤500 }`, message optional) writing the canonical `maintenance.enabled` (+ `maintenance.message` when provided) through the settings service, plus a live public read via `GET /system/status` (`{ status, version, uptimeSeconds, maintenance, message }`, no auth, reachable during maintenance). After every toggle the client SHALL re-read `GET /system/status` and SHALL show the enforced state; the acceptance spot-check SHALL assert that with maintenance on, a public read surfaces the guarded 503 (`MAINTENANCE_MODE`) path while admin routes stay usable. Concurrent toggles SHALL be treated as single-flight (last response wins in the UI; no parallel duplicate writes from this surface).

#### Scenario: Maintenance switches on and status reflects it

- **WHEN** an admin posts `{ enabled: true, message: "Upgrading search" }`
- **THEN** the response is `{ enabled: true, message: "Upgrading search" }` and the `GET /system/status` re-read shows `maintenance: true` with the stored message

#### Scenario: Maintenance enforcement spot-check

- **WHEN** maintenance is on
- **THEN** the settings screen shows the enforced banner noting public reads return 503 `MAINTENANCE_MODE` while `GET /system/status` stays 200 with `maintenance: true`

#### Scenario: Invalid toggle body blocked before the request

- **WHEN** an admin enters a non-boolean `enabled` or a message longer than 500 characters
- **THEN** no request is sent and the neutral validation message shows
