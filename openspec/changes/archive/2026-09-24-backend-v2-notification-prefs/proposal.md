## Why

The notifications module ships creation, read and read-receipts, but no per-user control surface: every domain event writes a notification for every recipient regardless of their wishes, and the Org Settings "notification toggles" screens have no backend to persist against (design conflict: "notification prefs (6 toggles) — no preference/persist API"). The reconciliation plan (RP Part 7 notifications row + RP §2.9#5) needs `notification_prefs` and `GET/PATCH /notifications/preferences`, and Admin Settings' notification-digest toggles (RP §3.6#5) need to surface as stored settings keys — flag only, no digest job (out-of-scope free-tier).

## What Changes

- Add a `notification_prefs` collection `{userId: unique, prefs: {applicationUpdates:bool, reviews:bool, verification:bool, system:bool, digest:bool, recordIssued:bool}}` with all defaults **on**, owned by the notifications module.
- Add `GET /notifications/preferences` (Auth) — returns the caller's prefs, creating the row lazily with defaults on first read (get-or-create).
- Add `PATCH /notifications/preferences` (Auth) — patches only the six whitelisted keys; unknown keys or non-boolean values are rejected `400` (`forbidNonWhitelisted`, false-true only); no delete support.
- Make `NotificationsEventHandlers` preference-aware: each event maps to a pref type and the handler skips the write when that type is off; a missing prefs row means defaults (write normally).
- Surface the Admin Settings notification-digest toggle as stored settings keys in `system_settings` (read values, flag only — no digest delivery build).
- Keep `GET /notifications/unread-count` index-cheap (unchanged query shape; prefs gating happens at write time, not read time).

## Capabilities

### New Capabilities
- `notification-prefs`: the `notification_prefs` collection, the `GET/PATCH /notifications/preferences` routes with lazy get-or-create, the six-key whitelist and patch validation, and specificity.

### Modified Capabilities
- `notifications`: the `NotificationsEventHandlers` behavior changes — an event whose mapped pref type is disabled no longer creates a row (defaults-on when the prefs row is absent); digest toggles surface as settings keys instead of creating notifications.

## Impact

- Backend: new files in `backend/src/notifications/` (prefs schema, service, controller, DTOs); `notifications-event-handlers.ts` gains the prefs gate; the notifications module wires the prefs model. Admin digest settings keys are read through `SettingsService` (`core/settings`, read-only, global module already exports it).
- New unit specs for prefs gating, lazily-created rows, DTO rejection; new e2e `backend/test/notification-prefs.e2e-spec.ts`.
- `openspec/specs/notification-prefs` (new) + `openspec/specs/notifications` (delta). No new packages, env vars, or route changes outside the two preferences routes. No schema migration beyond the new (small, indexed) collection.