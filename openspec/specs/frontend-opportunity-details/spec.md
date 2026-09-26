# frontend-opportunity-details Specification

## Purpose
TBD - created by archiving change frontend-opportunity-details. Update Purpose after archive.
## Requirements
### Requirement: Opportunity API module with one typed function per endpoint
The system SHALL provide a new module `frontend/src/lib/api/opportunity.ts` exposing one typed async function per consumed backend endpoint (base path `/api/v1`), validated with zod, built on the F0 axios singleton: `GET /opportunities/:idOrSlug`, `GET /opportunities` (related-by-category), `POST /opportunities/:opportunityId/positions/:positionId/applications` (`{message?}`), `POST /applications/:applicationId/withdraw`, `POST /reports` (`{targetType: "opportunity", targetId, reason, description?}`), `GET /media/:mediaId` (public cover read).

#### Scenario: Detail call resolves id or slug
- **WHEN** the UI calls the detail function with a 24-hex ObjectId or a slug
- **THEN** the system sends `GET /api/v1/opportunities/:idOrSlug` and validates the response shape with zod before returning it

#### Scenario: No ad-hoc fetching in opportunity flows
- **WHEN** the details route needs backend data
- **THEN** it goes through a function in `lib/api/opportunity.ts` and never calls `fetch(` or raw `axios.` directly

### Requirement: Opportunity hook with detail, actions, and related
The system SHALL provide `frontend/src/hooks/useOpportunity.ts` (this session's single hook file) exposing TanStack Query queries/mutations over the opportunity API module, with query keys from the F0 key factory (`detail` for the opportunity, `list` for related). Mutations SHALL invalidate the detail query on apply/withdraw success.

#### Scenario: Apply invalidates detail seats
- **WHEN** the apply mutation succeeds
- **THEN** the detail query is invalidated so position seats and counts re-read from the server

### Requirement: Detail route renders real meta only
The system SHALL render route `app/[locale]/volunteer/opportunities/[idOrSlug]` with meta boxes bound to real detail fields only: `mode`, `startDate`, `endDate`, `applicationDeadline`, `durationMinutes` (hours derived), `prerequisites[]`, `description`, cover via `coverMediaId`, category/skill labels, and wilaya/municipality location labels. The reference chip SHALL render `OPP-<registryId>` (never "Ref: BT-…"). The recognition box SHALL render neutral "Certificate" copy (never "Civic Recognition"/"Official Certificate" civic narrative). Perks/logistics blocks SHALL NOT exist on the page. No stat SHALL be invented: every number comes from the payload or its embeds.

#### Scenario: Registry chip shows neutral id
- **WHEN** the detail renders for an opportunity with `registryId "OPP-000123"`
- **THEN** the chip shows `OPP-000123` and no legacy `BT-` code appears anywhere

#### Scenario: Perks and logistics absent
- **WHEN** the detail page renders in either locale
- **THEN** no perks/host-logistics/accommodation/language-of-record block, input, or copy exists in the DOM

### Requirement: Positions block with counts, assignees, and seat gating
The system SHALL render one selectable position card per embedded position showing `title`, `description`, `requiredCount`/`filledCount` seats, `applicationCount`, assigned volunteer names where joined, `requiredSkills` labels, and `deliverables[]`/`startAt` where present. The Apply CTA per position SHALL be disabled with localized copy when the deadline passed, the position is full (`filledCount >= requiredCount`), or the opportunity status is not `published`.

#### Scenario: Full position gates Apply
- **WHEN** a position has `filledCount` equal to `requiredCount`
- **THEN** its Apply CTA is disabled with a localized "position full" note and no apply request can be sent

#### Scenario: Deadline gates Apply
- **WHEN** `applicationDeadline` is in the past
- **THEN** all Apply CTAs are disabled with a localized "deadline passed" note

### Requirement: Org sidebar from the detail embed
The system SHALL render the org sidebar (name + verified badge, `ORG-<registryId>` where joined, category/location facts) exclusively from the detail payload's `organization` embed. No org fact SHALL be fetched from another endpoint in this session, and no stat SHALL be invented.

#### Scenario: Sidebar shows embed only
- **WHEN** the detail payload embeds the organization
- **THEN** the sidebar shows the embedded name, verified badge, and facts with no N+1 request and no invented totals

### Requirement: Apply flow with message and guest redirect
The system SHALL implement per-position Apply calling `POST /opportunities/:opportunityId/positions/:positionId/applications` with optional trimmed `message` (≤2000 chars, client-validated). Guests SHALL be redirected to Login via `getLoginHref(locale, next)` preserving the detail URL (decision 10). The flow SHALL bind `EMAIL_NOT_VERIFIED` (verify CTA), `POSITION_FULL` (409), `APPLICATIONS_CLOSED`/`APPLICATION_DEADLINE_PASSED` (410), `DUPLICATE_APPLICATION` (409), 429 `RATE_LIMITED`, and 404 (non-published id/slug) to localized states through F0's error-code mapping.

#### Scenario: Guest apply redirects to login
- **WHEN** a guest clicks Apply on the detail page
- **THEN** the system navigates to the login route with a `next` param pointing back at the detail URL and sends no apply request

#### Scenario: Apply with message succeeds
- **WHEN** a verified volunteer applies with a message and the server returns the `pending` application
- **THEN** the UI shows a localized success state and the detail re-reads updated counts

### Requirement: Withdraw flow
The system SHALL implement Withdraw calling `POST /applications/:applicationId/withdraw` for the volunteer's own live application (application id resolved from the volunteer's application state for the selected position), guarded by a confirm dialog, with success invalidating the detail query and error codes bound through F0's mapper.

