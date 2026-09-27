# Tasks — frontend-admin-overview (F14, section FE)

Scope guard: this session owns ONLY
`src/app/[locale]/admin/dashboard/`, `src/lib/api/adminAnalytics.ts`(+test),
`src/hooks/useAdminAnalytics.ts`, `src/messages/admin-overview/`(+parity test),
and `e2e/admin-overview.spec.ts`. F15 owns the manage screens, F16 owns
reports/settings. `src/i18n/request.ts`, `src/lib/query/keys.ts`,
`components/ui`, and every other session's files are never edited. No
`admin/layout.tsx` is created (design decision 1).

## 1. API module — lib/api/adminAnalytics.ts

- [x] 1.1 Create `src/lib/api/adminAnalytics.ts` with zod schemas mirroring the backend exactly: `DeltaCountSchema` (`current`, `previous`, `deltaPercent: number | null`), `AdminAnalyticsOverviewSchema` (`totals` for the 5 entities, `activeParticipants`, `perStatus` incl. `organizations.byStatus` + `organizations.byVerificationStatus`, `verificationReady { total, byOrganization[] }`, `gateFreezes`, `medianDecisionHours: number | null`), `AnalyticsSeriesPointSchema`, `AdminAnalyticsSeriesSchema` (`days`, `points`), `AdminAnalyticsQueueSchema` (5 counts + `maintenanceMode`), `AdminStatsOverviewSchema` (`counts` 6 fields, `totalVolunteerHours`, `verificationRate`, `gateFreezes`), and a local `cursorPage` parser for `GET /admin/audit-logs` (`items` of `{ log, actorName, targetName }`, `nextCursor`, `limit`, `total`, `page`, `pages`).
- [x] 1.2 Add one typed async function per endpoint, each taking the shared `api` client as its first argument: `getAdminStatsOverview`, `getAdminAnalyticsOverview`, `getAdminAnalyticsSeries(client, days)`, `getAdminAnalyticsQueue`, `listAdminAuditLogs`. Clamp `days` to the backend's 1–90 bound before the request (`SERIES_MIN_DAYS`/`SERIES_MAX_DAYS`).
- [x] 1.3 Import `getHealth`/`getSystemStatus` from the existing `./system` for the System Status card — import only, never redefine `SystemStatusSchema` (F0 owns it; F16 already follows this rule).
- [x] 1.4 Implement the pure render-mapping exports (design decision 4): `DELTA_UNAVAILABLE` sentinel + `formatDeltaPercent`, `deltaCards`, `seriesTotals`, `seriesMax`, `attentionItems` (5 categories, fixed order, each with count + manage-route href), `auditRows` (display name else placeholder, id only as React key), `turnaroundValue`. No numeric literal may act as a backend figure and no "peak"/"record" value may be produced.
- [x] 1.5 Add `src/lib/api/adminAnalytics.test.ts` covering: every schema parses a backend-shaped fixture and rejects a malformed one; `formatDeltaPercent(null)` returns the sentinel and never `"0%"`; `deltaCards` maps all 5 totals; `seriesMax` returns 0 only for an empty window and never a hardcoded ceiling; `attentionItems` emits exactly the 5 real categories with the F15 hrefs; `auditRows` falls back to the placeholder on `null` names and never surfaces a raw ObjectId as the label; `turnaroundValue(null)` is the not-enough-data sentinel; `days` clamping.

## 2. Hooks — hooks/useAdminAnalytics.ts

- [x] 2.1 Create `src/hooks/useAdminAnalytics.ts` with read-only TanStack Query hooks under the `admin-overview` domain: `useAdminStatsOverviewQuery`, `useAdminAnalyticsOverviewQuery`, `useAdminAnalyticsSeriesQuery(days)`, `useAdminAnalyticsQueueQuery`, `useAdminAuditLogsQuery`, `useAdminHealthQuery`, `useAdminSystemStatusQuery`.
- [x] 2.2 Build every `queryKey` from the F0 `queryKeys` factory (`detail`/`list`) — no `keys.ts` edit. Series keys must include the `days` window so switching windows does not serve a stale chart.
- [x] 2.3 Gate every analytics hook on the resolved admin role (`enabled: role === 'admin'` after `useSessionQuery`) so no analytics payload is requested before the role check resolves; `retry: false` so a `403` surfaces as the forbidden state instead of retry noise.
- [x] 2.4 Set `staleTime` per read (dashboard aggregates ~30s, system status ~15s to track the maintenance flag). No mutation hook ships in this session.

## 3. Route + components

