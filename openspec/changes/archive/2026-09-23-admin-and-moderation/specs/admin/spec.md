## ADDED Requirements

### Requirement: Admin route guard and audit coverage

The system SHALL protect every `/admin/*` route with `@Roles('admin')` so a caller whose role is not `admin` receives `403` (S1 `RolesGuard`). Every admin request SHALL be recorded by the S1 `AuditInterceptor` into `audit_logs` (actor, action, method, path), including the admin verification decisions and status changes.

#### Scenario: Non-admin blocked everywhere
- **WHEN** any authenticated non-admin account (volunteer or organization) calls any `/admin/*` route
- **THEN** the response is `403` and no resource is changed

#### Scenario: Admin action audited
- **WHEN** an admin calls an `/admin/*` route
- **THEN** an `audit_logs` document is written for that action with the admin as actor

#### Scenario: Guest blocked from admin
- **WHEN** an unauthenticated request reaches an `/admin/*` route
- **THEN** the response is `401` (authentication required before the role check)

### Requirement: Admin stats overview

The system SHALL expose `GET /admin/stats/overview` (admin) returning a moderation summary: `counts` (total `users`, `volunteers` (role), `organizations`, `verifiedOrganizations`, `opportunities`, and open `pendingVerifications` rows), `totalVolunteerHours` (sum of `volunteer_profiles.stats.volunteerHours` across all volunteers), `verificationRate` (verified organizations ÷ total organizations, `0` when there are no organizations), and `gateFreezes` (the number of distinct organizations currently locked by the §4 publish gate per read of `opportunities`/`submissions` state and `publishGate.maxPendingOpportunities` from `system_settings`).

#### Scenario: Overview with empty data
- **WHEN** an admin requests the overview for a database with a few accounts and no opportunities/submissions
- **THEN** the response contains counts, `totalVolunteerHours` (0), `verificationRate`, and `gateFreezes` (0) with consistent values

#### Scenario: Hours accumulate volunteer stats
- **WHEN** volunteers have accumulated `volunteerHours` in their profile stats
- **THEN** `totalVolunteerHours` equals their sum across volunteers

#### Scenario: Verification rate reflects decisions
- **WHEN** some organizations are verified and others are pending/rejected
- **THEN** `verificationRate` equals verified ÷ total and `verifiedOrganizations` is the number of `verified` organizations

#### Scenario: Gate freezes count locked organizations
- **WHEN** an organization's pending-review opportunities meet or exceed `publishGate.maxPendingOpportunities`
- **THEN** the organization is counted in `gateFreezes`

### Requirement: Admin user listing

The system SHALL expose `GET /admin/users` (admin) returning a cursor-paginated list (default 20, max 50) of `users` documents filtered by optional `role`, `status`, and `q` (case-insensitive substring match on `email`). The password hash SHALL NEVER be included. A `role` filter that is not a valid user role or a `status` filter that is not valid SHALL be rejected by DTO validation.

#### Scenario: List filtered by role and status
- **WHEN** an admin calls `GET /admin/users?role=volunteer&status=active`
- **THEN** only active volunteers are returned
- **THEN** no response item contains a password hash

#### Scenario: Search by email substring
- **WHEN** an admin calls `GET /admin/users?q=basm`
- **THEN** only users whose email contains `basm` (case-insensitive) are returned

#### Scenario: Cursor paginated
- **WHEN** an admin pages through `GET /admin/users`
- **THEN** each page follows the cursor convention (default limit 20, max 50) and covers the whole population

### Requirement: Admin user detail

The system SHALL expose `GET /admin/users/:userId` (admin) returning the requested user without the password hash, or `404` when no user exists (including invalid ObjectId handling as a `400`).

#### Scenario: Existing user returned
- **WHEN** an admin requests an existing user id
- **THEN** the user is returned with no password hash

#### Scenario: Unknown user 404
- **WHEN** an admin requests an id with no matching user
- **THEN** the response is `404`

### Requirement: Admin user status control

