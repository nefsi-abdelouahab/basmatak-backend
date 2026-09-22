## ADDED Requirements

### Requirement: Talents feed
The system SHALL expose public `GET /talents` (guest, no auth) listing volunteer profiles with `publicProfile.enabled=true`, cursor-paginated per the S1 convention (default limit 20, max 50), newest-first. Filters SHALL be supported: `q` (bounded, case-insensitive match on `username`, `firstName`, `lastName`, and `bio`), `skillId` (the profile holds that skill in `volunteer_skills`), `categoryId` (the profile holds a skill belonging to that `skills` catalog category), and `wilayaId` (profile `location.wilayaId`). Each returned talent card SHALL be a public-safety projection only — every profile field obeys the same `show*` flag as the profile page, and the avatar is exposed only when the referenced media row is `visibility=public`. No private fields (`userId`, `email`, `phone`, `birthDate`, `stats`, full `location`) SHALL appear.

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

#### Scenario: Keyword filter matches profile fields
- **WHEN** a guest filters by `q`
- **THEN** profiles whose `username`, `firstName`, `lastName`, or `bio` contains the term (case-insensitive) are returned

#### Scenario: Public-safety projection
- **WHEN** a talent card is rendered
- **THEN** `firstName`/`bio` appear only under `showBiography`, skills only under `showSkills`, location only under `showLocation`, the avatar only when `showAvatar` AND its media is `visibility=public`, and no private field is included

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests a `limit` above 50
- **THEN** the limit is clamped to 50 and later pages advance via `cursor`

### Requirement: Public volunteer profile
The system SHALL expose public `GET /volunteers/:username` (guest, no auth) returning the volunteer's public profile. An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404` in the error envelope (A5). For an enabled profile the response SHALL include `username` and each section gated by its `show*` flag: `firstName` and `bio` under `showBiography`, `avatar` under `showAvatar` (only when the media row is `visibility=public`), `location` under `showLocation`, `skills` under `showSkills` (from `volunteer_skills` joined to the catalog, with `skillId`, names, `level`, `isPrimary`), `experiences` under `showExperiences` (limited to rows with `publicVisibility=public`), `availability` under `showAvailability` (the weekly schedule), and `portfolio` under `showPortfolio` (served by the unchanged Session 1 `PortfolioQueryService` seam, empty until S14). Sections whose flag is off SHALL be omitted/null. Private fields (`userId`, `email`, `phone`, `birthDate`, `stats`) SHALL never be returned.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username` for an unknown username or one whose `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Enabled profile exposes flagged sections
- **WHEN** a guest calls `GET /volunteers/:username` for an enabled profile with `showBiography`, `showSkills`, `showExperiences`, `showAvailability`, and `showLocation` set
- **THEN** those sections are populated from live data

#### Scenario: Flag-off sections are hidden
- **WHEN** a profile section has its `show*` flag set to `false`
- **THEN** that section is omitted/null in the public profile

#### Scenario: Private avatar media hidden
- **WHEN** a profile's `showAvatar` is true but the avatar media row is `visibility=private`
- **THEN** the avatar is omitted (null), not leaked

#### Scenario: Private fields never leak
- **WHEN** a guest reads any enabled public profile
- **THEN** no `userId`, `email`, `phone`, `birthDate`, or `stats` data is present in the response

### Requirement: Public volunteer experiences
The system SHALL expose public `GET /volunteers/:username/experiences` (guest, no auth). An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404`. For an enabled profile the response SHALL be cursor-paginated (S1 convention, default 20, max 50), newest-first, and SHALL contain only `volunteer_experiences` rows with `publicVisibility=public`, each exposing the snapshot fields (`title`, `description`, `skills`, `duration`) and evidence metadata restricted to `visibility=public` media. This dedicated listing endpoint does NOT depend on the `showExperiences` flag (per §2.6); that flag only controls whether the section appears on the profile page.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username/experiences` for an unknown username or a profile with `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Only public-visibility experiences listed
- **WHEN** a guest reads the experiences of a volunteer who has both `public` and `private` experiences
- **THEN** only the `publicVisibility=public` rows are returned, newest-first, cursor-paginated

#### Scenario: Evidence media restricted to public
- **WHEN** an experience's `evidenceIds` include media rows of `visibility=private`
- **THEN** those rows are excluded from the evidence metadata (A6)

### Requirement: Public volunteer portfolio
The system SHALL expose public `GET /volunteers/:username/portfolio` (guest, no auth). An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404`. For an enabled profile the response SHALL be produced by the unchanged Session 1 `PortfolioQueryService` seam (`getPublicPortfolio(username)`), which returns an empty-but-correct `{ items: [] }` shape until Session 14 replaces it. This change SHALL NOT replace or override the portfolio seam binding.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username/portfolio` for an unknown username or a profile with `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Portfolio served by the S1 seam
- **WHEN** a guest reads the portfolio of an enabled profile before Session 14
- **THEN** the response is the seam's empty-but-correct `{ items: [] }` shape