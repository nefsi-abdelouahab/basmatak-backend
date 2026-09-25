# organizations Specification

## Purpose
Organizations: single-account organization pages with bilingual names, logo, description, document-based verification flow (submit → pending → verified/rejected), public profile and public opportunity listing.
## Requirements
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

### Requirement: Organization verifications collection
The system SHALL provide an `organization_verifications` collection with `organizationId`, `status` (`pending | verified | rejected`), `documents` (array of `mediaId`s stored as ObjectId-format strings), `rejectionReason` (optional), `assignedAdminId` (optional ObjectId of an `admin`-role user, unset by default), `submittedAt`, `decidedAt` (optional), and `decidedBy` (optional). Index SHALL be `(organizationId, status)` plus `(assignedAdminId, status)`.

#### Scenario: Submission record created
- **WHEN** an organization submits verification documents
- **THEN** an `organization_verifications` row is created with the documents, status `pending`, no `assignedAdminId`, and `submittedAt` set

#### Scenario: Rejection context retained
- **WHEN** an organization's submission is rejected by an admin (Session 15)
- **THEN** the row records `status=rejected`, `rejectionReason`, `decidedAt`, and `decidedBy`

#### Scenario: Assignment recorded
- **WHEN** an admin assigns a verification row to an existing admin user
- **THEN** the row records `assignedAdminId` without changing `status` or decision fields

### Requirement: Verification status state machine
The SHALL be `pending → verified | rejected → pending` (F1). An organization SHALL only be considered able to publish once `verificationStatus=verified` (§7 decision 7; publish itself is Session 6). Moving `pending → verified | rejected` SHALL happen only through the admin approve/reject routes (Session 15). Resubmission from `rejected` SHALL return the organization to `pending`.

#### Scenario: Rejected organization resubmits
- **WHEN** an organization with `verificationStatus=rejected` submits documents
- **THEN** its `verificationStatus` becomes `pending`
- **AND** a new `organization_verifications` row is created

#### Scenario: Verified is terminal for submission
- **WHEN** an organization with `verificationStatus=verified` attempts to submit documents
- **THEN** the request is rejected with business code `ORG_ALREADY_VERIFIED`

### Requirement: Organization status transition whitelist
The system SHALL extend the `organization` entity whitelist registered with the S1 `StatusTransitionService` (already `pending → verified | rejected → pending` for verification status) with the organization account status pairs `active ↔ suspended`, used by the admin organization-status route so changes are validated and recorded in `status_histories`. The registration SHALL be additive and SHALL NOT alter the verification-status pairs.

#### Scenario: Whitelist active at bootstrap
- **WHEN** the application boots the organizations module with the admin additions
- **THEN** `StatusTransitionService.assert` accepts `active → suspended` and `suspended → active` for entity type `organization` in addition to the verification pairs

#### Scenario: Unlisted transition rejected
- **WHEN** any code attempts `active → deleted` for entity type `organization`
- **THEN** the call fails with `INVALID_STATUS_TRANSITION` and no `status_histories` row is written

### Requirement: Public organization listing
The system SHALL expose public `GET /organizations` returning organizations where `verificationStatus=verified` AND `status=active`, with the shared counted page metadata. It SHALL accept bounded `q` public search and the roadmap’s `page` parameter; the search SHALL not expose pending, rejected, inactive, or deleted organizations.

#### Scenario: Verified and active organizations listed
- **WHEN** a guest calls `GET /organizations`
- **THEN** the response contains only organizations that are both verified and active

#### Scenario: Public search and page narrow the list
- **WHEN** a guest calls `GET /organizations?q=...&page=...`
- **THEN** only verified, active organizations matching the bounded search are returned with their total, page, and pages metadata

#### Scenario: Pending or non-active hidden
- **WHEN** an organization is `pending`, `rejected`, or has `status` other than `active`
- **THEN** it is absent from `GET /organizations`

