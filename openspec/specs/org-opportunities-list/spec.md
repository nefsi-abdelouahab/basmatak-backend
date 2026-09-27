# org-opportunities-list Specification

## Purpose
TBD - created by archiving change frontend-org-opportunities. Update Purpose after archive.
## Requirements
### Requirement: Own opportunities list with search, sort, and pagination
The system SHALL render the organization's own opportunities from `GET /api/v1/organizations/me/opportunities` (`?q=&sort=&page=`, `CursorPage { items, nextCursor, limit, total, page, pages }`) with a search input bound to `q`, a sort control bound to `sort`, numbered pagination from `page`/`pages`, and result-count banners from `total`. Each card SHALL show the title, status, `OPP-<registryId>` ref, and embedded application/participant counts.

#### Scenario: Search filters own opportunities
- **WHEN** an org user types a query and submits
- **THEN** the system requests `GET /api/v1/organizations/me/opportunities?q=<query>` and renders the returned items with the count banner from `total`.

#### Scenario: Sort and pagination re-query
- **WHEN** an org user changes sort or page
- **THEN** the system re-requests with the updated `sort`/`page` params and renders the new page with counts from `total`/`page`/`pages`.

#### Scenario: Empty list renders neutral empty state
- **WHEN** the list response contains zero items
- **THEN** the system renders a neutral empty state with a create-opportunity call-to-action and no invented totals.

### Requirement: Owner single-read including drafts
The system SHALL load a single owned opportunity (including non-published/draft states) from `GET /api/v1/organizations/me/opportunities/:id` for the edit route, showing real meta (`mode`, dates, `durationMinutes`, `prerequisites[]`, `coverMediaId`, category, location labels, positions with `applicationCount`).

#### Scenario: Draft opens in edit route
- **WHEN** an org user opens `org/opportunities/[id]` for a draft opportunity
- **THEN** the system loads it via the owner single-read endpoint and renders the edit form with current values.

### Requirement: Duplicate creates an independent draft
The system SHALL duplicate via `POST /api/v1/organizations/me/opportunities/:id/duplicate`, producing an independent draft that the org user can edit without affecting the source opportunity.

#### Scenario: Duplicate then edit independently
- **WHEN** an org user duplicates an opportunity
- **THEN** the system posts the duplicate, navigates to the new draft's edit route, and edits to the copy never mutate the source.

### Requirement: Delete-draft only
The system SHALL delete via `DELETE /api/v1/opportunities/:opportunityId` only where the lifecycle matrix allows (draft state), behind an explicit confirm, and SHALL NOT offer delete on published/active opportunities.

#### Scenario: Delete draft with confirm
- **WHEN** an org user confirms delete on a draft opportunity
- **THEN** the system deletes it, invalidates the list, and surfaces success feedback.

### Requirement: No opportunity-PDF button and no applications UI
The system SHALL NOT render an opportunity report/PDF button anywhere in these routes (only experience attestation ships — backend has no opportunity-PDF endpoint), and SHALL NOT render applications on the opportunity (F11-owned: aggregate inbox, roster, review actions).

#### Scenario: List and edit DOM have no PDF or applications affordances
- **WHEN** the list or edit route renders
- **THEN** no report/PDF download button and no applicant-list/review affordance exists in the DOM.

