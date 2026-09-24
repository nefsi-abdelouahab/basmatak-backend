# counters Specification

## Purpose
The counters capability (RP Part 7 core/common row; registry-ids): a per-type `counters` collection and the `RegistryIdService` that atomically mints the neutral public registry identifiers (`VOL-`/`ORG-`/`OPP-`/`EXP-` + 6 zero-padded digits) consumed on volunteer, organization, opportunity, and volunteer-experience payloads. This change is the single owner of `registryId` across the four entities.

## ADDED Requirements

### Requirement: Counters collection
The system SHALL provide a `counters` collection owned by the core (common) module, storing exactly one document per registry type with the shape `{ _id: type, seq }` where `_id` is the type key — `volunteer`, `organization`, `opportunity`, or `experience` — naturally unique by construction, and `seq` is a non-negative integer. The collection SHALL be the single source of the registry sequence; identifiers SHALL never be derived from collection sizes, counts, or ObjectIds.

#### Scenario: One counter per type
- **WHEN** an identifier is minted for a type for the first time
- **THEN** a `counters` row is upserted with `_id` set to that type key and the sequence advanced to `1`

#### Scenario: Types advance independently
- **WHEN** identifiers are minted for different types
- **THEN** each type advances its own `seq` in isolation and the values never interfere

### Requirement: Atomic registry identifier minting
The system SHALL provide `RegistryIdService` with a `getNext(type)` method that atomically increments the type's counter via `findOneAndUpdate({ _id: type }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })` and returns the identifier formatted as the type's registry prefix (`VOL-`, `ORG-`, `OPP-`, `EXP-` for `volunteer`, `organization`, `opportunity`, `experience` respectively) followed by the sequence value zero-padded to exactly six digits. Concurrent `getNext` calls for the same type SHALL return distinct, gap-free-in-order identifiers (no two callers ever read the same sequence value), and the method SHALL accept an optional Mongo session so the increment can join a multi-document transaction.

#### Scenario: Parallel mints stay unique
- **WHEN** many `getNext(type)` calls run concurrently (e.g. under `Promise.all`)
- **THEN** the returned identifiers are all distinct, together form a contiguous sequence with no duplicate values, and no duplicate-key or lost-update write ever surfaces

#### Scenario: Prefix and zero-padding format
- **WHEN** the `experience` counter reaches 42
- **THEN** the minted identifier is exactly `EXP-000042` (prefix, hyphen, six zero-padded digits)

#### Scenario: Sequence overflow keeps its value
- **WHEN** a sequence value exceeds six digits (1,000,000+)
- **THEN** the identifier keeps the full numeric value zero-padded to at least six digits (e.g. `VOL-1000000`), never truncated

#### Scenario: Session-participating increment
- **WHEN** `getNext` is called inside a multi-document transaction (the verify transaction)
- **THEN** the counter increment is performed on the passed session so it commits or rolls back with the surrounding transaction

### Requirement: Registry identifier immutability
The system SHALL treat every assigned `registryId` as immutable: the registry identifier of a row SHALL be set exactly once at creation/backfill and SHALL never be updated, overwritten, or removed by any API, service, or script path. Server-minted values SHALL never be accepted from client input.

#### Scenario: Server-minted only
- **WHEN** any of the four entity rows is created or backfilled
- **THEN** its `registryId` is produced by `RegistryIdService` and any client-supplied value is ignored or rejected by validation

#### Scenario: Update attempt rejected
- **WHEN** any code path (PATCH DTO, service update, script) attempts to change an existing row's `registryId`
- **THEN** the storage call carries no `registryId` change and the stored identifier is left untouched

### Requirement: Registry identifier backfill
The system SHALL provide an idempotent backfill entrypoint (`seed:backfill-registry-ids`) that assigns a `registryId` to every existing row missing one across the four entity collections (`volunteer_profiles`, `organizations`, `opportunities`, `volunteer_experiences`). The script SHALL mint identifiers through the same `RegistryIdService` and format as new rows, and SHALL be safe to run repeatedly: rows that already carry a `registryId` are never touched and no value is ever overwritten.

#### Scenario: Idempotent double run
- **WHEN** the backfill is run twice over identical data
- **THEN** the second run changes nothing — no row gains a second identifier, no existing value is overwritten, and the totals reported for the second run are zero rows needing backfill

#### Scenario: Missing rows each receive one identifier
- **WHEN** rows across the four collections lack a `registryId`
- **THEN** each such row receives exactly one well-formed, type-prefixed identifier minted from the shared counter for its entity type