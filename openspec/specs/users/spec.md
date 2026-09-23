# users Specification

## Purpose
User account management: the `users` collection backing all accounts, read/update of own contact fields (email/phone re-triggering verification), soft delete, and listing/revoking the caller's own sessions.
## Requirements
### Requirement: Users collection
The system SHALL provide a `users` collection with `email` (unique), `phone` (unique sparse), `passwordHash`, `role` (`volunteer | organization | admin`), `status` (`active | suspended | deleted`, default `active`), `emailVerifiedAt`, and `deletedAt`. Indexes SHALL be: unique `email`, unique sparse `phone`, and `(role, status)`. Soft delete SHALL set `status=deleted` and `deletedAt`; no hard deletes are performed.

#### Scenario: Schema enforces uniqueness
- **WHEN** two `users` rows attempt the same `email`
- **THEN** the unique `email` index rejects the second insert
- **AND** `phone` uniqueness only applies when `phone` is set (sparse)

#### Scenario: Soft-deleted user keeps the row
- **WHEN** a user is deleted through the API
- **THEN** the row remains with `status=deleted` and a `deletedAt` timestamp

### Requirement: Read own user
The system SHALL expose `GET /users/me` (authenticated) returning the caller's user account without the password hash.

#### Scenario: Own account returned
- **WHEN** an authenticated user calls `GET /users/me`
- **THEN** the user's public account payload (id, email, phone, role, status, emailVerifiedAt, timestamps) is returned without the password hash

### Requirement: Update own user
The system SHALL expose `PATCH /users/me` (authenticated) allowing changes to `email` and `phone` only — `role` and `status` SHALL NOT be settable. Changing `email` or `phone` SHALL clear `emailVerifiedAt` and trigger a fresh `email_verify` token and email (re-verification).

#### Scenario: Contact change triggers re-verification
- **WHEN** an authenticated user changes `email` or `phone` via `PATCH /users/me`
- **THEN** the new value is stored
- **AND** `emailVerifiedAt` is cleared
- **AND** a new verification token is issued and a verification email is sent

#### Scenario: Role not mutable
- **WHEN** a `PATCH /users/me` payload includes `role` or `status`
- **THEN** the request is rejected by DTO validation

### Requirement: Delete own user
The system SHALL expose `DELETE /users/me` (authenticated) performing a soft delete: set `status=deleted`, set `deletedAt`, and revoke all of the user's sessions.

#### Scenario: Account soft-deleted
- **WHEN** an authenticated user calls `DELETE /users/me`
- **THEN** their `users` row becomes `status=deleted` with `deletedAt` set
- **AND** all their sessions are revoked

### Requirement: List own sessions
The system SHALL expose `GET /users/me/sessions` (authenticated) returning the caller's own `sessions` rows (id, `createdAt`, `expiresAt`, `lastUsedAt`) — never including any token hash or other secret. Only the caller's own sessions SHALL be returned; sessions belonging to other users SHALL never be surfaced.

#### Scenario: Own sessions listed
- **WHEN** an authenticated user calls `GET /users/me/sessions`
- **THEN** all of that user's active sessions are returned with their metadata

#### Scenario: No credential material leaked
- **WHEN** sessions are listed
- **THEN** no refresh-token hash or any other secret is included in the response

### Requirement: Revoke one session
The system SHALL expose `DELETE /users/me/sessions/:sessionId` (authenticated) deleting a single session of the caller — and only of the caller. Deleting an absent or foreign session SHALL be `404` in the error envelope. Deleting the caller's current session SHALL be allowed (the current access token remains usable until expiry).

#### Scenario: Own session revoked
- **WHEN** an authenticated user deletes one of their own session ids
- **THEN** that session row is deleted and the response is `204`

#### Scenario: Foreign or absent session 404
- **WHEN** the session id belongs to another user or does not exist
- **THEN** the response is `404` in the error envelope

#### Scenario: Current session revocable
- **WHEN** an authenticated user deletes the session used by their current access token
- **THEN** the session row is deleted and the bearer stays valid until expiry

### Requirement: User status transition whitelist
The system SHALL register a `user` entity whitelist with the S1 `StatusTransitionService` covering `active ↔ suspended`, used by the admin user-status route so every change is validated and recorded in `status_histories`. The registration SHALL be additive and SHALL NOT alter the whitelists of other entity types.

#### Scenario: Whitelist active at bootstrap
- **WHEN** the application boots with the admin module registered
- **THEN** `StatusTransitionService.assert` accepts `active → suspended` and `suspended → active` for entity type `user`

#### Scenario: Unlisted transition rejected
- **WHEN** any code attempts `active → deleted` or a `deleted → *` pair through the service for entity type `user`
- **THEN** the call fails with `INVALID_STATUS_TRANSITION` and no `status_histories` row is written

