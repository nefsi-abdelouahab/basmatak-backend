# users Specification Change

## Purpose
Session 13 (F7) adds the two session-management sub-routes on the users controller: listing the caller's own sessions and revoking a single one.

## Requirements

## ADDED Requirements

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