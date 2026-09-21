# extension-seams Specification

## Purpose
TBD - created by archiving change foundation. Update Purpose after archive.
## Requirements
### Requirement: Extension seam convention
The system SHALL define the extension-seam convention: when a module needs a capability owned by a later session, it SHALL depend on an interface with an inert default implementation provided in `src/common/seams/`, and the owning session swaps in the real provider. The convention is documented in `design.md`.

#### Scenario: Later provider swaps in
- **WHEN** the owning session ships its real implementation
- **THEN** it replaces the inert default via Nest DI without changing the depending module's code

### Requirement: Publish gate seam
The system SHALL provide a `PublishGateService` interface with an inert default that reports the gate unlocked unless `PUBLISH_GATE_ENABLED=true`, in which case the default reports locked via `PUBLISH_GATE_LOCKED` for the demo path.

#### Scenario: Inert default unlocked
- **WHEN** `PUBLISH_GATE_ENABLED` is unset or `false` and `evaluate(org)` is called
- **THEN** the gate reports unlocked

#### Scenario: Enabled demo path locked
- **WHEN** `PUBLISH_GATE_ENABLED=true` and the gate says locked
- **THEN** publish is blocked with business code `PUBLISH_GATE_LOCKED`

### Requirement: Portfolio query seam
The system SHALL provide a `PortfolioQueryService` interface with an inert default that returns empty portfolio/experience results, to be replaced by Session 14's real read.

#### Scenario: Inert default empty results
- **WHEN** a public portfolio or experience query is issued through the seam before Session 14
- **THEN** the seam returns an empty-but-correct result shape

### Requirement: Media ownership seam
The system SHALL provide a `MediaOwnership` check helper that validates a value is a well-formed ObjectId, with real existence/ownership enforcement deferred to Session 8.

#### Scenario: ObjectId format check
- **WHEN** a `mediaId`-shaped value is passed through the helper
- **THEN** the helper confirms it is valid ObjectId format (real ownership checks are deferred to Session 8)

### Requirement: Auth placeholder guard seam
The system SHALL provide an `AuthPlaceholderGuard` that sets `req.token` and a `CurrentAccount`-compatible placeholder for controllers, to be replaced by the real JWT strategy in Session 2.

#### Scenario: Placeholder identity available
- **WHEN** a protected route runs before Session 2
- **THEN** the guard injects a placeholder account so guards and decorators compile and function deterministically

