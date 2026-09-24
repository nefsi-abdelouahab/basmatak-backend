## MODIFIED Requirements

### Requirement: Talents feed
The system SHALL expose public `GET /talents` (guest, no auth) listing volunteer profiles with `publicProfile.enabled=true`, cursor-paginated per the S1 convention (default limit 20, max 50) with counted cursor-page metadata. Filters SHALL be supported: `q` (bounded, case-insensitive match on `username`, `firstName`, `lastName`, and `bio`), `skillId` (the profile holds that skill in `volunteer_skills`), `categoryId` (the profile holds a skill belonging to that `skills` catalog category), and `wilayaId` (profile `location.wilayaId`); plus `minExperiences`, `hasAvailability`, `portfolio`, comma-separated `skillIds`, and comma-separated `wilayaIds` for the roadmap’s multi-select controls. The requested `minExperiences` threshold SHALL be evaluated from the volunteer’s experience count. `sort` SHALL accept only the talents-list server-defined whitelist and unknown values SHALL be rejected by DTO validation. The response SHALL include skill and wilaya facet counts computed from the filtered talent set. Each returned talent card SHALL be a public-safety projection only — every profile field obeys the same `show*` flag as the profile page, and the avatar is exposed only when the referenced media row is `visibility=public`. The card SHALL additionally carry the profile's neutral `registryId` (not subject to any `show*` gate). No private fields (`userId`, `email`, `phone`, `birthDate`, `stats`, full `location`) SHALL appear. Nested card dependencies for a page — `volunteer_skills`, `skills` catalog rows, and avatar media — SHALL be batch-populated, never fetched one query per card, so the endpoint's query count stays constant with page size (no N+1).

#### Scenario: Enabled talents listed, disabled hidden
- **WHEN** a guest calls `GET /talents`
- **THEN** the response is cursor-paginated and contains only volunteers with `publicProfile.enabled=true`

#### Scenario: Guest access needs no authentication
- **WHEN** an unauthenticated guest calls `GET /talents`
- **THEN** the request succeeds with `200` (no `401`/`403`)

#### Scenario: Skill filter narrows the feed
- **WHEN** a guest filters by `skillId`
- **THEN** only profiles holding that `volunteer_skill` are returned

#### Scenario: Category filter narrows the feed
- **WHEN** a guest filters by `categoryId`
- **THEN** only profiles holding a skill from that catalog category are returned

#### Scenario: Wilaya filter narrows the feed
- **WHEN** a guest filters by `wilayaId`
- **THEN** only profiles whose `location.wilayaId` matches are returned

#### Scenario: Roadmap filters narrow the feed
- **WHEN** a guest filters by `minExperiences`, `hasAvailability`, `portfolio`, comma-separated `skillIds`, or comma-separated `wilayaIds`
- **THEN** only enabled profiles satisfying every selected filter constraint are returned

#### Scenario: Facets reflect the filtered set
- **WHEN** a guest requests talents with any supported filters
- **THEN** the returned skill and wilaya facet counts are computed from that filtered result set and remain consistent with its total

#### Scenario: Keyword filter matches profile fields
- **WHEN** a guest filters by `q`
- **THEN** profiles whose `username`, `firstName`, `lastName`, or `bio` contains the term (case-insensitive) are returned

#### Scenario: Public-safety projection
- **WHEN** a talent card is rendered
- **THEN** `firstName`/`bio` appear only under `showBiography`, skills only under `showSkills`, location only under `showLocation`, the avatar only when `showAvatar` AND its media is `visibility=public`, the neutral `registryId` is always present, and no private field is included

#### Scenario: Sort values are validated
- **WHEN** a guest supplies a `sort` value outside the talents whitelist
- **THEN** validation rejects the request

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests a `limit` above 50
- **THEN** the limit is clamped to 50 and later pages advance via `cursor`

#### Scenario: Page dependencies batch-populated without N+1
- **WHEN** a page of talent cards with skills and avatars is rendered
- **THEN** the page loads its skills/catalog/media in a bounded number of batched queries independent of page size, and every card still resolves the same data
