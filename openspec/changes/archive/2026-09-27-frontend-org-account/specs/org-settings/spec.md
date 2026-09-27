## ADDED Requirements

### Requirement: Email and phone editing
The system SHALL allow email/phone edits on `org/settings` via `PATCH /api/v1/users/me`, with email-format and phone (`/^\+?[0-9]{8,15}$/`) validation, loading/saving/error states, and re-render from the response.

#### Scenario: Email and phone persist with validation
- **WHEN** the org edits email/phone with valid values and saves
- **THEN** the system sends `PATCH /api/v1/users/me` and re-renders the account section from the response.

#### Scenario: Invalid phone is blocked client-side
- **WHEN** the org enters a phone failing `/^\+?[0-9]{8,15}$/`
- **THEN** the save is blocked with a validation message and no `PATCH /api/v1/users/me` call is made.

### Requirement: Password change
The system SHALL change the password on `org/settings` via `POST /api/v1/auth/change-password`, enforcing 8–72 chars with confirm-match validation and success/error states.

#### Scenario: Password changes with matching confirmation
- **WHEN** the org submits a matching 8–72 char new password + confirmation
- **THEN** the system calls `POST /api/v1/auth/change-password` and renders success.

### Requirement: Sessions with device rows, revoke, and logout-others
The system SHALL list sessions on `org/settings` from `GET /api/v1/users/me/sessions` with device rows (`device`/`userAgent` + derived `isCurrent` "This device" badge), revoke-one via `DELETE /api/v1/users/me/sessions/:sessionId`, and revoke-others via `POST /api/v1/auth/logout-others` (current session survives; list refreshes after each action).

#### Scenario: Sessions render with this-device badge
- **WHEN** `org/settings` loads with a multi-session fixture
- **THEN** the system requests `GET /api/v1/users/me/sessions` and renders device rows with the current session badged "This device".

#### Scenario: Logout-others keeps current session
- **WHEN** the org confirms logout-others
- **THEN** the system calls `POST /api/v1/auth/logout-others` and the refreshed list contains only the current session (asserted via re-read).

### Requirement: Notification preferences persist
The system SHALL load and persist notification prefs on `org/settings` via `GET`/`PATCH /api/v1/notifications/preferences` (read-only reuse of the F2 prefs pattern; own functions in `orgAccount.ts`), with toggle states reflecting the server and success/error feedback on save.

#### Scenario: Prefs load and persist
- **WHEN** the org toggles a preference and saves
- **THEN** the system sends `PATCH /api/v1/notifications/preferences` and re-renders toggles from the response.

### Requirement: Neutral public-profile visibility toggle
The system SHALL expose org visibility as a neutral `publicProfile.enabled` toggle on `org/settings` (no talent-directory wording, no civic-narrative copy), persisted via `PATCH /api/v1/organizations/me`, defaulting to the server value.

#### Scenario: Visibility toggle persists neutrally
- **WHEN** the org flips the public-profile toggle and saves
- **THEN** the system sends `PATCH /api/v1/organizations/me` with the toggle value and renders neutral visibility copy only.

### Requirement: Delete organization with confirm gating
The system SHALL delete the org account via `DELETE /api/v1/organizations/me` (soft-archive org + user, revokes sessions) only after an explicit typed/double confirm gate; on success the session is revoked and the Login route renders. The confirm gate SHALL block accidental submission (unit-tested).

#### Scenario: Delete requires confirm and revokes session
- **WHEN** the org completes the delete confirm gate and confirms
- **THEN** the system calls `DELETE /api/v1/organizations/me`, the session is revoked, and Login renders.

#### Scenario: Delete without confirm is blocked
- **WHEN** the delete dialog is open but the confirm gate is incomplete
- **THEN** the confirm action stays disabled and no `DELETE /api/v1/organizations/me` call is made.

### Requirement: Settings mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `org/settings` (theme tokens only; `orgAccount.*` strings en+ar with RTL logical properties; data only via `lib/api/orgAccount.ts` + `hooks/useOrgAccount.ts` over the F0 axios client; responsive at 1440/1100/390), handle 401/403/404/429/503 via the F0 error mapping, and SHALL NOT implement factsheet edits (F13 `org-profile`), dossier upload (F3), admin org management (F15), messaging, or any statute/"Law 12-06"/authority/audit UI.

#### Scenario: Guards exclude out-of-scope affordances
- **WHEN** `org/settings` renders
- **THEN** no fact-field editor, dossier-upload, admin-status, message-thread, or statute/authority/audit affordance exists in the DOM.
