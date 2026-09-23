## Why

F1 leaves the core loop blocked: an organization can submit verification documents but only the P3 admin route can move it `pending → verified`, and no admin surface exists yet. This session builds the moderation backbone for accounts — stats, users/volunteers/organizations listing, status control, and the organization-verification decision. It is Part A (users & organizations) of the shared `admin-and-moderation` change; Part B (opportunities, reviews hiding, reports, audit-logs, settings) extends the same change in Session 16.

## What Changes

- New `admin` module with `@Roles('admin')` route guard + S1 audit interceptor coverage (already writes `audit_logs` for every admin action).
- `GET /admin/stats/overview`: account/organization/opportunity counts, total volunteer hours (sum of `volunteer_profiles.stats.volunteerHours`), organization verification rate (verified ÷ total), and gate freezes (organizations locked by the §4 publish gate).
- `GET /admin/users?role=&status=&q=`, `GET /admin/users/:userId`, `PATCH /admin/users/:userId/status` (`active | suspended`). Suspended users are rejected by the S1 `SuspendedGuard` — an existing behavior this session's E2E exercises as a regression.
- `GET /admin/volunteers` (profile + linked account), `GET /admin/organizations`, `GET /admin/organizations/verifications?status=pending` (reads `organization_verifications`, joins org).
- `POST /admin/organizations/:organizationId/verification/approve` (sets `verifiedAt`/`verifiedBy`, `verificationStatus=verified`, emits `org.verification.updated` to the org account), `POST /admin/organizations/:organizationId/verification/reject` (`{ rejectionReason }` → `rejected`; the S5 resubmit route already returns a `rejected` org to `pending`).
- `PATCH /admin/organizations/:organizationId/status` (`active | suspended`); suspended orgs cannot publish (already enforced in S6 — E2E regression).
- All status writes (`users.status`, `organizations.status`, `organizations.verificationStatus`) go through `StatusTransitionService.assert`; registers the `user` whitelist and extends the `organization` whitelist with its status pairs.

## Capabilities

### New Capabilities
- `admin`: admin guard + audit, stats overview, users/volunteers/organizations listing, user and organization status control, and the organization-verification approve/reject decision.

### Modified Capabilities
- `users`: admin listing/filtering and `active | suspended` status control (the S1 guard already rejects suspended accounts).
- `organizations`: admin verification decision (`pending → verified | rejected` via the transition service, `verifiedAt/verifiedBy`, emits `org.verification.updated`) and admin organization status control.

## Impact

- Backend: new `backend/src/admin/` module (`AdminModule` + stats/users/volunteers/organizations controllers and services), additive import in `app.module.ts`, whitelist registrations, unit tests (audit recording, approve field/event wiring), and E2E `backend/test/admin.e2e-spec.ts` (non-admin 403 everywhere, list/filter, suspend regression, F1 unblock end-to-end).
- No new packages, env vars, or collections. No seed script (admin account is seeded in Session 17; tests create an admin-capable user through `UsersService`).
- Out of scope: Part B endpoints, skill/location admin (already in S3). Does not touch other sessions' changes.