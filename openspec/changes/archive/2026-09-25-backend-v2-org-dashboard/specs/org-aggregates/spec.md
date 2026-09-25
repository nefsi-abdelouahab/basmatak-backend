## MODIFIED Requirements

### Requirement: Organization Footprint Aggregate Service Seam
The system SHALL provide the real organization-footprint aggregate provider behind the `ORG_FOOTPRINT_PROVIDER` seam (`org-dashboard` fills it; the interface is unchanged): for an organization id, `getFootprint` SHALL return database-derived metrics with no hardcoded values — `opportunities` = count of the org's `opportunities` across all statuses; `applications` = count of `applications` with the org's `organizationId` across all statuses; `participants` = count of engaged `task_participants` (status `accepted | active | completed`, terminal `withdrawn | removed` excluded); `experiences` = count of `volunteer_experiences` with the org's `organizationId`; `hours` = sum of `volunteer_experiences.duration` (minutes) for the org (`0` when none); `reliability` = the org's cached `organizations.reliability` snapshot, or `null` when absent. The computation SHALL be read-only (no writes, no cache mutation — the reliability cache stays owned by `ReliabilityService`).

#### Scenario: Internal consumer requests an organization footprint
- **WHEN** an internal consumer requests an organization footprint through the seam
- **THEN** the seam provides the named aggregate metrics from real database data without hardcoded values

#### Scenario: Footprint matches the database
- **WHEN** the real provider computes the footprint for an org with 3 opportunities, 5 applications, 2 engaged participants, 1 verified experience of 120 minutes, and a cached reliability snapshot
- **THEN** it returns `{ opportunities: 3, applications: 5, participants: 2, experiences: 1, hours: 120 }` with the cached reliability object passed through

#### Scenario: Empty organization yields zeros and null reliability
- **WHEN** the real provider computes the footprint for an org with no rows and no cached reliability
- **THEN** counts and hours are `0` and `reliability` is `null`

### Requirement: Deferred Public Organization Integration
The organization-footprint seam SHALL be filled by `org-dashboard` with the real provider above, while this footprint work MUST NOT add or require a new public organization route or public-profile integration: public exposure of org numbers flows exclusively through the `OrgPublicStatsProvider` seam (organizations capability) behind the existing `GET /organizations/:slug`.

#### Scenario: Session 16 fills the seam without a new public route
- **WHEN** the real footprint provider is bound
- **THEN** no new public route is introduced by the footprint work and the existing public organization route behavior is unchanged
