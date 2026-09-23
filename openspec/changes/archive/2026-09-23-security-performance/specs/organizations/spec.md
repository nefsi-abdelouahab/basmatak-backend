# organizations Specification Change

## Purpose

Session 19 organizations hardening (ROADMAP lines 858+): the real publish-gate counter's pending distinct count and the reliability module's org-scoped submission reads are collection scans today. This change adds the gate aggregation index `(organizationId, status)` on the `submissions` collection so both read paths are served by its equality prefix.

## Requirements

## MODIFIED Requirements

### Requirement: Publish gate rule

The system SHALL provide a real publish-gate counter that replaces the inert `PublishGateService` default via Nest DI provider override without changing the opportunities module's code (A7, extension-seams contract). `evaluate(org)` SHALL count the distinct opportunities belonging to the org that have at least one submission in `submitted|under_review`; draft submissions and decided submissions SHALL never count, and an opportunity unlocks only when it has no pending submission left (whole-opportunity decision). The gate SHALL report locked when the pending count is greater than or equal to the `publishGate.maxPendingOpportunities` value from `system_settings` (default `3`), and a locked result SHALL turn the existing publish route into `409` with business code `PUBLISH_GATE_LOCKED`. When a gated publish resolves locked, the system SHALL emit the `publish-gate.locked` domain event so the notifications capability can notify the organization. The pending-count `distinct` SHALL be led by a `(organizationId, status)` compound index on the submissions collection (the gate aggregation index, §3), whose equality prefix also serves the reliability module's `submissionModel.find({ organizationId })` reads instead of a collection scan.

#### Scenario: Counter counts distinct pending opportunities
- **WHEN** an organization has one opportunity with two pending submissions and another opportunity with one
- **THEN** the count is `2` (one per distinct opportunity, not per submission)

#### Scenario: Drafts and decided submissions excluded
- **WHEN** an opportunity has only draft submissions or only `approved`/`rejected` submissions
- **THEN** it does not contribute to the pending count

#### Scenario: Whole opportunity decision unlocks
- **WHEN** an opportunity's last `submitted`/`under_review` submission is verified or rejected
- **THEN** the opportunity no longer counts toward the gate

#### Scenario: Threshold reached locks publish
- **WHEN** the pending count reaches `publishGate.maxPendingOpportunities` (default 3) on a publish attempt
- **THEN** `evaluate(org)` reports locked and the publish is blocked with `PUBLISH_GATE_LOCKED`

#### Scenario: Locked event emitted once per org
- **WHEN** a gated publish resolves locked for an organization
- **THEN** a `publish-gate.locked` event is emitted scoped to that organization (deduplicated by event name plus org id)

#### Scenario: Gate counting led by the aggregation index
- **WHEN** `evaluate(org)` runs the pending-count distinct for an organization
- **THEN** the submissions query plan is led by the `(organizationId, status)` compound index (asserted via `explain()`) with no collection scan