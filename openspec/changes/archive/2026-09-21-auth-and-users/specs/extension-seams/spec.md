## ADDED Requirements

### Requirement: Registration extras seam
The system SHALL provide a `RegistrationExtrasService` seam with an inert default in `src/common/seams/`: after a register route creates the `users` row it SHALL call `createExtras(user, registerDto)` so later sessions can own profile creation. The default implementation SHALL store nothing. Session 4 replaces it with a volunteer-profile provider and Session 5 with an organization provider (creating the `organizations` row linked by `organizations.userId`), without changing the auth module's code.

#### Scenario: Inert default stores nothing
- **WHEN** a volunteer or organization registers before Session 4/5 ships its provider
- **THEN** only the `users` row (and its session/token) is created and the seam call succeeds without side effects

#### Scenario: Owning session swaps the provider
- **WHEN** Session 4 or Session 5 registers its real `RegistrationExtrasService` provider via Nest DI
- **THEN** the same register route now creates the profile/organization through the provider without code changes in the auth module

## REMOVED Requirements

### Requirement: Auth placeholder guard seam

**Reason**: Replaced in this change by the real JWT strategy, the `JwtAuthGuard`, and `RolesGuard`/`SuspendedGuard` reading `req.user = { sub, role, sessionId }` from a signed access token. The deterministic placeholder (`AuthPlaceholderGuard`) and its `req.token` injection are removed.

**Migration**: Protected routes rely on `JwtAuthGuard` (registered as `APP_GUARD`); the `CurrentAccount` decorator reads `req.user`. The `AuthPlaceholderGuard` source file is deleted and no route relies on placeholder identity.