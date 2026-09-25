## ADDED Requirements

### Requirement: Identity and schedule joins on participation reads
The system SHALL enrich volunteer participation reads (`GET /participations/me`, detail) with `organization {id, slug, nameFr, nameAr}`, `opportunity {id, title, slug, status}`, `position {id, title, deliverables[]}` and the opportunity's schedule/location labels. The per-opportunity participant roster SHALL additionally carry each volunteer's `avatarMediaId` and the position `deliverables[]`. The org cross-opportunity roster position embed SHALL gain `deliverables[]` plus the opportunity location labels. Existing status vocabulary and seat semantics SHALL be unchanged.

#### Scenario: Volunteer sees named participation cards
- **WHEN** a volunteer reads their participations
- **THEN** every item names the org, opportunity, position (with deliverables) and schedule/location labels

#### Scenario: Org roster rows carry deliverables and avatars
- **WHEN** an org reads the cross-opportunity roster or the per-opportunity roster
- **THEN** each row's position embed includes `deliverables[]`, the volunteer block includes `avatarMediaId`, and submission-state/hour joins are unchanged
