# volunteers Specification

## Purpose
TBD - created by archiving change volunteer-profiles. Update Purpose after archive.
## Requirements
### Requirement: Volunteer profiles collection
The system SHALL provide a `volunteer_profiles` collection with a unique `userId`, a unique `username`, profile fields (full name, biographical fields, `birthDate`, `location` as `{ wilayaId, municipalityId }`, `avatar` and `banner` as `mediaId` object references), `stats` (with `completedTasks`, `verifiedExperiences`, `volunteerHours`), and a `publicProfile` object with `enabled`, `showAvatar`, `showBiography`, `showLocation`, `showSkills`, `showExperiences`, `showAvailability`, `showPortfolio` — all booleans. Indexes SHALL include unique `userId`, unique `username`, `location.municipalityId`, and the compound `(publicProfile.enabled, location.municipalityId)` — whose leading `publicProfile.enabled` equality serves the talents feed's enabled-only filter (replacing any lone `publicProfile.enabled` index).

#### Scenario: One profile per volunteer
- **WHEN** a second row attempts the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Username uniqueness enforced
- **WHEN** a volunteer profile is created with a `username` that already exists
- **THEN** the unique `username` index rejects the insert

#### Scenario: Default privacy posture
- **WHEN** a volunteer profile is first created
- **THEN** `publicProfile.enabled` defaults to `false` and every `show*` flag defaults to `false`

### Requirement: Volunteer registration creates the profile
The system SHALL create a `volunteer_profiles` row when a volunteer registers, through the `RegistrationExtrasService` seam (dispatched on `user.role`): the volunteer provider SHALL generate a unique `username` via the canonical slug utility (ASCII transliteration, collision retry) and store it. This SHALL not change behavior for non-volunteer roles, which continue through the inert default.

#### Scenario: Volunteer registration produces a profile
- **WHEN** a volunteer account registers
- **THEN** a `volunteer_profiles` row exists for that user with a unique generated `username`

#### Scenario: Non-volunteer registration unaffected
- **WHEN** an organization (or later role) registers
- **THEN** no `volunteer_profiles` row is created and the registration behaves exactly as before

### Requirement: Read own profile
The system SHALL expose `GET /volunteers/me` returning the caller's own volunteer profile, eligible only to accounts with the `volunteer` role. It SHALL include profile fields, `location`, `publicProfile`, and `stats`. A non-volunteer caller SHALL receive `403`.

#### Scenario: Volunteer reads own profile
- **WHEN** an authenticated volunteer calls `GET /volunteers/me`
- **THEN** their own profile is returned including `publicProfile` and `stats`

#### Scenario: Non-volunteer blocked
- **WHEN** an organization (or admin) account calls `GET /volunteers/me`
- **THEN** the response is `403`

### Requirement: Update own profile
The system SHALL expose `PATCH /volunteers/me` allowing the volunteer to update profile fields (names, biographical fields, `birthDate`, `location` with `wilayaId`/`municipalityId`, and `avatar`/`banner` media references). `username` and `userId` SHALL NOT be modifiable here. `avatar`/`banner` SHALL be validated through `MediaOwnership.assertFor` (Session 8 retrofit of the F9 seam): the mediaId SHALL reference an existing, non-deleted `media` row owned by the caller; `avatar` SHALL additionally carry `purpose=avatar`. Foreign, absent, or deleted media SHALL be rejected. Only the indicated fields SHALL change; `publicProfile` is not editable from this endpoint.

#### Scenario: Profile fields updated
- **WHEN** a volunteer patches bio, `birthDate`, and `location`
- **THEN** the profile reflects the new values and unrelated fields are unchanged

#### Scenario: malformed mediaId rejected
- **WHEN** a volunteer sends an `avatar`/`banner` value that is not a valid Mongo ObjectId
- **THEN** the request is rejected with `400`/`422`

#### Scenario: Own avatar accepted
- **WHEN** a volunteer sets `avatar` to a media row they own with `purpose=avatar` and not deleted
- **THEN** the profile is updated with that media reference

#### Scenario: Foreign media rejected
- **WHEN** a volunteer sets `avatar`/`banner` to media owned by another user
- **THEN** the request is rejected with `404`/`403` via `MediaOwnership.assertFor`

#### Scenario: Absent or deleted media rejected
- **WHEN** a volunteer sets `avatar`/`banner` to a mediaId that does not exist or is soft-deleted
- **THEN** the request is rejected via `MediaOwnership.assertFor`

#### Scenario: Wrong purpose rejected
- **WHEN** a volunteer sets `avatar` to media whose `purpose` is not `avatar`
- **THEN** the request is rejected via `MediaOwnership.assertFor`

### Requirement: Public-settings privacy toggles
The system SHALL expose `PATCH /volunteers/me/public-settings` accepting **only** the `publicProfile` fields (`enabled` and any `show*` flag). The endpoint SHALL update exactly those flags and no other profile field.

#### Scenario: Toggle public profile flags
- **WHEN** a volunteer patches `publicProfile.enabled` and `publicProfile.showSkills`
- **THEN** only those flags change on the profile

#### Scenario: Non-public-settings field rejected
- **WHEN** a volunteer sends any field outside `publicProfile` to `PATCH /volunteers/me/public-settings`
- **THEN** the extra field is rejected by the validation pipe (`400`)

### Requirement: Volunteer skills collection
The system SHALL provide a `volunteer_skills` collection with `volunteerId`, `skillId` (referencing the seeded `skills` catalog), `level`, `yearsOfExperience`, and `isPrimary`. It SHALL have a unique index on `(volunteerId, skillId)`.

