## 1. Preferences schema and service

- [x] 1.1 Create `backend/src/notifications/schemas/notification-pref.schema.ts`: `userId` (ref users, unique), `prefs` object with six required booleans defaulting `true` (`applicationUpdates`, `reviews`, `verification`, `system`, `digest`, `recordIssued`); S1 base options (timestamps, `versionKey:false`); unique index on `userId`
- [x] 1.2 Create `backend/src/notifications/notification-prefs.service.ts`: `getOwn(userId)` (lean `findOne`, lazy-create `{ userId, prefs: defaults }` on miss with E11000 swallow) and `patchOwn(userId, partial)` (get-or-create then `findOneAndUpdate` merging `$set` per provided key, return full merged `prefs`); method `prefsFor(userId)` returning parsed prefs or defaults for the handler gate
- [x] 1.3 Expose `NOTIFICATION_PREF_KEYS` / defaults constant used by the schema, service, DTO and handler gate (single source of truth)
- [x] 1.4 Wire the prefs model into `backend/src/notifications/notifications.module.ts` (`MongooseModule.forFeature` for the new collection + provider) without reordering existing imports

## 2. DTOs and controller

- [x] 2.1 Create `backend/src/notifications/dto/notification-prefs.dto.ts`: nested `NotificationPrefsDto` (six `@IsBoolean()` optional fields, `@IsOptional` each) + update body wrapper `{ prefs }` with `@ValidateNested`, `@Type`, whitelist + `forbidNonWhitelisted` + transform
- [x] 2.2 Add routes to `backend/src/notifications/notifications.controller.ts`: `GET notifications/preferences` → `{ prefs }` (lazy get-or-create) and `PATCH notifications/preferences` → merged `{ prefs }`; both Auth, caller from JWT `sub`; register DTOs for OpenAPI

## 3. Preference-aware event gating

- [x] 3.1 Add `prefsForType(type)` mapping (`applicationUpdates`, `verification`, `system` buckets; unknown/unmapped → `applicationUpdates`) in a small util or on the prefs service, with unit tests per event name
- [x] 3.2 In `backend/src/notifications/notifications.service.ts` add `createForRecipientIfEnabled(recipientId, type, payload)` that resolves the recipient's prefs (missing → defaults), skips when the mapped key is `false`, otherwise performs the existing idempotent create; keep `createForRecipient` and `createInSession` unchanged
- [x] 3.3 Re-point `NotificationsEventHandlers` calls from `createForRecipient` to `createForRecipientIfEnabled` (all twelve subscribers keep their existing recipient resolution); no handler body logic changes
- [x] 3.4 Measure: assert `GET /notifications/unread-count` keeps the `{ userId, isRead: false }` count shape (no query change); confirm no new index on `notifications`

## 4. Admin digest settings flags (read-only, flag only)

- [x] 4.1 Add a digest-settings read provider in the notifications module (inject exported `SettingsService`): `isDigestEnabled()` default `false`, `digestIntervalDays()` default `7`, tolerant of absent/non-boolean/non-numeric stored values
- [x] 4.2 Seed the two keys idempotently at bootstrap via `SettingsService.set` (`notifications.digest.enabled`, `notifications.digest.intervalDays`) only when absent; do NOT touch `admin/settings.service.ts` whitelist or controller
- [x] 4.3 Wire the digest provider reads into the handler gate or a documented consumption point (flag only; no digest delivery)

## 5. Unit tests

- [x] 5.1 Unit: prefs service — lazy row creation with defaults (and E11000 double-create swallowed), `patchOwn` merges only provided keys, get-or-create then patch
- [x] 5.2 Unit: `prefsForType` mapping — every current event name maps to the documented bucket; an unknown event defaults to `applicationUpdates`
- [x] 5.3 Unit: `createForRecipientIfEnabled` — defaults-on gating (no row → notification created), disabled pref → no row, enabled pref → row created; `createInSession` unaffected by prefs
- [x] 5.4 Unit: DTO validation — unknown pref key rejected 400, non-boolean rejected 400, empty patch/partial accepted, full-six update accepted

## 6. E2E tests

- [x] 6.1 Create `backend/test/notification-prefs.e2e-spec.ts`: `GET /notifications/preferences` on a fresh user returns all-six `true` and persists a row
- [x] 6.2 PATCH turns `verification` off → `submission.verified`/`org.verification.updated` event produces no notification while an `applicationUpdates` event still creates one for the same user
- [x] 6.3 Unknown-key PATCH → 400 and stored prefs unchanged; non-boolean → 400
- [x] 6.4 PATCH then GET round-trip returns the merged prefs; a second user's PATCH cannot affect the first user's row

## 7. Verification and wrap-up

- [x] 7.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green; investigate/record any pre-existing sibling failure
- [x] 7.2 From the repo root: `openspec validate backend-v2-notification-prefs` and `openspec status --change backend-v2-notification-prefs`
- [x] 7.3 `openspec archive backend-v2-notification-prefs -y`
- [x] 7.4 `git add -A` (session scope is notifications-only additions + openspec artifacts; no other modules touched); commit `feat(backend-v2-notification-prefs): preference collection and event-gated notifications`