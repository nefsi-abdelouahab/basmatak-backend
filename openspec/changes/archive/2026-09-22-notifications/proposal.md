## Why

In-app notifications are declared in the inventory (§2.17 routes, module #19, MongoDB-backed, the UI polls `unread-count`) but nothing creates them yet: Sessions 6/7 already emit `application.*`/`participation.*` events on the S1 bus, and Session 7 persists transactional notifications through an inert `NOTIFICATIONS_REPOSITORY` seam (F4), yet there is no `notifications` collection, no routes, and no event subscriber. The marketplace's feedback loop (an org knowing someone applied, a volunteer knowing they were accepted) is missing entirely.

## What Changes

- Add a `notifications` collection with index `(userId, isRead, createdAt)`, owned by a new notifications module.
- Add the four §2.17 routes: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:notificationId/read`, `POST /notifications/read-all`. Read-receipt semantics: PATCH marks exactly that row; nothing is emailed; no WebSocket/push.
- Add a `NotificationsService` (create, list with cursor pagination, unreadCount, markRead, readAll) and a `NotificationsController` + DTOs.
- Add a `NotificationsEventHandlers` registry subscribed to the S1 EventEmitter bus: `application.created` (→ org), `application.accepted|rejected|withdrawn` (→ volunteer), `participation.removed` (→ volunteer), `opportunity.cancelled` (→ participants), `org.verification.updated` (→ org). Handlers are registered NOW for events emitted later — `submission.submitted|verified|rejected`, `publish-gate.locked`, `opportunity.started` — so S10/S11/S13 only need to emit. Events with no handler are ignored.
- Handlers are idempotent: each event instance maps to at most one notification row (dedupe key), so a handler safely receiving the same event twice does not double-notify.
- Swap the inert F4 seam for a Mongo-backed `NotificationsRepository`: transactional flows (S7 accept / withdraw-accepted, later S11 verify) persist notifications inside their transaction via `createInSession`. Dedupe rule: transactional writes go directly through the repository; the bus only handles the non-transactional convenience events — no double-handling.

## Capabilities

### New Capabilities
- `notifications`: the user's notifications inbox — collection + index, the four read routes, read-receipt semantics, and the event-handler registry that translates named domain events into idempotent notification rows, plus the F4 transactional repository the transaction flows write through.

### Modified Capabilities
<!-- No existing requirement changes: the applications/participations specs already assert their in-transaction notification writes (F4), which this session merely backs with a real repository. -->

## Impact

- Backend: new `backend/src/notifications/` module (schema, service, controller, DTOs, event handlers); real provider for the existing `NOTIFICATIONS_REPOSITORY` token in `backend/src/applications/notifications.repository.ts` (DI swap, applications code stays source-compatible); additive wiring in `backend/src/app.module.ts`.
- New E2E `backend/test/notifications.e2e-spec.ts`; unit tests for event→notification mapping, idempotency, and ownership.
- `openspec/specs/notifications`. No new packages or env vars; no schema migration beyond the new collection.