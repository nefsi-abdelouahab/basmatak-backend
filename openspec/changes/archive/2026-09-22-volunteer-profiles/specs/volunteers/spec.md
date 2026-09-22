## ADDED Requirements

### Requirement: Volunteer profiles collection
The system SHALL provide a `volunteer_profiles` collection with a unique `userId`, a unique `username`, profile fields (full name, biographical fields, `birthDate`, `location` as `{ wilayaId, municipalityId }`, `avatar` and `banner` as `mediaId` object references), `stats` (with `completedTasks`, `verifiedExperiences`, `volunteerHours`), and a `publicProfile` object with `enabled`, `showAvatar`, `showBiography`, `showLocation`, `showSkills`, `showExperiences`, `showAvailability`, `showPortfolio` — all booleans. Indexes SHALL include unique `userId`, unique `username`, and `location.municipalityId` and `publicProfile.enabled`.

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
The system SHALL expose `PATCH /volunteers/me` allowing the volunteer to update profile fields (names, biographical fields, `birthDate`, `location` with `wilayaId`/`municipalityId`, and `avatar`/`banner` media references). `username` and `userId` SHALL NOT be modifiable here. `avatar`/`banner` SHALL accept a value validated only as a well-formed Mongo ObjectId (real media existence/ownership is deferred to Session 8). Only the indicated fields SHALL change; `publicProfile` is not editable from this endpoint.

#### Scenario: Profile fields updated
- **WHEN** a volunteer patches bio, `birthDate`, and `location`
- **THEN** the profile reflects the new values and unrelated fields are unchanged

#### Scenario: malformed mediaId rejected
- **WHEN** a volunteer sends an `avatar`/`banner` value that is not a valid Mongo ObjectId
- **THEN** the request is rejected with `400`/`422`

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