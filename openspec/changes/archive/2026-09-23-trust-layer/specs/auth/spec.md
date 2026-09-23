# auth Specification Change

## Purpose
Session 13 (F7) completes the logout requirement with the full-session revocation route, resolving the Phase 2 deferral recorded in the base spec.

## Requirements

## MODIFIED Requirements

### Requirement: Logout

The system SHALL support `POST /auth/logout` (authenticated) which deletes the caller's current `sessions` row identified by the access token's `sessionId`. The system SHALL support `POST /auth/logout-all` (authenticated) which deletes every session row for the caller's user (full-session revocation).

#### Scenario: Current session revoked
- **WHEN** an authenticated user calls `POST /auth/logout`
- **THEN** the session referenced by the access token is deleted

#### Scenario: All sessions revoked
- **WHEN** an authenticated user calls `POST /auth/logout-all`
- **THEN** every session row for that user (including the current one) is deleted