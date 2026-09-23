# auth Specification Change

## Purpose

Session 19 auth hardening (ROADMAP lines 858+): refresh-token rotation must withstand replay. Instead of merely rejecting a replayed token, the system revokes every session for the victim user (`401 REFRESH_TOKEN_REUSE_DETECTED`), keeps an audit-visible `rotatedAt` tombstone for consumed rows, atomically claims rows so concurrent replays cannot both succeed, and hides tombstones from `listSessions` while TTL cleans them.

## Requirements

## MODIFIED Requirements

### Requirement: Refresh token rotation
The system SHALL support `POST /auth/refresh`: it hashes the presented refresh token, looks up the `sessions` row, verifies it is unexpired and its user is not suspended/deleted, then SHALL rotate the session (mark the consumed row as rotated with a `rotatedAt` timestamp, insert a new session with a fresh refresh token hash and pushed expiry) and return a new access/refresh pair. Rows already rotated SHALL NOT satisfy the lookup, and consumption of a row SHALL be atomic against concurrent replays. When a presented refresh token matches a row that was already consumed (reuse detection), the system SHALL revoke every session belonging to that user and respond `401 REFRESH_TOKEN_REUSE_DETECTED`. The `sessions` collection SHALL keep `expiresAt` TTL indexes so tombstones are cleaned, and `listSessions` SHALL surface only un-rotated sessions.

#### Scenario: Successful refresh rotates the session
- **WHEN** `POST /auth/refresh` is called with a valid unexpired refresh token
- **THEN** a new access/refresh pair is returned
- **AND** the consumed row is marked with `rotatedAt` and a new session row stores the hash of the new refresh token

#### Scenario: Concurrent refreshes cannot both succeed
- **WHEN** the same refresh token is presented concurrently by two requests
- **THEN** at most one request succeeds with a fresh pair
- **AND** the loser is treated as a reuse and responds `401 REFRESH_TOKEN_REUSE_DETECTED` with every session for the user revoked

#### Scenario: Replayed refresh token revokes all sessions
- **WHEN** a previously rotated refresh token is presented again
- **THEN** the response is `401 REFRESH_TOKEN_REUSE_DETECTED`
- **AND** every session belonging to the user is revoked

#### Scenario: Expired refresh token rejected
- **WHEN** the presented refresh token's session `expiresAt` is in the past
- **THEN** the response is `401` and no new session is created for that token

#### Scenario: Tombstones stay out of the listing
- **WHEN** a user refreshes and then calls `listSessions`
- **THEN** the consumed row is absent and only the new live session is surfaced