The system SHALL expose `PATCH /admin/users/:userId/status` (admin) accepting `{ status }` with value `active` or `suspended`. The change SHALL be recorded through `StatusTransitionService.assert` for entity type `user` with whitelist `active ↔ suspended` (writing a `status_histories` row). A user already in the target status SHALL fail with `409 INVALID_STATUS_TRANSITION`, and a `deleted` user SHALL be unchangeable. Suspended users SHALL be rejected by the S1 `SuspendedGuard` on their next authenticated call.

#### Scenario: Suspend an active user
- **WHEN** an admin sets an active user to `suspended`
- **THEN** the user's `status` becomes `suspended` and a `status_histories` row records `active → suspended`

#### Scenario: Reinstate a suspended user
- **WHEN** an admin sets a suspended user to `active`
- **THEN** the user's `status` becomes `active` and a `status_histories` row records `suspended → active`

#### Scenario: Suspended user blocked at the guard
- **WHEN** a suspended user subsequently calls any authenticated route
- **THEN** the guard rejects the request with `403` and a business code such as `ACCOUNT_SUSPENDED`

#### Scenario: No-op transition rejected
- **WHEN** an admin sets a user's status to its current value
- **THEN** the response is `409 INVALID_STATUS_TRANSITION` and no history row is written

#### Scenario: Deleted user cannot be changed
- **WHEN** an admin attempts to change a `deleted` user's status
- **THEN** the response is `409 INVALID_STATUS_TRANSITION`

#### Scenario: Invalid status value rejected
- **WHEN** an admin sends a status value other than `active` or `suspended`
- **THEN** the request is rejected by DTO validation

### Requirement: Admin volunteer listing

The system SHALL expose `GET /admin/volunteers` (admin) returning a cursor-paginated list of volunteer profiles joined with their linked `users` account (role `volunteer`), so moderators can inspect profile completion and account state without the password hash.

#### Scenario: Volunteers listed with profile and account
- **WHEN** an admin requests `GET /admin/volunteers`
- **THEN** each item includes the volunteer profile and its linked account (no password hash), cursor-paginated per the S1 convention

#### Scenario: Paging covers all volunteers
- **WHEN** an admin pages through `GET /admin/volunteers`
- **THEN** every volunteer with a profile appears exactly once across pages

### Requirement: Admin organization listing

The system SHALL expose `GET /admin/organizations` (admin) returning a cursor-paginated list of all organizations (regardless of `verificationStatus` or `status`) including file and verification state, so moderators can triage the queue.

#### Scenario: All organizations listed
- **WHEN** an admin requests `GET /admin/organizations`
- **THEN** every organization is returned (pending, rejected, verified, active, or suspended), cursor-paginated

### Requirement: Admin organization verifications listing

The system SHALL expose `GET /admin/organizations/verifications` (admin) returning a cursor-paginated list of `organization_verifications` rows filterable by `status` (default `pending`), each enriched with its organization summary (id, slug, name, current `verificationStatus`). This is the moderator's decision queue.

#### Scenario: Pending verifications listed
- **WHEN** an admin requests `GET /admin/organizations/verifications?status=pending`
- **THEN** all rows with `status=pending` are returned ordered by `submittedAt` (oldest first for FIFO triage), each with its organization summary

#### Scenario: Filter by another status
- **WHEN** an admin requests `GET /admin/organizations/verifications?status=rejected`
- **THEN** only `rejected` rows are returned

### Requirement: Admin approves organization verification

The system SHALL expose `POST /admin/organizations/:organizationId/verification/approve` (admin): the organization's latest pending `organization_verifications` row SHALL be set to `status=verified` with `decidedAt` and `decidedBy` (the admin's user id); the organization SHALL transition `verificationStatus` `pending → verified` through `StatusTransitionService.assert` (entity type `organization`); and `org.verification.updated` SHALL be emitted on the S1 EventEmitter bus with the organization's id so the S9 handler notifies the org account. This is the F1 path that makes the organization able to publish. An organization with no pending verification row SHALL fail `409`; an unverifiable organization (unknown id) SHALL return `404`; an already-`verified` organization SHALL fail `409`.

