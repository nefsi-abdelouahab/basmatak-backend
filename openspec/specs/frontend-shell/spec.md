# frontend-shell Specification

## Purpose
TBD - created by archiving change frontend-foundation. Update Purpose after archive.
## Requirements
### Requirement: Base layout shell at three breakpoints

The system SHALL render the base shell — navbar/sidebar per DESIGN.md with mobile bottom-nav — at Desktop ≥1280px (3-column), Tablet 1024–1279px (2-column), and Mobile ≤768px (single-column + bottom nav), per mandate RESPONSIVE (roadmap §2.4).

#### Scenario: Shell renders at all viewports

- **WHEN** component tests render the shell at 1440/1100/390
- **THEN** navigation is reachable at each width (sidebar or bottom-nav as appropriate) with no overlap, no horizontal scroll, and desktop-first 1440px 3-column structure intact

### Requirement: Error boundary with six system screens bound to backend codes

The system SHALL provide an error boundary plus six system screens — 404, 403, 500, Maintenance, Network-Error, session-expired — wired to the backend `{code}` mapping: `FORBIDDEN` / `ACCOUNT_SUSPENDED` / `ACCOUNT_INACCESSIBLE` / `EMAIL_NOT_VERIFIED` drive 403 variants, 401 drives session-expired, 429 `RATE_LIMITED` structure is scaffolded here (copy lands in FB/F1), and 503 maintenance is driven by `GET /system/status` with liveness via `GET /health`.

#### Scenario: 403 variants resolve to distinct states

- **WHEN** the client receives 403 with each of `FORBIDDEN`, `ACCOUNT_SUSPENDED`, `ACCOUNT_INACCESSIBLE`, `EMAIL_NOT_VERIFIED`
- **THEN** the matching 403-variant screen renders with its recovery CTA (re-authenticate, contact-support neutral copy, or verify-email entry — neutral wording, no civic-narrative copy)

#### Scenario: Maintenance mode renders from system status

- **WHEN** `GET /system/status` reports maintenance active (guarded reads 503)
- **THEN** the Maintenance screen renders instead of content, and recovery re-checks `GET /health` / `GET /system/status`

#### Scenario: E2E system routes

- **WHEN** Playwright visits unknown, failing, and maintenance routes under en and ar
- **THEN** 404/500/maintenance screens render correctly in both locales at 1440/1100/390

### Requirement: Auth token storage with session read

The system SHALL persist JWT access/refresh tokens, attach them via the API client, and resolve the current session/role through `GET /auth/me` (role-based redirect logic itself lands in FB/F1; here only storage, attach, refresh, and expired-handling structure).

#### Scenario: Stored session hydrates requests

- **WHEN** the app boots with valid stored tokens
- **THEN** outgoing API calls carry the access token and `GET /auth/me` resolves the session without forcing re-login

