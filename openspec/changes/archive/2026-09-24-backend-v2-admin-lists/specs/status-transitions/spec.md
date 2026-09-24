## MODIFIED Requirements

### Requirement: Status transition service
The system SHALL provide a `StatusTransitionService` with a single entry point `assert(entityType, entityId, from, to, actor, reason?, notes?)` that validates the requested transition against a per-entity whitelist map, writes a `status_histories` entry when valid, and returns that entry. Optional `reason` (≤500) and `notes` (≤2000) SHALL be persisted on the entry when provided. Oversized values SHALL fail validation before any write.

#### Scenario: Valid transition writes history
- **WHEN** `assert` is called with a `(from, to)` pair allowed for the entity type
- **THEN** a `status_histories` document is created recording entity type, entity id, from status, to status, actor, and timestamp
- **AND** the created entry is returned to the caller

#### Scenario: Reason and notes persisted
- **WHEN** `assert` is called with valid `reason` and `notes`
- **THEN** the created `status_histories` document carries both fields

#### Scenario: Invalid transition throws
- **WHEN** `assert` is called with a `(from, to)` pair not allowed for the entity type
- **THEN** the call fails with business code `INVALID_STATUS_TRANSITION`
- **AND** no `status_histories` document is written

#### Scenario: Unknown entity type
- **WHEN** `assert` is called for an entity type with no registered whitelist
- **THEN** the call fails with a configuration/business error indicating the whitelist is not registered

### Requirement: Status histories collection
The system SHALL define the `status_histories` model with optional `reason` (trimmed, ≤500) and `notes` (trimmed, ≤2000) fields plus an index on `(entityType, entityId, createdAt)`.

#### Scenario: Index backs history lookup
- **WHEN** status histories are queried by entity type and entity id
- **THEN** the `(entityType, entityId, createdAt)` index is available to serve the query
- **AND** each history entry records the transition, actor, and timestamp

#### Scenario: Reason fields stored
- **WHEN** a transition is recorded with `reason` and `notes`
- **THEN** the stored entry returns both fields on read
