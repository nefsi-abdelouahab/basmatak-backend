## ADDED Requirements

### Requirement: Account registration
The system SHALL allow public self-registration for `volunteer` and `organization` accounts via `POST /auth/register/volunteer` and `POST /auth/register/organization`. Registration SHALL create a `users` document (with a `bcrypt`-hashed password), immediately create a session and issue access/refresh tokens, create an `email_verify` verification token and send a verification email. The request body SHALL NOT be able to set `role` or `status` (enforced by DTO whitelist + `forbidNonWhitelisted`); the role is fixed by the route. After registration, profile creation for `volunteer_profiles` (Session 4) and `organizations` (Session 5) SHALL be delegated through the `RegistrationExtrasService` seam with an inert default.

#### Scenario: Volunteer registers successfully
- **WHEN** a valid `POST /auth/register/volunteer` payload is submitted
- **THEN** a `users` row is created with role `volunteer` and status `active`
- **AND** a session is created and access/refresh tokens are returned
- **AND** an `email_verify` token is stored and a verification email is sent

#### Scenario: Organization registers successfully
- **WHEN** a valid `POST /auth/register/organization` payload is submitted
- **THEN** a `users` row is created with role `organization` and status `active`
- **AND** the profile is not created yet (delegated to the seam, inert by default)

#### Scenario: Duplicate email rejected
- **WHEN** a registration uses an email already present in `users`
- **THEN** the response is `409` with a `UPPER_SNAKE` business code and no account is changed

#### Scenario: Role cannot be set from the body
- **WHEN** a registration payload includes a `role` or `status` field
- **THEN** the request is rejected by DTO validation

### Requirement: Login
The system SHALL authenticate an existing `users` document via `POST /auth/login` using `bcrypt.compare` against the stored password hash. On success it SHALL create a `sessions` row and return `{ accessToken, refreshToken, user }` where the refresh token is a fresh random value (only its SHA-256 hash is stored). Suspended or deleted accounts SHALL be rejected. The endpoint SHALL be rate-limited.

#### Scenario: Correct credentials
- **WHEN** `POST /auth/login` is called with the correct email and password
- **THEN** an access token, a refresh token, and the user are returned
- **AND** a session row storing the SHA-256 hash of the refresh token is created

#### Scenario: Wrong password
- **WHEN** `POST /auth/login` is called with the wrong password
- **THEN** the response is `401` with a generic `UPPER_SNAKE` business code (no account enumeration)

#### Scenario: Suspended account rejected
- **WHEN** the account `users.status` is `suspended` or `deleted`
- **THEN** login is rejected with `403` and a business code such as `ACCOUNT_SUSPENDED`

#### Scenario: Login rate limited
- **WHEN** login attempts exceed the per-route limit within the TTL window
- **THEN** subsequent requests are rejected with `429`

### Requirement: Refresh token rotation
The system SHALL support `POST /auth/refresh`: it hashes the presented refresh token, looks up the `sessions` row, verifies it is unexpired and its user is not suspended/deleted, then SHALL rotate the session (revoke the old row and insert a new session with a fresh refresh token hash and pushed expiry) and return a new access/refresh pair.

#### Scenario: Successful refresh rotates the session
- **WHEN** `POST /auth/refresh` is called with a valid unexpired refresh token
- **THEN** a new access/refresh pair is returned
- **AND** the presented refresh token is revoked and a new session row stores the hash of the new refresh token

#### Scenario: Replayed refresh token rejected
- **WHEN** a previously rotated (revoked) refresh token is presented again
- **THEN** the response is `401` and no new session is created

#### Scenario: Expired refresh token rejected
- **WHEN** the presented refresh token's session `expiresAt` is in the past
- **THEN** the response is `401`

### Requirement: Logout
The system SHALL support `POST /auth/logout` (authenticated) which deletes the caller's current `sessions` row identified by the access token's `sessionId`. The full-session revocation variant (`/auth/logout-all`) is deferred to Phase 2.

#### Scenario: Current session revoked
- **WHEN** an authenticated user calls `POST /auth/logout`
- **THEN** the session referenced by the access token is deleted

### Requirement: Email verification
The system SHALL support one-shot email verification via `POST /auth/verify-email`: the presented token is hashed and atomically consumed against a current, unconsumed `verification_tokens` row of type `email_verify`; on success the user's `emailVerifiedAt` is set and the token is marked consumed. Replay of a consumed token SHALL fail.

#### Scenario: Verify with valid token
- **WHEN** `POST /auth/verify-email` is called with the token from the verification email
- **THEN** the user's `emailVerifiedAt` is set
- **AND** the verification token is marked consumed (cannot be reused)

#### Scenario: Replaying a consumed token
- **WHEN** the same verification token is presented a second time
- **THEN** the response is `400`/`410` with a `UPPER_SNAKE` business code

#### Scenario: Expired token rejected
- **WHEN** the verification token's `expiresAt` is in the past
- **THEN** verification fails with an error response

