## ADDED Requirements

### Requirement: Session device metadata
The system SHALL capture device metadata on every `sessions` row created at login or registration: a parsed `device` object `{browser, os, device}` produced by a small self-contained parser (no external UA-parsing dependency) from the `User-Agent` header, plus the raw `userAgent` string. When the header is absent or unparseable, `device` SHALL be `null`. Refresh rotation SHALL preserve the operated metadata: the replacement session row created by a rotation SHALL copy the rotated row's `device` and `userAgent`. The `GET /users/me/sessions` payload SHALL include `device`, `userAgent`, and a server-derived `isCurrent` boolean that is `true` only for the row whose `_id` equals the access token's `sessionId` claim and `false` for every other row. `isCurrent` SHALL be computed at read time and never stored on the `sessions` row. The `POST /auth/login` request body SHALL remain unchanged (metadata comes from headers).

#### Scenario: Login captures device metadata
- **WHEN** `POST /auth/login` succeeds and the request carries a `User-Agent` header
- **THEN** the created `sessions` row stores the parsed `device` object and the raw `userAgent`
- **AND** the row is later returned by `GET /users/me/sessions` with the same metadata

#### Scenario: Refresh preserves the operated metadata
- **WHEN** `POST /auth/refresh` rotates a session row that has `device`/`userAgent` stored
- **THEN** the replacement session row copies both values from the rotated row

#### Scenario: Current-session marker derived server-side
- **WHEN** an authenticated user calls `GET /users/me/sessions` with a valid access token
- **THEN** exactly the row whose id equals the token's `sessionId` has `isCurrent: true`
- **AND** every other row has `isCurrent: false`

#### Scenario: Missing user agent handled
- **WHEN** a session is created without a usable `User-Agent` header
- **THEN** the created row has `device: null` and an empty/null `userAgent` and the sessions payload renders it without error

### Requirement: Logout other sessions
The system SHALL expose `POST /auth/logout-others` (authenticated, any role) which deletes every session row belonging to the caller except the row identified by the current access token's `sessionId`. The current session SHALL remain active and its access/refresh tokens SHALL stay valid. The route SHALL be idempotent (deleting what is already gone is not an error) and SHALL respond `204`. The same service helper (`revokeAllExcept(userId, sessionId)`) SHALL be reusable by later account-deletion flows.

#### Scenario: Every other session revoked
- **WHEN** an authenticated user with multiple active sessions calls `POST /auth/logout-others`
- **THEN** the response is `204`
- **AND** all sessions except the current one are deleted

#### Scenario: Revoked refresh token rejected
- **WHEN** a refresh token that belonged to a session revoked by `logout-others` is presented afterwards
- **THEN** the response is `401` with an invalid/expired refresh-token error and no new session is created

#### Scenario: Current session stays usable
- **WHEN** a user calls `POST /auth/logout-others` followed by a request carrying the current access token
- **THEN** the request still succeeds (the current bearer remains valid)

#### Scenario: Single-session idempotent call
- **WHEN** a user with only the current session active calls `POST /auth/logout-others`
- **THEN** the response is `204` and the current session is untouched