## Context

Session 8 adds the Admin Dashboard's database-derived overview, time series, attention queue, and an organization-footprint service seam. It is an admin-only S2 change and is file- and module-disjoint from Session 7's pagination work. The roadmap requires real values and identifies the metrics and routes, while retaining the existing `/health` System Status card outside this session.

## Goals / Non-Goals

**Goals:**

- Provide the three specified admin-only analytics routes.
- Return the overview, time-series, attention-queue, and organization-footprint metrics named by Session 8 from real database data.
- Enforce the explicit UTC and 1–90-day series constraints.
- Define a reusable organization-footprint seam for later `org-facts` and `org-dashboard` work.

**Non-Goals:**

- CSV export, charts UI, and changes to the existing `/health` System Status card.
- Public organization routes or public-profile integration.
- New persistence, background processing, packages, or hardcoded analytics values.
- New formulas, business rules, thresholds, or metric definitions beyond the roadmap and cited RP requirements.

## Decisions

### Database-derived response values

The analytics routes and organization-footprint seam will source their required values from existing database data. The source requirements prohibit hardcoded figures and do not authorize cached or invented totals.

### Explicit series constraints

The series route will honor the stated inclusive `days` bound of 1 through 90 and use UTC dates. These are the only prescribed time-series mechanics.

### Deferred public organization integration

This session defines only the reusable organization-footprint service seam. `org-facts` and `org-dashboard` own the later public-side integration, so no public route or public payload changes are part of this design.

### Existing system-status ownership

The attention queue returns the required maintenance-mode flag. The System Status card remains a client use of existing `/health` and receives no change here.

### Owner-approved metric definitions

The owner approved four metric definitions, recorded here and in the specs with no additional invented semantics:

- **Deltas:** `{ current, previous, deltaPercent }` per total; `current` = `createdAt` in the last 30 days, `previous` = `createdAt` in days 31–60 back, `deltaPercent = null` when `previous` is 0. Applied to the Session 8 route `GET /admin/analytics/overview`, not the archived v1 `GET /admin/stats/overview` (the approval named the stats route; the Session 8 scope owns the analytics route, so the definition is encoded there and the v1 route is untouched).
- **Active participants:** distinct `volunteerId` across applications created/updated in 30d, `task_participant` status changes in `status_histories` (`entityType: 'task_participant'`) in 30d, and submissions created/updated in 30d. The `entityType` values `application`, `submission`, and `task_participant` are confirmed registered; `volunteerId` is joined from those collections since `status_histories` carries no volunteer reference.
- **Verification-ready:** submissions in `submitted` or `under_review`, matching `GATE_STATUSES` in the existing stats service and the trust-layer publish-gate definition. No new status.
- **`medianDecisionHours`:** verifications only, median of (`verification.decidedAt` − `submission.createdAt`) in hours over the last 90 days, `null` when fewer than 5 verifications exist. Field mapping (no `submittedAt` exists on `submissions`): `submission.createdAt` is the submit-time source and `decidedAt` the decision timestamp, consistent with the existing `ReliabilityService` convention. Alternatives considered (status-history `draft → submitted` timestamp as submit time) were rejected for now to stay with the approved definition and the existing convention.

## Risks / Trade-offs

- **[Risk]** Several required metrics are named without a formula or source-field definition. **Mitigation:** the four owner-approved definitions above are now normative; the per-organization footprint metrics stay named-only until the owner confirms the proposed one-line definitions.
- **[Risk]** Analytics could drift from the dashboard if values are duplicated. **Mitigation:** the overview and queue use a single source of truth for their shared dashboard information.
- **[Risk]** `status_histories` is indexed `(entityType, entityId, createdAt)`, which serves per-entity lookups but not efficient global 30-day scans for the active-participants query. **Mitigation:** flagged as a performance caveat for implementation (possible index review); correctness needs no new index, so this is not a blocker.

## Migration Plan

The change is additive: register the admin-only routes and service seam, then deploy with the existing data model. No data migration is specified.

## Open Questions

The per-organization footprint metrics (opportunities, applications, participants, experiences, hours, reliability) remain named-only; the proposed one-line definitions await owner confirmation before implementation. The delta definition was encoded on the Session 8 analytics overview route; confirm the approval's `GET /admin/stats/overview` naming was a slip and the v1 route must stay untouched.
