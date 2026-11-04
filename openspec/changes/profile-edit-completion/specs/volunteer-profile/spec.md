## RENAMED Requirements

- FROM: `### Requirement: Opt-out public toggles default on`
- TO: `### Requirement: Opt-out public toggles reflect backend defaults`

## MODIFIED Requirements

### Requirement: Own volunteer identity read and update
The system SHALL render the volunteer's own identity from `GET /api/v1/volunteers/me` and persist edits via `PATCH /api/v1/volunteers/me` for every editable field: first and last name, headline (≤120), bio (≤2000), birth date (ISO), location `{wilayaId, municipalityId}` chosen from localized wilaya/municipality lookups, avatar `mediaId`, banner `mediaId`, availability note (≤500), preferred domains (≤10, each ≤60), and geographic base (≤120). The form SHALL never render a raw ObjectId as visible text. Loading, saving, success, and failure states SHALL use translated messages and the global toast system.

#### Scenario: Profile loads and saves every field
- **WHEN** a volunteer opens `volunteer/profile`, edits names, headline, bio, birth date, wilaya/municipality, availability note, domains, geographic base, avatar, or banner, and saves
- **THEN** the fields populate from `GET /volunteers/me`, the valid changes persist via `PATCH /volunteers/me`, and the refreshed values render with a success toast (en+ar).

#### Scenario: Location is selected, never typed as a raw code
- **WHEN** the volunteer opens the location fields
- **THEN** wilaya options come from `GET /locations/wilayas` and municipality options from `GET /locations/wilayas/:wilayaId/municipalities`, with locale-appropriate labels and no free-text code input.

#### Scenario: Invalid values are rejected client-side
- **WHEN** a field exceeds its backend limit or the birth date is not a valid date
- **THEN** submit is blocked with a field-level translated error and no request is sent.

### Requirement: Own skills CRUD with API-backed picker
The system SHALL manage skills via `GET/POST /api/v1/volunteers/me/skills` and `PATCH/DELETE /api/v1/volunteers/me/skills/:rowId`, with the picker sourced from `GET /api/v1/skills` (+ `GET /api/v1/skill-categories` for grouping). `GET /volunteers/me/skills` SHALL return each row's `_id` together with the localized catalog skill and category names. The edit UI SHALL display the localized names and SHALL send the row `_id` (never the catalog `skillId`) for update, primary-toggle, and delete.

#### Scenario: Skill add/update/delete persist
- **WHEN** a volunteer adds, updates, marks primary, or removes a skill
- **THEN** the corresponding endpoint is called with the row id and the list re-renders from the server response.

#### Scenario: No raw ids render
- **WHEN** the skills list loads
- **THEN** each row shows the localized skill and category names, not a Mongo id.

### Requirement: Opt-out public toggles reflect backend defaults
The system SHALL expose the visibility toggles from the `publicProfile` block returned by `GET /volunteers/me` and persist changes via `PATCH /api/v1/volunteers/me/public-settings`. Toggle state SHALL always reflect the server value, including the privacy-safe backend defaults (`showAvatar`, `showLocation`, and `showAvailability` default off; the remaining flags default on). The UI copy SHALL NOT claim that everything is public by default.

#### Scenario: Toggling visibility persists
- **WHEN** a volunteer switches any toggle and saves
- **THEN** `PATCH /volunteers/me/public-settings` persists it and the toggle state matches the server on reload.

#### Scenario: Defaults match the backend
- **WHEN** a new volunteer's profile loads
- **THEN** `showAvatar`, `showLocation`, and `showAvailability` render off and the other flags render on, exactly as returned by the server.

### Requirement: Dashboard completion readout and public link
The system SHALL read profile completion from `GET /api/v1/volunteers/me/profile-completion` (`{percent, missingFields, complete}`) and SHALL reconcile it with the `completion` object returned by `GET /api/v1/volunteers/me/dashboard`. The page SHALL show the authoritative percent, localized labels for every missing field, and a link to the matching edit section; when complete it SHALL show a positive complete state instead of a “reach 100%” prompt. The page SHALL link “View public profile” to `/volunteer/talents/<username>` using the raw username.

#### Scenario: Completion and missing fields render
- **WHEN** the profile page loads with a non-complete completion payload
- **THEN** the percent and each missing field are displayed from `missingFields` and no completion value is computed client-side.

#### Scenario: Complete profile shows completion
- **WHEN** `complete` is true and `percent` is 100
- **THEN** the page shows the completed state and no remaining-fields message.

## ADDED Requirements

### Requirement: Volunteer banner upload
The system SHALL upload the volunteer banner through the shared 2-step media flow (`POST /media/uploads` with purpose `volunteer_banner`, PUT bytes, `POST /media/:mediaId/confirm`) and persist the confirmed `mediaId` through `PATCH /volunteers/me`. The uploader SHALL accept JPEG, PNG, or WebP up to 5 MB, show progress, and reject invalid files before any network call.

#### Scenario: Banner upload completes
- **WHEN** a volunteer selects a valid banner image
- **THEN** the media is uploaded with purpose `volunteer_banner`, previewed, and saved through the profile PATCH.

#### Scenario: Invalid banner rejected
- **WHEN** the selected banner is over 5 MB or not an allowed image type
- **THEN** the upload is blocked with a translated error and no upload request is sent.
