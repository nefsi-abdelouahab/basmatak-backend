## MODIFIED Requirements

### Requirement: Read own user
The system SHALL expose `GET /users/me` (authenticated) returning the caller's user account without the password hash. The payload SHALL include the `lastActivityAt` timestamp alongside the existing account fields.

#### Scenario: Own account returned
- **WHEN** an authenticated user calls `GET /users/me`
- **THEN** the user's public account payload (id, email, phone, role, status, emailVerifiedAt, `lastActivityAt`, timestamps) is returned without the password hash

### Requirement: List own sessions
The system SHALL expose `GET /users/me/sessions` (authenticated) returning the caller's own `sessions` rows (id, `createdAt`, `expiresAt`, `lastUsedAt`, `device`, `userAgent`) plus a server-derived `isCurrent` flag — never including any token hash or other secret. Only the caller's own sessions SHALL be returned; sessions belonging to other users SHALL never be surfaced.

#### Scenario: Own sessions listed
- **WHEN** an authenticated user calls `GET /users/me/sessions`
- **THEN** all of that user's active sessions are returned with their metadata including device/userAgent and the `isCurrent` marker

#### Scenario: No credential material leaked
- **WHEN** sessions are listed
- **THEN** no refresh-token hash or any other secret is included in the response

## ADDED Requirements

### Requirement: Last activity tracking
The system SHALL track `users.lastActivityAt` (a timestamp of the user's most recent authenticated access) via a guarded helper used on authenticated account reads. Writes SHALL be throttled to at most once per 15 minutes per user, so routine requests do not write the field on every heartbeat. The field SHALL be initialized at session creation (login/registration). `lastActivityAt` SHALL be readable on the caller's own account payload (`GET /users/me`); reads for other users are left to dedicated admin list routes which only read the field.

#### Scenario: Last activity recorded on access
- **WHEN** an authenticated user performs an access that triggers the guarded helper and more than 15 minutes have passed since the previous write
- **THEN** `users.lastActivityAt` is updated to the current server time

#### Scenario: Writes throttled
- **WHEN** an authenticated user performs accesses less than 15 minutes after the last `lastActivityAt` write
- **THEN** no additional write occurs

#### Scenario: Exposed on own account
- **WHEN** an authenticated user calls `GET /users/me` after activity
- **THEN** the response includes a `lastActivityAt` timestamp matching the last recorded access