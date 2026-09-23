# extension-seams Specification Change

## Purpose
Session 13 (trust layer) fulfills the publish-gate swap-in contract: the inert default is replaced by the real counter via Nest DI provider override, with no code change in the opportunities module.

## Requirements

## MODIFIED Requirements

### Requirement: Publish gate seam

The system SHALL provide a `PublishGateService` interface consumed by the opportunities publish route: `POST /opportunities/:opportunityId/publish` SHALL call `evaluate(org)` before applying the `draft → published` transition and SHALL turn a locked result into `409` with business code `PUBLISH_GATE_LOCKED`. The Session 1 inert default reported unlocked unless `PUBLISH_GATE_ENABLED=true` (demo path). Session 13 SHALL replace the inert default with the real counter via Nest DI provider override without changing the opportunities module's code (A7). `PUBLISH_GATE_ENABLED=true` SHALL keep acting as a manual lock override on top of the real counter.

#### Scenario: Publish route consumes the seam
- **WHEN** an organization publishes an opportunity and `evaluate(org)` reports unlocked
- **THEN** the publish transition proceeds
- **AND** when `evaluate(org)` reports locked the publish is blocked with `PUBLISH_GATE_LOCKED`

#### Scenario: Real gate replaces the default
- **WHEN** a submission enters `submitted`/`under_review` for an organization's opportunity and the pending count reaches the configured threshold
- **THEN** `evaluate(org)` reports locked (drafts and decided submissions excluded from the count)

#### Scenario: Whole opportunity unlock
- **WHEN** an opportunity's last pending submission is decided
- **THEN** the opportunity no longer contributes to the pending count and the gate may unlock

#### Scenario: Demo lock override still works
- **WHEN** `PUBLISH_GATE_ENABLED=true`
- **THEN** the gate reports locked regardless of the pending count