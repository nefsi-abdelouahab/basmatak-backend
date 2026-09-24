## ADDED Requirements

### Requirement: Admin experience display seam
The system SHALL provide an `AdminExperienceDisplay` seam (`AdminExperienceDisplayProvider` interface + `InertAdminExperienceDisplayProvider` default in `src/common/seams/`, following the extension-seam convention) backing `GET /admin/volunteers/:volunteerId/experiences`. The inert default SHALL return an empty counted page; `experience-enrichment` SHALL later swap in the real provider via Nest DI without changing the admin module's code.

#### Scenario: Inert default empty page
- **WHEN** the admin experiences route runs against the default binding
- **THEN** the seam returns an empty-but-correct counted page (`items: []`, `total: 0`)

#### Scenario: Real provider swaps in without module changes
- **WHEN** `experience-enrichment` provides the real implementation
- **THEN** it replaces the inert default via DI and the admin route behavior stays source-compatible
