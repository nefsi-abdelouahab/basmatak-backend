## ADDED Requirements

### Requirement: Opportunity favorite toggles
The system SHALL toggle opportunity saves via `POST /api/v1/favorites/opportunities/:id` (idempotent save, 201 created / 200 already-saved) and `DELETE /api/v1/favorites/opportunities/:id` (idempotent unsave, 204). Toggles SHALL optimistically flip and reconcile with `{ favorited, favoriteCount }` / 204.

#### Scenario: Save and unsave persist
- **WHEN** a volunteer clicks Save/Unsave on an opportunity card
- **THEN** the matching endpoint is called, the toggle state persists across reload, and the count updates from the server response.

### Requirement: Talent favorite toggles by username
The system SHALL toggle talent saves via `POST /api/v1/favorites/talents/:username` and `DELETE /api/v1/favorites/talents/:username` (both idempotent; usernames raw, no `@` prefix). Behavior matches opportunity toggles (optimistic flip + reconcile).

#### Scenario: Talent save persists by username
- **WHEN** a volunteer clicks Save/Unsave on a talent card
- **THEN** the matching `/:username` endpoint is called and the state persists across reload.

### Requirement: Batch card state via lookup
The system SHALL hydrate card save states via `GET /api/v1/favorites/lookup` (guest-tolerant: counts-only for anonymous callers) returning `{ favorited, favoriteCount }` per key, avoiding per-card favorite requests.

#### Scenario: Cards hydrate from single lookup
- **WHEN** a feed page renders
- **THEN** one `GET /favorites/lookup` call supplies all visible cards' `{ favorited, favoriteCount }` state.

### Requirement: Own favorites reads for counts
The system SHALL read the caller's saves via `GET /api/v1/favorites` (list, both target types) and `GET /api/v1/favorites/counts` (per-type totals) for badges/summary displays where needed. These endpoints SHALL NOT be used for per-card state (lookup owns that).

#### Scenario: Counts display from counts endpoint
- **WHEN** a saved-count badge renders
- **THEN** it reads `GET /favorites/counts`, not a client-side count of loaded cards.

### Requirement: Guest Save redirects to Login
The system SHALL redirect guest Save attempts (or any 401 from a favorite mutation) to Login via `getLoginHref(locale, next)` per decision 10 — the backend only ever returns 401 and never renders its own login UI.

#### Scenario: Guest favorite goes to login
- **WHEN** a guest clicks Save on any opportunity or talent card
- **THEN** no mutation is sent (or its 401 is caught) and the browser navigates to the Login route with a `next` return to the originating feed.
