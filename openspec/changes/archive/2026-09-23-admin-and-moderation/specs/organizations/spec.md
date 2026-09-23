## ADDED Requirements

### Requirement: Organization status transition whitelist

The system SHALL extend the `organization` entity whitelist registered with the S1 `StatusTransitionService` (already `pending → verified | rejected → pending` for verification status) with the organization account status pairs `active ↔ suspended`, used by the admin organization-status route so changes are validated and recorded in `status_histories`. The registration SHALL be additive and SHALL NOT alter the verification-status pairs.

#### Scenario: Whitelist active at bootstrap
- **WHEN** the application boots the organizations module with the admin additions
- **THEN** `StatusTransitionService.assert` accepts `active → suspended` and `suspended → active` for entity type `organization` in addition to the verification pairs

#### Scenario: Unlisted transition rejected
- **WHEN** any code attempts `active → deleted` for entity type `organization`
- **THEN** the call fails with `INVALID_STATUS_TRANSITION` and no `status_histories` row is written