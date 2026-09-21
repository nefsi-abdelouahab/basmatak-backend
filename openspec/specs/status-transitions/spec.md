# status-transitions Specification

## Purpose
TBD - created by archiving change foundation. Update Purpose after archive.
## Requirements
### Requirement: Status transition service
The system SHALL provide a `StatusTransitionService` with a single entry point `assert(entityType, entityId, from, to, actor)` that validates the requested transition against a per-entity whitelist map, writes a `status_histories` entry when valid, and returns that entry.

#### Scenario: Valid transition writes history
- **WHEN** `assert` is called with a `(from, to)` pair allowed for the entity type
- **THEN** a `status_histories` document is created recording entity type, entity id, from status, to status, actor, and timestamp
- **AND** the created entry is returned to the caller

#### Scenario: Invalid transition throws
- **WHEN** `assert` is called with a `(from, to)` pair not allowed for the entity type
- **THEN** the call fails with business code `INVALID_STATUS_TRANSITION`
- **AND** no `status_histories` document is written

#### Scenario: Unknown entity type
- **WHEN** `assert` is called for an entity type with no registered whitelist
- **THEN** the call fails with a configuration/business error indicating the whitelist is not registered

### Requirement: Per-entity whitelist registry
The system SHALL allow owning modules to register a transition whitelist per entity type; the registry SHALL be empty at bootstrap.

#### Scenario: Module registers whitelist
- **WHEN** a module registers a whitelist for its entity type (e.g. `opportunity`, `application`, `participation`, `submission`)
- **THEN** `assert` accepts the registered `(from, to)` pairs for that entity type

#### Scenario: No whitelists at startup
- **WHEN** the application boots in the foundation session
- **THEN** the registry contains no entity whitelists, so any `assert` call for a business entity fails with a not-registered error

### Requirement: Status histories collection
The system SHALL define the `status_histories` model with an index on `(entityType, entityId, createdAt)`.

#### Scenario: Index backs history lookup
- **WHEN** status histories are queried by entity type and entity id
- **THEN** the `(entityType, entityId, createdAt)` index is available to serve the query
- **AND** each history entry records the transition, actor, and timestamp

