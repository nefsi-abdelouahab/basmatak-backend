## MODIFIED Requirements

### Requirement: Organizations collection
The system SHALL provide an `organizations` collection with `userId` (ObjectId, unique — one organization per account per §9), `slug` (unique), `nameAr`/`nameFr`, `description`, `logoMediaId` (ObjectId-format optional, validated against `media` via `MediaOwnership.assertFor` with `purpose=organization_logo` — Session 8 retrofit of F9), `verificationStatus` (`pending | verified | rejected`, default `pending`), `status` (`active | suspended | deleted`, default `active`), and a `reliability` placeholder sub-document (populated by Session 13). Indexes SHALL include unique `userId`, unique `slug`, and `(verificationStatus, status)`.

#### Scenario: One organization per account
- **WHEN** a second `organizations` row is inserted with the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Slug uniqueness enforced
- **WHEN** two `organizations` rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert

#### Scenario: Reliability is a placeholder
- **WHEN** an organization is created
- **THEN** it carries a `reliability` placeholder whose real values are recomputed by Session 13

### Requirement: Update own organization
The system SHALL expose `PATCH /organizations/me` (authenticated, organization role) allowing the caller to update editable fields of their own organization. `userId`, `slug`, `verificationStatus`, and `status` SHALL NOT be settable from the body. `slug` SHALL be generated server-side and SHALL never be accepted from the body (A12). `logoMediaId` SHALL be validated through `MediaOwnership.assertFor` (existence, ownership by the caller's organization, `purpose=organization_logo`, not deleted) — Session 8 retrofit of F9.

#### Scenario: Owner updates editable fields
- **WHEN** an organization-role account patches `nameAr`, `nameFr`, `description`, or `logoMediaId`
- **THEN** the fields are updated and the updated organization is returned

#### Scenario: Protected fields rejected
- **WHEN** a payload attempts to set `slug`, `verificationStatus`, `status`, or `userId`
- **THEN** the request is rejected by DTO validation

#### Scenario: Non-owner isolated
- **WHEN** one organization-role account attempts to patch another organization's data through `/organizations/me`
- **THEN** it can only ever resolve its own row (no cross-organization access)

#### Scenario: Foreign, absent, or deleted logo rejected
- **WHEN** an organization patches a `logoMediaId` that is not theirs, does not exist, is soft-deleted, or has another purpose
- **THEN** the request is rejected via `MediaOwnership.assertFor`

### Requirement: Submit verification documents
The system SHALL expose `POST /organizations/me/verification` (authenticated, organization role) accepting `documents` as an array of `mediaId`s (validated through `MediaOwnership.assertFor` per document: existence, ownership by the caller's organization, `purpose=verification_document`, not deleted — Session 8 retrofit of F9). Submitting SHALL be allowed only from `verificationStatus=pending` (replaces the document set, status stays `pending`) and from `rejected` (becomes `pending` — F1 resubmission). The call SHALL require the account email to be verified (A10); otherwise the response SHALL be `403` with business code `EMAIL_NOT_VERIFIED`.

#### Scenario: First submission sets pending
- **WHEN** an organization with `pending` status submits valid document mediaIds
- **THEN** a new `organization_verifications` row is created with the documents and status `pending`

#### Scenario: Re-submission from pending updates documents
- **WHEN** a `pending` organization submits documents again
- **THEN** a new `organization_verifications` row is created for the latest documents while status remains `pending`

#### Scenario: Resubmission from rejected
- **WHEN** a `rejected` organization submits documents
- **THEN** the organization returns to `pending` and a new verification row is stored

#### Scenario: Unverified email blocked
- **WHEN** an organization-role account without a verified email submits documents
- **THEN** the response is `403` with business code `EMAIL_NOT_VERIFIED`

#### Scenario: Verified organization blocked
- **WHEN** a `verified` organization submits documents
- **THEN** the response is `409` with business code `ORG_ALREADY_VERIFIED`

#### Scenario: Foreign or absent document rejected
- **WHEN** any document mediaId is not owned by the organization, does not exist, is soft-deleted, or has a purpose other than `verification_document`
- **THEN** the request is rejected via `MediaOwnership.assertFor`