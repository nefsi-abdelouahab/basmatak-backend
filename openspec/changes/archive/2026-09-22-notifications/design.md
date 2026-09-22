## Context

Sessions 1–8 shipped the substrate this session plugs into: the S1 in-process EventEmitter with a named `DomainEvents` map (`backend/src/common/constants/domain-events.ts`), the cursor-pagination helpers (`common/pagination/*`), and the F4 seam — a `NOTIFICATIONS_REPOSITORY` token + `NotificationsRepository` interface declared in `backend/src/applications/notifications.repository.ts`, currently bound to an `InertNotificationsRepository` that no-ops. S6/S7 already emit the convenience events (`application.created|accepted|rejected|withdrawn`, `participation.withdrawn|removed`, `opportunity.cancelled`, `opportunity.started`), and S7's accept and withdraw-accepted transactions already call `createInSession({ recipientId, type, payload }, txn)` inside `session.withTransaction`. There is no `notifications` collection, no module, and no subscriber — the inventory's four §2.17 routes and the whole in-app notification surface are unimplemented.

The session's hard constraints: idempotent handlers (same event twice → one notification), register handlers *now* for events emitted later (`submission.*`, `publish-gate.locked`, `opportunity.started`) so S10/S11/S13 only emit, and the F4 dedupe rule — transactional flows write their notification inside the transaction and must NOT also cross the bus.

## Goals / Non-Goals

**Goals:**
- A `notifications` collection with the §3 `(userId, isRead, createdAt)` index plus the idempotency index, and a Mongoose model following the S1 base options.
- The four §2.17 routes with S1 cursor pagination and per-user scare (list, unread-count, mark-one-read, read-all), 404-for-foreign convention per §6.
- A `NotificationsEventHandlers` registry on the global bus covering every named event at session scope, idempotent, with forward registrations for S10/S11/S13.
- The real `NOTIFICATIONS_REPOSITORY` implementation swapping in for S7's inert default so transactional notifications become real rows atomically.
- Tests on the replica-set rig proving notification-tx atomicity, idempotency, and route behavior.

**Non-Goals:**
- WebSocket/push/email notifications, notification preferences, anything beyond cursor pagination (session scope).
- Any new package, env var, or route beyond §2.17.
- Touch on other sessions' collections beyond reading them for recipient lookup (`organizations`, `task_participants` are read-only here).
- Changing the already-emitted event names or payload shapes in S6/S7 modules.

## Decisions

**D1 — Module layout.** New `backend/src/notifications/`:
- `schemas/notification.schema.ts` — `{ userId, type, payload (Mixed), isRead, readAt, dedupeKey }` + timestamps; indexes `(userId, isRead, createdAt)` and unique partial `dedupeKey`.
- `notifications.repository.ts` — the real `MongoNotificationsRepository` implementing the F4 interface (imports `NotificationsRepository`/`NOTIFICATIONS_REPOSITORY` from the applications seam file unchanged).
- `notifications.service.ts` — `createForRecipient`, `createInSession` (delegates to the repository), `list`, `unreadCount`, `markRead`, `readAll`.
- `notifications.controller.ts` + `dto/notification.dto.ts` — list/unread-count/PATCH read/read-all.
- `notifications-event-handlers.ts` — `@OnEvent` subscribers.
- `notifications.module.ts` — the composition root; exports `MongooseModule` (so `applications.module.ts` can resolve the model) so the real repository provider is usable in the applications module's injector scope.

**D2 — Dedupe key derivation is shared between repository and handlers.** Both the mongodb repository's `createInSession` and the bus handlers produce the same key: `dedupeKey = "${type}:${recipientId}:${entityId}"` where `entityId` is extracted from the payload by looking up the stable business id (`applicationId`, `submissionId`, `participationId`, `opportunityId`, `organizationId` — whichever the type's payload carries). A single `notificationKey(type, payload, recipientId)` helper in the notifications module is the only place this is computed. Why it works: S7's in-transaction rows already carry `payload: { applicationId }` and `type: application.accepted` / `application.withdrawn`, so the row's `dedupeKey` lands on exactly the key the post-commit `application.accepted` handler derives for the same volunteer → the handler's insert collides on the unique partial index (E11000) and is swallowed. Handlers catch that E11000 and move on; it is the enforcement of both idempotency and the F4 dedupe rule. Events that carry no stable entity id (none in this session's set) would fall back to a random instance id so a single emit still produces exactly one row.

