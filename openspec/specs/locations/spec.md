# locations Specification

## Purpose
Reference data for wilayas and municipalities (seeded, two-level hierarchy), served publicly and maintained by admin endpoints.
## Requirements
### Requirement: Locations collection
The system SHALL provide a `locations` collection for reference geography with fields `code` (official administrative code), `type` (`wilaya | municipality`), `parentCode` (optional string — set for municipalities to their wilaya's `code`), `nameAr`, `nameFr`, and `legacyId` (optional). Indexes SHALL be a unique index on `code` and a `(type, parentCode)` index. A municipality SHALL reference its wilaya by `parentCode`; a wilaya SHALL have no `parentCode`.

#### Scenario: Code uniqueness enforced
- **WHEN** two `locations` rows attempt the same `code`
- **THEN** the unique `code` index rejects the second insert

#### Scenario: Municipality linked to its wilaya
- **WHEN** a wilaya with code `16` and a municipality with `parentCode: '16'` are stored
- **THEN** querying municipalities by `(type: 'municipality', parentCode: '16')` returns the municipality

### Requirement: Read wilayas
The system SHALL expose public `GET /locations/wilayas` returning all wilayas ordered ascending by `code`, each with `code`, `type`, `nameAr`, `nameFr`, and `legacyId` when present. The response SHALL be cacheable via a `Cache-Control` header.

#### Scenario: Guest lists all wilayas
- **WHEN** a guest calls `GET /locations/wilayas` after the seed has run
- **THEN** the response contains the 58 seeded wilayas (codes `01`–`58`) ordered ascending by `code`

### Requirement: Read municipalities of a wilaya
The system SHALL expose public `GET /locations/wilayas/:wilayaId/municipalities` returning the municipalities whose `parentCode` equals the wilaya's `code`, ordered ascending by `code`. When a wilaya with the given code does not exist, the response SHALL be a `404` in the error envelope.

#### Scenario: Municipalities returned for an existing wilaya
- **WHEN** a guest calls `GET /locations/wilayas/16/municipalities` after the seed has run
- **THEN** the response is a non-empty list of that wilaya's municipalities ordered ascending by `code`

#### Scenario: Unknown wilaya
- **WHEN** a guest calls `GET /locations/wilayas/99/municipalities`
- **THEN** the response is `404` with the standard error envelope

### Requirement: Admin location maintenance
The system SHALL require the `admin` role for `POST /admin/locations` and `PATCH /admin/locations/:id`. `POST` SHALL create a location from `code`, `type`, `nameAr`, `nameFr`, and optional `parentCode`/`legacyId`, rejecting a duplicate `code` with `409`. `PATCH` SHALL update the editable fields. Requests without the `admin` role SHALL be rejected with `403`.

#### Scenario: Admin creates and updates a location
- **WHEN** an admin calls `POST /admin/locations` with a valid payload
- **THEN** the location is created and returned
- **AND** a subsequent `PATCH /admin/locations/:id` updates its `nameAr`/`nameFr`

#### Scenario: Duplicate code rejected
- **WHEN** an admin creates a location with a `code` already in use
- **THEN** the response is `409` and no row is changed

#### Scenario: Non-admin blocked
- **WHEN** a non-admin authenticated user calls `POST /admin/locations`
- **THEN** the response is `403`

### Requirement: Location seed idempotency
The `seed:locations` script SHALL insert the complete dataset of 58 wilayas (codes `01`–`58`) and their municipalities via `bulkWrite` upserts keyed by unique `code`. Running it a second time SHALL update the same rows in place and SHALL result in the same document counts as the first run.

#### Scenario: Double run is stable
- **WHEN** `seed:locations` is run twice
- **THEN** the second run leaves the same wilaya and municipality counts as the first run

#### Scenario: Dataset completeness after seed
- **WHEN** `seed:locations` completes
- **THEN** exactly 58 wilayas (`code` `01`–`58`) are present