### Requirement: Public organization by slug
The system SHALL expose public `GET /organizations/:slug` returning the organization profile only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope. The public profile SHALL include the organization's neutral `registryId` and the additive fact-sheet fields `location`, `website`, `type`, `registrationNumber`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `annualReportMediaId`, plus `aggregates` supplied by the `OrgPublicStatsProvider` seam (database-derived since Session 16 filled the real provider). Organizations with `publicProfile.enabled=false` SHALL still resolve (the toggle is a neutral platform-profile preference, not a visibility gate — no 404 regression).

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug` for a verified, active organization
- **THEN** the public organization profile is returned, including its `ORG-` registry identifier, the fact-sheet fields, and the `aggregates` block

#### Scenario: Non-verified organization hidden
- **WHEN** a guest calls `GET /organizations/:slug` for a `pending` or `rejected` organization (or an inactive/deleted one)
- **THEN** the response is `404`

#### Scenario: Aggregates real after Session 16
- **WHEN** a guest reads the public profile of an org with 2 active initiatives, 1 completed initiative, 4 engaged volunteers, 300 verified minutes, and a cached `responseRate` of `0.5`
- **THEN** the `aggregates` block carries those database-derived values (not zeros) with `activeSince` mirroring `foundedYear`

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

### Requirement: Read own organization
The system SHALL expose `GET /organizations/me` (authenticated, organization role) returning the caller's own organization, resolved from the token's user via `organizations.userId`. The response SHALL include the organization's `registryId`. The route SHALL be declared before `/organizations/:slug` in the controller (§2.7 route-order trap).

#### Scenario: Owner reads their organization
- **WHEN** an `organization`-role account calls `GET /organizations/me`
- **THEN** its own organization record is returned, including its `ORG-` registry identifier

#### Scenario: Account without an organization
- **WHEN** a `volunteer` (or any account with no matching `organizations` row) calls `GET /organizations/me`
- **THEN** the response is `404` in the error envelope

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

### Requirement: Publish gate rule

The system SHALL provide a real publish-gate counter that replaces the inert `PublishGateService` default via Nest DI provider override without changing the opportunities module's code (A7, extension-seams contract). `evaluate(org)` SHALL count the distinct opportunities belonging to the org that have at least one submission in `submitted|under_review`; draft submissions and decided submissions SHALL never count, and an opportunity unlocks only when it has no pending submission left (whole-opportunity decision). The gate SHALL report locked when the pending count is greater than or equal to the `publishGate.maxPendingOpportunities` value from `system_settings` (default `3`), and a locked result SHALL turn the existing publish route into `409` with business code `PUBLISH_GATE_LOCKED`. When a gated publish resolves locked, the system SHALL emit the `publish-gate.locked` domain event so the notifications capability can notify the organization. The pending-count `distinct` SHALL be led by a `(organizationId, status)` compound index on the submissions collection (the gate aggregation index, §3), whose equality prefix also serves the reliability module's `submissionModel.find({ organizationId })` reads instead of a collection scan.

#### Scenario: Counter counts distinct pending opportunities
- **WHEN** an organization has one opportunity with two pending submissions and another opportunity with one
- **THEN** the count is `2` (one per distinct opportunity, not per submission)

#### Scenario: Drafts and decided submissions excluded
- **WHEN** an opportunity has only draft submissions or only `approved`/`rejected` submissions
- **THEN** it does not contribute to the pending count

#### Scenario: Whole opportunity decision unlocks
- **WHEN** an opportunity's last `submitted`/`under_review` submission is verified or rejected
- **THEN** the opportunity no longer counts toward the gate

#### Scenario: Threshold reached locks publish
- **WHEN** the pending count reaches `publishGate.maxPendingOpportunities` (default 3) on a publish attempt
- **THEN** `evaluate(org)` reports locked and the publish is blocked with `PUBLISH_GATE_LOCKED`

#### Scenario: Locked event emitted once per org
- **WHEN** a gated publish resolves locked for an organization
- **THEN** a `publish-gate.locked` event is emitted scoped to that organization (deduplicated by event name plus org id)

#### Scenario: Gate counting led by the aggregation index
- **WHEN** `evaluate(org)` runs the pending-count distinct for an organization
- **THEN** the submissions query plan is led by the `(organizationId, status)` compound index (asserted via `explain()`) with no collection scan

### Requirement: Publish-gate status read

The system SHALL expose `GET /organizations/me/publish-gate` (authenticated, organization role) returning `{ locked, pendingCount, threshold, pendingOpportunities[] }` where `locked` and `pendingCount` follow the same rule as the publish-gate counter, `threshold` is the `system_settings` value (default `3`), and `pendingOpportunities` lists the distinct opportunities currently counting toward the gate with their id and display fields. The route SHALL be declared before `/organizations/:slug` in its controller (§2.7 route-order trap).

#### Scenario: Reports state under the threshold
- **WHEN** a verified organization with one pending opportunity calls the route and the threshold is 3
- **THEN** the response reports `locked: false`, `pendingCount: 1`, `threshold: 3`, and that opportunity in `pendingOpportunities`

#### Scenario: Reports locked at the threshold
- **WHEN** the pending count equals or exceeds the threshold
- **THEN** the response reports `locked: true`

#### Scenario: Route order beats the slug route
- **WHEN** the controller is scanned
- **THEN** `me/publish-gate` is matched before `:slug` so `"me"` is never treated as a slug

#### Scenario: Non-organization isolated
- **WHEN** a volunteer or an account without an organization row calls the route
- **THEN** the response is `404` in the error envelope

### Requirement: Reliability computation

The system SHALL compute per-organization reliability from that organization's `submissions`, `verifications`, and `reviews` data: `responseRate` (decided submissions over uploaded ones — upload statuses `submitted|under_review|approved|rejected`; decided means `approved|rejected`), `decidedRatio` (decided submissions over all of the org's submissions including drafts), `medianDecisionMs` (median over the org's verification rows of `decidedAt − submission.createdAt`; an even-length set SHALL use the average of the two middle values), and an `anomaly` flag (true when the org's average `reviews.rating` exceeds the platform-wide average; the flag is only computable when both the org and the platform have at least one review, otherwise `false`). Metrics whose divisor is zero SHALL be omitted rather than stored as `0`.

#### Scenario: Ratios computed from a fixture
- **WHEN** an org has 2 drafts, 4 uploaded submissions of which 2 are decided
- **THEN** `responseRate` is `0.5` and `decidedRatio` is `0.4`

#### Scenario: Even-length median averaged
- **WHEN** the org has 4 verification rows with decision durations ordering to `[10, 20, 40, 90]` minutes
- **THEN** `medianDecisionMs` is the average of the two middle values (`30` minutes)

#### Scenario: Zero-upload guard
- **WHEN** an org has no uploaded submissions
- **THEN** the ratio metrics are omitted (not `0`)

#### Scenario: Anomaly flag derived from average rating
- **WHEN** the org's average `reviews.rating` is above the platform average
- **THEN** `anomaly` is `true`; otherwise (or with insufficient reviews) it is `false`

### Requirement: Reliability cache and refresh

The system SHALL cache the computed reliability into the org's `organizations.reliability` sub-document with `lastRefreshedAt`, and SHALL refresh it on the submission events that change the inputs (submitted/verified/rejected) and through a `reliabilityRecompute` handler registered in the S1 `JobRegistry` that runs on the job tick and recomputes all organizations idempotently.

#### Scenario: Event-driven refresh persists values
- **WHEN** a submission event fires for an organization
- **THEN** the org's cached reliability is recomputed and `lastRefreshedAt` is updated

#### Scenario: Job handler recomputes all orgs
- **WHEN** the job tick runs the `reliabilityRecompute` handler
- **THEN** every organization's `reliability` is recomputed (idempotent, no duplicate writes)

### Requirement: Public organization reliability

The system SHALL expose public `GET /organizations/:slug/reliability` returning the organization's cached reliability metrics only when `verificationStatus=verified` AND `status=active`; otherwise it SHALL return `404` in the error envelope (same gating as the public organization seam).

#### Scenario: Verified active organization readable
- **WHEN** a guest calls `GET /organizations/:slug/reliability` for a verified, active organization
- **THEN** the cached reliability metrics are returned

#### Scenario: Non-verified or inactive hidden
- **WHEN** a guest calls the route for a `pending`/`rejected`/inactive/absent organization
- **THEN** the response is `404`

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
The system SHALL bind the real `OrgPublicStatsProvider` aggregation behind the extension seam (interface in `src/common/seams/`, following the S1 seam convention; swapped via Nest DI without changing the organizations module's code): `getStats(organizationId)` SHALL return `{ volunteers, initiativesActive, initiativesCompleted, verifiedHours, responseRate, perDomain[] }` where `volunteers` = distinct `volunteerId` over the org's `task_participants` with status `accepted | active`; `initiativesActive` / `initiativesCompleted` = counts of the org's `opportunities` by status (active `published | in_progress`, completed `completed | closed`, `draft | cancelled` excluded); `verifiedHours` = lifetime sum of `volunteer_experiences.duration` for the org (no trailing-window restriction); `responseRate` = the org's cached `organizations.reliability.responseRate` (the `ReliabilityService` convention: decided over uploaded submissions), `0` when the cache is absent — no new formula is introduced; `perDomain[]` = `{ domain, share }` slices of the org's non-draft opportunities grouped by `categoryId` → skill-category name, sorted desc, at most 8). `activeSince` stays derived in `OrganizationsService` from `foundedYear` (else `null`), not by the seam.

#### Scenario: Real provider returns database values
- **WHEN** the public payload resolves aggregates through the real binding
- **THEN** every field reflects the org's rows per the formulas above and `activeSince` mirrors `foundedYear` (or `null` when unset)

#### Scenario: Swap is source-compatible
- **WHEN** Session 16 binds the real provider
- **THEN** consumers calling `getStats(organizationId)` compile unchanged against the same interface

#### Scenario: Organization without activity yields zeros
- **WHEN** the real provider computes stats for an org with no participants, opportunities, experiences, or cached reliability
- **THEN** numerics are `0` and `perDomain` is empty

### Requirement: Organization private dashboard stats
The system SHALL expose `GET /organizations/me/stats` (authenticated, `organization` role, caller's own org only; a caller without an organization row SHALL receive `404`) returning the private dashboard numbers: `opportunitiesActive`, `opportunitiesCompleted` (same status mapping as the public seam), `applicationsPending`, `applicationsUnderReview` (counts over the org's `applications`), `participantsActive`, `participantsCompleted` (counts over the org's `task_participants`), `verifiedHours` (same sum as the public seam), `decisionsLast30d` (count of the org's `verifications` with `decidedAt` in the trailing 30 days), `decidedRatio` and `medianDecisionHours` (the org's cached reliability snapshot values, omitted when the cache is absent). The route SHALL be read-only with no pagination (single object).

#### Scenario: Owning org reads its stats
- **WHEN** the owning org calls `GET /organizations/me/stats`
- **THEN** the response carries the counts above matching the database, with cached reliability values included when present

#### Scenario: Foreign caller isolated
- **WHEN** a guest or a volunteer calls the route, or an organization-role caller has no organization row
- **THEN** guests receive `401`, wrong-role callers receive `403`, and a role-valid caller without an organization row receives `404`; scoping always derives from the caller's own org so no org ever sees another org's numbers

