## ADDED Requirements

### Requirement: Factsheet renders real org facts
The system SHALL render the organization factsheet on `org/profile` from `GET /api/v1/organizations/me`: name, `type`, `registrationNumber`, `ORG-<registryId>` display-only (never a route key), `location{}` labels, `website`, `foundedYear`, `contact{}` (neutral labels), `focusDisciplines[]`, `operatingScope`, verification status, and cover/logo from real media IDs only (neutral empty state otherwise — no placeholder image, no invented facts).

#### Scenario: Factsheet renders real facts with ORG display code
- **WHEN** an authenticated org opens `org/profile`
- **THEN** the system requests `GET /api/v1/organizations/me` and renders name, type, registrationNumber, `ORG-<registryId>`, location, website, founded year, contact, focus disciplines, operating scope, and verification status.

#### Scenario: Missing cover or logo renders neutral empty state
- **WHEN** the org record has no `coverMediaId` or logo media
- **THEN** no image renders and a neutral empty state is shown (no placeholder, no stock image).

### Requirement: Factsheet edits via expanded PATCH
The system SHALL persist factsheet edits via `PATCH /api/v1/organizations/me` for the full v2 fact set (`type`, `registrationNumber`, `location{}`, `website`, `foundedYear`, `contact{}`, `focusDisciplines[]`, `operatingScope`), with phone/website validation (phone `/^\+?[0-9]{8,15}$/`) and loading/saving/error states. No statute, "Law 12-06", authority, or audit field SHALL exist in the form or payload.

#### Scenario: Edit all fact fields persists
- **WHEN** the org edits every fact field and saves
- **THEN** the system sends `PATCH /api/v1/organizations/me` with the v2 fact set and re-renders the factsheet from the response.

#### Scenario: Statute and legal-accreditation fields are absent
- **WHEN** the factsheet form renders
- **THEN** no statute, "Law 12-06 Accredited", supervisory-authority, or audit-record input, label, or payload key exists in the DOM or request.

### Requirement: Cover and logo uploads via 2-step flow
The system SHALL upload cover and logo through the shared 2-step flow (`POST /api/v1/media/uploads` → PUT bytes → `POST /api/v1/media/:mediaId/confirm`), images/PDF only ≤5 MB, with progress states and an imagery-consent checkbox before submit. Cover uses purpose `organization_cover`, logo uses purpose `organization_logo`.

#### Scenario: Cover upload completes with progress and consent
- **WHEN** the org selects a ≤5 MB image for cover, checks imagery consent, and confirms
- **THEN** the system runs the 2-step upload with purpose `organization_cover` and binds the confirmed media to the factsheet.

#### Scenario: Oversize or non-image file is rejected client-side
- **WHEN** the org selects a file over 5 MB or a non-image/non-PDF type
- **THEN** the upload is blocked with a validation message and no `POST /api/v1/media/uploads` call is made.

### Requirement: Profile-completion display
The system SHALL display profile completion on `org/profile` from `GET /api/v1/organizations/me/profile-completion` (read-only reuse of the F3 read shape; no new completion logic), showing percent + remaining-fields checklist linking to the editable sections.

#### Scenario: Completion percent and checklist render
- **WHEN** `org/profile` loads with a profile-completion fixture
- **THEN** the system requests `GET /api/v1/organizations/me/profile-completion` and renders the percent with remaining-field links.

### Requirement: Annual report is an optional link only
The system SHALL render `annualReportMediaId` as an optional document link only (purpose `organization_document`, nullable): when present it links the stored document; when absent a neutral empty affordance renders. No annual-report workflow, filing-status, or audit copy SHALL exist.

#### Scenario: Annual report link renders when present, empty state when absent
- **WHEN** the org record carries (or omits) `annualReportMediaId`
- **THEN** a document link renders (or a neutral empty affordance), with zero filing-workflow or audit-status UI in the DOM.

### Requirement: Directory-indexing copy removed
The system SHALL NOT render "Indexed in Discover Talents" (or any talent-directory membership claim): orgs are not in the talent directory. Any visibility wording SHALL describe the neutral public-profile toggle only (owned by `org-settings`).

#### Scenario: No talent-directory membership claim renders
- **WHEN** `org/profile` renders
- **THEN** no "Indexed in Discover Talents" or directory-membership copy exists in the DOM.

### Requirement: Profile mandates and out-of-scope guards
The system SHALL satisfy the 4 mandates on `org/profile` (theme tokens only; `orgAccount.*` strings en+ar with RTL logical properties; data only via `lib/api/orgAccount.ts` + `hooks/useOrgAccount.ts` over the F0 axios client; responsive at 1440/1100/390), handle 401/403/404/429/503 via the F0 error mapping, and SHALL NOT implement dossier upload (F3), settings/sessions/delete (F13 `org-settings`), admin management (F15), messaging, or any statute/authority/audit UI.

#### Scenario: Guards exclude out-of-scope affordances
- **WHEN** `org/profile` renders
- **THEN** no dossier-upload, session-row, delete-account, message-thread, or statute/authority/audit affordance exists in the DOM.