#### Scenario: Duplicate skill rejected by index
- **WHEN** a volunteer adds the same `skillId` a second time
- **THEN** the unique `(volunteerId, skillId)` index rejects the second row

### Requirement: List volunteer skills
The system SHALL expose `GET /volunteers/me/skills` returning the caller's own skill rows.

#### Scenario: Own skills returned
- **WHEN** an authenticated volunteer calls `GET /volunteers/me/skills`
- **THEN** their own skill rows are returned

### Requirement: Add a volunteer skill
The system SHALL expose `POST /volunteers/me/skills` accepting `skillId`, `level`, `yearsOfExperience`, `isPrimary`. The referenced skill SHALL exist and be `active` in the seeded catalog, a duplicate `skillId` SHALL be rejected (`409`), and at most one skill of a profile SHALL be `isPrimary` (setting one clears the previous primary).

#### Scenario: Skill added with validation
- **WHEN** a volunteer adds a valid active `skillId` with a `level`
- **THEN** the skill row is created for that profile

#### Scenario: Unknown or inactive skill rejected
- **WHEN** a volunteer adds a `skillId` that is absent from or deactivated in the `skills` catalog
- **THEN** the add fails with a business error

#### Scenario: Duplicate skill add rejected
- **WHEN** a volunteer tries to add an existing `(volunteerId, skillId)` pair
- **THEN** the response is `409`

#### Scenario: Single primary skill enforced
- **WHEN** a volunteer sets `isPrimary: true` on a skill while another is already primary
- **THEN** the previous primary flag is cleared so exactly one `isPrimary` remains

### Requirement: Update a volunteer skill
The system SHALL expose `PATCH /volunteers/me/skills/:skillId` allowing updates to `level`, `yearsOfExperience`, and `isPrimary`, preserving the one-primary rule and the existing `(volunteerId, skillId)` uniqueness.

#### Scenario: Skill fields updated
- **WHEN** a volunteer patches a skill's `level` and `yearsOfExperience`
- **THEN** the row reflects the new values

### Requirement: Delete a volunteer skill
The system SHALL expose `DELETE /volunteers/me/skills/:skillId` removing the caller's own skill row.

#### Scenario: Own skill deleted
- **WHEN** a volunteer deletes one of their own skills
- **THEN** the row is removed and it no longer appears in `GET /volunteers/me/skills`

### Requirement: Volunteer availability collection
The system SHALL provide a `volunteer_availability` collection keyed by a unique `volunteerId` storing a full weekly schedule of the volunteer's availability.

#### Scenario: One availability row per volunteer
- **WHEN** a second row attempts the same `volunteerId`
- **THEN** the unique `volunteerId` index rejects the insert

### Requirement: Read availability
The system SHALL expose `GET /volunteers/me/availability` returning the caller's current weekly availability schedule.

#### Scenario: Own schedule returned
- **WHEN** an authenticated volunteer calls `GET /volunteers/me/availability`
- **THEN** their full weekly schedule is returned

### Requirement: Replace availability schedule
The system SHALL expose `PUT /volunteers/me/availability` that replaces the volunteer's whole weekly schedule atomically (upsert by `volunteerId`).

#### Scenario: Whole schedule replaced
- **WHEN** a volunteer sends a complete new schedule via `PUT /volunteers/me/availability`
- **THEN** the stored schedule equals the sent schedule, replacing any previous one

### Requirement: Volunteer dashboard
The system SHALL expose `GET /volunteers/me/dashboard` returning (a) a profile completion percentage derived from how many profile fields are filled, (b) `stats` read from `volunteer_profiles.stats` (zeroed until Session 11 populates them), and (c) the latest verified experience placeholder (empty until Session 11).

#### Scenario: Completion percentage computed
- **WHEN** a volunteer partially fills their profile and calls the dashboard
- **THEN** the completion percentage reflects the filled portion of the defined profile fields

#### Scenario: Stats are zeroed before Session 11
- **WHEN** a volunteer calls the dashboard before any verification has happened
- **THEN** `stats` fields (`completedTasks`, `verifiedExperiences`, `volunteerHours`) are `0`

### Requirement: Talents feed
The system SHALL expose public `GET /talents` (guest, no auth) listing volunteer profiles with `publicProfile.enabled=true`, cursor-paginated per the S1 convention (default limit 20, max 50), newest-first. Filters SHALL be supported: `q` (bounded, case-insensitive match on `username`, `firstName`, `lastName`, and `bio`), `skillId` (the profile holds that skill in `volunteer_skills`), `categoryId` (the profile holds a skill belonging to that `skills` catalog category), and `wilayaId` (profile `location.wilayaId`). Each returned talent card SHALL be a public-safety projection only — every profile field obeys the same `show*` flag as the profile page, and the avatar is exposed only when the referenced media row is `visibility=public`. No private fields (`userId`, `email`, `phone`, `birthDate`, `stats`, full `location`) SHALL appear. Nested card dependencies for a page — `volunteer_skills`, `skills` catalog rows, and avatar media — SHALL be batch-populated, never fetched one query per card, so the endpoint's query count stays constant with page size (no N+1).

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

#### Scenario: Page dependencies batch-populated without N+1
- **WHEN** a page of talent cards with skills and avatars is rendered
- **THEN** the page loads its skills/catalog/media in a bounded number of batched queries independent of page size, and every card still resolves the same data

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

