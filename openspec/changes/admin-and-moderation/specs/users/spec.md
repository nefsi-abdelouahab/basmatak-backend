## ADDED Requirements

### Requirement: User status transition whitelist

The system SHALL register a `user` entity whitelist with the S1 `StatusTransitionService` covering `active ↔ suspended`, used by the admin user-status route so every change is validated and recorded in `status_histories`. The registration SHALL be additive and SHALL NOT alter the whitelists of other entity types.

#### Scenario: Whitelist active at bootstrap
- **WHEN** the application boots with the admin module registered
- **THEN** `StatusTransitionService.assert` accepts `active → suspended` and `suspended → active` for entity type `user`

#### Scenario: Unlisted transition rejected
- **WHEN** any code attempts `active → deleted` or a `deleted → *` pair through the service for entity type `user`
- **THEN** the call fails with `INVALID_STATUS_TRANSITION` and no `status_histories` row is written