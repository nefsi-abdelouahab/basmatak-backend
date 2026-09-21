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

### Requirement: Registration extras seam
The system SHALL provide a `RegistrationExtrasService` seam with an inert default in `src/common/seams/`: after a register route creates the `users` row it SHALL call `createExtras(user, registerDto)` so later sessions can own profile creation. The default implementation SHALL store nothing. Session 4 replaces it with a volunteer-profile provider and Session 5 with an organization provider (creating the `organizations` row linked by `organizations.userId`), without changing the auth module's code.

#### Scenario: Inert default stores nothing
- **WHEN** a volunteer or organization registers before Session 4/5 ships its provider
- **THEN** only the `users` row (and its session/token) is created and the seam call succeeds without side effects

#### Scenario: Owning session swaps the provider
- **WHEN** Session 4 or Session 5 registers its real `RegistrationExtrasService` provider via Nest DI
- **THEN** the same register route now creates the profile/organization through the provider without code changes in the auth module

