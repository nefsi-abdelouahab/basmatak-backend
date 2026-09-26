# org-verification-dossier Specification

## Purpose
TBD - created by archiving change frontend-org-onboarding. Update Purpose after archive.
## Requirements
### Requirement: Dossier document upload via 2-step media flow
The dossier screen SHALL let an org account upload one or more verification documents, each via `POST /media/uploads` with purpose `verification_document`, followed by a PUT of file bytes to `uploadUrl`, followed by `POST /media/:mediaId/confirm`. Each file MUST be jpeg, png, webp, or pdf and MUST NOT exceed 5 MB; the UI SHALL reject other types or larger files client-side before upload and show per-file upload progress.

#### Scenario: Successful multi-document upload
- **WHEN** an email-verified org selects two valid PDFs and confirms
- **THEN** the system performs uploads → PUT bytes → confirm for each file and holds two confirmed `mediaId`s ready for submission

#### Scenario: Oversized or wrong-type file rejected
- **WHEN** the org selects a 6 MB file or an `.mp4` file
- **THEN** the system blocks that file with a validation message and uploads nothing for it

### Requirement: Dossier submission and status lifecycle
The system SHALL submit confirmed documents via `POST /organizations/me/verification` with body `{documents: string[]}` and SHALL display status from `GET /organizations/me/verification` (`{verificationStatus, latest}`). A `pending` org stays `pending` on re-submit; a `rejected` org resubmits back to `pending` with the `rejectionReason` shown; a `verified` org sees the verified state and cannot resubmit (backend returns 409 `ORG_ALREADY_VERIFIED`, surfaced as an info state).

#### Scenario: Submit dossier then see pending
- **WHEN** the org submits confirmed documents
- **THEN** the system posts `{documents}` and the status view shows `pending` with neutral copy and `ORG-<registryId>`

#### Scenario: Rejected org resubmits
- **WHEN** an org with `verificationStatus: rejected` uploads new documents and submits
- **THEN** the system posts again and the status view returns to `pending`, with the prior `rejectionReason` retained in history

### Requirement: Neutral copy and registry display
The dossier and status views SHALL use neutral copy only (no "Law 12-06", seal, ledger, or fabricated reference codes) and SHALL display `ORG-<registryId>` from the org record after creation, never before.

#### Scenario: Pending copy check
- **WHEN** the status view renders for a pending org
- **THEN** it shows neutral "Pending review" copy plus `ORG-<registryId>` and no fabricated codes

