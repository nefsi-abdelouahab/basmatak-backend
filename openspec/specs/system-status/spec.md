# system-status Specification

## Purpose
TBD - created by archiving change backend-v2-settings-expansion. Update Purpose after archive.
## Requirements
### Requirement: Public system status
The system SHALL expose public `GET /system/status` (no auth) returning `{ status, version, uptimeSeconds, maintenance, message }`, where `status`/`version` reuse the `/health` semantics (`'ok'` + package version), `uptimeSeconds` is the process uptime, `maintenance` mirrors canonical `maintenance.enabled` (default `false`), and `message` mirrors `maintenance.message` (empty when unset). The route SHALL stay reachable while maintenance mode is on.

#### Scenario: Status reflects stored maintenance state
- **WHEN** a guest calls `GET /system/status` with maintenance on and a message set
- **THEN** the response is `200` with `maintenance: true` and the stored message

#### Scenario: Healthy defaults
- **WHEN** a guest calls `GET /system/status` with no maintenance keys stored
- **THEN** the response is `200` with `status: 'ok'`, a version string, `maintenance: false`, and an empty message

### Requirement: Runtime maintenance gate
While canonical `maintenance.enabled` is `true`, every request EXCEPT `GET /health`, `GET /system/status`, `/internal/*`, and `/admin/*` SHALL be rejected `503` with business code `MAINTENANCE_MODE` and neutral copy (including the stored `maintenance.message` when set), regardless of role or method. Admin routes SHALL remain fully usable during maintenance. The gate SHALL read through the cached `SettingsService.get` (TTL 30s or fresher after a write), so toggling takes effect without a restart.

#### Scenario: Public read rejected during maintenance
- **WHEN** maintenance is on and a guest calls a public read (e.g. the opportunity feed)
- **THEN** the response is `503` (`MAINTENANCE_MODE`), not the payload

#### Scenario: Volunteer write rejected during maintenance
- **WHEN** maintenance is on and an authenticated volunteer calls a write route
- **THEN** the response is `503` (`MAINTENANCE_MODE`)

#### Scenario: Admin unaffected during maintenance
- **WHEN** maintenance is on and an admin calls any `/admin/*` route
- **THEN** the request is processed normally (no 503)

#### Scenario: Status and health stay reachable
- **WHEN** maintenance is on
- **THEN** `GET /system/status` returns `200` with `maintenance: true` and `GET /health` returns `200`

#### Scenario: Gate opens immediately after toggle-off
- **WHEN** maintenance is switched off via the admin toggle
- **THEN** a subsequent public read succeeds without waiting for cache expiry

### Requirement: Registration kill-switch enforcement
When `ops.registrationEnabled` is `false`, `POST /auth/register/volunteer` and `POST /auth/register/organization` SHALL be rejected `403` with business code `REGISTRATION_DISABLED` before any account creation. The default `true` SHALL preserve current registration behavior exactly.

#### Scenario: Registration paused
- **WHEN** `ops.registrationEnabled` is `false` and a guest posts a valid volunteer registration
- **THEN** the response is `403` (`REGISTRATION_DISABLED`) and no user row is created

#### Scenario: Registration open by default
- **WHEN** `ops.registrationEnabled` is unset or `true`
- **THEN** registration behaves exactly as before this change

### Requirement: Publishing kill-switch enforcement
When `ops.publishingEnabled` is `false`, publishing an opportunity SHALL be rejected `403` with business code `PUBLISHING_DISABLED`. Enforcement SHALL live in the trust publish-gate seam (`TrustPublishGateService.evaluate` throws `403 PUBLISHING_DISABLED` before counting, so no edit to `OpportunitiesService` — owned by parallel S4 session `backend-v2-opportunity-fields` — is needed); the existing `409 PUBLISH_GATE_LOCKED` path is otherwise untouched. The default `true` SHALL preserve current publish behavior exactly, and the verified-org precondition (`ORG_NOT_VERIFIED`) SHALL stay enforced independently.

#### Scenario: Publishing paused
- **WHEN** `ops.publishingEnabled` is `false` and an org publishes a draft
- **THEN** the response is `403` (`PUBLISHING_DISABLED`) and the opportunity stays a draft

#### Scenario: Gate lock unchanged when kill-switch open
- **WHEN** `ops.publishingEnabled` is unset or `true` and the gate is locked by pending count
- **THEN** publish still fails `409` (`PUBLISH_GATE_LOCKED`)

### Requirement: Admin session duration enforcement
`auth.adminSessionDurationDays` (positive integer, default 30) SHALL govern the refresh-session `expiresAt` for newly created admin-role sessions (`now + duration`, TTL index semantics unchanged). Non-admin sessions SHALL keep the `JWT_REFRESH_TTL` behavior. Changing the key SHALL affect only sessions created after the change.

#### Scenario: Admin session honors configured duration
- **WHEN** `auth.adminSessionDurationDays` is `7` and an admin logs in
- **THEN** the new session row expires ~7 days after creation

#### Scenario: Volunteer sessions unaffected
- **WHEN** `auth.adminSessionDurationDays` is `7` and a volunteer logs in
- **THEN** the volunteer session expiry follows `JWT_REFRESH_TTL` as before

### Requirement: Verified-email moderation flag enforcement
`moderation.requireVerifiedEmail` (boolean, default `true`) SHALL govern the email-verified guard with AND-semantics against the existing `EMAIL_VERIFICATION_REQUIRED` env flag: the env flag off keeps the guard open exactly as before; with the env flag on, the default `true` keeps blocking `EMAIL_NOT_VERIFIED` exactly as before, and `false` lets unverified accounts through at runtime (dossier-gated actions such as org verification submission and publishing keep their own verified preconditions).

#### Scenario: Default preserves current behavior
- **WHEN** `moderation.requireVerifiedEmail` is unset or `true` and an unverified account calls a guarded route
- **THEN** the response is `403` (`EMAIL_NOT_VERIFIED`) as before

#### Scenario: Flag relaxed
- **WHEN** `moderation.requireVerifiedEmail` is `false` and an unverified account calls a guarded route
- **THEN** the request passes the email-verified guard

