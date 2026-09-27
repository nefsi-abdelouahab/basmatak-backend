## Why

The backend V2 admin analytics surface (Session 8) already exists and is fully
database-derived, but there is no frontend for it, so admins have no dashboard at
all. The legacy admin dashboard was blocked in V2 §B#18 for hardcoded figures,
invented peaks, a metric mismatch, missing audit display names, and forbidden
civic copy ("DZ-NAT-REG sync", "compliance %"). This change lands the real
read-model: previous-period deltas, a UTC activity series, an attention queue,
audit-log display names, and a neutral System Status card.

## What Changes

- NEW route `admin/dashboard`: the admin overview screen (route guard renders
  the 403 system state for non-admins; guests follow the standard login redirect).
- NEW `lib/api/adminAnalytics.ts` — one typed function per consumed endpoint:
  `GET /admin/stats/overview`, `GET /admin/analytics/overview`,
  `GET /admin/analytics/series?days=`, `GET /admin/analytics/queue`,
  `GET /admin/audit-logs`. `GET /health` and `GET /system/status` are reused
  from the F0 `system.ts` module (imported, never redefined).
- NEW `hooks/useAdminAnalytics.ts` — TanStack Query read hooks only, keys from the
  F0 `queryKeys` factory.
- Single-source pending counts: every figure renders from the response payload;
  the queue, the overview, and the stats overview are never reconciled or summed
  client-side, so one backend definition feeds each number.
- Deltas render `{ current, previous, deltaPercent }` with an explicit
  "no comparison" state when `deltaPercent` is `null` (previous window empty) —
  never a fabricated `0%`.
- Series renders signups / applications / verifications per UTC day from
  `GET /admin/analytics/series?days=`, bounded 1–90, with a window selector.
- Attention queue renders the five real categories plus the maintenance flag and
  links onward to the F15 manage screens. Links are navigation only: the queue is
  labelled "Needs review" and carries **no** moderation vocabulary and **no**
  actions (moderation is F16, manage tables are F15).
- Audit trail renders the newest audit rows with `actorName` / `targetName`
  display names (never raw ObjectIds as the primary label).
- Neutral System Status card from `GET /system/status` (status, version, uptime,
  maintenance flag/message). No compliance or civic-sync copy.
- Turnaround renders from `medianDecisionHours`, with an explicit "not enough
  data" state when the backend returns `null` (fewer than 5 decisions in 90 days).
- NEW message catalog `messages/admin-overview/{en,ar}.json` under prefix
  `adminOverview` (auto-merged by the next-intl config; `src/i18n/request.ts`
  untouched).

## Capabilities

### New Capabilities
- `admin-overview`: The admin dashboard read-model — overview deltas, activity
  series, attention queue, audit display names, and neutral system status — plus
  its access control and copy constraints.

### Modified Capabilities
None. No existing capability's requirements change: the backend contract is
consumed read-only and `openspec/specs/admin-analytics` and
`openspec/specs/system-status` already define the server behavior being rendered.

## Impact

- Frontend only. New route dir `src/app/[locale]/admin/dashboard/`, new
  `src/lib/api/adminAnalytics.ts`, new `src/hooks/useAdminAnalytics.ts`, new
  `src/messages/admin-overview/` catalog pair, new unit + e2e tests.
- No new `admin/layout.tsx`: pages stay self-contained (the `org`/`volunteer`
  precedent) so F15/F16 own their own route files without a shared layout to
  conflict over.
- Consumes F0 theme/i18n/api-client/query-keys untouched. `src/lib/query/keys.ts`
  and `src/i18n/request.ts` are not edited.
- Cross-session: queue links target F15's `admin/*` manage routes; `GET
  /system/status` is shared with F16 and imported from the F0 module rather than
  redefined.
- Out of scope: manage screens (F15), moderation actions (F16), Reports &
  Moderation, Admin Settings, any backend change.
