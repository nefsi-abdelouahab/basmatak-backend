# volunteer-profile Specification

## Purpose
TBD - created by archiving change frontend-volunteer-account. Update Purpose after archive.
## Requirements
### Requirement: Own volunteer identity read and update
The system SHALL render the volunteer's own identity from `GET /api/v1/volunteers/me` and persist edits via `PATCH /api/v1/volunteers/me` (names incl. `lastName`, `headline`, bio, `birthDate`, location `{wilayaId, municipalityId}`, avatar `mediaId`). Phone input SHALL validate against `/^\+?[0-9]{8,15}$/` (no spaces); password rules do not apply here.

#### Scenario: Profile loads and saves
- **WHEN** a volunteer opens `volunteer/profile`
- **THEN** fields populate from `GET /volunteers/me` and a valid edit persists via `PATCH /volunteers/me` with success feedback (en+ar).

#### Scenario: Invalid phone rejected client-side
- **WHEN** a phone value failing `/^\+?[0-9]{8,15}$/` is entered
- **THEN** submit is blocked with a validation error and no request is sent.

### Requirement: Avatar upload via 2-step presigned flow
The system SHALL upload avatars via `POST /api/v1/media/uploads` (purpose `avatar`, images jpeg/png/webp ≤5 MB) → PUT bytes to `uploadUrl` → `POST /api/v1/media/:mediaId/confirm`, then set the confirmed `mediaId` via `PATCH /volunteers/me`. Upload progress SHALL be displayed during the PUT phase.

#### Scenario: Avatar upload succeeds
- **WHEN** a volunteer selects a valid image and confirms
- **THEN** the 2-step flow completes, progress is shown, and the new avatar renders.

#### Scenario: Oversize or wrong-type file rejected
- **WHEN** a file over 5 MB or not jpeg/png/webp is selected
- **THEN** upload is blocked with an error and no `POST /media/uploads` call is made.

### Requirement: Own skills CRUD with API-backed picker
The system SHALL manage skills via `GET/POST /api/v1/volunteers/me/skills` and `PATCH/DELETE /api/v1/volunteers/me/skills/:skillId`, with the picker sourced from `GET /api/v1/skills` (+ `GET /api/v1/skill-categories` for grouping).

#### Scenario: Skill add/update/delete persist
- **WHEN** a volunteer adds, edits, or removes a skill
- **THEN** the corresponding endpoint is called and the list re-renders from the server response.

### Requirement: Own availability editor
The system SHALL read availability via `GET /api/v1/volunteers/me/availability` and replace it atomically via `PUT /api/v1/volunteers/me/availability` (weekday slots + optional free-text note only; no editor for derived areas).

#### Scenario: Availability saved
- **WHEN** a volunteer edits slots/note and saves
- **THEN** `PUT /volunteers/me/availability` persists the full replacement and the UI reflects it.

### Requirement: Opt-out public toggles default on
The system SHALL expose `GET`-read toggles (`enabled`, `showBio`, `showSkills`, `showPortfolio`, `showExperiences`, `showStats`) sourced from `GET /volunteers/me` (embedded `publicProfile`; no `GET /volunteers/me/public-settings` exists on the backend) and persist via `PATCH /api/v1/volunteers/me/public-settings`. All toggles SHALL default ON (public-by-default) and SHALL be built as opt-out, never opt-in.

#### Scenario: Toggling visibility persists
- **WHEN** a volunteer switches any toggle off and saves
- **THEN** `PATCH /volunteers/me/public-settings` persists it and the toggle state matches the server on reload.

#### Scenario: Defaults are on for new profiles
- **WHEN** a new volunteer's profile loads
- **THEN** every public toggle renders ON until explicitly opted out.

### Requirement: Dashboard completion readout and public link
The system SHALL display profile-completion from `GET /api/v1/volunteers/me/dashboard` (read-only; the dashboard screen itself is F4) and link "View public profile" to `/volunteers/<username>` with raw username (no `@` prefix).

#### Scenario: Completion and link render
- **WHEN** the profile page loads
- **THEN** completion percent displays from the dashboard payload and the public link points at `/volunteers/<username>`.

