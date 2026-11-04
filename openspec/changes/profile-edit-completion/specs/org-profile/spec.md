## MODIFIED Requirements

### Requirement: Factsheet renders real org facts
The system SHALL render the organization factsheet on `org/profile` from `GET /api/v1/organizations/me`: name, `type`, `registrationNumber`, `ORG-<registryId>` display-only (never a route key), localized wilaya/municipality labels (resolved from `GET /locations/wilayas` and its municipality endpoint), `website`, `foundedYear`, `contact{}` (neutral labels, canonical phone), localized `focusDisciplines[]` names resolved from `GET /skill-categories`, `operatingScope`, verification status, and cover/logo/report from real media IDs only (neutral empty state otherwise — no placeholder image, no invented facts). Raw ObjectIds SHALL NOT appear as visible text.

#### Scenario: Factsheet renders real facts with ORG display code
- **WHEN** an authenticated org opens `org/profile`
- **THEN** the system requests `GET /api/v1/organizations/me` and renders name, type, registrationNumber, `ORG-<registryId>`, localized location, website, founded year, contact, localized focus disciplines, operating scope, verification status, and media.

#### Scenario: Missing cover or logo renders neutral empty state
- **WHEN** the org record has no `coverMediaId` or logo media
- **THEN** no image renders and a neutral empty state is shown (no placeholder, no stock image).

#### Scenario: Unresolvable labels are hidden
- **WHEN** a focus-discipline or location reference cannot be resolved from the lookups
- **THEN** the raw id is not rendered and the affected chip or line is omitted.

### Requirement: Factsheet edits via expanded PATCH
The system SHALL persist factsheet edits via `PATCH /api/v1/organizations/me` for the full v2 fact set (`nameAr`, `nameFr`, `description`, `logoMediaId`, `coverMediaId`, `type`, `registrationNumber`, `location{}`, `website`, `foundedYear`, `contact{}` including the optional dedicated phone, `focusDisciplines[]`, `operatingScope`), with loading/saving/error states, a shared save bar, and global success/failure toasts. Phone/website validation SHALL match the backend; Algerian phone inputs SHALL be normalized before submit. No statute, “Law 12-06”, authority, or audit field SHALL exist in the form or payload.

#### Scenario: Edit all fact fields persists
- **WHEN** the org edits every fact field and saves
- **THEN** the system sends `PATCH /api/v1/organizations/me` with the v2 fact set and re-renders the factsheet from the response.

#### Scenario: Statute and legal-accreditation fields are absent
- **WHEN** the factsheet form renders
- **THEN** no statute, “Law 12-06 Accredited”, supervisory-authority, or audit-record input, label, or payload key exists in the DOM or request.

### Requirement: Cover and logo uploads via 2-step flow
The system SHALL upload cover and logo through the shared 2-step flow (`POST /api/v1/media/uploads` → PUT bytes → `POST /api/v1/media/:mediaId/confirm`), images only ≤5 MB, with progress states and an imagery-consent checkbox before upload. Cover uses purpose `organization_cover`; logo uses purpose `organization_logo`. Both uploaders SHALL preview the selected media and persist the confirmed id through the form's PATCH. The annual report remains an optional document link only.

#### Scenario: Cover upload completes with progress and consent
- **WHEN** the org selects a ≤5 MB image for cover or logo, checks imagery consent, and confirms
- **THEN** the system runs the 2-step upload with the matching purpose and binds the confirmed media to the factsheet.

#### Scenario: Oversize or non-image file is rejected client-side
- **WHEN** the org selects a file over 5 MB or a non-image type
- **THEN** the upload is blocked with a validation message and no `POST /api/v1/media/uploads` call is made.

### Requirement: Profile-completion display
The system SHALL display profile completion on `org/profile` from `GET /api/v1/organizations/me/profile-completion` (`{percent, missingFields, complete}`), showing the authoritative percent plus a checklist of translated missing-field labels. Each missing item SHALL link or scroll to its editable section. The UI SHALL NOT compute completion locally and SHALL NOT render raw missing keys.

#### Scenario: Completion percent and checklist render
- **WHEN** `org/profile` loads with a non-complete completion payload
- **THEN** the system requests `GET /api/v1/organizations/me/profile-completion` and renders the percent with translated remaining-field labels.

#### Scenario: Complete profile shows completion
- **WHEN** the completion payload has `complete: true` and `percent: 100`
- **THEN** the page shows a positive completed state and no remaining-fields checklist.

## ADDED Requirements

### Requirement: Shared organization profile form
The system SHALL use one shared organization profile form for `org/profile` and `org/complete-profile`. The form SHALL edit the complete fact set, reuse the same validation, location lookups, focus-discipline multi-select, media uploads, completion payload, and save behavior. `org/complete-profile` SHALL be an onboarding wrapper around that form with onboarding copy and the delete-account action; it SHALL NOT duplicate field or validation logic.

#### Scenario: Both routes render the same fields
- **WHEN** either `org/profile` or `org/complete-profile` renders
- **THEN** both expose the same editable fields, selectors, media slots, validation, and completion contract.

#### Scenario: Onboarding keeps delete
- **WHEN** the organization opens `org/complete-profile`
- **THEN** the shared form renders inside onboarding copy and the delete-account action remains available with explicit confirmation.
