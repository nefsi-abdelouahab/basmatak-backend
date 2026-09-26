# frontend-auth-screens Specification

## Purpose
TBD - created by archiving change frontend-auth-screens. Update Purpose after archive.
## Requirements
### Requirement: Auth API module with one typed function per endpoint
The system SHALL provide a new module `frontend/src/lib/api/auth.ts` exposing one typed async function per auth backend endpoint (base path `/api/v1`), validated with zod, built on the F0 axios singleton. Functions already owned by F0 (`POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout` in `lib/api/session.ts`) SHALL be reused via import, not redefined; `auth.ts` defines the remaining functions: `POST /auth/register/volunteer`, `POST /auth/register/organization`, `POST /auth/login`, `POST /auth/logout-all`, `POST /auth/logout-others`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password`.

#### Scenario: Register volunteer call is typed and validated
- **WHEN** the UI calls the volunteer-registration function with `{email, password, phone?}`
- **THEN** the system sends `POST /api/v1/auth/register/volunteer` and validates the response shape with zod before returning it

#### Scenario: No ad-hoc fetching in auth flows
- **WHEN** any auth screen needs backend data
- **THEN** it goes through a function in `lib/api/auth.ts` (or the reused F0 `session.ts` functions) and never calls `fetch(`/raw `axios.` directly

### Requirement: Auth hook with session, role redirect, and guest-continue
The system SHALL provide `frontend/src/hooks/useAuth.ts` (this session's single hook file) exposing TanStack Query mutations/queries over the auth API module, with query keys from the F0 key factory. After login the hook SHALL call `GET /auth/me` and redirect by role (volunteer, organization, admin). The Sign In route SHALL honor a `next` query param ("continue to X after login") so F4+ guest redirects land back on the intended page.

#### Scenario: Role-based post-login redirect
- **WHEN** login succeeds and `GET /auth/me` returns `role: "organization"`
- **THEN** the system navigates to the organization landing route, not the volunteer one

#### Scenario: Guest-continue flow
- **WHEN** a guest is redirected to `/login?next=/opportunities/abc` and signs in successfully
- **THEN** the system navigates to `/opportunities/abc` after the role check passes

### Requirement: Sign In screen without role selection
The system SHALL render a Sign In route at `app/[locale]/(auth)/login` with email + password fields only (no role selector; role comes from `GET /auth/me`). It SHALL bind `INVALID_CREDENTIALS`, unverified-email (with CTAs to Email Verification + resend), `ACCOUNT_SUSPENDED`, and 429 `RATE_LIMITED` (login bucket 5/min) to F0's error-code mapping and system screens, and link to Create Account and Forgot Password.

#### Scenario: Unverified email shows resend CTA
- **WHEN** login fails with the unverified-email code
- **THEN** the screen shows a CTA to the verification screen and a resend action instead of a generic error

#### Scenario: No role selector present
- **WHEN** the Sign In screen renders in either locale
- **THEN** no role/volunteer/org/admin picker exists on the form

### Requirement: Create Account selector
The system SHALL render `app/[locale]/(auth)/create-account` as an account-type selector (volunteer vs organization) linking to the two registration routes, per delta doc §B#29 (aligned, no backend call).

#### Scenario: Selector links to both registration forms
- **WHEN** the Create Account screen renders
- **THEN** it shows entries for volunteer registration and organization registration, each navigating to its route

### Requirement: Volunteer registration with minimal fields
The system SHALL render `app/[locale]/(auth)/register-volunteer` collecting `{email, password, phone?}` only, calling `POST /auth/register/volunteer`. Phone SHALL validate `/^\+?[0-9]{8,15}$/` (no spaces); password SHALL validate 8–72 chars. On success the system auto-logs-in, shows the email-verification notice, and offers a next-step CTA toward Volunteer Profile completion (F2 owns that screen; this session only links to it).

#### Scenario: Invalid phone rejected client-side
- **WHEN** the volunteer form is submitted with phone `"555 123"`
- **THEN** validation fails with a localized message and no request is sent

#### Scenario: Successful registration shows verification notice
- **WHEN** `POST /auth/register/volunteer` succeeds
- **THEN** the session is stored and an email-verification notice with next-step CTA renders

### Requirement: Organization minimal registration
The system SHALL render `app/[locale]/(auth)/register-organization` collecting `{email, password, phone?}` only, calling `POST /auth/register/organization` (auto-login). All org facts stay in F3 profile-completion. Post-creation the screen SHALL show neutral "Pending review" copy plus `ORG-<registryId>` and gate further steps on verified email (`EMAIL_NOT_VERIFIED` CTA).

#### Scenario: Org registration shows pending copy with registry id
- **WHEN** `POST /auth/register/organization` succeeds
- **THEN** the screen shows neutral pending-review copy including the returned `ORG-<registryId>` and no statute/legal fields

### Requirement: Forgot password with always-success copy
The system SHALL render `app/[locale]/(auth)/forgot-password` calling `POST /auth/forgot-password` (always-204 anti-enumeration: identical success copy whether or not the email exists) and SHALL bind 429 `RATE_LIMITED` (3/hr bucket) to the F0 rate-limited state.

#### Scenario: Unknown email shows same success copy
- **WHEN** forgot-password is submitted for an email with no account
- **THEN** the screen shows the same neutral "check your inbox" copy as for a known email

### Requirement: Reset password with token states
The system SHALL render `app/[locale]/(auth)/reset-password` reading the token from the email link and calling `POST /auth/reset-password` with `{token, newPassword}` (8–72 chars; revokes sessions). It SHALL render distinct invalid/expired/used-token states, show TTL copy "within one hour", and navigate to Sign In on success.

#### Scenario: Expired token shows dedicated state
- **WHEN** reset-password fails with an expired/consumed token code
- **THEN** the screen shows the expired-token state with a CTA back to Forgot Password, not a generic error

### Requirement: Email verification with resend
The system SHALL render `app/[locale]/(auth)/verify-email` calling `POST /auth/verify-email` with `{token}` and `POST /auth/resend-verification` (Bearer) for resend (3/hr → 429 state). Success SHALL show neutral "Email verified" copy plus a Sign In CTA; org accounts stay `verificationStatus: pending`. `EMAIL_NOT_VERIFIED` gating CTAs elsewhere SHALL link here.

#### Scenario: Verified email links to sign in
- **WHEN** `POST /auth/verify-email` succeeds
- **THEN** the screen shows neutral success copy and a Sign In CTA, and does not claim org approval

### Requirement: 401 and 429 states wired to the global handler
The system SHALL wire 401 session-expired (re-authenticate CTA → Sign In, preserving `next`) and 429 rate-limited (neutral retry-later copy) to the F0 global handler and system screens (`SessionExpiredScreen`, `RateLimitedScreen`); no new system-screen components are created in this session.

#### Scenario: Expired session preserves destination
- **WHEN** a 401 occurs on a protected route `/org/dashboard`
- **THEN** the expired screen offers Sign In with `next=/org/dashboard` so login returns there

### Requirement: Auth strings fully translated with RTL-correct layout
The system SHALL ship every auth-screen string under the `auth` message-key prefix in per-area catalogs (`messages/auth/en.json` + `messages/auth/ar.json`), with zero hardcoded JSX strings, logical CSS properties only, and mirrored layout at `locale=ar`.

#### Scenario: Arabic login mirrors layout
- **WHEN** the Sign In screen renders at `locale=ar`
- **THEN** all copy comes from the `ar` catalog and directional layout uses logical properties (no physical `ml-/mr-` for direction)

### Requirement: Auth screens token-driven and responsive
The system SHALL style all auth routes from the F0 centralized theme (no hardcoded color/font/spacing values) and render correctly at 1440/1100/390 viewports (desktop 3-column shell context, tablet 2-column, mobile single-column).

#### Scenario: No hardcoded theme values in auth routes
- **WHEN** the theme audit greps auth route sources for hex colors outside `theme/`
- **THEN** the result is empty

