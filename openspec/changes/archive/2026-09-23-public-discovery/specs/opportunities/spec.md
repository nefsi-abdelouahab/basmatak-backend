## MODIFIED Requirements

### Requirement: Recommended feed
The system SHALL expose `GET /opportunities/recommended` (authenticated, volunteer role) returning a rule-based, cursor-paginated feed (S1 convention, default 20, max 50) computed from the caller's own `volunteer_profiles`/`volunteer_skills` data (the same sources as S4). Only opportunities with `status=published` and at least one position with `filledCount < requiredCount` SHALL be candidates. Candidates SHALL be ranked by a deterministic score combining (a) skill-topic/level overlap between the volunteer's skills and the winning position's `requiredSkills`, (b) location match on `location.wilayaId`, and (c) recency, with stable tie-breaking. The route SHALL be declared before `GET /opportunities/:idOrSlug` in the controller so `recommended` is not shadowed by the `:idOrSlug` catch-all. No ML/search — a plain query per §0.

#### Scenario: Published open opportunities recommended
- **WHEN** a volunteer calls `GET /opportunities/recommended` and matching published opportunities with open positions exist
- **THEN** the response is a cursor-paginated list of those opportunities, ordered deterministically by score

#### Scenario: Non-published and full opportunities excluded
- **WHEN** an opportunity is `draft`, `closed`, `cancelled`, or `completed`, or has no position with `filledCount < requiredCount`
- **THEN** it is absent from the recommended feed

#### Scenario: Scored by skills, location and recency
- **WHEN** a volunteer has higher skill-overlap with one opportunity and a same-wilaya match with another
- **THEN** the higher-overlap / matched-wilaya opportunities rank above lower-overlap, mismatched-wilaya ones, with ties resolved deterministically so two calls with the same data return the same order

#### Scenario: No skill or location data still returns a feed
- **WHEN** a volunteer has no `volunteer_skills` or no `location`
- **THEN** the feed degrades gracefully (the skill/location components contribute nothing) and returns the published open-opportunity set, deterministically ordered

#### Scenario: Route not shadowed
- **WHEN** a volunteer calls `GET /opportunities/recommended`
- **THEN** the request resolves to the recommended handler, not the `:idOrSlug` detail handler