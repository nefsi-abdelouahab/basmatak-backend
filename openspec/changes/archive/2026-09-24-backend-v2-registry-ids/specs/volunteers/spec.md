# volunteers Specification Delta

## MODIFIED Requirements

### Requirement: Volunteer profiles collection
The system SHALL provide a `volunteer_profiles` collection with a unique `userId`, a unique `username`, profile fields (full name, biographical fields, `birthDate`, `location` as `{ wilayaId, municipalityId }`, `avatar` and `banner` as `mediaId` object references), `registryId` (a server-minted neutral registry identifier in `VOL-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), `stats` (with `completedTasks`, `verifiedExperiences`, `volunteerHours`), and a `publicProfile` object with `enabled`, `showAvatar`, `showBiography`, `showLocation`, `showSkills`, `showExperiences`, `showAvailability`, `showPortfolio` — all booleans. Indexes SHALL include unique `userId`, unique `username`, `location.municipalityId`, and the compound `(publicProfile.enabled, location.municipalityId)` — whose leading `publicProfile.enabled` equality serves the talents feed's enabled-only filter (replacing any lone `publicProfile.enabled` index).

#### Scenario: One profile per volunteer
- **WHEN** a second row attempts the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Username uniqueness enforced
- **WHEN** a volunteer profile is created with a `username` that already exists
- **THEN** the unique `username` index rejects the insert

#### Scenario: Default privacy posture
- **WHEN** a volunteer profile is first created
- **THEN** `publicProfile.enabled` defaults to `false` and every `show*` flag defaults to `false`

#### Scenario: One registry identifier per volunteer
- **WHEN** a volunteer profile is created (or an existing row is backfilled)
- **THEN** the row carries a well-formed `VOL-` registry identifier minted by `RegistryIdService`, and the identifier is never client-settable or mutable afterwards

### Requirement: Read own profile
The system SHALL expose `GET /volunteers/me` returning the caller's own volunteer profile, eligible only to accounts with the `volunteer` role. It SHALL include profile fields, `location`, `publicProfile`, `stats`, and `registryId`. A non-volunteer caller SHALL receive `403`.

#### Scenario: Volunteer reads own profile
- **WHEN** an authenticated volunteer calls `GET /volunteers/me`
- **THEN** their own profile is returned including `publicProfile`, `stats`, and `registryId`

#### Scenario: Non-volunteer blocked
- **WHEN** an organization (or admin) account calls `GET /volunteers/me`
- **THEN** the response is `403`

### Requirement: Talents feed
The system SHALL expose public `GET /talents` (guest, no auth) listing volunteer profiles with `publicProfile.enabled=true`, cursor-paginated per the S1 convention (default limit 20, max 50), newest-first. Filters SHALL be supported: `q` (bounded, case-insensitive match on `username`, `firstName`, `lastName`, and `bio`), `skillId` (the profile holds that skill in `volunteer_skills`), `categoryId` (the profile holds a skill belonging to that `skills` catalog category), and `wilayaId` (profile `location.wilayaId`). Each returned talent card SHALL be a public-safety projection only — every profile field obeys the same `show*` flag as the profile page, and the avatar is exposed only when the referenced media row is `visibility=public`. The card SHALL additionally carry the profile's neutral `registryId` (not subject to any `show*` gate). No private fields (`userId`, `email`, `phone`, `birthDate`, `stats`, full `location`) SHALL appear. Nested card dependencies for a page — `volunteer_skills`, `skills` catalog rows, and avatar media — SHALL be batch-populated, never fetched one query per card, so the endpoint's query count stays constant with page size (no N+1).

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
- **THEN** `firstName`/`bio` appear only under `showBiography`, skills only under `showSkills`, location only under `showLocation`, the avatar only when `showAvatar` AND its media is `visibility=public`, the neutral `registryId` is always present, and no private field is included

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests a `limit` above 50
- **THEN** the limit is clamped to 50 and later pages advance via `cursor`

#### Scenario: Page dependencies batch-populated without N+1
- **WHEN** a page of talent cards with skills and avatars is rendered
- **THEN** the page loads its skills/catalog/media in a bounded number of batched queries independent of page size, and every card still resolves the same data

### Requirement: Public volunteer profile
The system SHALL expose public `GET /volunteers/:username` (guest, no auth) returning the volunteer's public profile. An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404` in the error envelope (A5). For an enabled profile the response SHALL include `username`, the neutral `registryId` (unconditionally, not subject to any `show*` gate), and each section gated by its `show*` flag: `firstName` and `bio` under `showBiography`, `avatar` under `showAvatar` (only when the media row is `visibility=public`), `location` under `showLocation`, `skills` under `showSkills` (from `volunteer_skills` joined to the catalog, with `skillId`, names, `level`, `isPrimary`), `experiences` under `showExperiences` (limited to rows with `publicVisibility=public`), `availability` under `showAvailability` (the weekly schedule), and `portfolio` under `showPortfolio` (served by the unchanged Session 1 `PortfolioQueryService` seam, empty until S14). Sections whose flag is off SHALL be omitted/null. Private fields (`userId`, `email`, `phone`, `birthDate`, `stats`) SHALL never be returned.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username` for an unknown username or one whose `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Enabled profile exposes flagged sections
- **WHEN** a guest calls `GET /volunteers/:username` for an enabled profile with `showBiography`, `showSkills`, `showExperiences`, `showAvailability`, and `showLocation` set
- **THEN** those sections are populated from live data and the neutral `registryId` is present

#### Scenario: Flag-off sections are hidden
- **WHEN** a profile section has its `show*` flag set to `false`
- **THEN** that section is omitted/null in the public profile, while the unconditional `registryId` is still present

#### Scenario: Private avatar media hidden
- **WHEN** a profile's `showAvatar` is true but the avatar media row is `visibility=private`
- **THEN** the avatar is omitted (null), not leaked

#### Scenario: Private fields never leak
- **WHEN** a guest reads any enabled public profile
- **THEN** no `userId`, `email`, `phone`, `birthDate`, or `stats` data is present in the response

### Requirement: Public volunteer experiences
The system SHALL expose public `GET /volunteers/:username/experiences` (guest, no auth). An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404`. For an enabled profile the response SHALL be cursor-paginated (S1 convention, default 20, max 50), newest-first, and SHALL contain only `volunteer_experiences` rows with `publicVisibility=public`, each exposing the snapshot fields (`title`, `description`, `skills`, `duration`), the neutral `registryId` (`EXP-` format), and evidence metadata restricted to `visibility=public` media. This dedicated listing endpoint does NOT depend on the `showExperiences` flag (per §2.6); that flag only controls whether the section appears on the profile page.

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username/experiences` for an unknown username or a profile with `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Only public-visibility experiences listed
- **WHEN** a guest reads the experiences of a volunteer who has both `public` and `private` experiences
- **THEN** only the `publicVisibility=public` rows are returned, newest-first, cursor-paginated, each carrying its `EXP-` registry identifier

#### Scenario: Evidence media restricted to public
- **WHEN** an experience's `evidenceIds` include media rows of `visibility=private`
- **THEN** those rows are excluded from the evidence metadata (A6)