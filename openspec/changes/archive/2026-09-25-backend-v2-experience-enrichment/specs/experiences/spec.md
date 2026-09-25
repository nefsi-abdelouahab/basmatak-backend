## MODIFIED Requirements

### Requirement: Volunteer experiences collection
The system SHALL maintain a `volunteer_experiences` collection owned by the experiences module (inventory §3, §2.14, §5). Each document SHALL carry: `submissionId` (ObjectId referencing `submissions`, unique — one experience per approved submission), `volunteerId`, `organizationId`, `opportunityId`, `positionId` (denormalized for the `me`/detail reads), `title`, `description` (snapshots copied from the verified position), `skills` (snapshot of the position's required skills, unchanged — Session 9's read-time `areasOfContribution` derivation reads these ids and is unaffected by this change), `duration` (real minutes stamped by the verify transaction from `opportunities.durationMinutes`, `0` for legacy opportunities predating Session 11 fields; legacy rows keep their stored value, no backfill), `evidenceIds` (array of the submission's evidence media references), `verificationCode` (unique, generated per A12), `registryId` (a server-minted neutral registry identifier in `EXP-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), `publicVisibility` (`public | private`), and timestamps. Experiences SHALL be created only by the verify transaction — there is no create/edit route (inventory §2.14). Wherever an experience surfaces in a payload — the volunteer's own list/detail, the org experiences list, the admin volunteer-experiences read, the public `/verify/:verificationCode` proof, or public profile experience cards — the row's `registryId`, `verificationCode`, real `duration`, `organization { id, slug, nameFr, nameAr }`, and `verifiedAt` (the verification's `decidedAt`, falling back to the experience `createdAt`) SHALL be included. Indexes SHALL include unique `submissionId`, unique `verificationCode`, and `(volunteerId, publicVisibility)` per §3, plus `(organizationId, _id)` serving the org list.

#### Scenario: Experience created by verify
- **WHEN** the verify transaction approves a submission
- **THEN** a `volunteer_experiences` row is inserted with the position's title/description/skills snapshots, the opportunity's real `durationMinutes` (or `0` when unset), the submission's evidence ids, a generated `verificationCode`, and a minted `EXP-` registry identifier

#### Scenario: One experience per approved submission
- **WHEN** a submission is verified after being re-submitted and re-approved
- **THEN** the existing experience row is reused/updated for that `submissionId` (unique constraint), no second row is created, and the registry identifier is never reassigned or overwritten

#### Scenario: No create or edit endpoint
- **WHEN** a client attempts to create or edit an experience directly
- **THEN** no such route exists (`404`)

#### Scenario: Enriched identity on every surface
- **WHEN** an experience is returned on any surface (own, org, admin, public proof, public cards)
- **THEN** the payload carries `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, `verificationCode`, `registryId`, and the real `duration`

### Requirement: Volunteer lists own experiences
The system SHALL expose `GET /experiences/me` (authenticated, volunteer) returning only the caller's own experiences, newest-first, cursor-paginated per the S1 convention (default limit 20, max 50) with counted cursor-page metadata. It SHALL accept optional `categoryId`, `skillId`, `from`, and `to` filters; the date range SHALL apply to the experience list's timestamps. Each returned row SHALL carry its `registryId`, `verificationCode`, real `duration`, `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, and neutral `review { rating, notes } | null` (joined read-only from the review on the experience's `submissionId`; `notes` mirrors the review `comment`). No other volunteer's rows SHALL appear regardless of pagination depth.

#### Scenario: Own experiences listed
- **WHEN** an authenticated volunteer requests `GET /experiences/me`
- **THEN** only rows with `volunteerId` equal to the caller are returned, ordered newest-first, paginated by the cursor convention, each including its `EXP-` registry identifier, `verificationCode`, org identity, `verifiedAt`, and real `duration`

#### Scenario: Category, skill, and date filters narrow own rows
- **WHEN** a volunteer supplies `categoryId`, `skillId`, `from`, or `to`
- **THEN** only their experiences matching every supplied filter are returned and the total reflects those filters

#### Scenario: Reviewer notes surfaced neutrally
- **WHEN** a review exists for the experience's `submissionId`
- **THEN** the row carries `review { rating, notes }` with neutral naming (no "Compliance Evaluation" wording); otherwise `review` is `null`

### Requirement: Volunteer reads own experience
The system SHALL expose `GET /experiences/:experienceId` (authenticated, volunteer owner) returning the full experience detail including its evidence media metadata (resolved for rendering), the experience's `registryId`, `verificationCode`, real `duration`, `organization { id, slug, nameFr, nameAr }`, `verifiedAt`, and any `review { rating, notes }` written against the experience's `submissionId`. A caller who does not own the experience SHALL receive `404` (non-owner treated as not-found, §6).

#### Scenario: Owner reads full detail
- **WHEN** the owning volunteer requests the experience detail
- **THEN** the experience snapshot, its `EXP-` registry identifier, `verificationCode`, org identity, `verifiedAt`, real `duration`, evidence media metadata, and the associated neutral review are returned

#### Scenario: Foreign volunteer gets 404
- **WHEN** a volunteer who does not own the experience requests the detail
- **THEN** the response is `404`

## ADDED Requirements

### Requirement: Organization lists its experiences
The system SHALL expose `GET /organizations/me/experiences` (authenticated, organization) returning the verified-experience rows minted from submissions on the caller's own opportunities (RP §2.7#1), newest-first, cursor-paginated per the S1 convention (default limit 20, max 50) with counted cursor-page metadata (`total`/`page`/`pages`). It SHALL accept optional `q` (bounded case-insensitive match on experience `title`, `verificationCode`, or `registryId`), `opportunityId` (ObjectId equality), `visibility` (`public | private`, matching `publicVisibility`), and `sort` (server whitelist `newest | oldest`, default `newest`; unknown values rejected `400`). Each row SHALL carry the enriched shape (`id`, `registryId`, `title`, `description`, `skills` as string ids, real `duration`, `organization` identity of the caller, `verifiedAt`, `verificationCode`, `publicVisibility`, neutral `review { rating, notes } | null`) — the "Copy verification link" (`GET /verify/:verificationCode`) and registry data source (RP §2.7#9). Evidence blobs are NOT embedded in list rows. With `?format=csv` the route SHALL stream the filtered rows as `text/csv` in-process (header row + one row per experience; never written to disk). Rows of other organizations SHALL never appear; guests/volunteers SHALL receive `401`/`403`.

#### Scenario: Org lists own experiences with filters
- **WHEN** an org requests `GET /organizations/me/experiences` with `q`, `opportunityId`, `visibility`, or `sort`
- **THEN** only experiences whose `organizationId` equals the caller's org are returned, narrowed by every supplied filter, newest-first (or oldest-first), with totals reflecting those filters

#### Scenario: Rows carry verification identity
- **WHEN** an org reads a list row
- **THEN** the row includes `verificationCode` and `publicVisibility` alongside the enriched identity fields

#### Scenario: CSV export streams filtered rows
- **WHEN** an org requests the list with `?format=csv`
- **THEN** the response is `text/csv` with a header row and one row per filtered experience, streamed in-process with no disk artifact

#### Scenario: Foreign org sees nothing
- **WHEN** an org lists experiences while another org's experiences exist
- **THEN** the other org's rows are absent from items and totals
