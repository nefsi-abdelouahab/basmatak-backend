## ADDED Requirements

### Requirement: Organization Footprint Aggregate Service Seam
The system SHALL define an internal reusable organization-footprint aggregate service seam for the database-derived metrics named by Session 8: opportunities, applications, participants, experiences, hours, and reliability. This requirement does not define formulas for those metrics.

#### Scenario: Internal consumer requests an organization footprint
- **WHEN** an internal Session 8 consumer requests an organization footprint through the seam
- **THEN** the seam provides the named aggregate metrics from real database data without hardcoded values

### Requirement: Deferred Public Organization Integration
The organization-footprint seam SHALL be reusable by `org-facts` and `org-dashboard`, while this change MUST NOT add or require a public organization route or public-profile integration.

#### Scenario: Session 8 defines the seam
- **WHEN** this change is implemented
- **THEN** the public organization integration remains owned by the later `org-facts` and `org-dashboard` sessions
