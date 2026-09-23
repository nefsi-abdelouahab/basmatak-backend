# volunteers Specification Change

## Purpose

Session 19 volunteers hardening (ROADMAP lines 858+): the talents feed must be served by a `(publicProfile.enabled, location.municipalityId)` compound index (replacing the lone `publicProfile.enabled` index) and must batch-populate per-page skills/catalog/media instead of querying once per card (no N+1).

## Requirements

## MODIFIED Requirements

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