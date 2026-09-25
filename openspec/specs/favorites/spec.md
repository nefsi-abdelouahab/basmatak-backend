# favorites Specification

## Purpose
TBD - created by archiving change backend-v2-favorites. Update Purpose after archive.
## Requirements
### Requirement: Opportunity favorite toggle
The system SHALL expose `POST /favorites/opportunities/:id` for callers with the volunteer role that saves the opportunity for the caller. The toggle SHALL be idempotent: repeating the call creates exactly one row. The opportunity MUST exist, otherwise the system returns 404 `OPPORTUNITY_NOT_FOUND`; a malformed id returns the same 404 (codebase convention: invalid ids map to NOT_FOUND at the service boundary).

#### Scenario: Volunteer saves an opportunity
- **WHEN** an authenticated volunteer POSTs a valid existing opportunity id
- **THEN** the system returns 201 with `{ favorited: true, favoriteCount }` and persists one favorite row for that caller

#### Scenario: Repeat save is idempotent
- **WHEN** the same volunteer POSTs the same opportunity id again (including concurrently)
- **THEN** the system returns 200 with `{ favorited: true, favoriteCount }` and still exactly one row exists for that `(userId, targetType, targetId)` triple

#### Scenario: Save of unknown opportunity fails
- **WHEN** a volunteer POSTs a well-formed but nonexistent opportunity id
- **THEN** the system returns 404 `OPPORTUNITY_NOT_FOUND` and persists nothing

### Requirement: Talent favorite toggle by username
The system SHALL expose `POST /favorites/talents/:username` for callers with the volunteer role that saves the talent for the caller, resolving `username` server-side to the volunteer's userId and storing that userId as `targetId`. An unknown username returns 404 `VOLUNTEER_PROFILE_NOT_FOUND`. Repeat calls are idempotent per the opportunity toggle.

#### Scenario: Volunteer saves a talent by username
- **WHEN** an authenticated volunteer POSTs an existing talent username
- **THEN** the system returns 201 (200 on repeat) with `{ favorited: true, favoriteCount }` and stores one row with `targetType: talent` and the resolved userId

#### Scenario: Save of unknown username fails
- **WHEN** a volunteer POSTs a username with no volunteer profile
- **THEN** the system returns 404 `VOLUNTEER_PROFILE_NOT_FOUND` and persists nothing

### Requirement: Idempotent unfavorite
The system SHALL expose `DELETE /favorites/opportunities/:id` and `DELETE /favorites/talents/:username` for callers with the volunteer role that remove the caller's matching row and return 204 whether or not a row existed. A malformed opportunity id returns 404 `OPPORTUNITY_NOT_FOUND`; an unknown talent username still returns 204.

#### Scenario: Volunteer unsaves both target types
- **WHEN** an authenticated volunteer DELETEs a previously saved opportunity id and a previously saved talent username
- **THEN** the system returns 204 for each and subsequent reads show `favorited: false`

#### Scenario: Delete of absent favorite succeeds silently
- **WHEN** a volunteer DELETEs an opportunity or talent username they never saved (or an unknown username)
- **THEN** the system returns 204 and no error is raised

### Requirement: Own favorites list
The system SHALL expose `GET /favorites` for callers with the volunteer role returning only that caller's favorites as a `CursorPage` with populated `total`/`page`/`pages`, newest-first, with an optional `?targetType=opportunity|talent` filter. Each item SHALL carry `{ targetType, targetId, createdAt, summary }` where `summary` is a best-effort lightweight snapshot (`{ title, slug }` for opportunities, `{ username, fullName }` for talents) and `null` when the target no longer exists.

#### Scenario: Volunteer lists both saved types
- **WHEN** a volunteer with one saved opportunity and one saved talent calls `GET /favorites`
- **THEN** the system returns 200 with both items, correct `total`, and a non-null `summary` for each existing target

#### Scenario: Type filter narrows the list
- **WHEN** a volunteer calls `GET /favorites?targetType=talent`
- **THEN** the system returns only rows with `targetType: talent` with totals scoped to that filter

#### Scenario: Missing target yields null summary
- **WHEN** a saved target was deleted without cascade
- **THEN** the list still returns the row with `summary: null` and a 200 status

### Requirement: Caller favorite counts
The system SHALL expose `GET /favorites/counts` for callers with the volunteer role returning `{ opportunity: number, talent: number }` totals scoped to the caller.

#### Scenario: Counts reflect caller state
- **WHEN** a volunteer with two saved opportunities and zero saved talents calls `GET /favorites/counts`
- **THEN** the system returns 200 with `{ opportunity: 2, talent: 0 }`

### Requirement: Batch card-state lookup
The system SHALL expose `GET /favorites/lookup?targetType=&targetIds=` (comma-separated, 1–50 keys; opportunity keys MUST be ObjectId strings, talent keys are usernames) returning a map of `{ favorited, favoriteCount }` per requested key. For authenticated volunteers `favorited` reflects their own saves; for guests every entry returns `favorited: false` with the public `favoriteCount`. Unknown or unresolvable keys return `{ favorited: false, favoriteCount: 0 }`.

#### Scenario: Authed caller gets per-card state
- **WHEN** an authenticated volunteer looks up one saved and one unsaved opportunity id
- **THEN** the system returns 200 with `favorited: true` for the saved id, `favorited: false` for the other, and the true platform `favoriteCount` for both

#### Scenario: Guest sees counts only
- **WHEN** a guest looks up valid targets without credentials
- **THEN** the system returns 200 with `favorited: false` on every entry and correct `favoriteCount` values

#### Scenario: Lookup bounds enforced
- **WHEN** a caller requests zero keys or more than 50 keys
- **THEN** the system returns 400 and performs no lookup (unresolvable keys inside a valid request instead yield zero entries)

### Requirement: Favorites data model and race safety
Favorite rows SHALL have the shape `{ userId, targetType: opportunity|talent, targetId: string, createdAt }` where `targetId` is the opportunity ObjectId hex for `opportunity` and the volunteer userId hex for `talent`. The collection SHALL enforce a unique index on `(userId, targetType, targetId)` with supporting indexes on `(userId, targetType, createdAt)` and `(targetType, targetId)`. Concurrent duplicate inserts MUST collapse to a single row via duplicate-key handling, never a 500.

#### Scenario: Unique triple enforced under concurrency
- **WHEN** two identical save requests race
- **THEN** exactly one row exists afterwards and both callers receive a 2xx `{ favorited: true }` response

### Requirement: Favorites authz isolation
Favorites SHALL be strictly per-account: every read and toggle scopes `userId` to the authenticated caller, and no route SHALL expose which users favorited a target — only aggregate counts. Guest (unauthenticated) calls to the volunteer-role routes SHALL be rejected with 401 by the existing auth guard; no new guest logic SHALL be introduced.

#### Scenario: Cross-user isolation
- **WHEN** volunteer A saves an opportunity and volunteer B lists favorites and counts
- **THEN** B sees none of A's rows, B's counts exclude A's saves, and no endpoint reveals A's identity as the saver

#### Scenario: Guest toggle rejected
- **WHEN** a guest POSTs any favorites toggle route without credentials
- **THEN** the system returns 401 and persists nothing

