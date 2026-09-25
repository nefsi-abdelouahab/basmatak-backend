## ADDED Requirements

### Requirement: Moderation action registry and neutral vocabulary

The system SHALL provide a moderation action registry with exactly four action types using neutral vocabulary (no "sanction" wording): `unpublish_opportunity` ("Remove from public listing"), `close_opportunity` ("Close opportunity"), `suspend_target` ("Suspend target account"), and `notice` ("Send system notice"). An unknown action type SHALL be rejected with `400` by DTO validation (`forbidNonWhitelisted`).

#### Scenario: Unknown action type rejected

- **WHEN** an admin sends `action.type` outside the four registered values
- **THEN** the response is `400` and neither the report nor any target is modified

### Requirement: Action-target compatibility matrix

The system SHALL enforce action-target compatibility against the report's `targetType`: `unpublish_opportunity` and `close_opportunity` require `targetType=opportunity`; `suspend_target` requires `targetType=user|organization`; `notice` accepts any `targetType` with an explicit `{ userId, message }` payload. An incompatible pair SHALL fail with `400 INCOMPATIBLE_MODERATION_ACTION` and persist nothing (no report transition, no history row).

#### Scenario: Suspend on an opportunity target refused

- **WHEN** an admin resolves an opportunity-targeted report with `suspend_target`
- **THEN** the response is `400 INCOMPATIBLE_MODERATION_ACTION` and the report stays in its current status

#### Scenario: Unpublish on a user target refused

- **WHEN** an admin resolves a user-targeted report with `unpublish_opportunity`
- **THEN** the response is `400 INCOMPATIBLE_MODERATION_ACTION` with no writes

### Requirement: Atomic report resolution with consequence

The system SHALL execute `PATCH /admin/reports/:reportId` with an `action` envelope inside a single Mongo `withTransaction`: the report transition (`open|in_review → resolved`), the target-entity transition, and any notice write SHALL commit together or roll back together. The report transition and every target transition SHALL pass through `StatusTransitionService.assert` with the transaction session, writing one `status_histories` row per transitioned entity carrying the report `resolution` as its reason. The report `resolution` text SHALL be required (`400` when absent with an action) and SHALL be stored on the report row as today.

#### Scenario: Report plus unpublish commits atomically

- **WHEN** an admin resolves an `open` report on a `published` opportunity with `unpublish_opportunity`
- **THEN** the report becomes `resolved` with the `resolution` stored, the opportunity becomes `closed`, and two `status_histories` rows exist (report + opportunity, both carrying the resolution as reason)

#### Scenario: Failed consequence rolls back the resolution

- **WHEN** the consequence fails inside the transaction (e.g. the target opportunity is already `closed`, failing the `published→closed` whitelist check with `409`)
- **THEN** the whole transaction aborts: the report keeps its original status and no `status_histories` row is written for either entity

#### Scenario: Action requires terminal resolved status

- **WHEN** an admin sends an `action` with `status=in_review` or `status=dismissed`
- **THEN** the response is `400` and nothing is persisted

#### Scenario: Suspended target blocks sign-in

- **WHEN** an admin resolves a user-targeted report with `suspend_target`
- **THEN** the target user's `status` becomes `suspended` with a history row, and the account can no longer authenticate (existing suspended-account behavior, regression-covered)

#### Scenario: Non-admin refused

- **WHEN** a guest, volunteer, or organization calls the resolve-with-action route
- **THEN** guests receive `401` and non-admin roles receive `403`, with no writes

### Requirement: Policy-default suspension from moderation flags

The system SHALL re-check the `moderation.suspendOnReport` setting (Session 13) on every composite resolution: when the flag is `true` and an admin resolves (`resolved`) a `user|organization`-targeted report with no explicit `action`, the system SHALL apply `suspend_target` as the policy default inside the same transaction (reason = the `resolution`). When the flag is `false` (default), the same call resolves plainly. An explicit `action` SHALL always take precedence over the flag.

#### Scenario: Flag on suspends user targets by default

- **WHEN** `moderation.suspendOnReport` is `true` and an admin resolves a user-targeted report with no action
- **THEN** the target user is suspended in the same transaction with the resolution as reason

#### Scenario: Flag off resolves plainly

- **WHEN** `moderation.suspendOnReport` is `false` and an admin resolves a user-targeted report with no action
- **THEN** only the report transitions; the target account status is untouched

### Requirement: Admin system notice route

The system SHALL expose `POST /admin/users/:userId/notice` (admin) accepting `{ message }` (required, non-empty, ≤1000 chars) creating exactly one neutral `notifications` row for the target user with `type=admin.notice` and payload `{ message, reportId? }`. The write SHALL respect notification preferences: when the recipient's `system` pref is `false`, no row is created (still `2xx`). An absent user SHALL return `404`; a guest SHALL receive `401` and non-admin roles `403`. The composite `notice` action SHALL reuse this same delivery path inside the resolution transaction (prefs checked first, then `createInSession`), with the payload additionally carrying the triggering `reportId` so distinct notices never collapse onto one `dedupeKey`.

#### Scenario: Notice delivered to the target user

- **WHEN** an admin posts a message to an existing user whose `system` pref is on (or who has no prefs row)
- **THEN** one `notifications` row exists with `type=admin.notice` and the message in the payload

#### Scenario: Disabled system pref suppresses the notice

- **WHEN** the recipient's `system` pref is `false`
- **THEN** no notification row is created and the response is still success

#### Scenario: Unknown user 404

- **WHEN** an admin posts a notice to a non-existent user id
- **THEN** the response is `404` in the error envelope
