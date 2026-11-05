## ADDED Requirements

### Requirement: Organization favorite toggles by slug
The system SHALL toggle organization saves via `POST /api/v1/favorites/organizations/:slug` and `DELETE /api/v1/favorites/organizations/:slug` (both idempotent; slugs raw). Behavior matches opportunity toggles (optimistic flip + reconcile), and the toggle SHALL be offered only to volunteer sessions because the backend routes require that role.

#### Scenario: Organization save persists by slug
- **WHEN** a volunteer clicks Save/Unsave on a public organization profile
- **THEN** the matching `/:slug` endpoint is called and the state persists across reload.

#### Scenario: Organization session cannot save
- **WHEN** an organization-role session views a public organization profile
- **THEN** no Save action is rendered and no forbidden toggle request is sent.

### Requirement: Saved items page
The system SHALL provide a volunteer saved-items page with one tab per target type (opportunities, volunteers, organizations), per-type counts, cursor pagination, and in-place unsave. Rows SHALL link only to currently public targets (published opportunities, active organizations, existing talent profiles), SHALL show a status label for non-public rows, and SHALL keep removed targets visible but disabled so the caller can still unsave them. Talent rows SHALL render the username, never `fullName`.

#### Scenario: Tabs page independently
- **WHEN** a volunteer switches from opportunities to organizations and back
- **THEN** each tab requests its own `targetType` page and preserves its cursor position.

#### Scenario: Non-public target is disabled
- **WHEN** a saved opportunity is no longer published or a saved organization is no longer active
- **THEN** the row shows its status, has no detail link, and remains removable.

#### Scenario: Empty tab offers a discovery path
- **WHEN** a tab has no saved items
- **THEN** an empty state explains the tab and offers a link to the relevant discovery surface (opportunities for organizations, since no public organization directory exists).

### Requirement: Organization save on public profile
The public organization profile SHALL render a Save/Saved action for guests and volunteers, hydrated from `GET /api/v1/favorites/lookup` keyed on the organization slug. Guests SHALL be redirected to Login with a return to the profile; organization and admin sessions SHALL omit the action.

#### Scenario: Guest save redirects to Login
- **WHEN** a guest clicks Save on a public organization profile
- **THEN** no mutation is sent and the browser navigates to Login with `next` set to the profile URL.

#### Scenario: Saved state hydrates
- **WHEN** a volunteer who saved the organization opens its profile
- **THEN** the action renders in the Saved state from the lookup response without a per-card request.

## MODIFIED Requirements

### Requirement: Batch card state via lookup
The system SHALL hydrate card save states via `GET /api/v1/favorites/lookup` (guest-tolerant: counts-only for anonymous callers) returning `{ favorited, favoriteCount }` per key, avoiding per-card favorite requests. Keys are opportunity ids, talent usernames, or organization slugs according to `targetType`.

#### Scenario: Cards hydrate from single lookup
- **WHEN** a feed page or public organization profile renders
- **THEN** one `GET /favorites/lookup` call supplies all visible cards' `{ favorited, favoriteCount }` state.

### Requirement: Own favorites reads for counts
The system SHALL read the caller's saves via `GET /api/v1/favorites` (list, all target types) and `GET /api/v1/favorites/counts` (per-type totals) for badges/summary displays where needed. These endpoints SHALL NOT be used for per-card state (lookup owns that).

#### Scenario: Counts display from counts endpoint
- **WHEN** a saved-count badge renders
- **THEN** it reads `GET /favorites/counts`, not a client-side count of loaded cards.
