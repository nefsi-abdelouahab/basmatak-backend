## ADDED Requirements

### Requirement: Volunteer join on submission inbox and detail
The system SHALL enrich `GET /organizations/me/submissions` page items and the org/volunteer submission detail payload with `volunteer {userId, username, fullName, avatarMediaId, geographicBase}` resolved with one batched profile query per page. Filters (`status`, `opportunityId`, `q`, `format`, `sort`), totals and evidence handling SHALL be unchanged, and rows SHALL remain strictly scoped to the caller's organization.

#### Scenario: Org inbox rows carry volunteer identity
- **WHEN** an org reads its submissions inbox
- **THEN** every row carries the submitting volunteer's username/name/avatar/base with totals and paging intact

#### Scenario: Volunteer detail shows own identity join
- **WHEN** a volunteer reads their own submission detail
- **THEN** the payload includes their own volunteer join alongside the unchanged evidence block
