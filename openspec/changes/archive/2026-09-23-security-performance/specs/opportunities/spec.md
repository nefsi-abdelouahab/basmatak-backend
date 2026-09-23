# opportunities Specification Change

## Purpose

Session 19 opportunities hardening (ROADMAP lines 858+): add and confirm the §3 compound indexes (including `(status, categoryId)`) so the public feed's keyword/geo/startDate filters are served by `(status, …)` compound indexes instead of collection scans, and record the canonical F11 search decision in the requirement set.

## Requirements

## MODIFIED Requirements

### Requirement: Opportunities collection
The system SHALL provide an `opportunities` collection with `organizationId`, `slug` (unique, generated server-side via the canonical `src/common/slug` pipeline per A12), `title`/`description`, `categoryId`, embedded `positions` (each with `title`, `description`, `requiredCount`, `filledCount` default `0`, `requiredSkills` as an array of `skillId` refs), `status` (`draft | published | in_progress | completed | closed | cancelled`, default `draft`), `startDate` (optional), `applicationDeadline` (optional), and `location { wilayaId, municipalityId, coordinates }`. Indexes SHALL include unique `slug`, `(status, startDate)`, `(status, categoryId)`, `(status, location.wilayaId)`, `(status, location.municipalityId)`, `(organizationId, status)`, 2dsphere `location.coordinates`, text on `title, description` (reserved per the F11 decision; not referenced by queries), and `positions.requiredSkills.skillId` per §3. Per the F11 canonical decision, keyword search SHALL be implemented as `$regex` bounded by an early `categoryId` equality, and geo filtering SHALL be implemented via the indexed `location` equality fields; no query SHALL reference the text index.

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