## ADDED Requirements

### Requirement: Organization embed and label fields on opportunity reads
The system SHALL include on public feed items, public detail, org own list/single-read rows and org-archive rows an `organization` object `{id, slug, nameFr, nameAr, logoMediaId, verificationStatus}` plus `categoryName`, location labels (`wilayaName`, `municipalityName`) and per-position skill names. Joins SHALL be batched per page (one query per joined entity) and missing references SHALL yield `null`/empty rather than errors. Existing fields and ordering SHALL be unchanged.

#### Scenario: Feed cards carry org identity and labels
- **WHEN** a guest or authenticated caller reads `GET /opportunities`
- **THEN** every item carries the full `organization` embed, `categoryName`, location labels and skill names alongside the existing fields

#### Scenario: Detail carries the same embed set
- **WHEN** a caller reads `GET /opportunities/:idOrSlug`
- **THEN** the payload carries the identical `organization` embed and label fields as feed items

#### Scenario: Dangling references degrade gracefully
- **WHEN** an opportunity references a deleted category or unknown location id
- **THEN** the corresponding label is `null` (skill lists omit unknowns) and the response is still 200

### Requirement: Per-position application counts and assigned volunteer names
The system SHALL expose on public opportunity detail `positions[].applicationCount` counting non-terminal applications (`pending`, `under_review`, `accepted`) per position, and `positions[].assigned[]` listing `{volunteerId, fullName, username, avatarMediaId}` for participants in `active`, `accepted` or `completed` status. Org own list/single-read rows SHALL include `applicationCount` per position. No contact data SHALL be exposed. Counts SHALL be computed with one batched query per page (detail: two bounded queries).

#### Scenario: Detail shows counts and assignees
- **WHEN** a caller reads the public detail of an opportunity with applications and active participants
- **THEN** each position shows the correct `applicationCount` and `assigned` contains only current (`active|accepted|completed`) volunteer names

#### Scenario: Withdrawn and rejected applications are excluded
- **WHEN** a position has withdrawn/rejected applications and a withdrawn participant
- **THEN** `applicationCount` excludes them and `assigned` omits the withdrawn volunteer

### Requirement: Favorites card state on opportunity payloads
The system SHALL include on feed items and public detail `isFavorited` (caller's own save state) and `favoriteCount` (platform total) computed through the existing favorites store (no duplicated counting logic). Guests SHALL receive `favoriteCount` with `isFavorited: false`. Feed/detail routes SHALL accept optional authentication without changing guest responses.

#### Scenario: Authed caller sees per-card save state
- **WHEN** an authenticated volunteer who saved one of two feed opportunities reads the feed
- **THEN** the saved item returns `isFavorited: true`, the other `false`, and both carry the true platform `favoriteCount`

#### Scenario: Guest sees counts only
- **WHEN** a guest reads the feed or public detail
- **THEN** every item returns `isFavorited: false` with correct `favoriteCount` values and a 200 status
