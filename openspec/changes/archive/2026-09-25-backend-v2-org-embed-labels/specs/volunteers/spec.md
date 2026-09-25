## ADDED Requirements

### Requirement: Favorites state on talent cards and public profile
The system SHALL include on `GET /talents` cards and `GET /volunteers/:username` responses `isFavorited` (caller's own save state for that talent) and `favoriteCount` (platform total) computed through the existing favorites store. Guests SHALL receive `favoriteCount` with `isFavorited: false`. Both routes SHALL accept optional authentication; guest-visible gating (`show*` flags, enabled profiles) SHALL be unchanged.

#### Scenario: Authed caller sees talent save state
- **WHEN** an authenticated volunteer who saved talent B reads `GET /talents` containing talents A and B
- **THEN** B's card returns `isFavorited: true`, A's returns `false`, and both carry true platform `favoriteCount` values

#### Scenario: Guest sees counts only on talents and profile
- **WHEN** a guest reads `GET /talents` and `GET /volunteers/:username`
- **THEN** every card and the profile return `isFavorited: false` with correct `favoriteCount` values

#### Scenario: Unknown talent still resolves to zero state
- **WHEN** a lookup-backed embed cannot resolve a favorite target
- **THEN** the card carries `{isFavorited: false, favoriteCount: 0}` and the response is still 200
