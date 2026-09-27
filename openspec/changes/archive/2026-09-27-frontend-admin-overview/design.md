## Context

Session 8 of the backend V2 slate (`backend-v2-admin-analytics`, archived as
`2026-09-24-backend-v2-admin-analytics`) already ships the whole server side of
the admin overview: `AdminAnalyticsService.getOverview/getSeries/getQueue`
(`backend/src/admin/analytics.service.ts`), the v1 `AdminStatsService.getOverview`
(`backend/src/admin/stats.service.ts`), the enriched `AdminAuditService.list`
(`backend/src/admin/audit.service.ts`), and the public `GET /system/status`
(`openspec/specs/system-status`). Every figure is database-derived. V2 §B#18
unblocks the Admin Dashboard with "minor field-name update".

The frontend has no admin surface at all — `src/app/[locale]/` contains only
`(auth)`, `org`, `system`, and `volunteer`. So this is a greenfield read-only
screen, not a migration.

Three sessions land in the same section and are declared parallel-safe by the
roadmap: **F14** (this change, the dashboard), **F15** (`frontend-admin-manage`,
the manage tables at `admin/volunteers|organizations|verifications|opportunities`),
and **F16** (`frontend-admin-moderation`, `admin/reports` and `admin/settings`).
F15 and F16 are mid-flight on disk right now. That drives most of the decisions
below.

Contract shapes confirmed by reading the backend (no backend edits):

| Endpoint | Response |
|---|---|
| `GET /admin/analytics/overview` | `{ totals: { users, organizations, opportunities, applications, submissions } : DeltaCount, activeParticipants, perStatus: { users, organizations: { byStatus, byVerificationStatus }, opportunities, applications, submissions }, verificationReady: { total, byOrganization[] }, gateFreezes, medianDecisionHours }` |
| `GET /admin/analytics/series?days=` | `{ days, points: [{ date, signups, applications, verifications }] }`, `days` bounded 1–90, UTC day keys |
| `GET /admin/analytics/queue` | `{ pendingVerifications, openReports, underReviewSubmissions, suspendedUsers, suspendedOrganizations, maintenanceMode }` |
| `GET /admin/stats/overview` | `{ counts: { users, volunteers, organizations, verifiedOrganizations, opportunities, pendingVerifications }, totalVolunteerHours, verificationRate, gateFreezes }` |
| `GET /admin/audit-logs` | `CursorPage<{ log, actorName, targetName }>` — `{ items, nextCursor, limit, total, page, pages }` |
| `GET /health` / `GET /system/status` | `{ status, version, uptimeSeconds, maintenance, message }` |

Note the deliberate overlap: `gateFreezes` appears in both overview endpoints and
`pendingVerifications` appears in both the stats overview and the queue. The
backend does not reconcile these, and neither will the client.

## Goals / Non-Goals

**Goals:**
- Land the real overview: deltas, per-status counts, active participants,
  verification-ready, gate freezes, median decision hours.
- Render the UTC series with an admin-selectable 1–90 day window.
- Render a neutral, read-only "Needs review" attention queue that links to F15's
  manage routes.
- Render audit rows by `actorName` / `targetName`, never by raw ObjectId.
- Render a neutral System Status card with no compliance or civic-sync copy.
- Enforce admin-only access with the forbidden system state for non-admins.
- Zero hardcoded figures; every number traceable to one response field.

**Non-Goals:**
- Manage screens, tables, filters, CSV, verification triage (F15).
- Reports resolution, moderation actions, notices, settings, maintenance toggle
  (F16).
- Any backend change, any new endpoint, any new query capability.
- Editing `src/i18n/request.ts`, `src/lib/query/keys.ts`, `components/ui`, or any
  other session's file.
- Creating a shared `admin/layout.tsx` or admin navigation shell.

## Decisions

### 1. No shared `admin/layout.tsx` — the dashboard is self-contained

The `org` and `volunteer` trees have no per-area `layout.tsx`; each route
directory is self-contained (`page.tsx` + a `*Page.tsx` client component). F14,
F15, and F16 all need admin routes, and a shared `admin/layout.tsx` would be the
one file all three must write — a guaranteed conflict in a parallel slate.

**Chosen:** F14 creates only `src/app/[locale]/admin/dashboard/` (`page.tsx` +
`AdminDashboardPage.tsx`) and no `admin/layout.tsx`. Next.js applies the root
`[locale]` layout to nested segments, so the route works without one, and the
inherited root layout keeps admin nav F0's problem.

**Rejected:** a shared admin layout with an admin nav rail — it is the right long-
term shape but cannot be authored three times in parallel. Deferred to the
integration/finalisation sessions (F18+), which own cross-session composition.

### 2. `GET /health` and `GET /system/status` are imported, never redefined

Both F14 and F16 list `GET /system/status` in their endpoint sets. F16's
`lib/api/adminModeration.ts` already set the precedent: it imports
`getSystemStatus` from the F0 `lib/api/system.ts` and explicitly never redefines
it. F14 follows that precedent so the two sessions cannot drift on the schema,
and so there is exactly one zod schema for the payload.

**Rejected:** a session-local `SystemStatusSchema` — would be a duplicate of the
F0 one and a drift hazard.

### 3. Pending counts are rendered per-endpoint and never reconciled

`pendingVerifications` exists on both `GET /admin/stats/overview` and
`GET /admin/analytics/queue`; `gateFreezes` exists on both the stats overview and
the analytics overview. They are separate backend queries with separate filters
and no reconciliation contract.