#### Scenario: Withdraw frees the seat on re-read
- **WHEN** withdraw succeeds
- **THEN** the UI shows a localized withdrawn state and the detail re-read reflects the freed seat

### Requirement: Report flow
The system SHALL implement Report calling `POST /reports` with `{targetType: "opportunity", targetId: <opportunityId>, reason, description?}`, behind a dialog with required `reason`, available to authenticated users only (guests redirect to Login), with 429 `RATE_LIMITED` bound to the rate-limited state.

#### Scenario: Report requires a reason
- **WHEN** the report dialog is submitted with an empty reason
- **THEN** validation fails with a localized message and no request is sent

### Requirement: Related opportunities by category
The system SHALL render a related strip calling `GET /opportunities` filtered by the detail's `categoryId`, excluding the current opportunity, showing card fields (`mode`, `coverMediaId`, `endDate`, `durationMinutes`, org name + verified badge + `OPP-<registryId>`) and linking to each related detail route.

#### Scenario: Related excludes self
- **WHEN** related results include the current opportunity id
- **THEN** it is filtered out before render

### Requirement: Cover image via public media read
The system SHALL resolve `coverMediaId` through `GET /media/:mediaId` (public, no auth required) and render the signed URL; when absent, a neutral token-driven empty state renders (no placeholder imagery claiming content).

#### Scenario: Missing cover shows neutral empty state
- **WHEN** the opportunity has no `coverMediaId`
- **THEN** a neutral empty block renders with localized copy and no broken image

### Requirement: Detail strings fully translated with RTL-correct layout
The system SHALL ship every detail-screen string under the `opportunityDetails` message-key prefix in per-area catalogs (`messages/opportunityDetails/en.json` + `messages/opportunityDetails/ar.json`), with zero hardcoded JSX strings, logical CSS properties only, and mirrored layout at `locale=ar`.

#### Scenario: Arabic detail mirrors layout
- **WHEN** the detail screen renders at `locale=ar`
- **THEN** all copy comes from the `ar` catalog and directional layout uses logical properties (no physical `ml-/mr-` for direction)

### Requirement: Detail screen token-driven, responsive, and state-complete
The system SHALL style the detail route from the F0 centralized theme (no hardcoded color/font/spacing values), render correctly at 1440/1100/390 viewports, and cover loading/empty/error states plus 401/403/404/429/503 via F0's mapper and system screens.

#### Scenario: No hardcoded theme values in detail route
- **WHEN** the theme audit greps detail route sources for hex colors outside `theme/`
- **THEN** the result is empty