#### Scenario: Approve a pending organization
- **WHEN** an admin approves an organization with a pending verification row
- **THEN** the latest verification row becomes `verified` with `decidedAt`/`decidedBy` set
- **AND** the organization's `verificationStatus` becomes `verified` with a `status_histories` row `pending → verified`
- **AND** `org.verification.updated` is emitted exactly once (creating one org-account notification)

#### Scenario: Approved organization can publish
- **WHEN** a just-verified organization calls the S6 publish route
- **THEN** the publish is no longer blocked by verification (unblocks the F1 core loop)

#### Scenario: Approved org resubmission blocked
- **WHEN** an admin approves an organization whose `verificationStatus` is already `verified`
- **THEN** the response is `409`

#### Scenario: No pending row to decide
- **WHEN** an admin approves an organization with no `pending` verification row
- **THEN** the response is `409` with a business code such as `NO_PENDING_VERIFICATION`

#### Scenario: Unknown organization 404
- **WHEN** an admin approves a nonexistent organization id
- **THEN** the response is `404`

### Requirement: Admin rejects organization verification

The system SHALL expose `POST /admin/organizations/:organizationId/verification/reject` (admin) with a required `{ rejectionReason }`: the latest pending verification row SHALL be set to `status=rejected` recording `rejectionReason`, `decidedAt`, and `decidedBy`; the organization SHALL transition `verificationStatus` `pending → rejected` through `StatusTransitionService.assert`; and `org.verification.updated` SHALL be emitted so the org account is notified. The S5 resubmit route SHALL then allow the organization to return to `pending` with fresh documents. Missing `rejectionReason` SHALL fail with `400`; no pending row SHALL fail `409`; unknown org `404`.

#### Scenario: Reject a pending organization
- **WHEN** an admin rejects an organization with a pending verification row and a non-empty reason
- **THEN** the latest verification row becomes `rejected` with `rejectionReason`/`decidedAt`/`decidedBy`
- **AND** the organization's `verificationStatus` becomes `rejected` with a `status_histories` row `pending → rejected`
- **AND** `org.verification.updated` is emitted exactly once

#### Scenario: Rejection reason required
- **WHEN** an admin rejects with an empty or absent `rejectionReason`
- **THEN** the response is `400` and no state changes

#### Scenario: No pending row to decide
- **WHEN** an admin rejects an organization with no `pending` verification row
- **THEN** the response is `409`

#### Scenario: Rejected organization resubmits
- **WHEN** a rejected organization submits new documents through `POST /organizations/me/verification`
- **THEN** the organization returns to `pending` and a new verification row is created (existing S5 behavior)

### Requirement: Admin organization status control

The system SHALL expose `PATCH /admin/organizations/:organizationId/status` (admin) accepting `{ status }` with value `active` or `suspended`. The change SHALL be recorded through `StatusTransitionService.assert` for entity type `organization` with whitelist including `active ↔ suspended` (writing a `status_histories` row). A suspended organization SHALL NOT be able to publish opportunities (enforced by the S6 publish route), and an already-`suspended` (or `deleted`) organization SHALL fail with `409 INVALID_STATUS_TRANSITION`.

#### Scenario: Suspend an active organization
- **WHEN** an admin sets an active organization to `suspended`
- **THEN** the organization's `status` becomes `suspended` and a `status_histories` row records `active → suspended`

#### Scenario: Suspended org publish blocked
- **WHEN** a suspended organization attempts to publish an opportunity through the S6 route
- **THEN** the publish is rejected (regression of the existing publish-enforcement behavior)

#### Scenario: Reinstate a suspended organization
- **WHEN** an admin sets a suspended organization to `active`
- **THEN** the organization's `status` becomes `active` and a `status_histories` row records `suspended → active`

#### Scenario: No-op or deleted transition rejected
- **WHEN** an admin sets an organization's status to its current value or targets a `deleted` organization
- **THEN** the response is `409 INVALID_STATUS_TRANSITION`

#### Scenario: Invalid status value rejected
- **WHEN** an admin sends a status value other than `active` or `suspended`
- **THEN** the request is rejected by DTO validation