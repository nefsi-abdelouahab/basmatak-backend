## ADDED Requirements

### Requirement: Organization cross-opportunity participant roster
The system SHALL expose `GET /organizations/me/participants` (authenticated, `organization` role; scoping derives from the caller's own organization so an org only ever sees its own rows) returning the cross-opportunity roster with cursor pagination (Session 7 `execPage` convention: `limit` + `cursor`, default 20, max 50, `total`/`page`/`pages` populated). Filters: `?opportunityId=` (must belong to the caller's org, else `404`), `?status=` (single participant status from `PARTICIPANT_STATUSES`, including `completed`; absent means all statuses), `?q=` (case-insensitive match on volunteer name/username, opportunity title, or position title). Each row SHALL join: volunteer identity (`username`, `firstName`, `lastName`, `avatarMediaId`, `geographicBase`), position title, opportunity title/slug/status, the latest submission for the participant (`state`, file `mediaIds`, or `null` when none), and `hourlyTotal` (sum of that volunteer's `volunteer_experiences.duration` on that opportunity, `0` when none). Name/label embeds beyond these fields stay owned by Session 17 and SHALL NOT be joined here.

#### Scenario: Owning org reads its roster across opportunities
- **WHEN** the owning org calls `GET /organizations/me/participants` spanning two of its opportunities
- **THEN** rows from both opportunities are returned with volunteer identity, position/opportunity labels, submission state, and totals, paginated with correct totals

#### Scenario: Status filter includes completed
- **WHEN** the owning org calls the route with `?status=completed`
- **THEN** only `completed` participant rows are returned

#### Scenario: Foreign opportunity refused
- **WHEN** the org passes an `opportunityId` belonging to another org (or malformed)
- **THEN** the response is `404` in the error envelope

#### Scenario: Guest or volunteer refused
- **WHEN** a guest or a volunteer calls the route
- **THEN** guests receive `401` and volunteers receive `403`
