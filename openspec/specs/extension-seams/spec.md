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
The system SHALL provide a `RegistrationExtrasService` seam in `src/common/seams/`: after a register route creates the `users` row it SHALL call `createExtras(user, registerDto)` so the owning session creates the profile/organization row. The default `InertRegistrationExtrasService` SHALL store nothing. This session provides a volunteer provider bound to the `REGISTRATION_EXTRAS_SERVICE` token in `src/common/common.module.ts` that SHALL dispatch on `user.role`: for the `volunteer` role it creates the `volunteer_profiles` row (with a generated unique `username` via the canonical slug utility); for every other role it SHALL delegate to `InertRegistrationExtrasService`, leaving non-volunteer registration behavior unchanged. Session 5 provides the organization provider (creating the `organizations` row linked by `organizations.userId`). The auth module's code SHALL NOT change.

#### Scenario: Inert default stores nothing
- **WHEN** a role without an owning provider (e.g., an organization before Session 5) registers
- **THEN** only the `users` row (and its session/token) is created and the seam call succeeds without side effects

#### Scenario: Volunteer provider creates the profile
- **WHEN** a `volunteer` role registers after this session ships its provider
- **THEN** the same register route creates a `volunteer_profiles` row with a unique generated `username`, without code changes in the auth module

#### Scenario: Non-volunteer delegation is unchanged
- **WHEN** a non-volunteer (e.g., `organization`) registers after this session
- **THEN** the volunteer provider delegates to the inert default and no `volunteer_profiles` row is created

### Requirement: Volunteer public-read seams
The system SHALL provide volunteer public-read seams with inert-but-correct shapes, consumed by Session 12: `getPublicProfile(username)`, `listPublicTalents(filters)`, and `getPublicExperiences(volunteerId)`. `getPublicProfile` SHALL implement the A5 contract — returning `404` when `publicProfile.enabled=false`, and gating each profile section by its `show*` flag — while the underlying data stays inert/empty this session. `getPublicPortfolio` SHALL remain the Session 1 `PortfolioQueryService` default (inert empty until Session 14) and SHALL NOT be replaced here.

#### Scenario: Disabled profile is 404
- **WHEN** `getPublicProfile` is called for a username whose `publicProfile.enabled` is `false`
- **THEN** the result signals `404` per the A5 contract

#### Scenario: Inert public reads return empty-but-correct shapes
- **WHEN** `listPublicTalents` or `getPublicExperiences` is invoked before Session 12
- **THEN** it returns an empty-but-correct result shape (e.g., an empty list with the expected schema), not an error

#### Scenario: Portfolio seam stays the Session 1 default
- **WHEN** a public portfolio query is issued this session
- **THEN** it is served by the unchanged `PortfolioQueryService` inert default, not a newly-replaced provider

