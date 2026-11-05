## ADDED Requirements

### Requirement: Organization favorite toggle by slug
The system SHALL expose `POST /favorites/organizations/:slug` for callers with the volunteer role that saves the organization for the caller, resolving `slug` server-side to the organization account's `userId` and storing that userId as `targetId`. An unknown slug returns 404 `ORGANIZATION_NOT_FOUND`. Repeat calls are idempotent per the opportunity toggle.

#### Scenario: Volunteer saves an organization by slug
- **WHEN** an authenticated volunteer POSTs an existing organization slug
- **THEN** the system returns 201 (200 on repeat) with `{ favorited: true, favoriteCount }` and stores one row with `targetType: organization` and the resolved userId

#### Scenario: Save of unknown organization slug fails
- **WHEN** a volunteer POSTs a slug with no organization
- **THEN** the system returns 404 `ORGANIZATION_NOT_FOUND` and persists nothing

## MODIFIED Requirements

### Requirement: Idempotent unfavorite
The system SHALL expose `DELETE /favorites/opportunities/:id`, `DELETE /favorites/talents/:username`, and `DELETE /favorites/organizations/:slug` for callers with the volunteer role that remove the caller's matching row and return 204 whether or not a row existed. A malformed opportunity id returns 404 `OPPORTUNITY_NOT_FOUND`; an unknown talent username or organization slug still returns 204.

#### Scenario: Volunteer unsaves every target type
- **WHEN** an authenticated volunteer DELETEs a previously saved opportunity id, talent username, and organization slug
- **THEN** the system returns 204 for each and subsequent reads show `favorited: false`

#### Scenario: Delete of absent favorite succeeds silently
- **WHEN** a volunteer DELETEs an opportunity, talent username, or organization slug they never saved (or an unknown talent/organization)
- **THEN** the system returns 204 and no error is raised

### Requirement: Own favorites list
The system SHALL expose `GET /favorites` for callers with the volunteer role returning only that caller's favorites as a `CursorPage` with populated `total`/`page`/`pages`, newest-first, with an optional `?targetType=opportunity|talent|organization` filter. Each item SHALL carry `{ targetType, targetId, createdAt, summary }` where `summary` is a best-effort lightweight snapshot: opportunities carry `{ title, slug, status, applicationDeadline, organization? }`, talents carry `{ username, fullName }`, and organizations carry `{ slug, nameAr, nameFr, status }`. `summary` is `null` when the target no longer exists.

#### Scenario: Volunteer lists all saved types
- **WHEN** a volunteer with one saved opportunity, one saved talent, and one saved organization calls `GET /favorites`
- **THEN** the system returns 200 with all three items, correct `total`, and a non-null `summary` for each existing target

#### Scenario: Type filter narrows the list
- **WHEN** a volunteer calls `GET /favorites?targetType=organization`
- **THEN** the system returns only rows with `targetType: organization` with totals scoped to that filter

#### Scenario: Missing target yields null summary
- **WHEN** a saved target was deleted without cascade
- **THEN** the list still returns the row with `summary: null` and a 200 status

### Requirement: Caller favorite counts
The system SHALL expose `GET /favorites/counts` for callers with the volunteer role returning `{ opportunity: number, talent: number, organization: number }` totals scoped to the caller.

#### Scenario: Counts reflect caller state
- **WHEN** a volunteer with two saved opportunities, zero saved talents, and one saved organization calls `GET /favorites/counts`
- **THEN** the system returns 200 with `{ opportunity: 2, talent: 0, organization: 1 }`

### Requirement: Batch card-state lookup
The system SHALL expose `GET /favorites/lookup?targetType=&targetIds=` (comma-separated, 1–50 keys; opportunity keys MUST be ObjectId strings, talent keys are usernames, organization keys are slugs) returning a map of `{ favorited, favoriteCount }` per requested key. For authenticated volunteers `favorited` reflects their own saves; for guests every entry returns `favorited: false` with the public `favoriteCount`. Unknown or unresolvable keys return `{ favorited: false, favoriteCount: 0 }`.

#### Scenario: Authed caller gets per-card state
- **WHEN** an authenticated volunteer looks up one saved and one unsaved organization slug
- **THEN** the system returns 200 with `favorited: true` for the saved slug, `favorited: false` for the other, and the true platform `favoriteCount` for both

#### Scenario: Guest sees counts only
- **WHEN** a guest looks up valid targets without credentials
- **THEN** the system returns 200 with `favorited: false` on every entry and correct `favoriteCount` values

#### Scenario: Lookup bounds enforced
- **WHEN** a caller requests zero keys or more than 50 keys
- **THEN** the system returns 400 and performs no lookup (unresolvable keys inside a valid request instead yield zero entries)

### Requirement: Favorites data model and race safety
Favorite rows SHALL have the shape `{ userId, targetType: opportunity|talent|organization, targetId: string, createdAt }` where `targetId` is the opportunity ObjectId hex for `opportunity`, the volunteer userId hex for `talent`, and the organization account userId hex for `organization`. The collection SHALL enforce a unique index on `(userId, targetType, targetId)` with supporting indexes on `(userId, targetType, createdAt)` and `(targetType, targetId)`. Concurrent duplicate inserts MUST collapse to a single row via duplicate-key handling, never a 500.

#### Scenario: Unique triple enforced under concurrency
- **WHEN** two identical save requests race
- **THEN** exactly one row exists afterwards and both callers receive a 2xx `{ favorited: true }` response
