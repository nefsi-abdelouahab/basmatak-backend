## 1. Model and repository

- [x] 1.1 Create `backend/src/notifications/schemas/notification.schema.ts`: `userId` (ref users), `type` (DomainEvents name), `payload` (Mixed, optional), `isRead` (default `false`), `readAt?`, `dedupeKey?`; S1 base options (timestamps, `versionKey:false`, `toJSON` ObjectId→string); indexes `(userId, isRead, createdAt)` and unique partial `{ dedupeKey: 1 }` (`partialFilterExpression: { dedupeKey: { $exists: true } }`)
- [x] 1.2 Create `backend/src/notifications/notifications.module.ts`: `MongooseModule.forFeature` for `NotificationsCollection`, providers for service/repository/handlers, exports `MongooseModule` (so the applications module can resolve the model)
- [x] 1.3 Implement the shared dedupe-key helper `buildNotificationKey(type, payload, recipientId)` (e.g. `notifications-key.util.ts`): extract the stable entity id from the payload (`applicationId`, `submissionId`, `participationId`, `opportunityId`, `organizationId` — whichever the type's payload carries) → `"${type}:${recipientId}:${entityId}"`; random-instance fallback when no entity id is present
- [x] 1.4 Implement `MongoNotificationsRepository` in `backend/src/notifications/notifications.repository.ts` implementing the `NotificationsRepository` interface from the applications seam file: `createInSession(notification, session)` derives `dedupeKey` via the shared helper and inserts the row inside the passed `ClientSession`
- [x] 1.5 Swap the F4 seam in `backend/src/applications/applications.module.ts`: import `NotificationsModule`, change the `NOTIFICATIONS_REPOSITORY` binding from `useExisting: InertNotificationsRepository` to `useClass: MongoNotificationsRepository`, delete the inert class + its provider entry; `applications.service.ts` stays unchanged (it already injects the token)

## 2. Service, controller, DTOs

- [x] 2.1 Implement `NotificationsService`: `createForRecipient` (bus path — derives key, swallows E11000), `createInSession` (delegates to the repository), `list(userId, limit, cursor)` (newest-first, cursor-paginated, only the caller's rows), `unreadCount`, `markRead(userId, notificationId)` (ownership), `readAll(userId)`
- [x] 2.2 Create `backend/src/notifications/dto/notification.dto.ts`: `NotificationListQueryDto` (`limit`, `cursor`, class-validator whitelist/forbidNonWhitelisted) and the response/`CursorPage` shape; business error `NOTIFICATION_NOT_FOUND` (404)
- [x] 2.3 Implement `NotificationsController` with the four §2.17 routes: `GET /notifications`, `GET /notifications/unread-count` → `{ count }`, `PATCH /notifications/:notificationId/read`, `POST /notifications/read-all` → `{ updated }`; all `Auth`, caller from JWT `sub`
- [x] 2.4 Register `NotificationsModule` additively in `backend/src/app.module.ts` (re-read the file first; two lines only, existing style preserved)

## 3. Event handlers

- [x] 3.1 Create `NotificationsEventHandlers` (`@OnEvent` subscribers, registered in the notifications module): `application.created` → notification to the owning org account (resolve `organizations.userId` from `application.organizationId`), `application.rejected` → to the applying volunteer
- [x] 3.2 `application.accepted` and `application.withdrawn` handlers → to the applying volunteer; rely on the shared dedupe key so the S7 in-transaction rows (accept, withdraw-accepted) are not duplicated by the post-commit event
- [x] 3.3 `participation.removed` → to the participant volunteer (`participant.volunteerId`)
- [x] 3.4 `opportunity.cancelled` and `opportunity.started` → one notification to each `task_participants` row of the opportunity with `status in (accepted, active)`
- [x] 3.5 Forward registrations (already registered now, no-op until later sessions emit): `org.verification.updated` → org account; `submission.submitted` → org account; `submission.verified`/`submission.rejected` → submitting volunteer; `publish-gate.locked` → org account
- [x] 3.6 Every handler: sets `type` to the exact `DomainEvents` name, passes the event payload through, catches the dedupe `E11000`, and never emits an event itself (no circular writes)

## 4. Unit tests

- [x] 4.1 Unit: `buildNotificationKey` — deterministic per `(type, entity, recipient)`, correct entity extraction for each event payload shape, random fallback distinct per instance
- [x] 4.2 Unit: `MongoNotificationsRepository.createInSession` — row committed inside a transaction persists; aborted transaction leaves no row (replica-set rig); duplicate `dedupeKey` is an inert error
- [x] 4.3 Unit: `NotificationsService` — list pagination (`limit` default 20/max 50, cursor, newest-first, only own rows), `unreadCount`, `markRead` ownership (foreign → 404), idempotent re-mark, `readAll` scoping
- [x] 4.4 Unit: event handlers — event→notification mapping (recipient, `type`, payload); same event delivered twice → one row; transactional-write-then-bus-event → one row (F4 dedupe); unregistered event → no row and no error; handlers emit nothing

## 5. E2E tests

- [x] 5.1 Create `backend/test/notifications.e2e-spec.ts`: seed org + volunteer; emit `application.created` via the injected `EventEmitter2` → org account lists it via `GET /notifications` and `unread-count` is 1
- [x] 5.2 Real apply+accept path: volunteer applies to a published opportunity and the org accepts → the volunteer receives exactly one `application.accepted` notification
- [x] 5.3 `PATCH /notifications/:notificationId/read` marks exactly that row (isRead + readAt); re-mark succeeds; a foreign user's PATCH → 404 and the row stays unread
- [x] 5.4 `POST /notifications/read-all` zeroes the caller's `unread-count` and does not touch another user's rows; cursor pagination returns consistent windows

## 6. Verification and wrap-up

- [x] 6.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green; investigate and resolve/record any pre-existing sibling failure (S8 noted `opportunities.e2e-spec.ts` failing 2 tests due to the S7 `task_participants` unique `applicationId` index vs S6 raw seeds)
- [x] 6.2 From the repo root: `openspec validate notifications` and `openspec status --change notifications`
- [x] 6.3 `openspec archive notifications -y`
- [x] 6.4 `git add` selectively (backend/src/notifications/**, backend/test/notifications.e2e-spec.ts, the `notifications.repository.ts`/`applications.module.ts` seam swap, backend/src/app.module.ts, openspec specs + archive artifacts); never `git add -A`; leave `openspec/changes/my-opportunities-page/` and anything under `applications*`/`test/applications*` untouched; commit `feat(notifications): event-driven in-app notifications`