**D3 — F4 seam swap is a binding change in `applications.module.ts`.** The token and interface stay where S7 imports them (`applications/notifications.repository.ts`); `MongoNotificationsRepository` lives in the notifications module. `applications.module.ts` changes its provider entry from `{ provide: NOTIFICATIONS_REPOSITORY, useExisting: InertNotificationsRepository }` to `{ provide: NOTIFICATIONS_REPOSITORY, useClass: MongoNotificationsRepository }`, imports `NotificationsModule`, and the now-unused inert class/provider is deleted. `applications.service.ts` is untouched (it already injects the token). The import DAG stays acyclic: `notifications → participations + organizations` (read models), `applications → notifications`. Alternative considered — moving the token/interface into `src/notifications/` — rejected: it would force import edits in S7's already-committed service for zero behavior gain (the seam file location is an implementation detail, and the specs only call out the token contract).

**D4 — Events, recipients and lookups.** `NotificationsEventHandlers` subscribes via `@OnEvent` to the session's list, mapping:
- `application.created` → org account (`organizations.userId`, query `organizations` by `application.organizationId`);
- `application.accepted|rejected|withdrawn` → `application.volunteerId` (accepted/withdrawn are post-commit conveniences that dedupe against the in-transaction row per D2);
- `participation.removed` → `participant.volunteerId`;
- `opportunity.cancelled|started` → every `task_participants` row of the opportunity with `status in (accepted,active)` (the started handler is registered now and will fire from the S6 ticker);
- `org.verification.updated` → org account (`organizations.userId` from `organizationId`);
- `submission.submitted` → org account; `submission.verified|rejected` → volunteer; `publish-gate.locked` → org account — registered now, no-op until S10/S11/S13 emit.
Notification `type` is exactly the `DomainEvents` name; `payload` is passed through so the UI can render context. Handlers never emit events themselves. Models are read via `MongooseModule.forFeature` re-registration of the `TaskParticipantsCollection` and `OrganizationsCollection` schemas (the export of `MongooseModule` by participations/organizations is the precedent S7/S8 already rely on).

**D5 — Controller semantics (all four §2.17 routes).** `GET /notifications` returns `CursorPage<NotificationDto>` newest-first, `limit` (S1 default 20/max 50) + `cursor` (encode/decode via `common/pagination/pagination.util.ts`), scoped `{ userId: caller }` with `_id < decodedCursor` ordering. `GET /notifications/unread-count` returns `{ count }` from a `countDocuments({ userId, isRead: false })` (index-served). `PATCH /notifications/:notificationId/read` is a `findOneAndUpdate({ _id, userId: caller }, { $set: { isRead: true, readAt: now } })`; no match → 404 `NOTIFICATION_NOT_FOUND` (idempotent re-mark of an own already-read row still matches the query, so it returns 200 without changing anything). `POST /notifications/read-all` is `updateMany({ userId: caller, isRead: false }, { $set: { isRead: true, readAt: now } })`, returning `{ updated }`. All routes take the caller from the JWT `sub`; no role beyond `Auth`. Alternative considered — a single `read-all` + global read timestamp — rejected: the inventory's per-row `isRead` + `unread-count` contract is the poll model, and the spec pins mark-read to one row.

## Risks / Trade-offs

- **E11000 swallowing as the idempotency mechanism** is only as good as the key derivation staying shared. If a future transactional session (S11 verify) passes a payload without the entity id the helper expects, the row would carry a random key and the post-commit handler would duplicate. → The `notificationKey` helper is a single exported function with a targeted unit test per event type, and this session's tasks spell out the payload→entityId mapping each handler must use.
- **Reading `organizations`/`task_participants` inside an event handler adds reads on the hot path** (an `opportunity.cancelled` fans out one notification per participant). MVP scale is fine (inventory §10); in-process bus means no cross-process consistency issues. → Keep lookups single-doc/single-query; no `$lookup` aggregations.
- **`notifications` module import ordering in `app.module.ts`.** Sibling archives warn wiring must stay additive. → Add `NotificationsModule` to the imports list without reordering existing modules; the full build/e2e gate flags any shadowing.
- **Transactional rows are written before the post-commit event fires.** A crash between commit and the bus emit leaves the row (good — the notification outlives the event), and the bus handler later would collide on the key (no-op). The opposite ordering cannot happen because `createInSession` is inside the transaction, so there is no missing-notification window where the event fires first.
- **Handlers run synchronously on the emitter** (S1 bus is in-process, no queue). A slow handler would block the emit. → Handlers only do a create-statement plus at most one recipient lookup; acceptable, and matches the roadmap's explicit no-queues constraint.

## Migration Plan

New `notifications` collection only — indexes created on first boot (`autoIndex` is on for the test rig and local dev; Atlas index build is a background warm-up like every prior session). No existing data touched. `app.module.ts` gets one additive import; `applications.module.ts` gets the seam binding swap. Rollback: revert this session's single commit; the applications module reverts to the inert seam and nothing else depends on the collection.

## Open Questions

- None blocking. Post-implementation watch item: S11's verify transaction must derive its `dedupeKey` from `submissionId` in its `createInSession` payload — the helper already supports it, but the S11 author should assert the payload carries `submissionId` (noted in tasks).