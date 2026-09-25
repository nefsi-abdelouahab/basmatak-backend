## Context

`system_settings` + `SettingsService` (`backend/src/core/settings`, 30s per-key cache, unique `key` index) exist, but the admin write surface (`backend/src/admin/settings.service.ts`, `KNOWN_SETTING_KEYS`) whitelists exactly one numeric key. Session 3 (notification-prefs, archived) seeded two digest keys (`notifications.digest.enabled=false`, `notifications.digest.intervalDays=7`) with tolerant readers and explicitly deferred whitelist widening to this session. Session 8 (admin-analytics, archived) reads provisional `maintenance.enabled` (fallback `false`) for its queue flag and explicitly deferred canonical ownership here. The publish gate (`trust-publish-gate.service.ts` over the `common/seams` interface) already reads its threshold via `SettingsService`; JWT/refresh TTLs are env-driven (`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`); the email-verified guard runs globally for non-public routes; the audit interceptor covers `/admin/*`. S4 peers: `opportunity-fields` (in-flight, proposal stage, owns opportunities module) and `activity-feed` (new module) — both file-disjoint from core-settings/admin-settings by plan.

## Goals / Non-Goals

**Goals:**
- 16 canonical, validated, admin-writable keys; `maintenance.enabled` canonicalized without renaming (Session 8 compatible); digest keys promoted to admin-writable (Session 3 compatible).
- Runtime enforcement for maintenance, both kill-switches, admin session TTL, and the verified-email flag — all default-preserving (existing tests/suites keep passing).
- Public `GET /system/status` + `POST /admin/ops/maintenance` per the roadmap.

**Non-Goals:**
- Digest delivery job; audit-log retention config; any civic key (dropped, not renamed).
- `moderation.suspendOnReport` enforcement (stored/validated only; Session 20 owns it).
- Server-side enforcement of locale/platform keys (stored/validated; consumed client-side).

## Decisions

### D1 — Canonical key table (proposed; Open Question O1 confirms names/defaults)
Existing untouched: `publishGate.maxPendingOpportunities` (number, 3). Promoted: `notifications.digest.enabled` (bool, false), `notifications.digest.intervalDays` (pos-int, 7). New: `platform.name` (string 1..120, `Basmatak Tatatoua`), `platform.summary` (string ≤500, empty), `platform.contactEmail` (email string, empty allowed), `locale.defaultLanguage` (enum `fr|ar|en`, `fr`), `locale.defaultTimezone` (string, `Africa/Algiers`), `locale.dateFormat` (enum `DD/MM/YYYY|MM/DD/YYYY|YYYY-MM-DD`, `DD/MM/YYYY`), `auth.adminSessionDurationDays` (int 1..90, 30), `moderation.requireVerifiedEmail` (bool, true), `moderation.suspendOnReport` (bool, false), `ops.registrationEnabled` / `ops.publishingEnabled` (bool, true), `maintenance.enabled` (bool, false), `maintenance.message` (string ≤500, empty).
Validation lives in `AdminSettingsService` per-key (replacing the number-only check); `SettingsValueDto.value` widens to `unknown`.

### D2 — Leave Session 3's seeding/readers untouched
`ensureDigestSettings` + `isDigestEnabled`/`digestIntervalDays` stay as-is (absent-only seeding is idempotent and shape-compatible). Core `ensureDefaults` becomes absent-only for all 16 keys. Rationale: no edits to archived Session 3 files, no behavior change.

### D3 — Maintenance pieces live in `core/maintenance`
`MaintenanceService` (state read via `SettingsService`, `setState` with a JobsService-style `inFlight` single-flight mutex), `MaintenanceGuard` (APP_GUARD after `RolesGuard`, before `ThrottlerGuard`; exempts `GET /health`, `GET /system/status`, `/internal/*`, `/admin/*`; non-admin → 503 `MAINTENANCE_MODE` with neutral copy + message), `SystemController` (`GET /system/status`) registered on `CoreModule`. `POST /admin/ops/maintenance` is a thin `AdminModule` controller delegating to `MaintenanceService` (audited by the existing interceptor as `/admin/*`).

### D4 — Kill-switches reuse existing seams, not new middleware
Registration: early check in `AuthService.register` → 403 `REGISTRATION_DISABLED` (auth module has no S4 peer). Publishing: `TrustPublishGateService.evaluate` throws 403 `PUBLISHING_DISABLED` before counting when the flag is off — the throw propagates through the untouched publish path, so `OpportunitiesService` (owned by parallel S4 session `opportunity-fields`, already modified in-tree) needs no same-file edit. Rejected alternative: path-matching guard (fragile, duplicates route knowledge); rejected: a code-mapping line in `publishOpportunity` (would violate S4 file-disjointness — drift flagged per the session rules).

### D5 — Verified-email flag and admin TTL are surgical, default-preserving
`EmailVerifiedGuard` consults `moderation.requireVerifiedEmail` (default true) with AND-semantics against the env flag: env-off behavior is byte-identical, and only an explicit admin `false` relaxes the gate. Admin `expiresAt` uses `auth.adminSessionDurationDays` only for `role==='admin'`; volunteers keep `JWT_REFRESH_TTL`. Non-numeric stored values fall back to the env TTL (tolerant read).

### D6 — Login is gated by maintenance like any non-admin route
No carve-out: during maintenance `POST /auth/login` (non-admin, non-allowlisted) also 503s; existing admin sessions keep working. Rationale: simplest consistent rule, matches "admin unaffected + public 503".

## Risks / Trade-offs

- **[Risk]** S4 peer `opportunity-fields` owns the opportunities module in parallel. **Mitigation:** this change touches no opportunities-module file (kill-switch enforced by throw from the trust seam); verified by `git status` file list before commit.
- **[Risk]** 30s settings cache delays gate visibility. **Mitigation:** every write goes through `SettingsService.set` (refreshes cache); reads-after-write are immediate; worst case is external DB edits (30s staleness, pre-existing).
- **[Risk]** Key names/defaults are proposed, not RP-dictated. **Mitigation:** O1 blocks Phase 2 until confirmed.
- **[Risk]** `MaintenanceGuard` ordering vs auth guards. **Mitigation:** placed after `RolesGuard` so admin identity is resolved; suspended users still 403 first (unchanged precedence).

## Migration Plan

Deploy additive: boot seeds absent keys only; defaults preserve all current behavior (gate on requires explicit admin action). Rollback: revert commit; leftover `system_settings` rows are inert (readers tolerate absence; Session 8 falls back to `false`).

## Open Questions

- **O1 (blocking):** Confirm the D1 key names, types, defaults — especially `locale.*` enums/defaults, `platform.*` defaults, and `auth.adminSessionDurationDays` unit (days vs minutes).
- **O2:** Keep `maintenance.message` (≤500) or drop it and return only the boolean?
- **O3:** Confirm D6 — login 503s during maintenance — or allowlist `/auth/login`?
- **O4 (resolved in Phase 2):** the `publishOpportunity` mapping was dropped — the kill-switch throws from the trust seam, so no S4-peer file is touched.
- **O5:** `notifications.digest.intervalDays` bounds — positive int ≤365, or tighter?
