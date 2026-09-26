## ADDED Requirements

### Requirement: Complete-profile fact form bound to org endpoints
The system SHALL render an `org/complete-profile` form with fact fields bound to `GET /organizations/me` and persisted via `PATCH /organizations/me`: name, description, type, registrationNumber, location (wilaya select from `GET /locations/wilayas` + municipality select from `GET /locations/wilayas/:wilayaId/municipalities` + address), website, foundedYear, contact (email, phone), focusDisciplines, operatingScope, and cover image (purpose `organization_cover`, ≤5 MB jpeg/png/webp, via `POST /media/uploads` → PUT bytes → `POST /media/:mediaId/confirm`). The form SHALL contain no statute/legal fields.

#### Scenario: Complete profile reaches checklist 100%
- **WHEN** an org fills all fact fields with valid values and submits
- **THEN** the system PATCHes `/organizations/me` and `GET /organizations/me/profile-completion` returns `{percent: 100, missing: [], complete: true}`

#### Scenario: Municipality requires its wilaya
- **WHEN** the org picks a municipality
- **THEN** the municipality options come from the selected wilaya's endpoint and submit without a wilaya is blocked (backend `INVALID_LOCATION`)

### Requirement: Completion checklist display and math
The system SHALL display the profile-completion checklist from `GET /organizations/me/profile-completion` (`{percent, missing, complete}` over the 11 backend keys: name, description, type, registrationNumber, location, website, foundedYear, contact, focusDisciplines, operatingScope, coverMediaId), showing percent and the missing-fields list.

#### Scenario: Partial profile shows missing keys
- **WHEN** the checklist returns `{percent: 64, missing: [...], complete: false}`
- **THEN** the UI renders the percent and names each missing field from the response, computing nothing client-side

### Requirement: Phone and website validation
Phone inputs SHALL accept `/^\+?[0-9]{8,15}$/` (no spaces) and website inputs SHALL accept http/https URLs, matching backend validation; invalid values are rejected client-side with a message before PATCH.

#### Scenario: Invalid phone blocked
- **WHEN** the org enters a phone with spaces or fewer than 8 digits
- **THEN** the system blocks submit with a validation message and sends no PATCH

### Requirement: Delete-own organization account
The system SHALL offer organization self-deletion via `DELETE /organizations/me` behind an explicit confirm step; on success the session is revoked and the user is signed out.

#### Scenario: Delete with confirm
- **WHEN** the org confirms deletion
- **THEN** the system calls `DELETE /organizations/me`, clears the session, and redirects to sign-in
