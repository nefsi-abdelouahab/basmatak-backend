## MODIFIED Requirements

### Requirement: Publish gate seam
The system SHALL provide a `PublishGateService` interface with an inert default that reports the gate unlocked unless `PUBLISH_GATE_ENABLED=true`, in which case the default reports locked via `PUBLISH_GATE_LOCKED` for the demo path. From Session 6 onward the opportunities publish route SHALL be the consumer of this seam: `POST /opportunities/:opportunityId/publish` SHALL call `evaluate(org)` before applying the `draft → published` transition and SHALL turn a locked result into `409` with business code `PUBLISH_GATE_LOCKED`. The seam's swap-in contract (Session 13): the trust layer SHALL replace the inert default with the real counter without changing the opportunities module's code (Nest DI provider override), respecting A7.

#### Scenario: Inert default unlocked
- **WHEN** `PUBLISH_GATE_ENABLED` is unset or `false` and `evaluate(org)` is called
- **THEN** the gate reports unlocked

#### Scenario: Enabled demo path locked
- **WHEN** `PUBLISH_GATE_ENABLED=true` and the gate says locked
- **THEN** publish is blocked with business code `PUBLISH_GATE_LOCKED`

#### Scenario: Publish route consumes the seam
- **WHEN** an organization publishes an opportunity and `evaluate(org)` reports unlocked
- **THEN** the publish transition proceeds
- **AND** when `evaluate(org)` reports locked the publish is blocked with `PUBLISH_GATE_LOCKED`

#### Scenario: Real gate swaps in without module changes
- **WHEN** Session 13 provides the real publish-gate provider
- **THEN** it replaces the inert default via DI and the opportunities module's publish route behavior stays source-compatible

## ADDED Requirements

### Requirement: Opportunity transition whitelist registration
The system SHALL allow the opportunities module to register the `opportunity` entity whitelist in `StatusTransitionRegistry` at module bootstrap (entity whitelists are registered by owning modules per the S1 registry seam). Registration SHALL be additive and SHALL NOT remove or alter any whitelist already registered by other modules (e.g. `organization` from Session 5).

#### Scenario: Opportunity whitelist active at runtime
- **WHEN** the application boots with the opportunities module registered
- **THEN** `StatusTransitionService.assert` accepts the `opportunity` entity's registered `(from, to)` pairs

#### Scenario: Other whitelists unaffected
- **WHEN** a module bootstraps after the opportunities module registers its whitelist
- **THEN** the registry still contains the other entities' whitelists unchanged