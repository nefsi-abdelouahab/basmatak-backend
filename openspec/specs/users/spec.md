# users Specification

## Purpose
TBD - created by archiving change auth-and-users. Update Purpose after archive.
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

