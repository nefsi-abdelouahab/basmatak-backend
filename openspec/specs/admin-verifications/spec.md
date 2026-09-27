# admin-verifications Specification

## Purpose
TBD - created by archiving change frontend-admin-manage. Update Purpose after archive.
## Requirements
### Requirement: Verification triage queue with pending-first default
The system SHALL render the moderator decision queue from `GET /api/v1/admin/organizations/verifications` (`?status=&assignedAdminId=&page=&pageSize=`, default `pending`, oldest-first for FIFO triage), each row enriched with its organization summary (id, slug, name, current `verificationStatus`) and `assignedAdminId`. Result-count banners SHALL read from `total`.

#### Scenario: Pending queue renders oldest-first
- **WHEN** an admin opens the verification triage with the default filter
- **THEN** the system requests `?status=pending` and renders pending rows oldest-first with the count banner from `total`.

#### Scenario: Queue filters combine
- **WHEN** an admin sets status and assigned-officer filters together
- **THEN** the system sends them as combined `?status=&assignedAdminId=` params and re-renders the queue from the server response.

### Requirement: Officer assignment on verification rows
The system SHALL assign a verification row to an admin officer via `PATCH /api/v1/admin/organizations/verifications/:rowId/assign` accepting `{ assignedAdminId }` (an existing admin-role user id), collected in an assign dialog. A missing row SHALL surface 404; a non-admin assignee SHALL surface 400.

#### Scenario: Assign officer to a verification row
- **WHEN** an admin assigns a verification row to an existing admin user
- **THEN** the system patches `{ assignedAdminId }` and the re-read row shows the new assignee.

### Requirement: Latest-dossier read with dossier media render
The system SHALL render an organization's latest dossier from `GET /api/v1/admin/organizations/:organizationId/verification/latest` (newest row by `submittedAt`, with `assignedAdminId`), resolving each dossier document through `GET /api/v1/media/:mediaId` for admin display. An organization with no submissions SHALL render a neutral empty state (surfaces the backend 404 as empty, not an error).

#### Scenario: Latest dossier renders with documents
- **WHEN** an admin opens the latest dossier for an organization with submissions
- **THEN** the newest verification row renders with its submitted documents resolved for display.

#### Scenario: No submissions shows empty state
- **WHEN** an admin opens the latest dossier for an organization with no submissions
- **THEN** the system renders a neutral empty state.

### Requirement: Neutral approve verification (no seal)
The system SHALL approve an organization's pending verification via `POST /api/v1/admin/organizations/:organizationId/verification/approve` with neutral "Approve verification" copy (the "Grant Law 12-06 Seal" action stays deleted). No pending row SHALL surface the 409 `NO_PENDING_VERIFICATION` error.

#### Scenario: Approve a pending organization
- **WHEN** an admin approves an organization with a pending verification row
- **THEN** the system posts approve and the re-read organization shows `verificationStatus: verified`.

### Requirement: Reject verification with required reason (no request-info)
The system SHALL reject an organization's pending verification via `POST /api/v1/admin/organizations/:organizationId/verification/reject` with a required non-empty `{ rejectionReason }` collected in a dialog that blocks submit while empty (the "Request Info" action stays deleted).

#### Scenario: Reject requires a reason
- **WHEN** an admin opens the reject dialog and submits with an empty reason
- **THEN** the system blocks the submit and keeps the dialog open; with a non-empty reason it posts `{ rejectionReason }` and the re-read organization shows `verificationStatus: rejected`.

