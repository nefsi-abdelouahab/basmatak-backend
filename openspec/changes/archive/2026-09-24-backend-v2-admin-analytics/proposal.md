## Why

The Admin Dashboard needs its overview, activity series, and attention counts to reflect actual database data. Session 8 supplies those analytics without hardcoded figures.

## What Changes

- Add `GET /admin/analytics/overview` with totals, deltas versus the previous period, the 30-day active-participants metric, per-status counts for users, organizations, opportunities, applications, and submissions, the verification-ready queue, gate-freeze count, and reliability `medianDecisionHours`.
- Add `GET /admin/analytics/series?days=` for per-day UTC signups, applications, and verifications, with the documented 1–90-day bound.
- Add `GET /admin/analytics/queue` with totals for pending verifications, open reports, `under_review` submissions, suspended accounts, and the maintenance-mode flag.
- Define a reusable organization-footprint aggregate service seam for opportunities, applications, participants, experiences, hours, and reliability. `org-facts` and `org-dashboard` will integrate the seam on public organization reads in their later sessions.
- Keep CSV export, chart UI, and the existing `/health` System Status card outside this change.

## Capabilities

### New Capabilities

- `admin-analytics`: Admin-only overview, time-series, and attention-queue analytics derived from database data.
- `org-aggregates`: Internal reusable service seam for the named organization-footprint aggregates.

### Modified Capabilities

- None.

## Impact

- Adds the three admin analytics routes and their admin authorization.
- Adds analytics and organization-aggregate service seams in the backend admin area.
- Uses existing database collections and existing maintenance state; no new packages, persistence, CSV export, client chart work, or `/health` changes.
