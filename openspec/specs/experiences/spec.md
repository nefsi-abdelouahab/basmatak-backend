# experiences Specification

## Purpose
The experiences capability (§2.14): a `volunteer_experiences` collection created only by the verify transaction, with ownership-scoped list/detail reads, publicVisibility control, unique verification codes, and the possession-based public proof route.

## Requirements
### Requirement: Volunteer experiences collection

The system SHALL maintain a `volunteer_experiences` collection owned by the experiences module (inventory §3, §2.14, §5). Each document SHALL carry: `submissionId` (ObjectId referencing `submissions`, unique — one experience per approved submission), `volunteerId`, `organizationId`, `opportunityId`, `positionId` (denormalized for the `me`/detail reads), `title`, `description` (snapshots copied from the verified position), `skills` (snapshot of the position's required skills), `duration` (snapshot copied from the verify transaction), `evidenceIds` (array of the submission's evidence media references), `verificationCode` (unique, generated per A12), `registryId` (a server-minted neutral registry identifier in `EXP-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), `publicVisibility` (`public | private`), and timestamps. Experiences SHALL be created only by the verify transaction — there is no create/edit route (inventory §2.14). Wherever an experience surfaces in a payload — the volunteer's own list/detail, the public `/verify/:verificationCode` proof, or public profile experience cards — the row's `registryId` SHALL be included. Indexes SHALL include unique `submissionId`, unique `verificationCode`, and `(volunteerId, publicVisibility)` per §3.

#### Scenario: Experience created by verify

- **WHEN** the verify transaction approves a submission
- **THEN** a `volunteer_experiences` row is inserted with the position's title/description/skills/duration snapshots, the submission's evidence ids, a generated `verificationCode`, and a minted `EXP-` registry identifier

#### Scenario: One experience per approved submission

- **WHEN** a submission is verified after being re-submitted and re-approved
- **THEN** the existing experience row is reused/updated for that `submissionId` (unique constraint), no second row is created, and the registry identifier is never reassigned or overwritten

#### Scenario: No create or edit endpoint

- **WHEN** a client attempts to create or edit an experience directly
- **THEN** no such route exists (`404`)

### Requirement: Verification code generation

The system SHALL generate a `verificationCode` for each experience per A12: exactly 8 characters drawn from an uppercase base32 alphabet with the visually ambiguous characters `0`, `O`, `1`, and `I` excluded, generated using the built-in Node `crypto` random API (no new package). Codes SHALL be unique across the collection; a collision with an existing row SHALL be retried with a fresh random code (bounded attempts, then a failure that rolls back the verify transaction).

#### Scenario: Code has correct shape

- **WHEN** a code is generated
- **THEN** it is exactly 8 characters, uppercase, drawn only from the permitted base32 alphabet

#### Scenario: Collision is retried

- **WHEN** a generated code already exists on another experience
- **THEN** a fresh code is generated and the unique `verificationCode` index constraint is satisfied within bounded attempts

#### Scenario: Bounded retries fail the transaction

- **WHEN** collisions exhaust the retry bound
- **THEN** the verify transaction raises an error and rolls back (no experience row, submission not approved)

### Requirement: Volunteer lists own experiences

The system SHALL expose `GET /experiences/me` (authenticated, volunteer) returning only the caller's own experiences, newest-first, cursor-paginated per the S1 convention (default limit 20, max 50). Each returned row SHALL carry its `registryId`. No other volunteer's rows SHALL appear regardless of pagination depth.

#### Scenario: Own experiences listed

- **WHEN** an authenticated volunteer requests `GET /experiences/me`
- **THEN** only rows with `volunteerId` equal to the caller are returned, ordered newest-first, paginated by the cursor convention, each including its `EXP-` registry identifier

### Requirement: Volunteer reads own experience

The system SHALL expose `GET /experiences/:experienceId` (authenticated, volunteer owner) returning the full experience detail including its evidence media metadata (resolved for rendering), the experience's `registryId`, and any `review` written against the experience's `submissionId`. A caller who does not own the experience SHALL receive `404` (non-owner treated as not-found, §6).

#### Scenario: Owner reads full detail

- **WHEN** the owning volunteer requests the experience detail
- **THEN** the experience snapshot, its `EXP-` registry identifier, evidence media metadata, and the associated review are returned

#### Scenario: Foreign volunteer gets 404

- **WHEN** a volunteer who does not own the experience requests the detail
- **THEN** the response is `404`

### Requirement: Volunteer controls experience visibility

The system SHALL expose `PATCH /experiences/:experienceId/visibility` (authenticated, volunteer owner) accepting `{ publicVisibility }` (`public | private`) and updating only that field. The change SHALL affect whether the experience is discoverable/public elsewhere (S12) — it SHALL NOT affect the possession-based `/verify/:verificationCode` proof, which resolves regardless of `publicVisibility` (A6). A caller who does not own the experience SHALL receive `404`.

#### Scenario: Owner toggles visibility

- **WHEN** the owning volunteer PATCHes `{ publicVisibility: "private" }` on their experience
- **THEN** only `publicVisibility` changes and the row still resolves at `/verify/:code` (A6)

#### Scenario: Foreign volunteer gets 404

- **WHEN** a volunteer who does not own the experience PATCHes visibility
- **THEN** the response is `404` and the row is unchanged