## MODIFIED Requirements

### Requirement: Volunteer profiles collection
The system SHALL provide a `volunteer_profiles` collection with a unique `userId`, a unique `username`, profile fields (full name, biographical fields, `birthDate`, `location` as `{ wilayaId, municipalityId }`, `avatar` and `banner` as `mediaId` object references), `registryId` (a server-minted neutral registry identifier in `VOL-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), `stats` (with `completedTasks`, `verifiedExperiences`, `volunteerHours`), optional public-identity fields `headline` (short text, max 120), `availabilityNote` (free text, max 500), `preferredDomains` (bounded free-text array, max 10 entries each max 60 — element type proposed, see design Open Questions), `geographicBase` (free text, max 120 — shape proposed, see design Open Questions), and a `publicProfile` object with `enabled`, `showAvatar`, `showBiography`, `showLocation`, `showSkills`, `showExperiences`, `showAvailability`, `showPortfolio`, `showStats` (new flag gating the public stats block) — all booleans. Opt-out defaults for new rows: `enabled`, `showBiography`, `showSkills`, `showExperiences`, `showPortfolio`, `showStats` default to `true` (decision 5); `showAvatar`, `showLocation`, `showAvailability` keep their existing `false` defaults pending owner confirmation (see design Open Questions). Indexes SHALL include unique `userId`, unique `username`, `location.municipalityId`, and the compound `(publicProfile.enabled, location.municipalityId)` — whose leading `publicProfile.enabled` equality serves the talents feed's enabled-only filter (replacing any lone `publicProfile.enabled` index).

#### Scenario: One profile per volunteer
- **WHEN** a second row attempts the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Username uniqueness enforced
- **WHEN** a volunteer profile is created with a `username` that already exists
- **THEN** the unique `username` index rejects the insert

#### Scenario: Default privacy posture
- **WHEN** a volunteer profile is first created
- **THEN** `publicProfile.enabled`, `showBiography`, `showSkills`, `showExperiences`, `showPortfolio`, and `showStats` default to `true`, and the volunteer may disable any flag afterwards via the existing settings routes

#### Scenario: One registry identifier per volunteer
- **WHEN** a volunteer profile is created (or an existing row is backfilled)
- **THEN** the row carries a well-formed `VOL-` registry identifier minted by `RegistryIdService`, and the identifier is never client-settable or mutable afterwards

#### Scenario: New optional fields accepted within bounds
- **WHEN** a volunteer sets `headline`, `availabilityNote`, `preferredDomains`, or `geographicBase` within the documented bounds
- **THEN** the values persist on the profile and values outside the bounds are rejected by validation

### Requirement: Update own profile
The system SHALL expose `PATCH /volunteers/me` allowing the volunteer to update profile fields (names, biographical fields, `birthDate`, `location` with `wilayaId`/`municipalityId`, `avatar`/`banner` media references, and the new optional `headline`, `availabilityNote`, `preferredDomains`, `geographicBase`). `username` and `userId` SHALL NOT be modifiable here. `avatar`/`banner` SHALL be validated through `MediaOwnership.assertFor` (Session 8 retrofit of the F9 seam): the mediaId SHALL reference an existing, non-deleted `media` row owned by the caller; `avatar` SHALL additionally carry `purpose=avatar`. Foreign, absent, or deleted media SHALL be rejected. Only the indicated fields SHALL change; `publicProfile` is not editable from this endpoint.

#### Scenario: Profile fields updated
- **WHEN** a volunteer patches bio, `birthDate`, and `location`
- **THEN** the profile reflects the new values and unrelated fields are unchanged

#### Scenario: New public-identity fields updated
- **WHEN** a volunteer patches `headline`, `availabilityNote`, `preferredDomains`, and `geographicBase`
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
The system SHALL expose `PATCH /volunteers/me/public-settings` accepting **only** the `publicProfile` fields (`enabled` and any `show*` flag, including the new `showStats`). The endpoint SHALL update exactly those flags and no other profile field.

#### Scenario: Toggle public profile flags
- **WHEN** a volunteer patches `publicProfile.enabled` and `publicProfile.showSkills`
- **THEN** only those flags change on the profile

#### Scenario: Toggle the stats flag
- **WHEN** a volunteer patches `publicProfile.showStats` to `false`
- **THEN** only that flag changes and subsequent public reads omit the stats block

#### Scenario: Non-public-settings field rejected
- **WHEN** a volunteer sends any field outside `publicProfile` to `PATCH /volunteers/me/public-settings`
- **THEN** the extra field is rejected by the validation pipe (`400`)

### Requirement: Talents feed
The system SHALL expose public `GET /talents` (guest, no auth) listing volunteer profiles with `publicProfile.enabled=true`, cursor-paginated per the S1 convention (default limit 20, max 50) with counted cursor-page metadata. Filters SHALL be supported: `q` (bounded, case-insensitive match on `username`, `firstName`, `lastName`, and `bio`), `skillId` (the profile holds that skill in `volunteer_skills`), `categoryId` (the profile holds a skill belonging to that `skills` catalog category), and `wilayaId` (profile `location.wilayaId`); plus `minExperiences`, `hasAvailability`, `portfolio`, comma-separated `skillIds`, and comma-separated `wilayaIds` for the roadmap's multi-select controls. The requested `minExperiences` threshold SHALL be evaluated from the volunteer's experience count. `sort` SHALL accept only the talents-list server-defined whitelist and unknown values SHALL be rejected by DTO validation. The response SHALL include skill and wilaya facet counts computed from the filtered talent set. Each returned talent card SHALL be a public-safety projection only — every profile field obeys the same `show*` flag as the profile page, and the avatar is exposed only when the referenced media row is `visibility=public`. The card SHALL additionally carry the profile's neutral `registryId` (not subject to any `show*` gate) and the `stats` block only when `showStats` is true. No other private fields (`userId`, `email`, `phone`, `birthDate`, full `location`) SHALL appear. Nested card dependencies for a page — `volunteer_skills`, `skills` catalog rows, and avatar media — SHALL be batch-populated, never fetched one query per card, so the endpoint's query count stays constant with page size (no N+1).

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
- **THEN** `firstName`/`bio` appear only under `showBiography`, skills only under `showSkills`, location only under `showLocation`, the avatar only when `showAvatar` AND its media is `visibility=public`, `stats` only when `showStats` is true, the neutral `registryId` is always present, and no private field is included

#### Scenario: Sort values are validated
- **WHEN** a guest supplies a `sort` value outside the talents whitelist
- **THEN** validation rejects the request

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests a `limit` above 50
- **THEN** the limit is clamped to 50 and later pages advance via `cursor`

#### Scenario: Page dependencies batch-populated without N+1
- **WHEN** a page of talent cards with skills and avatars is rendered
- **THEN** the page loads its skills/catalog/media in a bounded number of batched queries independent of page size, and every card still resolves the same data

### Requirement: Public volunteer profile
The system SHALL expose public `GET /volunteers/:username` (guest, no auth) returning the volunteer's public profile. An unknown username or a profile whose `publicProfile.enabled=false` SHALL produce `404` in the error envelope (A5). For an enabled profile the response SHALL include `username`, `fullName` (first and last name merged; `lastName` is public — decision 5 surname exposure), the neutral `registryId` (unconditionally, not subject to any `show*` gate), `createdAt`, and each section gated by its `show*` flag: `firstName` and `bio` under `showBiography`, `headline`, `availabilityNote`, `preferredDomains`, `geographicBase` under `showBiography`, `avatar` under `showAvatar` (only when the media row is `visibility=public`), `location` under `showLocation`, `skills` under `showSkills` (from `volunteer_skills` joined to the catalog, with `skillId`, names, `level`, `isPrimary`), `experiences` under `showExperiences` (limited to rows with `publicVisibility=public`), `availability` under `showAvailability` (the weekly schedule), `portfolio` under `showPortfolio` (served by the unchanged Session 1 `PortfolioQueryService` seam, empty until S14), `stats` under the new `showStats` flag, and the derived `areasOfContribution` breakdown. Sections whose flag is off SHALL be omitted/null. Private fields (`userId`, `email`, `phone`, `birthDate`) SHALL never be returned. No free-form "Community Contributions" list SHALL exist anywhere in the payload (CUT per FCD #4).

#### Scenario: Disabled or unknown profile is 404
- **WHEN** a guest calls `GET /volunteers/:username` for an unknown username or one whose `publicProfile.enabled=false`
- **THEN** the response is `404` in the error envelope

#### Scenario: Enabled profile exposes flagged sections
- **WHEN** a guest calls `GET /volunteers/:username` for an enabled profile with `showBiography`, `showSkills`, `showExperiences`, `showAvailability`, `showStats`, and `showLocation` set
- **THEN** those sections are populated from live data and the neutral `registryId`, `fullName`, and `createdAt` are present

#### Scenario: Flag-off sections are hidden
- **WHEN** a profile section has its `show*` flag set to `false`
- **THEN** that section is omitted/null in the public profile, while the unconditional `registryId` is still present

#### Scenario: Stats hidden when showStats is off
- **WHEN** a profile has `showStats=false`
- **THEN** the public profile contains no `stats` block while all other enabled sections remain visible

#### Scenario: Private avatar media hidden
- **WHEN** a profile's `showAvatar` is true but the avatar media row is `visibility=private`
- **THEN** the avatar is omitted (null), not leaked

#### Scenario: Private fields never leak
- **WHEN** a guest reads any enabled public profile
- **THEN** no `userId`, `email`, `phone`, or `birthDate` data is present in the response

#### Scenario: No free-form contributions list
- **WHEN** a guest reads any enabled public profile
- **THEN** the payload contains no free-form "Community Contributions" text list; contribution insight appears only as the derived `areasOfContribution` breakdown

## ADDED Requirements

### Requirement: Derived areas of contribution
The system SHALL compute `areasOfContribution` at read time on the public volunteer profile from the volunteer's verified-experience skill/category breakdown. Each entry SHALL carry a category label and the share of verified experiences in that category, sorted descending, with at most 8 entries. The value SHALL NOT be stored on any collection. The exact weighting rule (count-based share; denominator and rounding; handling of experiences with no mapped category) follows the owner-confirmed definition in design Open Questions.

#### Scenario: Contribution areas derived at read time
- **WHEN** a guest reads the public profile of an enabled volunteer with verified experiences across several skill categories
- **THEN** the response carries up to 8 category entries sorted by share descending, computed from live experience data with no stored field

#### Scenario: No stored contribution field
- **WHEN** any `volunteer_profiles` document is inspected in the database
- **THEN** it carries no `areasOfContribution` (or equivalent) stored field
