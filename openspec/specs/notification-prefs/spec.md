# notification-prefs Specification

## Purpose
TBD - created by archiving change backend-v2-notification-prefs. Update Purpose after archive.
## Requirements
### Requirement: Notification preferences collection

The system SHALL maintain a `notification_prefs` collection owned by the notifications module, with one row per user. Each document SHALL carry `userId` (the `users._id`, unique) and a `prefs` object with exactly six boolean keys: `applicationUpdates`, `reviews`, `verification`, `system`, `digest`, `recordIssued`. All six keys SHALL default to `true`. A unique index on `userId` SHALL enforce one row per user. Documents SHALL be timestamped (Schema `toJSON` transforms `_id` to string, `versionKey:false`, as per the S1 base options).

#### Scenario: Defaults are all on

- **WHEN** a new preference row is created without explicit values
- **THEN** `prefs` is `{applicationUpdates: true, reviews: true, verification: true, system: true, digest: true, recordIssued: true}`

#### Scenario: One row per user

- **WHEN** a second preference row is inserted for a `userId` that already has one
- **THEN** the unique index rejects it (callers get-or-create, so this only surfaces as an inert duplicate handled by the service)

### Requirement: Read own notification preferences

The system SHALL expose `GET /notifications/preferences` (authenticated) returning the caller's preferences as `{ prefs }`. When no row exists for the caller, the system SHALL create one lazily with all-defaults-on and return it. The caller SHALL only ever observe their own row.

#### Scenario: First read creates the row with defaults

- **WHEN** an authenticated user calls `GET /notifications/preferences` and has no preference row
- **THEN** a row is created for that `userId` with all six keys `true` and the response returns `{ prefs: { ... } }` with all `true`

#### Scenario: Existing row is returned as stored

- **WHEN** an authenticated user with a saved preference row calls `GET /notifications/preferences`
- **THEN** the response returns the stored `prefs` values, unchanged

### Requirement: Patch own notification preferences

The system SHALL expose `PATCH /notifications/preferences` (authenticated). The body SHALL be a partial `prefs` object; only the six whitelisted keys (`applicationUpdates`, `reviews`, `verification`, `system`, `digest`, `recordIssued`) SHALL be accepted with boolean values only (`whitelist` + `forbidNonWhitelisted` + transform). An unknown key or a non-boolean value SHALL be rejected `400`. The service SHALL merge the patch into the caller's row, creating the row lazily (get-or-create) if it does not exist, and SHALL return the updated full `prefs`. There is no delete support.

#### Scenario: Patch updates one or more keys

- **WHEN** an authenticated user PATCHes `{ prefs: { verification: false } }`
- **THEN** their stored row keeps the other five keys' values and sets `verification` to `false`, returning the merged `prefs`

#### Scenario: Unknown key rejected

- **WHEN** an authenticated user PATCHes a preference key outside the six whitelisted keys
- **THEN** the request fails `400` and nothing is stored

#### Scenario: Non-boolean value rejected

- **WHEN** an authenticated user PATCHes `{ prefs: { system: "yes" } }`
- **THEN** the request fails `400` and the stored value is unchanged

#### Scenario: Patch on a fresh user creates then merges

- **WHEN** an authenticated user with no row PATCHes `{ prefs: { digest: false } }`
- **THEN** a row is created with defaults and `digest` set to `false`, and the returned `prefs` reflects defaults plus the patch