### Requirement: Resend verification email
The system SHALL support `POST /auth/resend-verification` (authenticated) which invalidates any prior unconsumed `email_verify` tokens for the user and issues a new one, sending a fresh email. It SHALL be rate-limited.

#### Scenario: New token invalidates the previous one
- **WHEN** an authenticated user calls `POST /auth/resend-verification`
- **THEN** previous `email_verify` tokens for that user are invalidated
- **AND** a new token is issued and a new email is sent

#### Scenario: Resend rate limited
- **WHEN** resend attempts exceed the per-route limit within the TTL window
- **THEN** the response is `429`

### Requirement: Password reset
The system SHALL support `POST /auth/forgot-password` (public, rate-limited, always `204`) which issues a `password_reset` token and sends a reset email without disclosing whether the email exists, and `POST /auth/reset-password` (public) which atomically consumes that token and, on success, updates the password hash and revokes all of the user's sessions.

#### Scenario: Forgot password is silent
- **WHEN** `POST /auth/forgot-password` is called for an existing or a non-existent email
- **THEN** the response is `204` in both cases and a reset email is only sent for the existing account

#### Scenario: Reset password revokes sessions
- **WHEN** `POST /auth/reset-password` succeeds with a valid, unconsumed `password_reset` token
- **THEN** the password hash is updated
- **AND** all sessions for that user are deleted

#### Scenario: Reset token replay rejected
- **WHEN** an already-consumed `password_reset` token is presented
- **THEN** the response is `400`/`410`

### Requirement: Change password
The system SHALL support `POST /auth/change-password` (authenticated) validating the current password with `bcrypt.compare`, then updating the password hash and revoking all sessions except the caller's current one.

#### Scenario: Password updated and sessions kept scoped
- **WHEN** an authenticated user calls `POST /auth/change-password` with the correct current password
- **THEN** the password hash is replaced
- **AND** all other sessions are revoked while the current session remains active

### Requirement: Current account endpoint
The system SHALL expose `GET /auth/me` (authenticated) returning the current account (`id`, `email`, `emailVerifiedAt`, `role`, `status`, `createdAt`) and, for `organization` accounts, the organization linked by `organizations.userId` when it exists.

#### Scenario: Volunteer reads own account
- **WHEN** a volunteer calls `GET /auth/me`
- **THEN** the account payload is returned without an organization block

#### Scenario: Organization reads own account
- **WHEN** an organization account calls `GET /auth/me` and an organization with `userId` equal to its user id exists
- **THEN** the account payload includes the linked organization

### Requirement: JWT identity injection
The system SHALL authenticate requests via a JWT access-token strategy (`@nestjs/passport` + `passport-jwt`) that resolves the payload `{ sub, role, sessionId }` into `req.user`. This replaces the foundation's `AuthPlaceholderGuard`; guards and the `CurrentAccount` decorator SHALL read `req.user`. An unverified account SHALL be blocked only when `EMAIL_VERIFICATION_REQUIRED=true` and there is no `emailVerifiedAt` (the enforcement gate for later publish/apply/submit routes).

#### Scenario: Token treated as authoritative
- **WHEN** a request carries a valid access token
- **THEN** `req.user` contains the sub, role and sessionId claims and `RolesGuard` enforces against the real `role`

#### Scenario: Missing or invalid token rejected
- **WHEN** a protected route is called with no token or an invalid/expired token
- **THEN** the response is `401`

#### Scenario: Public routes bypass auth
- **WHEN** a route is marked `@Public`
- **THEN** it is reachable without a token

#### Scenario: Email verification gate active
- **WHEN** `EMAIL_VERIFICATION_REQUIRED=true` and the caller's `emailVerifiedAt` is unset
- **THEN** the guard blocks the route with a `UPPER_SNAKE` business code (e.g. `EMAIL_NOT_VERIFIED`)

#### Scenario: Email verification gate inactive
- **WHEN** `EMAIL_VERIFICATION_REQUIRED` is unset or `false`
- **THEN** the gate does not block unverified callers

### Requirement: Mail service
The system SHALL provide a `MailService` interface with three implementations: `SmtpMailService` (nodemailer transport configured from `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`), `LogMailService` (used when `MAIL_HOST` is unset; renders the same message to the app logger for local/dev parity), and a test double. Messages SHALL be plain text, French by default, and safe for Arabic Latin-French characters. The interface SHALL cover `sendVerificationEmail` and `sendPasswordReset`.

#### Scenario: SMTP provider sends mail
- **WHEN** `MAIL_HOST` is set and a verification/reset email is requested
- **THEN** `SmtpMailService` sends the message through nodemailer with `MAIL_FROM`

#### Scenario: Fallback logs mail
- **WHEN** `MAIL_HOST` is unset and an email is requested
- **THEN** `LogMailService` renders the same plain-text body into the logger and does not attempt an SMTP connection