**Chosen:** each card renders exactly one field from exactly one endpoint, and
each card's section header names the source. No summing, no preferring, no
"canonical" pick. A `sourceOf` label on the shared-shape cards makes the
difference legible to an admin instead of hiding it.

**Rejected:** deduplicating to one canonical pending count — would require
inventing a precedence rule the backend does not define, and would silently
disagree with one of the two endpoints.

### 4. Pure mapping functions carry the render semantics, so they are unit-testable

The roadmap asks for unit coverage of "delta/series/queue render mapping". That
logic is extracted from JSX into pure exported functions in
`lib/api/adminAnalytics.ts` (the F9 `orgStats.statCards` precedent), following
CONVENTIONS.md rule 3 — components fetch only via hooks, and mapping lives
beside the schema it maps.

Pure functions to be unit-tested:
- `formatDeltaPercent(deltaPercent)` — `null` → a sentinel the component renders
  as the "no comparison" state, so a real `0` and a `null` never collapse.
- `deltaCards(totals)` — one card per total, current value + delta.
- `seriesTotals(points)` / `seriesMax(points)` — per-series maxima from returned
  points only, used to scale the bar chart. Never a hardcoded ceiling and never a
  "peak" figure presented as a record.
- `attentionItems(queue)` — the five categories in a fixed order, each carrying
  its count and its manage-route href.
- `auditRows(page)` — display-name-or-placeholder resolution, id used only as a
  React key.
- `turnaroundValue(medianDecisionHours)` — number or the "not enough data"
  sentinel.

`seriesMax` returns `0` only when the whole window is empty, in which case the
component renders the empty state — so no chart is drawn against a fake scale.

### 5. Role gate before any analytics request

`useSessionQuery` resolves first; the analytics hooks are `enabled: false` until
the session reports `role === 'admin'`. Non-admins get the existing
`ForbiddenScreen`; guests get the standard `getLoginHref` redirect.

`ForbiddenScreen` is also rendered when any analytics query returns a `403`, which
covers a revoked role mid-session — the screen never shows a half-populated
dashboard. The role check is display-level; the backend `@Roles('admin')` guard
remains the real boundary and the e2e asserts both.

### 6. Queue links are asserted as hrefs only

The roadmap's e2e criterion is "queue links route to manage screens", but F15's
routes do not exist yet in a parallel slate. Following the F9 precedent
(`toHaveAttribute('href', expect.stringContaining(...))` for the F11 queues), F14
asserts the link target and the neutral label, and does not follow the link into
a route F15 has not shipped. No stub route is created — a placeholder
`admin/volunteers` page would collide with F15's real route.

### 7. `CursorPage` schema defined locally

`orgStats.ts` defines its own `CursorPageSchema`; F16 imports the one from
`tasks.ts`. F14 defines a local `cursorPage` parser over
`{ items, nextCursor, limit, total, page, pages }` so the module has no
cross-session import edge that could break when another session edits its file.

### 8. Forbidden-copy guard as a test, mirroring F16

F16 shipped `src/messages/admin-moderation-parity.test.ts` (key parity, no empty
values, no hex colors, no sanction vocabulary). F14 ships
`src/messages/admin-overview-parity.test.ts` with the same four checks plus
`/DZ-NAT-REG/i` and `/compliance\s*%/i`, and a scan of the dashboard source for
the same patterns. The copy constraint is enforced by CI, not by review.

## Risks / Trade-offs

- **F15/F16 create `admin/` routes concurrently and the tree interleaves** → F14
  owns only `admin/dashboard/`; no shared file is written, so the merge is
  directory-level. Verified before commit that `admin/layout.tsx` still does not
  exist; if it appears mid-session, F14's files are unaffected because the page
  imports no admin-layout symbol.
- **Queue links point at routes that do not exist until F15 lands** → links are
  asserted as hrefs, and the click-through e2e is deferred to the integration
  session. A temporary 404 is the accepted cost of the parallel slate.
- **Two endpoints report overlapping pending/gate figures and an admin may read
  them as a contradiction** → each card names its source endpoint; no
  reconciliation is attempted. Flagged as a backend contract question.
- **`medianDecisionHours` and `deltaPercent` are frequently `null` on a fresh
  install** → dedicated "no comparison" / "not enough data" states rather than
  zeros, so an empty dataset is never misread as a measurement.
- **Uptime rendering needs a locale-independent duration format** → format from
  `uptimeSeconds` with a catalog-provided unit vocabulary, no `Intl` locale
  plumbing in a client component.
- **`GET /admin/audit-logs` supports `format=csv`** → not consumed here; the audit
  panel is a read-only newest-first strip. CSV belongs with the manage tables
  (F15) and reports (F16).

## Migration Plan

No data migration, no backend deploy, no flag. The route is additive: `admin` was
simply absent, so nothing to re-point. Rollback is deleting
`src/app/[locale]/admin/dashboard/`, `src/lib/api/adminAnalytics.ts`,
`src/hooks/useAdminAnalytics.ts`, and `src/messages/admin-overview/`. The catalog
pair must be removed together — `src/i18n/request.ts` throws at startup on an
unpaired locale file.

## Open Questions

- Should `gateFreezes` and `pendingVerifications` be deduplicated to one
  canonical figure by the backend? Both analytics and stats overview report them
  with different filters and no reconciliation rule. F14 renders both, labelled.
- Should the admin shell (layout + nav) be assigned to an integration session?
  F14 deliberately ships without one.
- Does the audit panel need CSV or a filter rail here, or does that belong to the
  session that owns the audit table?
