## MODIFIED Requirements

### Requirement: Registration extras seam
The system SHALL provide a `RegistrationExtrasService` seam in `src/common/seams/` with an inert default: after a register route creates the `users` row it SHALL call `createExtras(user, registerDto)` so later sessions can own profile creation. The default implementation SHALL store nothing. The active provider binding SHALL dispatch on `user.role`: for role `organization` it SHALL create the `organizations` row linked by `organizations.userId = user.id` (server-generated slug, `verificationStatus=pending`); for every other role it SHALL delegate to the inert default. Session 4 replaces role `volunteer` with a volunteer-profile provider and Session 5 adds the organization provider — without changing the auth module's code.

#### Scenario: Inert default stores nothing
- **WHEN** a volunteer or organization registers before a provider exists for its role
- **THEN** only the `users` row (and its session/token) is created and the seam call succeeds without side effects

#### Scenario: Organization role creates org page
- **WHEN** a user registers with role `organization`
- **THEN** the seam creates an `organizations` row linked by `organizations.userId = user.id` with a generated slug and `verificationStatus=pending`

#### Scenario: Non-organization roles delegate to inert default
- **WHEN** a user registers with a role other than `organization` (and not handled by Session 4's volunteer provider)
- **THEN** the seam delegates to the inert default and stores nothing