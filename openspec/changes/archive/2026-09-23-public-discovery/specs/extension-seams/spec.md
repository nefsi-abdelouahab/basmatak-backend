## MODIFIED Requirements

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