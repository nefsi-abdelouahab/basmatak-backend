## Context

Session 10 (`backend-v2-admin-lists`, archived) built the triage surface: report list enrichments, `assignedAdminId` + assign route, and plain resolve/dismiss via `StatusTransitionService`. The consequence side already exists in standalone form: `AdminOpportunitiesService.setStatus` (`published|in_progress → closed|cancelled`), `AdminUsersService`/`AdminOrganizationsService.setStatus` (`active ↔ suspended`), and `NotificationsService.createForRecipientIfEnabled` (prefs-gated). What is missing is the composite: one admin decision → terminal report status + consequence, atomically, with a shared reason. `StatusTransitionService.assert` already accepts a `session`; the codebase transaction pattern (`@InjectConnection()` + `connection.startSession()` + `session.withTransaction`, as in accept-application and verify-submission) applies directly. `audit_logs` are written by the S1 `AuditInterceptor` for every admin action, so no manual audit writes are needed. Opportunity statuses have no `unpublished` value, so "remove from public listing" maps to `published→closed`.

## Goals / Non-Goals

**Goals:**

- One atomic admin decision per report: resolve + consequence in a single transaction, all transitions recorded in `status_histories` with the report `resolution` as reason.
- Extend, never duplicate: reuse existing whitelists, transition services, prefs gating, and audit paths.
- First real enforcement read of the `moderation.suspendOnReport` flag (stored since Session 13, never read).

**Non-Goals:**

- No new report fields/types, no new collections, no schema or index changes, no whitelist changes.
- No new opportunity close/unpublish routes (the existing `PATCH /admin/opportunities/:opportunityId/status` transitions cover them; the composite reuses the same pairs).
- No assign/unassign changes (Session 10's assign route already reassigns); no user-to-user notices; no digest delivery.

## Decisions

- **New `ModerationActionsService` in `backend/src/admin/` over editing the three `setStatus` services.** The existing services write outside transactions and have no session parameter; threading sessions through them would widen three archived APIs. The new service instead injects the already-registered Mongoose models + `StatusTransitionService` + `NotificationsService` + `SettingsService` and performs session-aware writes itself, reusing the same whitelists and reason/notes conventions. Plain (action-less) resolve stays in `AdminReportsService` untouched. Alternative (add optional `session` params to the three services) rejected: larger archived diffs for no behavioral gain.
- **Controller branching, not replacement.** `AdminReportsController.resolve` delegates to the composite for every `resolved` call (so the policy default fires) and keeps `in_review`/`dismissed`-without-action on the Session 10 path byte-identical. Without an action and with the flag off, the composite's observable outcome equals the plain path. The notice route is a small addition to `AdminUsersController`.
- **Notice delivery = prefs check + `createInSession`.** The transactional repository path is prefs-ungated by design (S9), so the service checks `prefs.enabledFor(recipient, 'admin.notice')` first (mapped to the `system` bucket via a one-line `prefsForType` addition), then writes in-transaction. Payload carries `reportId` + timestamp so the `dedupeKey` never swallows distinct notices.
- **`suspendOnReport` = policy-default consequence at resolution time, default off.** Creation-time auto-suspend would belong to the reports module (Session 10 archived / Session 19 in flight) and risks surprising automation; resolution-time default keeps the flag's enforcement inside this session's scope, is fully audited, and is inert under the shipped default `false`. Explicit actions always override it.
- **`resolution` doubles as the consequence reason.** No new reason field: the required resolution text propagates as `reason` on every consequence history row, satisfying "resolve/dismiss with a reason" with zero schema change.

## Risks / Trade-offs

- [Risk] Session 19 (S7 `org-embed-labels`) is unarchived and its scope touches admin/report read payloads → Mitigation: this change edits only the resolve/notice write path plus provider registration; Phase 2 implementation waits for Session 19's archive and rebases onto its committed base.
- [Risk] Small logic duplication (report lookup + transition) between `AdminReportsService.resolve` and the composite → Mitigation: accepted deliberately to keep the archived service untouched; the composite path is the only session-aware writer.
- [Risk] Interceptor audit writes fire outside the transaction (post-response) → Mitigation: accepted (matches all existing admin routes); `status_histories` inside the transaction is the source of truth for the consequence trail.
- [Risk] Auto-suspend default could surprise if an operator flips the flag without understanding it → Mitigation: default `false`, flag read is explicit in code, behavior fully specified and tested; flagged as Open Question for owner confirmation.

## Migration Plan

Additive only: new service + DTOs + two route additions; no data migration, no backfill. Rollback = revert the commit; in-flight transactions abort cleanly.

## Open Questions

- **O1 (recommended: yes):** Confirm `suspendOnReport=true` auto-applying `suspend_target` on plain `resolved` for user/organization targets (explicit actions always win; default `false` = current behavior).
- **O2 (recommended: 1000 chars):** Confirm the `notice` message bound (≤1000, non-empty) — balances system-notice usefulness against notification-row bloat.
