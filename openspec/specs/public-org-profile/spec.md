# public-org-profile Specification

## Purpose
TBD - created by archiving change frontend-public-orgs. Update Purpose after archive.
## Requirements
### Requirement: Organization fact header
The system SHALL render the public org fact header on `(public)/orgs/[slug]` from `GET /api/v1/organizations/:slug`, showing name, `ORG-<registryId>` display-only (never a route key), location labels, `website`, `foundedYear`, verification status, and neutral contact (`contact{}`, `website`, coordinates) — authority/audit/supervisory lines SHALL NOT render.

#### Scenario: Fact header renders real facts with ORG display code
- **WHEN** a guest opens `(public)/orgs/[slug]`
- **THEN** the system requests `GET /api/v1/organizations/:slug` and renders name, `ORG-<registryId>`, location, website, founded year, and verification status with neutral contact only.

#### Scenario: Unknown slug renders 404 state
- **WHEN** `GET /api/v1/organizations/:slug` returns 404
- **THEN** the shared not-found state renders with no fact residue.

### Requirement: Aggregates ribbon
The system SHALL render the public aggregates ribbon from the org public aggregates (active/completed opportunity counts, participant/volunteer counts, verified hours from real durations), with "Active since"/"Founded" wording — "Accredited" or any accredited-hours copy SHALL NOT appear.

#### Scenario: Ribbon numbers match aggregates
- **WHEN** the org profile loads with an aggregates fixture
- **THEN** every ribbon value equals its aggregate field and hours equal the duration-derived value.

#### Scenario: No accredited wording exists
- **WHEN** the org profile renders in either locale
- **THEN** no "Accredited" string exists in the DOM or catalogs.

### Requirement: Per-status public archive
The system SHALL render per-status archive tabs on `(public)/orgs/[slug]` from `GET /api/v1/organizations/:slug/opportunities?status=published|completed|closed` (voluntary `counts` per tab, `total` banner per page), where each card uses the category embed + `OPP-<registryId>` + real `endDate`/`durationMinutes`.

#### Scenario: Archive tabs filter by status with counts
- **WHEN** a guest selects the completed tab
- **THEN** the system requests `GET /api/v1/organizations/:slug/opportunities` with `status=completed` and renders cards with the `total` banner and per-tab counts.

#### Scenario: Archive cards link to public opportunity details
- **WHEN** an archive card renders
- **THEN** its link targets `(public)/opportunities/[idOrSlug]` using the card id-or-slug (never `registryId`).

### Requirement: Neutral reliability
The system SHALL render reliability on `(public)/orgs/[slug]` from `GET /api/v1/organizations/:slug/reliability` as neutral "Submission response rate" (+ per-domain breakdown where served) — "Deliverable Verification Rate" copy SHALL NOT appear.

#### Scenario: Reliability renders neutral rate
- **WHEN** the reliability payload loads
- **THEN** the neutral response-rate label with the served value (and per-domain breakdown iff present) renders.

### Requirement: Neutral publisher sidebar
The system SHALL render the org sidebar with neutral contact (address/phone/website/coordinates from the profile payload) and `ORG-<registryId>` only — National Registry IDs, supervisory-authority lines, audit records, maps beyond coordinates, and "Civic Mandates" labels SHALL NOT render; focus areas render from `focusDisciplines[]` under a neutral label.

#### Scenario: Sidebar carries no authority or audit copy
- **WHEN** the org profile renders
- **THEN** no registry/authority/audit/supervisory text exists in the sidebar DOM or catalogs.

### Requirement: Org profile mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `(public)/orgs/[slug]` (theme tokens only; `publicOrgs.*` strings en+ar with RTL logical properties; data only via `lib/api/publicOrgs.ts` + `hooks/usePublicOrgs.ts` over the F0 axios client; responsive at 1440/1100/390), handle loading/empty/error plus 401/403/404/429/503 via the F0 error mapping with guest authed-actions redirecting to Login, and SHALL NOT implement dossier/verification actions, messaging, ranking, or any F17 talent-profile block.

#### Scenario: Guards exclude out-of-scope affordances
- **WHEN** the org profile renders
- **THEN** no verification-action, message-thread, ranking, or talent-profile affordance exists in the DOM.

