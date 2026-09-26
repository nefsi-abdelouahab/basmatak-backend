# volunteer-applications Specification

## Purpose
TBD - created by archiving change frontend-volunteer-tasks. Update Purpose after archive.
## Requirements
### Requirement: Own applications list with under_review tab and date filter
The system SHALL render the volunteer's own applications from `GET /api/v1/applications/me` (`?status=&from=&to=`, `CursorPage { items, nextCursor, limit, total, page, pages }`) with tabs for every real status (`pending`, `under_review`, `accepted`, `rejected`, `withdrawn`), result-count banners from `total`, and ISO date-range inputs bound to `?from=`/`?to=` (created-at bounds per `ApplicationListQueryDto`).

#### Scenario: Under-review tab filters by real state
- **WHEN** a volunteer selects the "Under review" tab
- **THEN** the system requests `GET /api/v1/applications/me?status=under_review` and renders the returned items with the count banner from `total`.

#### Scenario: Date filter maps to from/to params
- **WHEN** a volunteer sets a from/to date range
- **THEN** the system sends them as ISO `?from=`/`?to=` query params and re-renders the list from the server response.

### Requirement: Application detail with joins and neutral timeline
The system SHALL render application detail from `GET /api/v1/applications/:applicationId` showing the joined org/opportunity/position names, the persisted cover `message`, the decision actor where present, and a neutral timeline derived from `status` plus the activity feed (`Submitted → Under review → Accepted`; rejected/withdrawn shown as terminal states with the stored `reason` where present).

#### Scenario: Detail renders joins and timeline
- **WHEN** a volunteer opens an application detail
- **THEN** org/opportunity/position names, the cover message, and the neutral timeline step matching `status` are displayed (en+ar).

### Requirement: Application withdraw flow
The system SHALL withdraw via `POST /api/v1/applications/:applicationId/withdraw` (valid from `pending`, `under_review`, and `accepted`; an accepted withdraw also withdraws the matching participation and frees the seat). Withdraw SHALL require explicit confirm and re-read the detail afterwards.

#### Scenario: Withdraw accepted frees the seat
- **WHEN** a volunteer confirms withdraw on an accepted application
- **THEN** the system posts the withdraw, re-reads the application (status `withdrawn`), and surfaces success feedback.

### Requirement: Application ID as client-side ObjectId short form
The system SHALL display "Application ID" as a client-side short form derived from the application ObjectId (e.g. last 6–8 chars, uppercase). The system SHALL NOT render `APL-…`, `GHT-…`, or any backend registry-style code for applications (applications intentionally have no `registryId`).

#### Scenario: Short-form ID renders without backend code
- **WHEN** an application row or detail renders
- **THEN** the displayed ID is the client-side ObjectId short form and no fabricated `APL-` code appears.

### Requirement: Activity strip on applications
The system SHALL render a recent-activity strip from `GET /api/v1/volunteers/me/activity` (newest first) on the applications route, used as the audit-timeline source alongside application `status` (the admin `status-histories` route is never called from this volunteer route).

#### Scenario: Activity strip renders newest first
- **WHEN** the applications route loads
- **THEN** recent activity items render newest-first with loading/empty/error states.

