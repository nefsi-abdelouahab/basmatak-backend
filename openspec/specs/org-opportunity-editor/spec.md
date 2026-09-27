# org-opportunity-editor Specification

## Purpose
TBD - created by archiving change frontend-org-opportunities. Update Purpose after archive.
## Requirements
### Requirement: Create opportunity with full v2 field set
The system SHALL create via `POST /api/v1/organizations/me/opportunities` with all v2 fields: title, description, `categoryId` (ObjectId from `GET /api/v1/skill-categories`), `mode`, `endDate`, `durationMinutes`, `prerequisites[]`, location (`wilayaId`/`municipalityId` from `GET /api/v1/locations/wilayas` + `GET /api/v1/locations/wilayas/:wilayaId/municipalities`), `coverMediaId` (2-step upload, purpose `opportunity_cover`, images ≤5 MB), and initial positions (`title`, `requiredCount`, `deliverables[]`, `startAt`). The system SHALL NOT offer perks/logistics inputs (FCD CUT — no such backend fields exist).

#### Scenario: Create with all v2 fields becomes a draft
- **WHEN** an org user submits the create form with valid v2 fields
- **THEN** the system posts the create payload and navigates to the new draft (edit route or list with success feedback).

#### Scenario: No perks or logistics inputs exist
- **WHEN** the create or edit form renders
- **THEN** no perks / "what you receive" / host-logistics / accommodation / language input exists in the DOM.

### Requirement: Edit opportunity within allowed windows
The system SHALL patch via `PATCH /api/v1/opportunities/:opportunityId` (expanded PATCH scope) and SHALL disable or hide fields the backend rejects outside the edit window, surfacing the backend error shape (`{ statusCode, code, message, details? }`) on failure.

#### Scenario: Edit persists and re-reads
- **WHEN** an org user saves valid edits
- **THEN** the system patches the opportunity, re-reads the owner single-read, and surfaces success feedback.

### Requirement: Category select wired to skill-categories API
The system SHALL populate the category select from `GET /api/v1/skill-categories` (ObjectId values) with loading/empty/error states, and SHALL NOT hardcode category options.

#### Scenario: Category options come from the API
- **WHEN** the create or edit form loads
- **THEN** category options render from the skill-categories response (no hardcoded list).

### Requirement: Cover upload via 2-step flow with progress
The system SHALL upload the cover via `POST /api/v1/media/uploads` (`{filename, mimeType, size, purpose: opportunity_cover}` → `{mediaId, uploadUrl}` → PUT bytes → `POST /api/v1/media/:mediaId/confirm`) with progress state, ≤5 MB jpeg/png/webp validation, and preview from `coverMediaId`.

#### Scenario: Cover uploads with progress then confirms
- **WHEN** an org user selects a valid cover image
- **THEN** the system uploads with progress, confirms the media, and binds `coverMediaId` to the form payload.

### Requirement: Positions CRUD on the opportunity
The system SHALL manage positions via `POST /api/v1/opportunities/:opportunityId/positions` (create), `PATCH /api/v1/opportunities/:opportunityId/positions/:positionId` (update), and `DELETE /api/v1/opportunities/:opportunityId/positions/:positionId` (remove), each with `title`, `requiredCount`, `deliverables[]`, and `startAt`, re-reading the owner single-read afterwards.

#### Scenario: Add, edit, and remove a position
- **WHEN** an org user adds, edits, or removes a position
- **THEN** the system calls the matching positions endpoint and re-renders positions from the re-read opportunity.

### Requirement: Lifecycle actions gated on verified status plus publish-gate
The system SHALL expose lifecycle actions via `POST /api/v1/opportunities/:opportunityId/publish|close|cancel|complete` exactly per the availability matrix: `publish` only from draft AND org `verificationStatus === verified` AND `GET /api/v1/organizations/me/publish-gate` reports `locked === false` (verified shape `PublishGateStatus { locked, pendingCount, threshold, pendingOpportunities[] }` — allowed means `!locked`); locked orgs see a locked explanation citing `pendingCount`/`threshold` (never a working publish button); `close`/`cancel`/`complete` only from published per backend transitions; invalid actions never render. Publish failures SHALL surface neutral copy per code: `ORG_NOT_VERIFIED` (403), `PUBLISH_GATE_LOCKED` (409), `PUBLISHING_DISABLED` (403 kill-switch).

#### Scenario: Verified org publishes a draft
- **WHEN** a verified org with an open publish-gate publishes a draft
- **THEN** the system posts publish, re-reads the opportunity (status `published`), and surfaces success feedback.

#### Scenario: Pending org sees publish locked
- **WHEN** a pending/unverified org, or an org whose publish-gate reports `locked === true`, views a draft
- **THEN** no working publish action renders; a locked explanation citing verification status plus `pendingCount`/`threshold` renders instead.

### Requirement: Lifecycle availability matrix is a pure gated function
The system SHALL compute action availability as a pure function of (`status`, `verificationStatus`, `publishGate.locked`): draft + verified + `locked === false` → publish/delete-draft; draft + otherwise → locked; published → close/cancel/complete per backend; closed/cancelled/completed → no lifecycle actions.

#### Scenario: Matrix gates every action
- **WHEN** any opportunity status/verification/gate combination renders
- **THEN** only the matrix-allowed actions render as enabled controls.

