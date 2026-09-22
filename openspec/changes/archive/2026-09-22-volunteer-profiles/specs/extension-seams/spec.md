## MODIFIED Requirements

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

## ADDED Requirements

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