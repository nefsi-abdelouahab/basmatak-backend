## MODIFIED Requirements

### Requirement: Organizations collection
The system SHALL provide an `organizations` collection with `userId` (ObjectId, unique — one organization per account per ��9), `slug` (unique), `nameAr`/`nameFr`, `description`, `logoMediaId` (ObjectId-format optional, validated against `media` via `MediaOwnership.assertFor` with `purpose=organization_logo` — Session 8 retrofit of F9), `coverMediaId` (ObjectId-format optional, validated via `MediaOwnership.assertFor` with `purpose=organization_cover`), `type` (optional short text, max 80), `registrationNumber` (optional short text, max 80), `location` (optional sub-document `{wilayaId, municipalityId, address}` with `address` max 500; `wilayaId`/`municipalityId` validated against seeded wilaya/municipality reference data), `website` (optional, must be an `http(s)` URL, max 500), `foundedYear` (optional integer between 1800 and the current year), `contact` (optional sub-document `{email, phone}` with `email` a valid email max 254 and `phone` matching the canonical phone pattern `^\+?[0-9]{8,15}$`), `focusDisciplines` (array of ObjectId refs to `skill_categories`, default `[]`, max 12 entries), `operatingScope` (optional short text, max 120), `publicProfile {enabled}` (boolean, default `true`), `annualReportMediaId` (ObjectId-format optional/nullable, validated via `MediaOwnership.assertFor` with `purpose=organization_document`, no workflow attached), `registryId` (a server-minted neutral registry identifier in `ORG-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), `verificationStatus` (`pending | verified | rejected`, default `pending`), `status` (`active | suspended | deleted`, default `active`), and a `reliability` sub-document whose values are computed by the Session 13 trust layer and refreshed on submission events and the job tick. The collection SHALL NOT contain perks-equivalent marketing fields (owner-confirmed cut). Indexes SHALL include unique `userId`, unique `slug`, and `(verificationStatus, status)`.

#### Scenario: One organization per account
- **WHEN** a second `organizations` row is inserted with the same `userId`
- **THEN** the unique `userId` index rejects the insert

#### Scenario: Slug uniqueness enforced
- **WHEN** two `organizations` rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert

#### Scenario: Reliability recomputed and cached
- **WHEN** the reliability computation runs for an organization
- **THEN** the `organizations.reliability` sub-document stores the computed metrics with a `lastRefreshedAt` timestamp, replacing any placeholder values

#### Scenario: One registry identifier per organization
- **WHEN** an organization is created (or an existing row is backfilled)
- **THEN** the row carries a well-formed `ORG-` registry identifier minted by `RegistryIdService`, and the identifier is never client-settable or mutable afterwards

#### Scenario: Fact-sheet fields persist
- **WHEN** an organization row is written with `type`, `registrationNumber`, `location`, `website`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `publicProfile`, `coverMediaId`, and `annualReportMediaId`
- **THEN** all fields persist and read back unchanged, with `publicProfile.enabled` defaulting to `true` when unset

#### Scenario: Out-of-range founded year rejected
- **WHEN** a write sets `foundedYear` below 1800 or above the current year
- **THEN** validation rejects the write

#### Scenario: Cut fields absent from the schema
- **WHEN** the `organizations` schema paths are inspected
- **THEN** no perks-equivalent marketing field exists beyond `annualReportMediaId`

### Requirement: Update own organization
The system SHALL expose `PATCH /organizations/me` (authenticated, organization role) allowing the caller to update editable fields of their own organization: `nameAr`, `nameFr`, `description`, `logoMediaId`, `coverMediaId`, `type`, `registrationNumber`, `location {wilayaId, municipalityId, address}`, `website`, `foundedYear`, `contact {email, phone}`, `focusDisciplines[]`, `operatingScope`, `publicProfile {enabled}`, and `annualReportMediaId`. `userId`, `slug`, `registryId`, `verificationStatus`, and `status` SHALL NOT be settable from the body. `slug` SHALL be generated server-side and SHALL never be accepted from the body (A12). `logoMediaId` SHALL be validated through `MediaOwnership.assertFor` (existence, ownership by the caller's organization, `purpose=organization_logo`, not deleted) — Session 8 retrofit of F9. `coverMediaId` SHALL be validated through `MediaOwnership.assertFor` with `purpose=organization_cover`, and `annualReportMediaId` with `purpose=organization_document`. `website` SHALL be rejected unless it is an `http(s)` URL. `location.wilayaId`/`location.municipalityId` SHALL reference seeded wilaya/municipality data; unknown refs SHALL be rejected with `400` and business code `INVALID_LOCATION`. Each `focusDisciplines` entry SHALL be a well-formed ObjectId referencing an existing skill category; unknown ids SHALL be rejected with `400` and business code `INVALID_FOCUS_DISCIPLINE`. Facts PATCH SHALL be allowed regardless of email-verification state (only the verification-dossier submission is email-gated — no regression).

#### Scenario: Owner updates fact-sheet fields
- **WHEN** an organization-role account patches `type`, `registrationNumber`, `location`, `website`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `publicProfile`, `coverMediaId`, or `annualReportMediaId`
- **THEN** the fields are updated and the updated organization is returned

#### Scenario: Protected fields rejected
- **WHEN** a payload attempts to set `slug`, `registryId`, `verificationStatus`, `status`, or `userId`
- **THEN** the request is rejected by DTO validation

#### Scenario: Non-owner isolated
- **WHEN** one organization-role account attempts to patch another organization's data through `/organizations/me`
- **THEN** it can only ever resolve its own row (no cross-organization access)

#### Scenario: Foreign, absent, or deleted logo rejected
- **WHEN** an organization patches a `logoMediaId` that is not theirs, does not exist, is soft-deleted, or has another purpose
- **THEN** the request is rejected via `MediaOwnership.assertFor`

#### Scenario: Cover and annual report purposes enforced
- **WHEN** an organization patches a `coverMediaId` without purpose `organization_cover`, or an `annualReportMediaId` without purpose `organization_document`
- **THEN** the request is rejected via `MediaOwnership.assertFor`

#### Scenario: Malformed website rejected
- **WHEN** an organization patches a `website` that is not an `http(s)` URL
- **THEN** DTO validation rejects the request with `400`

#### Scenario: Unknown location or discipline rejected
- **WHEN** an organization patches an unknown `wilayaId`/`municipalityId`, or a `focusDisciplines` entry that is not an existing skill category
- **THEN** the request is rejected with `400` (`INVALID_LOCATION` / `INVALID_FOCUS_DISCIPLINE`)

#### Scenario: Facts editable before email verification
- **WHEN** an organization-role account without a verified email patches fact-sheet fields
- **THEN** the patch succeeds (only dossier submission requires email verification)

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope. The public profile SHALL include the organization's neutral `registryId` and the additive fact-sheet fields `location`, `website`, `type`, `registrationNumber`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `annualReportMediaId`, plus `aggregates` supplied by the `OrgPublicStatsProvider` seam (zeroed until Session 16 fills them). Organizations with `publicProfile.enabled=false` SHALL still resolve (the toggle is a neutral platform-profile preference, not a visibility gate — no 404 regression).

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned, including its `ORG-` registry identifier, the fact-sheet fields, and the `aggregates` block

#### Scenario: Non-verified organization hidden
- **WHEN** a guest calls `GET /organizations/:slug` for a `pending` or `rejected` organization (or an inactive/deleted one)
- **THEN** the response is `404`

#### Scenario: Aggregates zeroed before Session 16
- **WHEN** a guest reads the public profile before the real stats provider ships
- **THEN** the `aggregates` block is present with zeroed values from the inert seam default

### Requirement: Public organization opportunities
The system SHALL expose public `GET /organizations/:slug/opportunities` returning the organization's opportunities filtered by `?status=published|completed|closed` (default `published`). The route SHALL be served by the opportunities controller (established there by Session 11, which also documents the registration order that shadows the organizations-side stub — removed here as dead code), delegating org gating and the status filter to `OrganizationsService.listOrgOpportunities`. For a non-verified or inactive organization it SHALL return `404` in the error envelope. Each row SHALL carry the card fields consumed by the public profile (`mode`, `coverMediaId`, `endDate`, `durationMinutes`) alongside the existing payload. The per-opportunity aggregates (`position.applicationCount`, assigned names) remain owned by Session 17 and SHALL NOT be joined here.

#### Scenario: Per-status opportunities returned
- **WHEN** a guest calls `GET /organizations/:slug/opportunities?status=completed` for a verified, active organization
- **THEN** the response lists only that organization's completed opportunities

#### Scenario: Default status is published
- **WHEN** a guest calls the route without `status`
- **THEN** only `published` opportunities are returned

#### Scenario: Non-verified organization not accessible
- **WHEN** a guest calls `GET /organizations/:slug/opportunities` for a non-verified or inactive organization
- **THEN** the response is `404`

#### Scenario: Invalid status rejected
- **WHEN** a guest calls the route with a `status` outside `published|completed|closed`
- **THEN** DTO validation rejects the request with `400`

## ADDED Requirements

### Requirement: Organization profile completion
The system SHALL expose `GET /organizations/me/profile-completion` (authenticated, organization role) returning `{ percent, missing[], complete }` where `missing` lists the fact-sheet keys still empty (`name` (either `nameAr` or `nameFr`), `description`, `type`, `registrationNumber`, `location`, `website`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `coverMediaId`) and `percent` is the share of filled keys rounded to an integer 0–100; `complete` SHALL be `true` only when `missing` is empty. Profile completion SHALL be a single-PATCH flow: `PATCH /organizations/me` writes the facts, this route only reads the checklist — no multi-step state machine.

#### Scenario: Checklist reflects missing facts
- **WHEN** an organization with only `nameFr` and `contact` set calls the route
- **THEN** `missing` lists every other key and `percent` equals the filled share

#### Scenario: Complete profile reports full
- **WHEN** an organization with all checklist keys filled calls the route
- **THEN** `percent` is `100`, `missing` is empty, and `complete` is `true`

#### Scenario: Non-organization isolated
- **WHEN** a volunteer or an account without an organization row calls the route
- **THEN** the response is `404` in the error envelope

### Requirement: Delete own organization
The system SHALL expose `DELETE /organizations/me` (authenticated, organization role) that soft-archives the caller's organization (`status=deleted`), retires the linked `user` (`status=deleted`), and revokes all of the account's sessions via the Session 6 revocation helper. The operation SHALL be atomic (single transaction): if any step fails nothing persists. Every consequence SHALL write `audit_logs` + `status_histories`. After deletion, the public `GET /organizations/:slug` SHALL return `404`, and all of the account's refresh tokens SHALL be rejected.

#### Scenario: Owner deletes account
- **WHEN** an organization-role account calls `DELETE /organizations/me`
- **THEN** the organization is `deleted`, the user is retired, sessions are revoked, and audit + history rows exist

#### Scenario: Deleted org hidden publicly
- **WHEN** a guest reads the deleted organization's former slug
- **THEN** the response is `404`

#### Scenario: Sessions dead after deletion
- **WHEN** the deleted account attempts a refresh with a pre-deletion refresh token
- **THEN** the refresh is rejected

#### Scenario: Non-organization isolated
- **WHEN** a volunteer or an account without an organization row calls the route
- **THEN** the response is `404` in the error envelope

### Requirement: Organization public stats seam
The system SHALL define the `OrgPublicStatsProvider` extension seam (interface + inert default in `src/common/seams/`, following the S1 seam convention): `getStats(organizationId)` SHALL return the public-aggregate shape `{ volunteers, initiativesActive, initiativesCompleted, verifiedHours, responseRate, perDomain[], activeSince }` with all numeric fields zeroed, empty `perDomain`, and `activeSince` derived from `foundedYear` when set (else `null`). The public organization payload SHALL consume this seam via Nest DI. Session 16 (`org-dashboard`) SHALL swap in the real aggregation implementation without changing the organizations module's code.

#### Scenario: Inert default zeroed
- **WHEN** the public payload resolves aggregates through the default binding
- **THEN** numerics are `0`, `perDomain` is empty, and `activeSince` mirrors `foundedYear` (or `null` when unset)

#### Scenario: Swap is source-compatible
- **WHEN** Session 16 binds the real provider
- **THEN** consumers calling `getStats(organizationId)` compile unchanged against the same interface
