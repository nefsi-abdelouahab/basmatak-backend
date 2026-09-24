## 1. Admin Analytics Routes and Guard

- [x] 1.1 Add `GET /admin/analytics/overview`, `GET /admin/analytics/series`, and `GET /admin/analytics/queue` under the admin module with the existing admin role guard so non-admin callers receive 403 and guests receive 401.
- [x] 1.2 Keep the new routes read-only with no persistence, no new packages, no CSV `format` handling, no charts UI work, and no change to the existing `/health` System Status card.

## 2. Overview From Real Data (Owner-Approved Definitions)

- [x] 2.1 Implement each overview total as `{ current, previous, deltaPercent }` with `current` from `createdAt` in the last 30 days, `previous` from `createdAt` in days 31–60 back, and `deltaPercent: null` when `previous` is 0; no hardcoded figures.
- [x] 2.2 Implement the 30-day active-participants metric as distinct `volunteerId` across applications created/updated in 30d, `task_participant` status changes in `status_histories` (`entityType: 'task_participant'`) in 30d, and submissions created/updated in 30d.
- [x] 2.3 Implement overview per-status counts for users, organizations, opportunities, applications, and submissions from existing collections only.
- [x] 2.4 Implement the overview verification-ready figure as submissions in `submitted` or `under_review` (publish-gate definition; no new status), sharing a single source of truth with the attention queue (RP §3.1#9).
- [x] 2.5 Implement the overview gate-freeze count by reusing the existing publish-gate freeze rule already implemented for `GET /admin/stats/overview` (distinct locked organizations per the §4 gate and `publishGate.maxPendingOpportunities`); do not define a new gate rule and do not modify the v1 stats route.
- [x] 2.6 Implement `medianDecisionHours` for verifications only as the median of (`verification.decidedAt` minus `submission.createdAt`) in hours over verifications decided in the last 90 days, returning `null` when fewer than 5 verifications exist (field mapping: no `submittedAt` exists on `submissions`).
- [x] 2.7 Note the `status_histories (entityType, entityId, createdAt)` index caveat for the global 30-day active-participants scan in implementation notes; correctness requires no new index.

## 3. Time Series

- [x] 3.1 Implement `GET /admin/analytics/series?days=` returning per-day UTC buckets for signups, applications, and verifications with the inclusive `days` bound 1 through 90; reject out-of-range values by validation.
- [x] 3.2 Cover the full requested range including empty days with real zero counts and no hardcoded data points.

## 4. Attention Queue

- [x] 4.1 Implement `GET /admin/analytics/queue` attention totals for pending verifications, open reports, `under_review` submissions, and suspended accounts from existing collections only.
- [x] 4.2 Include the read-only maintenance-mode flag from existing system state without adding a new settings key or changing the settings-expansion ownership.
- [x] 4.3 Use the same source of truth as the overview for shared dashboard information (RP §3.1#9).

## 5. Organization Footprint Seam

- [x] 5.0 Confirm the proposed one-line definitions for the six footprint metrics (opportunities, applications, participants, experiences, hours, reliability) with the owner before implementing seam values.
- [x] 5.1 Define the internal reusable organization-footprint aggregate service seam (interface plus inert default following the `src/common/seams` convention) for the six named metrics: opportunities, applications, participants, experiences, hours, and reliability.
- [x] 5.2 Keep the seam database-derived with no hardcoded values and no metric formulas beyond the roadmap/RP names.
- [x] 5.3 Do not add any public organization route or public-profile integration; `org-facts` and `org-dashboard` own that later integration.

## 6. Automated Coverage

- [x] 6.1 Add unit coverage for delta/window math, UTC series bucketing with the 1–90 bound, and queue category totals from fixtures.
- [x] 6.2 Add E2E coverage with seeded activity verifying overview counts plus deltas, series range coverage, queue pending verifications plus open reports, and 403 for non-admin on all three analytics routes.

## 7. Verification

- [x] 7.1 Run `npm run build` from `/backend`.
- [x] 7.2 Run `npm run lint` from `/backend`.
- [x] 7.3 Run `npm test` from `/backend`.
- [x] 7.4 Run `npm run test:e2e` from `/backend`.
- [x] 7.5 Run `openspec validate backend-v2-admin-analytics` from the repository root.
