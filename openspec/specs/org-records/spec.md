# org-records Specification

## Purpose
TBD - created by archiving change frontend-org-records. Update Purpose after archive.
## Requirements
### Requirement: Verified experiences archive list with filters
The system SHALL render the org verified-experiences archive from `GET /api/v1/organizations/me/experiences` with query filters `q`, `opportunityId`, `visibility`, `sort`, `page`. Each row SHALL show volunteer display name plus `VOL-<registryId>`, `EXP-<registryId>` from `registryId`, verified date from `verifiedAt`, inline `verificationCode`, `publicVisibility` display, and hours from the real numeric `durationMinutes`. Totals SHALL derive from the page payload (`total`/`pages`).

#### Scenario: Archive loads with enriched rows
- **WHEN** an org opens `org/experiences`
- **THEN** records populate from `GET /organizations/me/experiences` and each row shows volunteer name plus `VOL-<id>`, `EXP-<id>`, verified date, inline code, visibility display, and real-duration hours in en + ar.

#### Scenario: Filters narrow the list via query params
- **WHEN** an org sets search, opportunity, visibility, or sort controls
- **THEN** the list refetches with the matching `q`, `opportunityId`, `visibility`, `sort`, `page` params and result counts derive from the page payload.

#### Scenario: Hours come from real durations
- **WHEN** any archive row renders an hours value
- **THEN** it computes from the record numeric duration field and never from invented aggregates.

### Requirement: CSV export via shared blob helper
The system SHALL export the archive via `GET /api/v1/organizations/me/experiences?format=csv` through the single shared authed blob-download helper as an attachment with no navigation away from the page, preserving the active filters.

#### Scenario: CSV downloads as file
- **WHEN** an org clicks Export CSV
- **THEN** the blob helper streams the CSV with attachment disposition, the route does not change, and the request carries the active filter params plus `format=csv`.

### Requirement: Copy verification link inline
The system SHALL offer a copy action per row that copies the inline `verificationCode` plus a deep-link target of the form `/verify/:code` without building any standalone verify page UI. The link target resolves read-only via `GET /api/v1/verify/:verificationCode` (no page built in this change).

#### Scenario: Copy link copies inline code
- **WHEN** an org clicks Copy verification link on a row
- **THEN** the clipboard receives the inline code plus deep link and a confirmation renders.

#### Scenario: No verify page built
- **WHEN** an org follows or views the deep link value
- **THEN** no new `/verify` page UI exists in this change; the value is an inline deep-link string only.

### Requirement: Attestation download per row
The system SHALL download per-record attestations via `GET /api/v1/experiences/:experienceId/attestation` through the single shared authed blob-download helper as an attachment with no navigation.

#### Scenario: Attestation downloads as file
- **WHEN** an org clicks Download attestation on a row
- **THEN** the blob helper streams the PDF with attachment disposition and the route does not change.

### Requirement: Org reviews given read
The system SHALL render org-authored reviews read-only from `GET /api/v1/organizations/me/reviews` with neutral copy and no reply, edit, or dispute actions.

#### Scenario: Reviews render read-only
- **WHEN** an org opens the reviews block
- **THEN** items populate from `GET /organizations/me/reviews` with no mutation affordance.

### Requirement: Neutral record surface
The system SHALL NOT render ledger/SHA copy, `DZ-CIVIC`-style registry IDs, `National Civic Registry ID` labels, or audio playback elements. Volunteer identity SHALL show as volunteer name plus `VOL-<id>`; record identity as `EXP-<registryId>`; evidence affordances SHALL be image, PDF, or link only.

#### Scenario: Neutral copy enforced
- **WHEN** the archive renders in either locale
- **THEN** no `SHA-256`, `Ledger`, `DZ-CIVIC`, or `National Civic Registry` strings appear and no audio player element exists in the DOM.

### Requirement: Loading empty error states
The system SHALL render loading, empty, and error states for the archive, reviews, CSV, and download actions, mapping the unified error shape including 401/403/404/429/503, with guest authed-action redirect to Login.

#### Scenario: States render per mandate
- **WHEN** the archive is loading, empty, or any request fails
- **THEN** the matching loading, empty, or error state renders with the mapped code, and guest access redirects to Login.

