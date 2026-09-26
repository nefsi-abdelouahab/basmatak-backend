## ADDED Requirements

### Requirement: Dashboard stats cards from volunteer dashboard endpoint
The system SHALL render volunteer stat cards (experiences count, hours, applications, participations or backend-defined equivalents) exclusively from `GET /api/v1/volunteers/me/dashboard`. Hours SHALL be derived from real `durationMinutes` sums, never invented.

#### Scenario: Dashboard stats render from endpoint
- **WHEN** an authenticated volunteer opens `volunteer/dashboard`
- **THEN** stat cards display the values returned by `GET /volunteers/me/dashboard` with hours computed from `durationMinutes`.

### Requirement: Latest verified experience block
The system SHALL render the `latestVerifiedExperience` object from `GET /api/v1/volunteers/me/dashboard` showing verifying org name, `verifiedAt` date, verification code, and `EXP-<registryId>` where present. When null, the system SHALL render a neutral empty state (no stub hours, no fabricated record).

#### Scenario: Latest experience renders when present
- **WHEN** the dashboard payload contains a non-null `latestVerifiedExperience`
- **THEN** the block shows org name, verified date, code, and `EXP-<registryId>`.

#### Scenario: Null latest experience shows empty state
- **WHEN** the dashboard payload has `latestVerifiedExperience: null`
- **THEN** a neutral empty state renders with a link to the opportunities feed and no fabricated data.

### Requirement: Dashboard loading, empty, and error states
The system SHALL provide loading (skeleton/`Loader`), empty, and error states on `volunteer/dashboard` for 401/403/404/429/503 via the F0 error mapping. Unauthenticated access SHALL redirect to Login (decision 10).

#### Scenario: Dashboard error and guest handling
- **WHEN** the dashboard request fails with a mapped error code or the visitor is a guest
- **THEN** the matching error state renders, and guests are redirected to Login with a `next` return to the dashboard.
