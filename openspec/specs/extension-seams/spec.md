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

### Requirement: Portfolio query seam

The system SHALL provide a `PortfolioQueryService` seam that Session 14 SHALL upgrade from its inert default (which returned empty portfolio/experience results) to the real read over `portfolio_items`: `getPublicPortfolio(username)` SHALL resolve the volunteer profile by username — an unknown username or a profile whose `publicProfile.enabled=false` SHALL surface the A5 `404` signal — and SHALL return the volunteer's `visibility=public` items ordered by `order`, each with media metadata restricted to `visibility=public` media rows. The upgrade SHALL swap the provider binding via Nest DI without changing the interface or the depending consumers' code (`extension-seams` convention).

#### Scenario: Inert default empty results

- **WHEN** a public portfolio query is issued through the seam's default binding
- **THEN** the seam returns an empty-but-correct result shape

#### Scenario: Real read returns public items

- **WHEN** the real binding serves a public portfolio query for an enabled profile
- **THEN** it returns only `visibility=public` items ordered by `order`, with private media excluded

#### Scenario: Disabled or unknown profile reads as 404

- **WHEN** the real binding serves a query for an unknown username or a `publicProfile.enabled=false` profile
- **THEN** the result signals `404` per the A5 contract

#### Scenario: Swap is source-compatible

- **WHEN** Session 14 binds the real provider
- **THEN** consumers calling `getPublicPortfolio(username)` compile unchanged against the same interface

### Requirement: Media ownership seam
The system SHALL provide a `MediaOwnership` check helper that validates a value is a well-formed ObjectId (Session 1 checker), upgraded this session (Session 8 retrofit of F9) into `MediaOwnership.assertFor(mediaId, actor, purpose)` which validates existence (not deleted), ownership, and `purpose`, surfacing `404`/`403`/business errors on failure. The checker calls in the volunteer avatar/banner route, the organization logo route, and the organization verification-documents route SHALL use the real assertion. Extension routes in later sessions (e.g. submission evidence) SHALL consume the same `assertFor` helper.

#### Scenario: ObjectId format check
- **WHEN** a `mediaId`-shaped value is passed through the helper
- **THEN** the helper confirms it is valid ObjectId format

#### Scenario: Real assertion resolves owned media
- **WHEN** `assertFor` is called with media owned by the actor, with the matching purpose, and not deleted
- **THEN** it returns the media row

#### Scenario: Real assertion rejects invalid media
- **WHEN** `assertFor` is called with absent, deleted, foreign, or wrong-purpose media
- **THEN** it fails with the appropriate `404`/`403`/business error

#### Scenario: Invited routes consume the assertion
- **WHEN** the volunteer avatar/banner, organization logo, and organization verification-documents routes receive a mediaId
- **THEN** they route it through `MediaOwnership.assertFor` and reject invalid media
- **AND** later sessions' evidence routes can consume the same helper without changing it

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
The system SHALL provide volunteer public-read seams consumed by Session 12: `getPublicProfile(username)`, `listPublicTalents(filters, pagination)`, and `getPublicExperiences(volunteerId, pagination)`. `getPublicProfile` SHALL implement the A5 contract — signalling `404` when `publicProfile.enabled=false`, and gating each profile section by its `show*` flag — with the section data populated from live sources (`skills` from `volunteer_skills` joined to the catalog, `experiences` from `volunteer_experiences` where `publicVisibility=public`, `availability` from `volunteer_availability`). `listPublicTalents` SHALL return real enabled talents matching the provided filters, paged per the S1 convention. `getPublicExperiences(volunteerId, pagination)` SHALL return real `publicVisibility=public` experiences, paged per the S1 convention. `getPublicPortfolio` SHALL remain the Session 1 `PortfolioQueryService` default (inert empty until Session 14) and SHALL NOT be replaced here. The `PortfolioQueryService` interface SHALL stay source-compatible so Sessions 13/14 consumers are unaffected.

#### Scenario: Disabled profile is 404
- **WHEN** `getPublicProfile` is called for a username whose `publicProfile.enabled` is `false`
- **THEN** the result signals `404` per the A5 contract

#### Scenario: Enabled profile gates populated sections
- **WHEN** `getPublicProfile` is called for an enabled username with `showSkills`, `showExperiences`, and `showAvailability` set
- **THEN** those sections contain the real data, and sections whose flag is off are blanked

#### Scenario: Talents read returns real enabled profiles
- **WHEN** `listPublicTalents` is invoked with filters
- **THEN** it returns only `publicProfile.enabled=true` profiles matching the filters, paged per the S1 convention

#### Scenario: Experiences read returns public rows only
- **WHEN** `getPublicExperiences` is invoked for a volunteer
- **THEN** it returns only rows with `publicVisibility=public`, paged per the S1 convention

#### Scenario: Portfolio seam stays the Session 1 default
- **WHEN** a public portfolio query is issued this session
- **THEN** it is served by the unchanged `PortfolioQueryService` inert default, not a newly-replaced provider

### Requirement: Opportunity transition whitelist registration
The system SHALL allow the opportunities module to register the `opportunity` entity whitelist in `StatusTransitionRegistry` at module bootstrap (entity whitelists are registered by owning modules per the S1 registry seam). Registration SHALL be additive and SHALL NOT remove or alter any whitelist already registered by other modules (e.g. `organization` from Session 5).

#### Scenario: Opportunity whitelist active at runtime
- **WHEN** the application boots with the opportunities module registered
- **THEN** `StatusTransitionService.assert` accepts the `opportunity` entity's registered `(from, to)` pairs

#### Scenario: Other whitelists unaffected
- **WHEN** a module bootstraps after the opportunities module registers its whitelist
- **THEN** the registry still contains the other entities' whitelists unchanged

