## 1. API layer (`lib/api/adminModeration.ts` + unit tests)

- [x] 1.1 Implement reports functions: `listAdminReports` (GET /admin/reports, filters status/targetType/priority/assignedAdminId/q/from/to/sort/cursor/limit + format), `exportAdminReportsCsv` (same + format=csv via shared `downloadBlob`), `assignAdminReport` (PATCH /admin/reports/:reportId/assign), `resolveAdminReport` (PATCH /admin/reports/:reportId with status/resolution/action), `sendAdminNotice` (POST /admin/users/:userId/notice), `hideAdminReview` (PATCH /admin/reviews/:reviewId/hide), `readReportHistories` (GET /admin/status-histories?entityType=reports&entityId=) — zod-parsed, one function per endpoint (THEME n/a; I18N n/a; API mandate; RESPONSIVE n/a).
- [x] 1.2 Implement settings functions: `listAdminSettings` (GET /admin/settings), `updateAdminSetting` (PUT /admin/settings/:key {value}), `toggleMaintenance` (POST /admin/ops/maintenance {enabled,message?}), `getPublicSystemStatus` reuse note (F0 `system.ts` `getSystemStatus`, imported never redefined) — zod-parsed (API mandate).
- [x] 1.3 Implement pure builders/validators: `buildReportListParams` (drops unset, whitelists sort/status/targetType/priority), `buildReportCsvParams`, `buildResolveActionPayload` + `isCompatibleActionTarget` (4 neutral actions + matrix, unknown types rejected), `isResolutionValid` (non-empty ≤4000), `isNoticeValid` (non-empty ≤1000), `ADMIN_SETTING_KEYS` registry + `validateSettingValue` (per-key shapes, booleans strict, numbers finite, strings bounded, locale whitelists, maintenance.message ≤500) — unit-tested incl. incompatibility + wrong-shape guards.
- [x] 1.4 Unit tests `lib/api/adminModeration.test.ts`: param builders, payload builder/compatibility matrix, resolution/notice/setting validators, CSV-params carry filters, array-or-CursorPage list parsing.

## 2. Hooks (`hooks/useAdminModeration.ts`)

- [x] 2.1 Implement report hooks via F0 key factory only: `useAdminReportsQuery(filters)`, `useAdminReportHistoriesQuery(reportId)`, `useAssignAdminReportMutation`, `useResolveAdminReportMutation` (invalidates list+histories; caller re-reads consequence), `useSendAdminNoticeMutation`, `useHideAdminReviewMutation`, `useAdminReportsCsvExportMutation` — components fetch only via these hooks (API mandate).
- [x] 2.2 Implement settings hooks: `useAdminSettingsQuery`, `useUpdateAdminSettingMutation`, `useMaintenanceToggleMutation`, `usePublicSystemStatusQuery` (status re-read after every toggle; single-flight — no parallel duplicate writes from this surface).

## 3. Messages (`messages/admin-moderation/en.json` + `ar.json` + parity test)

- [x] 3.1 Ship both catalogs under the owned `adminModeration` prefix only (reports list/detail/resolve/assign/notice/hide strings, settings table/per-key editors/maintenance strings, shared loading/error/empty/retry/pagination, neutral 403/404/409/400 copy) — no hardcoded JSX strings (I18N mandate), no `src/i18n/request.ts` edit, RTL via logical utilities only.
- [x] 3.2 Add `messages/admin-moderation-parity.test.ts` (identical key sets, no empty strings, no hardcoded-theme leftovers) mirroring the F12 parity pattern.

## 4. Routes (`app/[locale]/admin/reports` + `app/[locale]/admin/settings`)

- [x] 4.1 Build `admin/reports` route (`page.tsx` + `AdminReportsPage.tsx` + route-local `RequireAdminModeration` guard: pending→loader, session-error→Login redirect, role≠admin→shared 403; THEME tokens only; RESPONSIVE 1440/1100/390): filter bar (status/targetType/priority/assignedAdminId/q/from/to/sort), totals banner from page `total`, cursor prev/next, CSV export button (blob download, no navigation), detail panel (reporter/target summaries, reason/description/title/priority, history), assign control, resolve dialog (status + resolution + neutral action picker + notice payload fields, client-side compatibility/resolution gating), standalone notice + review-hide controls, 409/400 neutral error states.
- [x] 4.2 Build `admin/settings` route (`page.tsx` + `AdminSettingsPage.tsx`, same guard/theme/responsive rules): settings table (16 canonical keys, per-key typed editors from the key registry, per-key validation messages, re-read-after-write), maintenance card (enabled switch + message ≤500, toggle → `GET /system/status` re-read + enforced banner noting public 503 `MAINTENANCE_MODE` while status stays 200), `UNKNOWN_SETTING_KEY`/`INVALID_SETTING_VALUE` neutral states.
- [x] 4.3 Forbidden-vocabulary guard: assert "Statutory Sanction", "100% compliance", "Contact Secretariat" (and case variants) appear in neither route nor catalogs (e2e text scan, both locales).

## 5. E2E (`e2e/admin-moderation.spec.ts`, viewport matrix 1440/1100/390, locales en+ar)

- [x] 5.1 Reports flow: list renders enriched rows translated; filter refetch carries real params; assign posts `{assignedAdminId}`; resolve-with-action (`unpublish_opportunity` on opportunity target) asserts consequence via re-read (report `resolved` + opportunity `closed`/history reason); incompatible action blocked with no request; action-without-resolution blocked; standalone notice posts `{message}`; review-hide patches; non-admin 403; guest → login.
- [x] 5.2 Settings flow: table lists stored keys; valid edit persists + re-reads; wrong-shaped value blocked with no request; maintenance on → `GET /system/status` re-read `maintenance:true` + enforced banner (public-503 spot-check copy); non-admin 403; RTL mirror check ar.

## 6. Verification, archive, commit

- [x] 6.1 From `/frontend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; from repo root: `openspec validate frontend-admin-moderation`; file-disjointness spot-check (no `adminAnalytics`/`adminLists` paths touched, no `src/i18n/request.ts` diff, no `/backend` diff).
- [x] 6.2 Archive (`openspec archive frontend-admin-moderation -y`) then commit locally (`git add -A` scoped to this session's files; `git commit -m "feat(admin-moderation): reports resolution actions and admin settings"`; never push/amend/branch).
