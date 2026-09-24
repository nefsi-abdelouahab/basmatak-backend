## MODIFIED Requirements

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