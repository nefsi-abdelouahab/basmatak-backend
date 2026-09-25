## Why

Admin Settings controls have no backend: `PUT /admin/settings/:key` whitelists a single numeric key (`publishGate.maxPendingOpportunities`), so every other control 400s with `UNKNOWN_SETTING_KEY` (RP §3.6#1). Maintenance mode exists only as a provisional read-only flag (`maintenance.enabled`, read by the Session 8 analytics queue with fallback `false`) with no toggle and no enforcement, and there is no public system-status surface beyond `/health` (`{status, version}`).

## What Changes

- Widen the `system_settings` whitelist to 16 canonical keys (platform, locale, session, moderation, ops kill-switches, maintenance, digest) with per-key type validation. `publishGate.maxPendingOpportunities` (threshold 3) stays untouched.
- Canonicalize `maintenance.enabled` (same key name/shape Session 8 reads — its queue stays compatible) plus `maintenance.message` as admin-writable; add `POST /admin/ops/maintenance` (single-flight, mirrors the `internal/jobs` pattern); enforce a runtime maintenance gate (non-admin requests → 503 with neutral copy).
- Add public `GET /system/status` returning `{status, version, uptimeSeconds, maintenance, message}`.
- Enforce `ops.registrationEnabled` (register routes → 403 `REGISTRATION_DISABLED`) and `ops.publishingEnabled` (publish → 403 `PUBLISHING_DISABLED` via a gate-code mapping).
- Enforce `auth.adminSessionDurationDays` on admin refresh-session TTL and `moderation.requireVerifiedEmail` in the email-verified guard (both default-preserving: current behavior unchanged).
- `moderation.suspendOnReport` is stored/validated here and enforced later by Session 20 (`moderation-actions` re-checks these flags). Digest keys `notifications.digest.*` (Session 3, flag-only) become admin-writable; Session 3's readers and seeding stay untouched.
- Anything civic ("DZ-NAT-REG sync", statutory/audit-retention rows) is dropped, not renamed (RP §3.6#1–#4).

## Capabilities

### New Capabilities
- `system-status`: public status endpoint plus maintenance-gate enforcement semantics.

### Modified Capabilities
- `system-settings`: widened 16-key whitelist with per-key types, canonical maintenance keys, idempotent boot defaults.
- `admin`: widened settings-write whitelist (MODIFIED `Admin settings write`) plus the new ops maintenance toggle (ADDED).

## Impact

- Code (all in `/backend`): `core/settings` (idempotent defaults), new `core/maintenance` (service + guard + system controller), `admin/settings.service.ts` + `admin/dto` (per-key validation) + new `admin/ops.controller.ts`, auth register/guard/session-TTL enforcement, trust publish-gate kill-switch short-circuit plus a one-line gate-code mapping in opportunities publish (coordination point with S4 peer `opportunity-fields`, still at proposal stage).
- No new packages or collections; no migrations (absent-only seeding on boot). Session 8's queue read and Session 3's digest readers stay compatible (same key names/shapes).
