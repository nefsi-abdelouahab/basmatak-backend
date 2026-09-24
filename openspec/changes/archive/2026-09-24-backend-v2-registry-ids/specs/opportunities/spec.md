# opportunities Specification Delta

## MODIFIED Requirements

### Requirement: Opportunities collection
The system SHALL provide an `opportunities` collection with `organizationId`, `slug` (unique, generated server-side via the canonical `src/common/slug` pipeline per A12), `title`/`description`, `categoryId`, `registryId` (a server-minted neutral registry identifier in `OPP-` + six zero-padded digits format, required on every row, immutable once assigned — owned by the `counters` capability), embedded `positions` (each with `title`, `description`, `requiredCount`, `filledCount` default `0`, `requiredSkills` as an array of `skillId` refs), `status` (`draft | published | in_progress | completed | closed | cancelled`, default `draft`), `startDate` (optional), `applicationDeadline` (optional), and `location { wilayaId, municipalityId, coordinates }`. Indexes SHALL include unique `slug`, `(status, startDate)`, `(status, categoryId)`, `(status, location.wilayaId)`, `(status, location.municipalityId)`, `(organizationId, status)`, 2dsphere `location.coordinates`, text on `title, description` (reserved per the F11 decision; not referenced by queries), and `positions.requiredSkills.skillId` per §3. Per the F11 canonical decision, keyword search SHALL be implemented as `$regex` bounded by an early `categoryId` equality, and geo filtering SHALL be implemented via the indexed `location` equality fields; no query SHALL reference the text index.

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

### Requirement: Public opportunity detail
The system SHALL expose public `GET /opportunities/:idOrSlug` (resolving either a 24-hex ObjectId or a slug) returning the opportunity with its positions and open seats only when the opportunity's status is `published`. The response SHALL include the opportunity's `registryId`. For any other status (draft, closed, cancelled, completed, in_progress — F5), the route SHALL return `404` in the error envelope. The owning organization reads its own opportunities (any status) via `GET /organizations/me/opportunities`.

#### Scenario: Published opportunity readable
- **WHEN** a guest calls `GET /opportunities/:idOrSlug` for a published opportunity
- **THEN** the opportunity detail with positions, open seats, and the `OPP-` registry identifier is returned

#### Scenario: Non-published is 404
- **WHEN** a guest calls `GET /opportunities/:idOrSlug` for a draft, closed, cancelled, or completed opportunity (or for a nonexistent id/slug)
- **THEN** the response is `404`

### Requirement: List own opportunities
The system SHALL expose `GET /organizations/me/opportunities` (authenticated, organization role) returning all of the owning organization's opportunities across every status, newest first, cursor-paginated (default 20, max 50). Each returned opportunity SHALL include its `registryId`.

#### Scenario: All statuses returned
- **WHEN** an organization account calls `GET /organizations/me/opportunities`
- **THEN** the response lists its own opportunities in every status, including drafts, each carrying its `OPP-` registry identifier

#### Scenario: Other organizations isolated
- **WHEN** an organization account calls the route
- **THEN** it only ever sees opportunities whose `organizationId` matches its own organization