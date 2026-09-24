## Context

The notifications module (archived v1 change `notifications`) owns the `notifications` collection, the four inbox routes, and a `NotificationsEventHandlers` registry subscribed to the global EventEmitter: it resolves a recipient per event (org account via `organizations.userId`, volunteer via `application.volunteerId`/`submission.volunteerId`, participants via `task_participants`) and inserts an idempotent row through `NotificationsService.createForRecipient`. There is no per-user control surface: every event writes to every mapped recipient unconditionally.

The reconciliation plan (RP Part 7 notifications row; RP §2.9#5; RP §3.6#5) requires the Settings screens' toggles to be real: a per-user `notification_prefs` collection and `GET/PATCH /notifications/preferences`, plus Admin Settings' notification-digest toggles surfacing as stored `system_settings` keys (flag only — the digest *job* is explicitly out of scope, free-tier). The `SettingsService` (`core/settings`, global module) already reads/writes `system_settings` with a 30s per-key cache. Admin writes settings via `PUT /admin/settings/:key` (`admin/settings.service.ts`, whitelist `KNOWN_SETTING_KEYS`) — owned by `settings-expansion` (Session 13); this session only needs the settings keys to **exist and be readable**, so it seeds defaults through `SettingsService.set` and reads them; it does not touch the admin controller/whitelist.

## Goals / Non-Goals

**Goals:**
- `notification_prefs` row per user, unique `userId`, six boolean prefs defaulting on, timestamped.
- `GET/PATCH /notifications/preferences` (Auth): lazy get-or-create, six-key patch whitelist, `400` on unknown key/non-boolean.
- `NotificationsEventHandlers` gates writes by pref type; missing row = defaults on.
- Admin notification-digest settings keys seeded/readable in `system_settings` (flag only).
- `GET /notifications/unread-count` stays index-cheap (no read-path change).

**Non-Goals:**
- The email/preference **digests job** (only flags are stored/read).
- `POST /admin/users/:userId/notice` (owned by `moderation-actions`, Session 20).
- Deleting preferences (no delete route).
- Widening the admin settings whitelist/controller (Session 13).
- Touching other sessions' modules (media/portfolio/applications/auth/users/... untouched; only `notifications` + read-only `system_settings`).

## Decisions

**D1 — Pref types and event mapping.** The six toggle keys are `applicationUpdates`, `reviews`, `verification`, `system`, `digest`, `recordIssued` (roadmap). Three of them gate current events; the other three are persisted toggles only:
- `applicationUpdates` → application.created/accepted/rejected/withdrawn, participation.removed, opportunity.cancelled, opportunity.started.
- `verification` → org.verification.updated, submission.submitted/verified/rejected.
- `system` → publish-gate.locked.
- `reviews`, `digest`, `recordIssued` → no current event maps to them (they are stored for the matching settings screens; digest additionally surfaces the admin settings flag). Kept in the prefs object so the UI toggles and future sessions (e.g. activity/reviews) never need a migration.

**D2 — Event→pref-type resolution is derived from the notification type.** Handlers currently pass `DomainEvents.X` as `type`. In the gate, `NotifPrefType` is derived from the `type` string via a single mapping function (`prefsForType(type)`), so every existing handler path gains gating without rewriting each handler's body: `NotificationsService.createForRecipient` becomes `createForRecipientIfEnabled(recipientId, type, payload)` which (a) resolves the recipient's prefs row with a lean `findOne({ userId })` (missing → defaults), (b) maps `type` → pref key, (c) skips when the key is `false`, (d) otherwise performs the existing idempotent create via `dedupeKey`. Transactional path `createInSession` is **unchanged** — prefs are not consulted inside Mongo transactions (F4 in-txn notifications for accept/withdraw/verify flows are state-changing records the volunteer/org must keep; the roadmap gates *event handlers*, not transactional reads). Alternative considered — a per-handler `@Pref('applicationUpdates')` decorator — rejected: it scatters the mapping across 12 subscribers and couples the decorator to the service; a single mapping function keeps the contract testable in one place.

**D3 — Prefs collection + get-or-create.** New `notification-prefs` folder under `src/notifications/`: `schemas/notification-pref.schema.ts` (`userId` unique index, `prefs` object with six required booleans defaulting `true`, S1 base options), `notification-prefs.service.ts` (`getOwn(userId)` lazy-create with `create` + duplicate-key swallow; `patchOwn(userId, partial)` = get-or-create then `findOneAndUpdate` merging via `$set` on each provided key), `dto/notification-prefs.dto.ts` (nested `PrefsDto` with six `@IsBoolean()` fields + `@IsOptional`, outer `@ValidateNested` + `forbidNonWhitelisted`; class-transformer `Type`), controller routes under `notifications/preferences`. Lazy-create swallows E11000 so two concurrent first reads yield one row (already same pattern in `NotificationsService`).

**D4 — Patch semantics.** `PATCH /notifications/preferences` body `{ prefs: { <key>: bool } }`; the DTO restricts to the six keys with booleans; service merges `$set` per key and returns the full post-merge `prefs`. Contrast with `PATCH :id/read` (existing): prefs have no id path — one row per user, so the patch targets the user's own row (JWT `sub`). Unknown key or non-boolean → `400` via class-validator whitelist.

**D5 — Admin digest settings keys (flag only).** Seed two keys via `SettingsService.set` at bootstrap (idempotent) and read them through the same service with defaults when absent: `notifications.digest.enabled` (boolean, default `false` — global switch) and `notifications.digest.intervalDays` (number, default `7`). The notifications module injects `SettingsService` (exported by the global `CoreModule`) and reads them in a small `DigestSettingsProvider` (get-only). No admin whitelist/controller change here — Session 13 widens `KNOWN_SETTING_KEYS` and removes the need for `ensureDefaults` seeding; until then the keys are readable and default-filled if never written. Reads are tolerant: absent key → default; non-boolean/non-numeric stored value → default (settings are Mixed).

**D6 — unread-count unchanged.** Gating happens at write time only; `unreadCount` still `countDocuments({ userId, isRead: false })` on the existing index. No new index needed beyond unique `userId` on `notification_prefs`.

## Risks / Trade-offs

- **Transactional notifications ignore prefs (D2).** Accept/withdraw/verify flows write notifications inside their Mongo transaction and never cross the bus; those rows are not gated, so a user who disabled `applicationUpdates` still sees an accept notification. → Trade-off accepted: gating transactional writes would require prefs lookups inside transactions and risks silent notification loss on state-changing actions; the roadmap scopes gating to *event handlers*.
- **Lazy-create race.** Two concurrent first reads could both hit "missing row". → Swallow E11000 on create; both callers read the same merged row next.
- **GAN (global any now) `type` string mapping drift.** A future event added without a pref mapping would default to `applicationUpdates` (the safest bucket) rather than never writing. → `prefsForType` returns `applicationUpdates` as the default bucket; documented and unit-tested.
- **Digest settings without an admin write target.** Until Session 13, the seeded keys exist but only admins calling the DB see them (admin API whitelist still single-key). → Accepted: the roadmap splits "keys exist/readable" (here) from "admin settings surface widened" (Session 13). No runtime dependency on Session 13.

## Migration Plan

New `notification_prefs` collection only; unique `userId` index created on first boot (`autoIndex`). Two digest setting keys seeded idempotently through `SettingsService.set`. No existing data touched, no index changes on `notifications`. Rollback: revert the single commit; rows left in `notification_prefs` are inert (nothing else reads them once the gate is gone).

## Open Questions

- None blocking. The `reviews` pref key has no emitting event yet; when `reviews`-type notifications appear (none in this roadmap's module list), the sender session must call `createForRecipientIfEnabled` with the matching type so gating applies.