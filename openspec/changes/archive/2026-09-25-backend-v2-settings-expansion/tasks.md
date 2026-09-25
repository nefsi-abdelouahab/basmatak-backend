## 1. Settings whitelist and defaults

- [x] 1.1 Widen `KNOWN_SETTING_KEYS` in `backend/src/admin/settings.service.ts` to the 16 canonical keys with a per-key type registry (number/boolean/string/enum/email/bounds); keep `UNKNOWN_SETTING_KEY`/`INVALID_SETTING_VALUE` 400s; widen `SettingsValueDto.value` to `unknown`
- [x] 1.2 Make `SettingsService.ensureDefaults` absent-only for all 16 canonical defaults; never overwrite stored values (keep `publishGate.maxPendingOpportunities` default 3)
- [x] 1.3 Unit-test the whitelist matrix (each key round-trips; each wrong shape 400s; unknown key 400s; digest shapes match Session 3 readers) in `backend/src/admin/settings.service.spec.ts`

## 2. Maintenance core (`core/maintenance`)

- [x] 2.1 Add `MaintenanceService` with cached state read plus single-flight `setState` (mirrors `JobsService.inFlight`), writing through `SettingsService.set`
- [x] 2.2 Add `MaintenanceGuard` (503 `MAINTENANCE_MODE` + neutral copy + stored message; exempts `GET /health`, `GET /system/status`, `/internal/*`, `/admin/*`; admin passes) and register it as APP_GUARD after `RolesGuard`
- [x] 2.1 Add `MaintenanceService` with cached state read plus single-flight `setState` (mirrors `JobsService.inFlight`), writing through `SettingsService.set`
- [x] 2.2 Add `MaintenanceGuard` (503 `MAINTENANCE_MODE` + neutral copy + stored message; exempts `GET /health`, `GET /system/status`, `/internal/*`, `/admin/*`; admin passes) and register it as APP_GUARD after `RolesGuard`
- [x] 2.3 Add public `SystemController` (`GET /system/status` → `{status, version, uptimeSeconds, maintenance, message}`) on `CoreModule`; unit-test guard matrix + status shape

## 3. Admin ops toggle

- [x] 3.1 Add `AdminOpsController` (`POST /admin/ops/maintenance {enabled, message?}`, admin-only, `whitelist`+`forbidNonWhitelisted`) delegating to `MaintenanceService`; register in `AdminModule` (audit comes from the existing `/admin/*` interceptor)
- [x] 3.2 Unit-test the toggle (on/off round-trip, invalid body 400, non-admin 403, concurrent calls single-flight)

## 4. Kill-switch and flag enforcement

- [x] 4.1 Gate `AuthService.register` on `ops.registrationEnabled` → 403 `REGISTRATION_DISABLED` before any write (default `true` = unchanged)
- [x] 4.2 Short-circuit `TrustPublishGateService.evaluate` to throw 403 `PUBLISHING_DISABLED` when `ops.publishingEnabled` is `false` (no `OpportunitiesService` edit — S4 peer file, drift rule)
- [x] 4.3 Read `moderation.requireVerifiedEmail` (default `true`) in `EmailVerifiedGuard`; read `auth.adminSessionDurationDays` (default 30) for admin-role session `expiresAt` in `AuthService`
- [x] 4.4 Unit-test each enforcement (kill-switches on/off, guard flag both ways, admin vs volunteer TTL, defaults preserve behavior)

## 5. E2E coverage (`/backend`)

- [x] 5.1 Settings round-trip across all 16 keys (list shows seeded defaults; per-key upsert + immediate read; unknown/wrong-shape 400)
- [x] 5.2 Maintenance matrix: on → guest/volunteer reads+writes 503 with message, `GET /system/status` 200 `maintenance:true`, `/health` 200, admin routes 200, queue `maintenanceMode:true`; off → everything normal without restart
- [x] 5.3 Kill-switches: registration off → 403 `REGISTRATION_DISABLED` (no user row); publishing off → 403 `PUBLISHING_DISABLED` (draft stays); gate-locked with switch open → still 409 `PUBLISH_GATE_LOCKED` (covered by the existing core-loop S13 regression e2e)

## 6. Verification and archive prep

- [x] 6.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; from repo root: `openspec validate backend-v2-settings-expansion` (Phase 2 only — needs O1–O5 confirmed first)
