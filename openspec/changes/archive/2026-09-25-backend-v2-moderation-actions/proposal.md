## Why

Admin report triage (Session 10) stops at triage: an admin can assign a report and mark it `resolved`/`dismissed`, but the resolution is disconnected from its platform consequence — unpublishing an opportunity, suspending a target account, or notifying a user each require separate manual calls with no atomicity and no shared reason. Session 20 (RP §3.5#10/#11, §3.2#10, §3.4#8) closes that gap: one admin decision resolves the report **and** applies its consequence in a single transaction, audited through the existing conventions.

## What Changes

- `PATCH /admin/reports/:reportId` body gains an optional `action` (`{ type, payload? }`): `unpublish_opportunity` (published→closed, "Remove from public listing"), `close_opportunity` (published|in_progress→closed), `suspend_target` (user|organization active→suspended), `notice` (`{ userId, message }`, prefs-respecting system notice). With `action` present, `status` must be `resolved` and `resolution` (the reason) is required; without `action`, today's resolve/dismiss behavior is unchanged.
- Report resolution + consequence execute in one Mongo `withTransaction` (report transition, target transition, notices); every transition goes through `StatusTransitionService` (session-aware `assert`), so `status_histories` keeps the full audit trail. `audit_logs` stay with the S1 interceptor (no manual writes).
- New `POST /admin/users/:userId/notice { message }` (admin): standalone neutral system notice, gated by the recipient's `system` notification preference (RP §3.2#10).
- `moderation.suspendOnReport` (Session 13 flag, currently stored but unenforced) is re-checked: when `true`, resolving a user/organization-targeted report as `resolved` with no explicit action applies `suspend_target` as the policy default; when `false` (default), plain resolution. Explicit admin actions always win over the flag.
- Assign/reassign needs no new route: `PATCH /admin/reports/:reportId/assign` (Session 10) already reassigns on repeat calls. RP Part 7 specifies no separate escalation route — escalation is assign + `open→in_review→resolved/dismissed`.
- No new collections, no schema changes, no whitelist changes (all needed pairs already registered), no new opportunity routes: `unpublish`/`close` map onto the existing `PATCH /admin/opportunities/:opportunityId/status` transitions (extend, not duplicate). Neutral vocabulary throughout — no "sanction" wording (RP §3.5#11).

## Capabilities

### New Capabilities

- `moderation-actions`: composite report-resolution execution (action registry, target-compatibility matrix, atomic transaction, policy-default suspension, standalone + composite system notices).

### Modified Capabilities

- `admin`: report-resolution route accepts the action envelope; new user-notice route.
- `reports`: terminal resolution may carry an atomic platform consequence; `resolution` required when an action is present.
- `notifications`: new directly-created `admin.notice` type gated by the `system` preference.

## Impact

- Code: new `backend/src/admin/moderation-actions.service.ts` (+ DTO file, unit + e2e tests); small explicit edits to archived files (listed below — **approval requested**, no edits made until granted): `admin/dto/admin-part-b.dto.ts` (action envelope on `ReportStatusDto`), `admin/reports.controller.ts` (branch to composite), `admin/users.controller.ts` (notice route), `admin/admin.module.ts` (provider + `NotificationsModule` import), `notifications/notification-prefs.service.ts` (`admin.notice`→`system` mapping), `common/constants/domain-events.ts` (`AdminNotice` constant). Standalone `AdminReportsService.resolve`, `setStatus` services, whitelists, and schemas are **not** touched.
- APIs: two additive changes (action envelope, notice route); no shape breaks (`PATCH /admin/reports/:id` still returns the updated report).
- Open questions: suspendOnReport default-consequence semantics (recommended: yes as specified); notice payload length bound (recommended: 1000 chars).
