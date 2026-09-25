## MODIFIED Requirements

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope. The public profile SHALL include the organization's neutral `registryId` and the additive fact-sheet fields `location`, `website`, `type`, `registrationNumber`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `annualReportMediaId`, plus `aggregates` supplied by the `OrgPublicStatsProvider` seam (database-derived since Session 16 filled the real provider). Organizations with `publicProfile.enabled=false` SHALL still resolve (the toggle is a neutral platform-profile preference, not a visibility gate — no 404 regression).

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned, including its `ORG-` registry identifier, the fact-sheet fields, and the `aggregates` block

#### Scenario: Non-verified organization hidden
- **WHEN** a guest calls `GET /organizations/:slug` for a `pending` or `rejected` organization (or an inactive/deleted one)
- **THEN** the response is `404`

#### Scenario: Aggregates real after Session 16
- **WHEN** a guest reads the public profile of an org with 2 active initiatives, 1 completed initiative, 4 engaged volunteers, 300 verified minutes, and a cached `responseRate` of `0.5`
- **THEN** the `aggregates` block carries those database-derived values (not zeros) with `activeSince` mirroring `foundedYear`

### Requirement: Organization public stats seam
The system SHALL bind the real `OrgPublicStatsProvider` aggregation behind the extension seam (interface in `src/common/seams/`, following the S1 seam convention; swapped via Nest DI without changing the organizations module's code): `getStats(organizationId)` SHALL return `{ volunteers, initiativesActive, initiativesCompleted, verifiedHours, responseRate, perDomain[] }` where `volunteers` = distinct `volunteerId` over the org's `task_participants` with status `accepted | active`; `initiativesActive` / `initiativesCompleted` = counts of the org's `opportunities` by status (active `published | in_progress`, completed `completed | closed`, `draft | cancelled` excluded); `verifiedHours` = lifetime sum of `volunteer_experiences.duration` for the org (no trailing-window restriction); `responseRate` = the org's cached `organizations.reliability.responseRate` (the `ReliabilityService` convention: decided over uploaded submissions), `0` when the cache is absent — no new formula is introduced; `perDomain[]` = `{ domain, share }` slices of the org's non-draft opportunities grouped by `categoryId` → skill-category name, sorted desc, at most 8). `activeSince` stays derived in `OrganizationsService` from `foundedYear` (else `null`), not by the seam.

#### Scenario: Real provider returns database values
- **WHEN** the public payload resolves aggregates through the real binding
- **THEN** every field reflects the org's rows per the formulas above and `activeSince` mirrors `foundedYear` (or `null` when unset)

#### Scenario: Swap is source-compatible
- **WHEN** Session 16 binds the real provider
- **THEN** consumers calling `getStats(organizationId)` compile unchanged against the same interface

#### Scenario: Organization without activity yields zeros
- **WHEN** the real provider computes stats for an org with no participants, opportunities, experiences, or cached reliability
- **THEN** numerics are `0` and `perDomain` is empty

## ADDED Requirements

### Requirement: Organization private dashboard stats
The system SHALL expose `GET /organizations/me/stats` (authenticated, `organization` role, caller's own org only; a caller without an organization row SHALL receive `404`) returning the private dashboard numbers: `opportunitiesActive`, `opportunitiesCompleted` (same status mapping as the public seam), `applicationsPending`, `applicationsUnderReview` (counts over the org's `applications`), `participantsActive`, `participantsCompleted` (counts over the org's `task_participants`), `verifiedHours` (same sum as the public seam), `decisionsLast30d` (count of the org's `verifications` with `decidedAt` in the trailing 30 days), `decidedRatio` and `medianDecisionHours` (the org's cached reliability snapshot values, omitted when the cache is absent). The route SHALL be read-only with no pagination (single object).

#### Scenario: Owning org reads its stats
- **WHEN** the owning org calls `GET /organizations/me/stats`
- **THEN** the response carries the counts above matching the database, with cached reliability values included when present

#### Scenario: Foreign caller isolated
- **WHEN** a guest or a volunteer calls the route, or an organization-role caller has no organization row
- **THEN** guests receive `401`, wrong-role callers receive `403`, and a role-valid caller without an organization row receives `404`; scoping always derives from the caller's own org so no org ever sees another org's numbers