- [x] 3.1 Create `src/app/[locale]/admin/dashboard/page.tsx` (server component: `setRequestLocale`, render `AdminDashboardPage`) and `src/app/[locale]/admin/dashboard/AdminDashboardPage.tsx` (`'use client'`). Do NOT create `src/app/[locale]/admin/layout.tsx`.
- [x] 3.2 Implement the access gate: session pending → loader; session error → `getLoginHref(locale, next)` redirect; `role !== 'admin'` → `ForbiddenScreen`; any analytics `403` → `ForbiddenScreen` instead of a partially populated dashboard. Test ids: `admin-dashboard`, `admin-dashboard-forbidden`.
- [x] 3.3 Build the overview panel: one card per `deltaCards` entry rendering the current value plus the delta, with the explicit no-comparison state when the sentinel is returned (never `0%`). Add active-participants, verification-ready total, gate freezes, per-status counts, and the turnaround card from `turnaroundValue` with its not-enough-data state.
- [x] 3.4 Build the series panel: a window selector restricted to the backend's 1–90 bound, one entry per returned point, three series (signups/applications/verifications), bars scaled by `seriesMax` only, empty state when the whole window is empty. Render points in the backend's date order; never extrapolate a missing date.
- [x] 3.5 Build the attention queue panel: heading "Needs review", the 5 categories with their counts (0 renders as 0, not hidden), the maintenance flag, and a navigation-only link per category to the F15 manage route. No mutating control, no sanction/compliance/enforcement wording.
- [x] 3.6 Build the audit strip: newest rows with `actorName`/`targetName`, neutral placeholder when a name is `null`, raw id used only as a React key, `action`/`method`/`path`/`createdAt` shown, read-only (no edit/revert/re-run control).
- [x] 3.7 Build the neutral System Status card: `status`, `version`, uptime formatted from `uptimeSeconds`, `maintenance` flag, and `maintenance.message` verbatim when set. No compliance %, no "DZ-NAT-REG sync", no statutory/authority wording.
- [x] 3.8 Consume `components/ui` primitives (`Card`, `Loader`, `Empty`, `Pill`) without editing them. Theme tokens only, zero hardcoded colors; logical directional utilities (`ms-/me-/ps-/pe-/start-/end-`) for RTL; layout holds at 1440/1100/390.
- [x] 3.9 Source every user-visible string from `useTranslations('adminOverview')` — no hardcoded JSX text.

## 4. Message catalogs

- [x] 4.1 Create `src/messages/admin-overview/en.json` and `src/messages/admin-overview/ar.json` with identical key sets covering: shared loading/error/empty, the dashboard title, overview card labels + the no-comparison state, the active-participants/verification-ready/gate-freeze labels, turnaround + not-enough-data, the series panel + window selector + empty state, the queue heading "Needs review" + 5 category labels + maintenance, the audit strip + name-unavailable placeholder, and the system-status card + uptime units. Both files are required — the i18n loader throws on an unpaired area.
- [x] 4.2 Do not edit `src/i18n/request.ts`; the area key `adminOverview` derives automatically from the `admin-overview` directory.
- [x] 4.3 Create `src/messages/admin-overview-parity.test.ts` (own file; F16 owns `admin-moderation-parity.test.ts`): identical en/ar key sets, no empty values, no hex colors, and no forbidden copy — `/DZ-NAT-REG/i`, `/compliance\s*%/i`, plus sanction patterns.
- [x] 4.4 Add a source-level guard in the same test that the dashboard component and the api module contain no forbidden copy and no hardcoded-figure literal standing in for a backend field.

## 5. E2E

- [x] 5.1 Create `e2e/admin-overview.spec.ts` with a `page.route('**/api/v1/**')` mock covering `/auth/me` (admin and non-admin), `/admin/stats/overview`, `/admin/analytics/overview`, `/admin/analytics/series`, `/admin/analytics/queue`, `/admin/audit-logs`, `/health`, and `/system/status`.
- [x] 5.2 Numbers-match-fixtures test: assert each overview card, the queue counts, the turnaround value, and the series point values equal the mocked payloads (this is the no-hardcoded-figures proof).
- [x] 5.3 Delta/median null-path test: a fixture with `previous: 0`/`deltaPercent: null` and `medianDecisionHours: null` renders the no-comparison and not-enough-data states and no `0%` and no `0h`.
- [x] 5.4 Queue-link test: assert each queue entry's `href` targets its F15 manage route and that the panel exposes no mutating control. Assert hrefs only — do not follow into F15's unlanded routes and do not stub them.
- [x] 5.5 Non-admin 403 test: a volunteer session and an organization session each render the forbidden state with no dashboard figure, and assert no analytics endpoint was requested.
- [x] 5.6 Guest test: an unauthenticated visit redirects to the sign-in route with the dashboard as `next`.
- [x] 5.7 Forbidden-copy e2e assertion: the rendered dashboard text contains no "DZ-NAT-REG", no "compliance %", and no sanction vocabulary.
- [x] 5.8 Run the whole suite across the viewport matrix (1440/1100/390) × locales (en+ar), asserting `dir` is `rtl` for ar and `ltr` for en on each.

## 6. Verification

- [x] 6.1 `npm run build` — passes with the new route and the auto-merged catalog (an unpaired locale file would fail here).
- [x] 6.2 `npm run lint` — clean.
- [x] 6.3 `npm test` — unit + parity tests pass.
- [x] 6.4 `npm run test:e2e` — full suite green, including the 3-viewport × 2-locale matrix for this route.
- [x] 6.5 `openspec validate frontend-admin-overview` and `openspec status --change frontend-admin-overview` — all 4 artifacts complete.
- [x] 6.6 Re-confirm no F14 file is also owned by F15/F16 and that `src/app/[locale]/admin/layout.tsx` was not created, then archive with `openspec archive frontend-admin-overview -y`.
- [x] 6.7 Commit only this session's paths (never `git add -A`: F15/F16 and prior sessions have uncommitted work in the tree). Never push, never amend, never branch.
