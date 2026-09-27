## ADDED Requirements

### Requirement: Contributions verification inbox with multi-status and joins
The system SHALL render the submissions verification inbox from `GET /api/v1/organizations/me/submissions` supporting multi-status `submitted,under_review`, `?q=`, `?format=`, `?sort=`, `CursorPage` totals, and the volunteer join. Submission detail SHALL render from `GET /api/v1/submissions/:submissionId`. The "Verified" archive tab SHALL NOT render here (F12-owned).

#### Scenario: Multi-status inbox filters submitted and under_review
- **WHEN** an org user selects the to-review filter
- **THEN** the system requests the inbox with multi-status `submitted,under_review` and renders items with the count banner from `total`.

#### Scenario: Search, format, and sort combine
- **WHEN** an org user sets search, format, and sort together
- **THEN** the system sends them as combined `?q=&format=&sort=` params and re-renders from the server response.

### Requirement: Start-review then single approve-and-mint
The system SHALL move a submission `submitted → under_review` via `POST /api/v1/submissions/:submissionId/start-review` and approve via the single `POST /api/v1/submissions/:submissionId/verify` (atomic incl. mint). Approve copy SHALL state that verification is issued on approval. Reviewer notes SHALL surface as neutral `review` (never "Compliance").

#### Scenario: Approve issues verification atomically
- **WHEN** an org user approves an under-review submission
- **THEN** the system posts verify, the detail re-reads as verified, the approve copy states verification is issued on approval, and the issued verification is readable via `GET /api/v1/verifications/:verificationId`.

#### Scenario: No council or compliance copy
- **WHEN** the contributions inbox or detail renders
- **THEN** no council-review flag, compliance column, or civic-ledger wording appears in the UI.

### Requirement: Reject with required reason mapping to rejected
The system SHALL reject via `POST /api/v1/submissions/:submissionId/reject` with a caller-supplied `{reason}` collected in a dialog that blocks submit while empty. "Changes requested" SHALL map to `rejected` with the resubmit loop owned by the volunteer's submit route (no separate changes-requested state).

#### Scenario: Reject requires a reason and maps to rejected
- **WHEN** an org user rejects with a non-empty reason
- **THEN** the system posts `{reason}`, the submission re-reads as `rejected`, and the UI copy points the volunteer at resubmission rather than a changes-requested state.

### Requirement: Owning-org private evidence render
The system SHALL render submission evidence for the owning org via `GET /api/v1/media/:mediaId` (the F1-fix private-evidence path), with images/PDF/link rendering only and no audio player.

#### Scenario: Evidence renders for owning org
- **WHEN** an org user opens a submission carrying evidence media
- **THEN** the evidence renders via the owning-org media read path; rows without evidence render a neutral empty state.
