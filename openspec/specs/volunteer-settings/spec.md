# volunteer-settings Specification

## Purpose
TBD - created by archiving change frontend-volunteer-account. Update Purpose after archive.
## Requirements
### Requirement: Email/phone update with re-verification notice
The system SHALL update contact fields via `PATCH /api/v1/users/me` and, when email changes, surface the email-verification notice (verification is invalidated server-side). Phone input SHALL validate against `/^\+?[0-9]{8,15}$/`.

#### Scenario: Email change triggers verification notice
- **WHEN** a volunteer saves a new email via `PATCH /users/me`
- **THEN** a verification notice renders with a link to the verify-email route.

### Requirement: Change password
The system SHALL change passwords via `POST /api/v1/auth/change-password` (consumed from F1's `lib/api/auth.ts`; this change SHALL NOT redefine it), enforcing 8–72 characters client-side before submit.

#### Scenario: Password changed
- **WHEN** a volunteer submits a valid current/new password pair
- **THEN** `POST /auth/change-password` succeeds and a confirmation renders.

#### Scenario: Short password blocked
- **WHEN** a new password under 8 characters is submitted
- **THEN** submit is blocked with a validation error and no request is sent.

### Requirement: Sessions list, revoke, logout-others
The system SHALL list sessions via `GET /api/v1/users/me/sessions` showing device metadata (`device {browser, os, device}`, `userAgent`) plus an isCurrent "This device" badge derived from server `isCurrent`; revoke one via `DELETE /api/v1/users/me/sessions/:sessionId`; revoke all others via `POST /api/v1/auth/logout-others` (consumed from F1's `lib/api/auth.ts`), keeping the current session alive.

#### Scenario: Sessions render with current badge
- **WHEN** settings loads
- **THEN** each row shows device info and exactly one row carries the "This device" badge.

#### Scenario: Logout-others keeps current session
- **WHEN** "Sign out other devices" is confirmed
- **THEN** `POST /auth/logout-others` succeeds, other rows disappear, and the current session remains valid.

### Requirement: Notification preferences
The system SHALL read and persist preferences via `GET/PATCH /api/v1/notifications/preferences` (`applicationUpdates`, `reviews`, `verification`, `system`, `digest`, `recordIssued`), all default ON.

#### Scenario: Preference toggles persist
- **WHEN** a volunteer flips a preference toggle
- **THEN** `PATCH /notifications/preferences` persists it and the state survives reload.

### Requirement: Soft delete with confirm dialog
The system SHALL delete the account via `DELETE /api/v1/users/me` (soft delete) only after an explicit typed/confirmed dialog, then sign out and redirect to the public landing page.

#### Scenario: Delete requires confirmation
- **WHEN** "Delete account" is opened but not confirmed
- **THEN** no request is sent and the account remains active.

#### Scenario: Confirmed delete signs out
- **WHEN** deletion is confirmed
- **THEN** `DELETE /users/me` succeeds, tokens are cleared, and the user lands on `/` signed out.

