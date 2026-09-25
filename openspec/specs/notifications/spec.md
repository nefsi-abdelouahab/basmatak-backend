# notifications Specification

## Purpose
Notifications: in-app notifications created by domain events over an in-process EventEmitter (new application, accept/reject, submission submitted/verified/rejected, org verification result, opportunity cancelled, gate locked), read via cursor-paginated listing and per-user read/unread tracking.
## Requirements
### Requirement: Notifications collection
The system SHALL maintain a `notifications` collection owned by the notifications module (inventory §3, module #19, P1 in-app only). Each document SHALL carry `userId` (the recipient's `users._id`), `type` (the originating domain-event name, e.g. `application.accepted`), an optional `payload` (the event data copied through so the UI can render context), `isRead` (boolean, default `false`), `readAt` (set when the row is marked read, otherwise absent), and an optional `dedupeKey` backing idempotency. Documents SHALL be timestamped (Schema `toJSON` transforms `_id` to string, `versionKey:false`, as per the S1 base options). Indexes SHALL include `(userId, isRead, createdAt)` per §3 and a unique index on `dedupeKey` (partial, so rows without a key are allowed). Database rows SHALL be created either from a domain event through the event bus or inside a Mongo transaction through the `NOTIFICATIONS_REPOSITORY` seam — never both for the same flow (F4 dedupe rule).

#### Scenario: New rows are per-user and unread
- **WHEN** a notification row is created for a recipient
- **THEN** it is scoped to that `userId`, `isRead` is `false`, `readAt` is absent, and it is queryable via the `(userId, isRead, createdAt)` index

#### Scenario: Unique dedupe key rejects a second row
- **WHEN** a `create` attempt supplies a `dedupeKey` that already exists
- **THEN** the unique index rejects the duplicate (swallowed as a no-op by callers, never surfaced as a 500)

### Requirement: List own notifications
The system SHALL expose `GET /notifications` (authenticated). It SHALL return only the caller's own rows, newest first, cursor-paginated with the S1 convention (default limit 20, max 50, `?limit=&cursor=`). A caller SHALL never observe any other user's rows in the response.

#### Scenario: Own notifications are listed newest-first
- **WHEN** an authenticated user requests `GET /notifications`
- **THEN** the response contains only rows with `userId` equal to the caller, ordered by `createdAt` desc, paginated by the cursor convention

#### Scenario: Foreign rows never leak into the list
- **WHEN** a user lists notifications and another user has notifications rows
- **THEN** the response contains none of the other user's rows regardless of pagination depth

### Requirement: Unread count
The system SHALL expose `GET /notifications/unread-count` (authenticated) returning `{ count }` where count is the number of the caller's rows with `isRead=false`, served cheaply by the `(userId, isRead, createdAt)` index.

#### Scenario: Unread count reflects read state
- **WHEN** a user has `n` unread notifications, marks one read, and calls `unread-count`
- **THEN** count returns `n - 1`

#### Scenario: Read-all zeroes the count
- **WHEN** a user calls `POST /notifications/read-all` then `GET /notifications/unread-count`
- **THEN** count returns `0`

### Requirement: Mark one notification read
The system SHALL expose `PATCH /notifications/:notificationId/read` (authenticated). It SHALL mark exactly that notification row read: `isRead=true` and `readAt` set. Marking an already-read row SHALL succeed without error (idempotent). Only the row's recipient may mark it; any other caller SHALL receive a `404` (non-owner treated as not-found, inventory §6 visibility convention).

#### Scenario: Recipient marks a row read
- **WHEN** the owning user PATCHes a notification's `/read`
- **THEN** that single row becomes `isRead=true` with `readAt` set, and no other row changes

#### Scenario: Re-marking an already-read row is harmless
- **WHEN** a user PATCHes `/read` on a row that is already read
- **THEN** the request succeeds with no state change and no error

#### Scenario: Foreign user cannot read another's notification
- **WHEN** a user PATCHes `/read` on a notification whose `userId` is someone else's
- **THEN** the request fails `404` and the row stays unread

### Requirement: Read all notifications
The system SHALL expose `POST /notifications/read-all` (authenticated) which marks every one of the caller's unread rows read (`isRead=true`, `readAt` set). It SHALL affect only the caller's rows and SHALL return an acknowledgement (e.g. the number of rows updated).

#### Scenario: Read-all flips every own unread row
- **WHEN** a user with unread notifications calls `POST /notifications/read-all`
- **THEN** all of that user's rows become read and rows belonging to other users are untouched

### Requirement: Domain-event notification handlers

The system SHALL register a `NotificationsEventHandlers` registry on the S1 global EventEmitter bus at bootstrap, subscribing to the named events in `DomainEvents` and translating each into at most one notification row. Each notification type SHALL map to exactly one preference type: `applicationUpdates`, `verification`, or `system`. Before creating a row the handler SHALL resolve the recipient's `notification_prefs` row (missing row = all-defaults-on) and skip the write when the mapped preference type is `false`. `reviews`, `digest`, and `recordIssued` preference keys SHALL NOT gate any current event (no event maps to them); they are persisted toggles only. The concrete event→type→recipient mappings:

- `applicationUpdates` — `application.created` → the owning organization's account (`organizations.userId`); `application.accepted`, `application.rejected`, `application.withdrawn` → the applying volunteer; `participation.removed` → the participant volunteer; `opportunity.cancelled`, `opportunity.started` → each participant of the opportunity whose `task_participants.status` is `accepted` or `active`;
- `verification` — `org.verification.updated` → the organization account; `submission.submitted` → the owning organization; `submission.verified`, `submission.rejected` → the submitting volunteer;
- `system` — `publish-gate.locked` → the publishing organization.

The `notification.type` SHALL be the event name; `payload` SHALL be the event payload. Handlers SHALL NOT emit events of their own (no circular writes). Any event on the bus with no registered handler SHALL be ignored.

#### Scenario: Application event notifies the recipient

- **WHEN** `application.created` / `application.accepted` / `application.rejected` / `application.withdrawn` / `participation.removed` fires and the recipient's `applicationUpdates` pref is on (or they have no prefs row)
- **THEN** one notification is created for the mapped recipient with `type` equal to the event name
- **AND** the org-facing recipients (application.created, submission.submitted, publish-gate.locked) resolve the organization account via `organizations.userId`

#### Scenario: Opportunity cancel notifies every live participant

- **WHEN** `opportunity.cancelled` fires for an opportunity with multiple `accepted`/`active` participants
- **THEN** each such participant with `applicationUpdates` on receives one notification

#### Scenario: Forward-registered handlers wake up when events start firing

- **WHEN** `submission.submitted`, `submission.verified`, `submission.rejected`, `opportunity.started`, or `publish-gate.locked` fires in a later session
- **THEN** the already-registered handler produces the notification without any code change in the notifications module (subject to the recipient's prefs)

#### Scenario: Unhandled events are ignored

- **WHEN** an event with no matching handler is emitted on the bus
- **THEN** no notification row is created and no error is raised

#### Scenario: Disabled preference type suppresses the notification

- **WHEN** an event fires whose mapped preference type is `false` for the recipient
- **THEN** no notification row is created for that recipient and the event is otherwise ignored

#### Scenario: Missing preference row behaves as all-on

- **WHEN** an event fires for a recipient with no `notification_prefs` row
- **THEN** a notification is created (defaults-on gating)

#### Scenario: Preference gating keeps unread-count cheap

- **WHEN** users disable preference types and notifications continue to be created for enabled types
- **THEN** `GET /notifications/unread-count` keeps the same `{ userId, isRead: false }` query shape served by the `(userId, isRead, createdAt)` index (gating never changes the read path)

### Requirement: Idempotent processing and the F4 dedupe rule
Handlers SHALL be idempotent: receiving the same event instance twice SHALL produce at most one notification row, enforced by a `dedupeKey` derived from `(event type, entity id, recipient)` — e.g. `application.accepted:<applicationId>:<volunteerId>`. Transactional flows (accept application, withdraw accepted application, and later the verify transaction) SHALL persist their notification row inside the Mongo transaction through `NotificationsRepository.createInSession` (F4) and SHALL NOT also cross the bus: the handler for a transactional event SHALL derive the same `dedupeKey` as the in-transaction write so its post-commit insert hits the unique index and is swallowed. Neither double-handling nor a duplicated notification SHALL occur.

#### Scenario: Same event delivered twice yields one notification
- **WHEN** the same event instance is emitted twice (e.g. a test or a retried emit)
- **THEN** the second delivery produces no additional notification row (unique `dedupeKey`)

#### Scenario: Transactional flow does not double-notify via the bus
- **WHEN** the accept transaction inserts its notification via `createInSession` and the post-commit `application.accepted` event then fires
- **THEN** the bus handler's insert is a no-op (same `dedupeKey`) and exactly one notification row exists for the volunteer

#### Scenario: Non-transactional flow still notifies through the bus
- **WHEN** a flow that wrote no in-transaction notification (e.g. `application.rejected`) emits its event
- **THEN** the bus handler creates exactly one notification row

### Requirement: Transactional notifications repository
The system SHALL provide the real Mongo-backed implementation of the `NOTIFICATIONS_REPOSITORY` interface declared by the applications module (`createInSession(notification, session)` persisting a `notifications` row inside the caller's `ClientSession`). The applications module SHALL bind the real repository so the S7 accept and withdraw-accepted transactions (and the later S11 verify transaction) persist their notification atomically with their other writes; the notifications module SHALL own the `notifications` model used by that implementation. The repository SHALL derive `dedupeKey` identically to the bus handlers so transactional writes and handlers never duplicate (F4 dedupe rule).

#### Scenario: In-transaction write commits with its transaction
- **WHEN** a transactional flow calls `createInSession({ recipientId, type, payload }, session)` and the transaction commits
- **THEN** the notification row exists with the correct `userId`, `type` and `payload`, plus the shared `dedupeKey`

#### Scenario: In-transaction write rolls back with its transaction
- **WHEN** the surrounding transaction aborts after `createInSession`
- **THEN** the notification row is not persisted (no orphaned notification)

### Requirement: Admin system notice delivery
The system SHALL support a directly-created (non-bus) notification type `admin.notice` for neutral admin-to-user system notices (standalone `POST /admin/users/:userId/notice` and the composite moderation `notice` action). Delivery SHALL gate on the recipient's `system` notification preference exactly like bus-handler gating (missing prefs row = defaults-on; `system=false` = suppressed, still success). The row SHALL carry `type=admin.notice` with payload `{ message, reportId?, sentAt }` and a `dedupeKey` derived from that payload, so distinct notices (different message/report/timestamp) never collapse. Composite delivery SHALL write through `createInSession` inside the resolution transaction (after the prefs check) so a rolled-back resolution leaves no orphaned notice.

#### Scenario: Notice gated by the system preference
- **WHEN** a notice is delivered to a recipient whose `system` pref is `false`
- **THEN** no `notifications` row is created

#### Scenario: Distinct notices never dedupe
- **WHEN** two notices with different messages (or different triggering reports) target the same user
- **THEN** two `notifications` rows exist

#### Scenario: Rolled-back resolution leaves no notice
- **WHEN** a composite resolution aborts after the notice write
- **THEN** the notice row is not persisted

