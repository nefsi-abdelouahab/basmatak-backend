## MODIFIED Requirements

### Requirement: Opportunities collection
The system SHALL provide an `opportunities` collection with `organizationId`, `slug` (unique, generated server-side via the canonical `src/common/slug` pipeline per A12), `title`/`description`, `categoryId`, `registryId` (a server-minted neutral registry identifier in `OPP-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), embedded `positions` (each with `title`, `description`, `requiredCount`, `filledCount` default `0`, `requiredSkills` as an array of `skillId` refs, `deliverables` as an array of short texts default `[]`, and optional `startAt`), `mode` (`onsite | remote | hybrid`, optional), `coverMediaId` (optional ObjectId ref to `media` with purpose `opportunity_cover`), `endDate` (optional), `durationMinutes` (optional positive int, minutes), `prerequisites` (array of short texts, default `[]`), `status` (`draft | published | in_progress | completed | closed | cancelled`, default `draft`), `startDate` (optional), `applicationDeadline` (optional), and `location { wilayaId, municipalityId, coordinates }`. The collection SHALL NOT contain `perks`, `hostLogistics`, `accommodation`, or `languageOfRecord` paths (owner-confirmed cuts, FCD #1/#3). Indexes SHALL include unique `slug`, `(status, startDate)`, `(status, categoryId)`, `(status, location.wilayaId)`, `(status, location.municipalityId)`, `(organizationId, status)`, 2dsphere `location.coordinates`, text on `title, description` (reserved per the F11 decision; not referenced by queries), and `positions.requiredSkills.skillId` per §3. Per the F11 canonical decision, keyword search SHALL be implemented as `$regex` bounded by an early `categoryId` equality, and geo filtering SHALL be implemented via the indexed `location` equality fields; no query SHALL reference the text index.

#### Scenario: Slug uniqueness enforced
- **WHEN** two opportunity rows attempt the same `slug`
- **THEN** the unique `slug` index rejects the second insert
- **AND** slug generation retries with a numeric suffix until the unique index accepts it

#### Scenario: Indexes back the feed and lifecycle queries
- **WHEN** opportunities are queried by status and startDate, by organization and status, by geo coordinates, by keyword, or by a required skill
- **THEN** each of those query shapes is served by a corresponding index in the collection

#### Scenario: Feed search decision is index-backed
- **WHEN** the public feed filters by status together with `categoryId`, `location.wilayaId`, `location.municipalityId`, keyword (`$regex` with an early `categoryId` bound when provided), or `startDate`
- **THEN** an `explain()`-asserted plan shows the query led by a corresponding `(status, …)` compound index with no collection scan

#### Scenario: One registry identifier per opportunity
- **WHEN** an opportunity is created (or an existing row is backfilled)
- **THEN** the row carries a well-formed `OPP-` registry identifier minted by `RegistryIdService`, and the identifier is never client-settable or mutable afterwards

#### Scenario: Cut fields absent from the schema
- **WHEN** the `opportunities` schema paths are inspected
- **THEN** no path named `perks`, `hostLogistics`, `accommodation`, or `languageOfRecord` exists at the top level or inside `positions`

### Requirement: Public feed
The system SHALL expose public `GET /opportunities` returning only opportunities whose status is exactly `published` (per §2.8 "Published only"), with cursor-based pagination (default limit 20, max 50 per §0) and the counted cursor-page metadata. Filters SHALL be supported: `q` (matches title/description, capped by a filter bound so the text index is not required for correctness — F11), `categoryId`, `skillId` (an opportunity whose positions include the skill), `wilayaId`, `municipalityId`, `from`/`to` (startDate bounds), and `hasOpenPositions` (true = at least one position with `filledCount < requiredCount`). Inputs represented by the feed’s multi-select filters SHALL accept comma-separated values, parsed consistently, with all selected filter constraints applied. `sort` SHALL accept only the feed’s server-defined whitelist and unknown values SHALL be rejected by DTO validation. An authenticated volunteer passing `nearMe=me` SHALL have the feed restricted using that caller’s volunteer-location wilaya. The `from`/`to` handling SHALL support the roadmap’s current-week and weekend windows using day-of-week boundaries. Each feed item SHALL carry the card fields `mode`, `coverMediaId`, `endDate`, and `durationMinutes` alongside the existing payload.

#### Scenario: Published opportunities listed
- **WHEN** a guest calls `GET /opportunities` with no filters
- **THEN** the response is paginated and contains only opportunities whose status is published/visible

#### Scenario: Non-published hidden
- **WHEN** an opportunity is `draft`, `closed`, `cancelled`, or `completed`
- **THEN** it is absent from the feed

#### Scenario: Filters narrow the feed
- **WHEN** a guest calls the feed with `q`, `categoryId`, `skillId`, `wilayaId`, `municipalityId`, `from`, `to`, or `hasOpenPositions=true`
- **THEN** only matching opportunities are returned, and `hasOpenPositions=true` keeps only opportunities having at least one position with `filledCount < requiredCount`

#### Scenario: Multi-select filters apply together
- **WHEN** a caller supplies comma-separated values for a supported feed multi-select filter
- **THEN** the values are parsed as separate selected constraints and the returned total and items reflect the combined filter

#### Scenario: Near-me uses the caller’s wilaya
- **WHEN** an authenticated volunteer calls `GET /opportunities?nearMe=me`
- **THEN** the list contains only published opportunities matching that volunteer’s resolved wilaya

#### Scenario: Date-window filters use calendar bounds
- **WHEN** a caller supplies `from`/`to` for a current-week or weekend feed window
- **THEN** only published opportunities whose start dates fall within those day-of-week bounds are returned

#### Scenario: Sort values are validated
- **WHEN** a caller supplies a `sort` value outside the feed whitelist
- **THEN** validation rejects the request

#### Scenario: Pagination clamps and pages by cursor
- **WHEN** a guest requests `limit` greater than 50
- **THEN** the limit is clamped to 50
- **AND** subsequent pages advance via the `cursor` parameter

#### Scenario: Feed cards carry the new fields
- **WHEN** a guest calls `GET /opportunities` and a published opportunity has `mode`, `coverMediaId`, `endDate`, and `durationMinutes` set
- **THEN** each returned item includes those four fields with their stored values

### Requirement: Public opportunity detail
The system SHALL expose public `GET /opportunities/:idOrSlug` (resolving either a 24-hex ObjectId or a slug) returning the opportunity with its positions and open seats only when the opportunity's status is `published`. The response SHALL include the opportunity's `registryId`, `mode`, `coverMediaId`, `endDate`, `durationMinutes`, and `prerequisites`, and each position SHALL include `deliverables` and `startAt`. For any other status (draft, closed, cancelled, completed, in_progress — F5), the route SHALL return `404` in the error envelope. The owning organization reads its own opportunities (any status) via `GET /organizations/me/opportunities` and `GET /organizations/me/opportunities/:id`.

#### Scenario: Published opportunity readable
- **WHEN** a guest calls `GET /opportunities/:idOrSlug` for a published opportunity
- **THEN** the opportunity detail with positions, open seats, the `OPP-` registry identifier, `mode`, `coverMediaId`, `endDate`, `durationMinutes`, `prerequisites`, and per-position `deliverables`/`startAt` is returned

#### Scenario: Non-published is 404
- **WHEN** a guest calls `GET /opportunities/:idOrSlug` for a draft, closed, cancelled, or completed opportunity (or for a nonexistent id/slug)
- **THEN** the response is `404`

#### Scenario: Unset new fields read back null-safe
- **WHEN** a guest reads a published opportunity created before this change (no new fields stored)
- **THEN** the detail returns with `mode`, `coverMediaId`, `endDate`, `durationMinutes` absent or null, `prerequisites` as `[]`, and each position with `deliverables` as `[]` and `startAt` absent or null

### Requirement: Create opportunity
The system SHALL expose `POST /organizations/me/opportunities` (authenticated, organization role) creating an opportunity with `status=draft`, a server-generated unique `slug` from the title, and the supplied embedded `positions` (each with `title`, `description`, `requiredCount` ≥ 1, `requiredSkills` of existing active skill ids, optional `deliverables` of at most 20 short texts each at most 500 chars, and optional `startAt` ISO date). The create body SHALL additionally accept optional `mode` (`onsite | remote | hybrid`), optional `coverMediaId` (must reference live media owned by the caller with purpose `opportunity_cover`), optional `endDate` (ISO date; when both `startDate` and `endDate` are supplied, `endDate` SHALL NOT precede `startDate`), optional `durationMinutes` (int ≥ 1), and optional `prerequisites` (at most 20 short texts each at most 500 chars). The organization is resolved from the token's user via `organizations.userId`; an account without an `organizations` row SHALL receive `404`.

#### Scenario: Draft created with positions
- **WHEN** an organization account posts an opportunity with positions
- **THEN** an opportunity row is created with `status=draft`, a generated `slug`, and the positions as embedded documents

#### Scenario: Draft created with all new fields
- **WHEN** an organization posts an opportunity with `mode`, `coverMediaId` (own `opportunity_cover` media), `endDate`, `durationMinutes`, `prerequisites`, and per-position `deliverables`/`startAt`
- **THEN** the created row persists every supplied field and the response echoes them back

#### Scenario: Invalid positions rejected
- **WHEN** a payload includes a position with `requiredCount < 1` or a `requiredSkills` entry that is not a valid skill id
- **THEN** the request is rejected by validation

#### Scenario: Invalid mode rejected
- **WHEN** a create payload includes a `mode` outside `onsite | remote | hybrid`
- **THEN** the request is rejected with `400` by DTO validation

#### Scenario: Invalid duration or date window rejected
- **WHEN** a create payload includes `durationMinutes < 1` or an `endDate` preceding `startDate`
- **THEN** the request is rejected with `400`

#### Scenario: Foreign or wrong-purpose cover rejected
- **WHEN** a create payload includes a `coverMediaId` that does not exist, is not owned by the caller, or has a purpose other than `opportunity_cover`
- **THEN** the request fails with `404` (`MEDIA_NOT_FOUND`) for absent/foreign media or `409` (`MEDIA_PURPOSE_MISMATCH`) for a purpose mismatch

### Requirement: List own opportunities
The system SHALL expose `GET /organizations/me/opportunities` (authenticated, organization role) returning all of the owning organization's opportunities across every status, cursor-paginated (default limit 20, max 50) with counted cursor-page metadata. Each returned opportunity SHALL include its `registryId`, `mode`, `coverMediaId`, `endDate`, `durationMinutes`, and `prerequisites`, and each position SHALL include `deliverables` and `startAt`. The list SHALL accept `q` across the roadmap’s title, location, and skill search surface and a validated `sort` value from its server-defined whitelist, while retaining the existing optional status filter and ownership isolation.

#### Scenario: All statuses returned
- **WHEN** an organization account calls `GET /organizations/me/opportunities`
- **THEN** the response lists its own opportunities in every status, including drafts, each carrying its `OPP-` registry identifier and the new fields

#### Scenario: Search and sort narrow only own rows
- **WHEN** an organization supplies `q` or a valid `sort` value
- **THEN** only matching opportunities belonging to that organization are returned in the selected permitted order

#### Scenario: Unknown sort is rejected
- **WHEN** an organization supplies an unlisted `sort` value
- **THEN** validation rejects the request

### Requirement: Update opportunity
The system SHALL expose `PATCH /opportunities/:opportunityId` (authenticated, organization role, owning org only). Before publish the editable set SHALL be the full profile (title, description, categoryId, startDate, endDate, durationMinutes, mode, prerequisites, applicationDeadline, location) plus `coverMediaId`; after publish it SHALL be limited to a small safe set (`description`, forward-only `applicationDeadline`, and `coverMediaId`) and only while the opportunity has no `accepted` participants. `mode`, `prerequisites`, `endDate`, and `durationMinutes` SHALL be locked after publishing (`409` `OPPORTUNITY_FIELD_LOCKED` when attempted). `coverMediaId` updates SHALL assert live caller-owned media with purpose `opportunity_cover` (`404`/`409` per the media-ownership contract). `endDate` SHALL NOT be set before `startDate` (`400`). `slug`, `organizationId`, `status`, `registryId`, and `positions` SHALL NOT be settable from the body.

#### Scenario: Draft fully editable
- **WHEN** a draft opportunity of the owning org is patched with profile fields including `mode`, `prerequisites`, `endDate`, `durationMinutes`, or `coverMediaId`
- **THEN** the fields are updated

#### Scenario: Published edit limited and gated
- **WHEN** a published opportunity with no accepted participants is patched with the limited safe fields
- **THEN** the safe fields are updated
- **AND** a patch attempting unsupported fields (or applied after an accepted participant exists) is rejected

#### Scenario: Post-publish mode and schedule locked
- **WHEN** a published opportunity with no accepted participants is patched with `mode`, `prerequisites`, `endDate`, or `durationMinutes`
- **THEN** the request is rejected with `409` `OPPORTUNITY_FIELD_LOCKED`

#### Scenario: Cover changeable until first acceptance
- **WHEN** a published opportunity with no accepted participants is patched with a valid own `opportunity_cover` `coverMediaId`
- **THEN** the cover is updated
- **AND** when an accepted participant exists the same patch is rejected with `409`

#### Scenario: Non-owner rejected
- **WHEN** an account that is not the owning organization patches the opportunity
- **THEN** the response is `404` in the error envelope

### Requirement: Positions management
The system SHALL expose positions CRUD under `/opportunities/:opportunityId/positions` (authenticated, organization role, owning org only): `POST` adds a position, `PATCH /positions/:positionId` edits one, `DELETE /positions/:positionId` removes one. The seat rule `requiredCount >= filledCount` SHALL be enforced on create, patch, and delete (a patch may never drop `requiredCount` below `filledCount`, and a delete is refused once `filledCount > 0`). Positions SHALL carry `deliverables` (at most 20 short texts each at most 500 chars) and optional `startAt` (ISO date), both settable on add and editable on patch. Position add/patch SHALL be allowed on drafts freely and on published opportunities only while no `accepted` participants exist; delete SHALL additionally be refused while any application references the position (§2.8).

#### Scenario: Position added with seats
- **WHEN** the owning org adds a position with `requiredCount` and skills to a draft
- **THEN** the position is embedded and `filledCount` starts at `0`

#### Scenario: Position added with deliverables and schedule
- **WHEN** the owning org adds a position with `deliverables` and `startAt` to a draft
- **THEN** the position persists both fields and reads them back

#### Scenario: Seat count never below filled
- **WHEN** a patch attempts to set `requiredCount` below the position's `filledCount`
- **THEN** the request is rejected
- **AND** a delete of a position with `filledCount > 0` is also rejected

#### Scenario: Published gate on position edits
- **WHEN** the owning org attempts to add or edit positions on a published opportunity that already has an accepted participant
- **THEN** the request is rejected

## ADDED Requirements

### Requirement: Org single opportunity read
The system SHALL expose `GET /organizations/me/opportunities/:id` (authenticated, organization role) returning the owning organization's single opportunity in any status (including `draft` and other non-published statuses) with the full field set (`registryId`, `mode`, `coverMediaId`, `endDate`, `durationMinutes`, `prerequisites`, per-position `deliverables`/`startAt`). An account that is not the owning organization, a nonexistent id, or a malformed id SHALL receive `404` in the error envelope.

#### Scenario: Own draft readable
- **WHEN** the owning organization calls `GET /organizations/me/opportunities/:id` for its own `draft` opportunity
- **THEN** the full opportunity (any status) is returned with the new fields

#### Scenario: Foreign or missing opportunity hidden
- **WHEN** an organization requests another org's opportunity id, a nonexistent id, or a malformed id
- **THEN** the response is `404` in the error envelope

### Requirement: Duplicate opportunity
The system SHALL expose `POST /organizations/me/opportunities/:id/duplicate` (authenticated, organization role, owning org only) creating an independent copy of the owned opportunity with `status=draft`, a fresh server-generated unique `slug`, and a fresh `registryId` minted by `RegistryIdService`. The copy SHALL carry over `title`, `description`, `categoryId`, `startDate`, `endDate`, `durationMinutes`, `mode`, `prerequisites`, `coverMediaId`, `applicationDeadline`, `location`, and the full `positions` list (new sub-document ids, `filledCount` reset to `0`, `requiredSkills`/`deliverables`/`startAt` preserved). A nonexistent, malformed, or foreign opportunity id SHALL yield `404`.

#### Scenario: Duplicate creates an independent draft
- **WHEN** the owning organization duplicates its opportunity (any status)
- **THEN** a new row is created with `status=draft`, a different id/slug/`registryId`, zeroed seat fills, and identical descriptive/schedule/mode/cover/prerequisite content

#### Scenario: Duplicate is isolated from the source
- **WHEN** the owning organization edits the duplicate's positions or fields
- **THEN** the source opportunity is unchanged (and vice versa)

#### Scenario: Duplicate of foreign opportunity hidden
- **WHEN** an organization duplicates another org's opportunity id or a nonexistent id
- **THEN** the response is `404` in the error envelope
