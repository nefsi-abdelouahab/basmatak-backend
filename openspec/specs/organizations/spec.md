# organizations Specification

## Purpose
TBD - created by archiving change organizations. Update Purpose after archive.
## Requirements
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

### Requirement: Organization verifications collection
The system SHALL provide an `organization_verifications` collection with `organizationId`, `status` (`pending | verified | rejected`), `documents` (array of `mediaId`s stored as ObjectId-format strings), `rejectionReason` (optional), `submittedAt`, `decidedAt` (optional), and `decidedBy` (optional). Index SHALL be `(organizationId, status)`.

#### Scenario: Submission record created
- **WHEN** an organization submits verification documents
- **THEN** an `organization_verifications` row is created with the documents, status `pending`, and `submittedAt` set

#### Scenario: Rejection context retained
- **WHEN** an organization's submission is rejected by an admin (Session 15)
- **THEN** the row records `status=rejected`, `rejectionReason`, `decidedAt`, and `decidedBy`

### Requirement: Verification status state machine
The SHALL be `pending → verified | rejected → pending` (F1). An organization SHALL only be considered able to publish once `verificationStatus=verified` (§7 decision 7; publish itself is Session 6). Moving `pending → verified | rejected` SHALL happen only through the admin approve/reject routes (Session 15). Resubmission from `rejected` SHALL return the organization to `pending`.

#### Scenario: Rejected organization resubmits
- **WHEN** an organization with `verificationStatus=rejected` submits documents
- **THEN** its `verificationStatus` becomes `pending`
- **AND** a new `organization_verifications` row is created

#### Scenario: Verified is terminal for submission
- **WHEN** an organization with `verificationStatus=verified` attempts to submit documents
- **THEN** the request is rejected with business code `ORG_ALREADY_VERIFIED`

### Requirement: Public organization listing
The system SHALL expose public `GET /organizations` returning organizations where `verificationStatus=verified` AND `status=active`.

#### Scenario: Verified and active organizations listed
- **WHEN** a guest calls `GET /organizations`
- **THEN** the response contains only organizations that are both verified and active

#### Scenario: Pending or non-active hidden
- **WHEN** an organization is `pending`, `rejected`, or has `status` other than `active`
- **THEN** it is absent from `GET /organizations`

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope.

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned

#### Scenario: Non-verified organization hidden
- **WHEN** a guest calls `GET /organizations/:slug` for a `pending` or `rejected` organization (or an inactive/deleted one)
- **THEN** the response is `404`

### Requirement: Public organization opportunities
The system SHALL expose public `GET /organizations/:slug/opportunities` returning the organization's opportunities with `published` status only. Until Session 6 owns the opportunities model, the response SHALL be an empty list even when the organization is verified and active.

#### Scenario: Published opportunities returned
- **WHEN** a guest calls `GET /organizations/:slug/opportunities` for a verified, active organization
- **THEN** the response lists only that organization's published opportunities (empty until Session 6)

#### Scenario: Non-verified organization not accessible
- **WHEN** a guest calls `GET /organizations/:slug/opportunities` for a non-verified or inactive organization
- **THEN** the response is `404`

### Requirement: Read own organization
The system SHALL expose `GET /organizations/me` (authenticated, organization role) returning the caller's own organization, resolved from the token's user via `organizations.userId`. The route SHALL be declared before `/organizations/:slug` in the controller (§2.7 route-order trap).

#### Scenario: Owner reads their organization
- **WHEN** an `organization`-role account calls `GET /organizations/me`
- **THEN** its own organization record is returned

#### Scenario: Account without an organization
- **WHEN** a `volunteer` (or any account with no matching `organizations` row) calls `GET /organizations/me`
- **THEN** the response is `404` in the error envelope

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

### Requirement: Read own verification status
The system SHALL expose `GET /organizations/me/verification` (authenticated, organization role) returning the latest `organization_verifications` status and, when the latest row is `rejected`, its `rejectionReason`, alongside the organization's current `verificationStatus`.

#### Scenario: Latest status returned
- **WHEN** an organization calls `GET /organizations/me/verification`
- **THEN** the response includes the latest submission status and the organization's `verificationStatus`

#### Scenario: Rejection reason surfaced
- **WHEN** the latest verification row is `rejected`
- **THEN** the response includes the `rejectionReason`

### Requirement: Organization registration hook
The system SHALL create the `organizations` row during organization registration: the `RegistrationExtrasService` seam dispatch on `user.role` SHALL, for role `organization`, create an `organizations` row linked by `organizations.userId = user.id` with a server-generated `slug` and `verificationStatus=pending`; for every other role it SHALL delegate to the inert default (S2 seam, no behavior change for non-organization accounts).

#### Scenario: Organization registration creates org page
- **WHEN** a user registers with role `organization`
- **THEN** a `users` row and an `organizations` row (same `userId`, generated `slug`, `pending`) are both created

#### Scenario: Other roles unchanged
- **WHEN** a user registers with role `volunteer` (or `admin`)
- **THEN** the seam delegates to the inert default and no `organizations` row is created

### Requirement: Slug generation from org name
The system SHALL generate the organization `slug` server-side from the organization name using the canonical slug pipeline in `src/common/slug` (transliterate to ASCII, kebab-case, retry on `E11000` with a numeric suffix per A12). The slug SHALL NOT be read from the registration or update bodies.

#### Scenario: Slug derived from name
- **WHEN** an organization registers with a name
- **THEN** the stored `slug` is a unique ASCII kebab-case derivation of that name

#### Scenario: Collision retried
- **WHEN** the generated slug collides with an existing one
- **THEN** generation retries with a numeric suffix until the unique index accepts it

### Requirement: Public organization seam
The system SHALL provide a public seam `getPublicOrganization(slug)` returning the organization only when `verificationStatus=verified` AND `status=active`, and `null` otherwise, for consumption by Session 12 (public discovery). No public route beyond the two GETs above is exposed.

#### Scenario: Verified active organization returned
- **WHEN** the seam is called with the slug of a verified, active organization
- **THEN** the organization payload is returned

#### Scenario: Anything else null
- **WHEN** the organization is pending/rejected/inactive/deleted or does not exist
- **THEN** the seam returns `null`

