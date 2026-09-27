## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs (auto-discovered `messages/<area>/{en,ar}.json` — never edit `src/i18n/request.ts`), the axios singleton with 401 refresh-and-retry, TanStack Query + key factory, `components/ui/*` primitives, and the shared authed blob-download helper. FB (F1/F2/F3, archived) shipped auth guards (`GET /auth/me` → `{ id, email, role, status }`) and the guest→Login redirect convention (decision 10). No admin FE surface exists yet: F14 (`adminAnalytics.ts`/`useAdminAnalytics.ts`) and F16 (`adminModeration.ts`/`useAdminModeration.ts`) are unclaimed filenames owned by sibling sessions — this change touches neither. F15 builds the four manage routes (delta doc V2 §B#19–§B#21) on those primitives. Backend route truth was re-verified in the archived `admin` + `moderation-actions` + `notifications` specs: `GET /admin/volunteers` (+ query power), `GET /admin/volunteers/:volunteerId/experiences`, `GET /admin/users/:userId`, `PATCH /admin/users/:userId/status` (`{status, reason?, notes?}`, `active|suspended` only), `POST /admin/users/:userId/notice` (`{message}` ≤1000), `GET /admin/organizations` (+ query power), `GET /admin/organizations/verifications` (`?status=&assignedAdminId=`), `GET /admin/organizations/:organizationId/verification/latest`, `PATCH /admin/organizations/verifications/:rowId/assign` (`{assignedAdminId}`), `PATCH /admin/organizations/:organizationId/status`, `POST /admin/organizations/:organizationId/verification/approve|reject` (`{rejectionReason}` on reject), `GET /admin/opportunities` (+ enrichment), `PATCH /admin/opportunities/:opportunityId/status` (`closed|cancelled`), `GET /admin/status-histories` (`?entityType=&entityId=`), `GET /media/:mediaId` (dossier read) — all `:userId`/`:volunteerId`/`:organizationId`/`:opportunityId`/`:rowId` param naming.

## Goals / Non-Goals

**Goals:**
- Four token-driven, en+ar, RTL-correct routes (`admin/volunteers`, `admin/organizations`, `admin/verifications`, `admin/opportunities`) at 1440/1100/390 with real query power, totals banners, CSV parity, status-with-reason dialogs, officer assignment, latest-dossier render, neutral approve/reject, force-close via status-PATCH, histories views, and a non-admin 403 + guest-redirect guard.
- One typed api function per consumed endpoint in a single new module; all data via a single new hook file; unit + e2e coverage per roadmap §F15 Tests.

**Non-Goals:**
- Reports/moderation composite actions incl. review-hide (F16), admin settings + maintenance toggle (F16), analytics dashboard/queue (F14), any `/backend` / `backend-inventory.md` / `docs/API.md` / archived-change edits.

## Decisions

- **One api module + one hook file for four capabilities.** Roadmap mandates `lib/api/adminLists.ts` + `hooks/useAdminLists.ts` (singular). Rationale: all four routes share `CursorPage` handling, the status-with-reason dialog pattern, CSV-via-blob flow, and the histories read; splitting would quadruple the filter/pagination/dialog patterns. Alternative (one module per table) rejected — the roadmap file split is explicit and FE parallel-safety is by filename (`adminLists.ts`/`useAdminLists.ts` owned solely by F15).
- **Exact vocabularies, guarded client-side.** User/org status actions offer only `active`/`suspended` (backend whitelist; `deleted` rows get no actions); opportunity force-close offers only `closed`/`cancelled`; verification triage defaults `status=pending`. Suspend/force-close dialogs hold local `reason`/`notes` state (optional, length-capped) and post `{status, reason?, notes?}` followed by a re-read; reject-verification and notice dialogs block submit while the required field is empty. Alternative (free-text status inputs) rejected — unknown statuses fail 400/409 and invented states ("Pending", "Legal Review", "Flagged") fail review.
- **Force-close is status-PATCH, never a close POST.** Opportunity force-close calls `PATCH /admin/opportunities/:opportunityId/status` per naming diff §A#16. Alternative (a `POST .../close` route) rejected — it does not exist; the backend resolved close to the status-PATCH form.
- **Triage stays neutral: approve/reject only.** Verification decisions are neutral "Approve verification" (`POST .../approve`, no body) and "Reject with reason" (`POST .../reject`, `{rejectionReason}` required); "Request Info" and "Grant Law 12-06 Seal" render nowhere. Alternative (seal/info actions) rejected — deleted per V2 §B#20.
- **Latest-dossier 404 is an empty state, not an error.** Orgs with no submissions get a neutral empty state from the `GET .../verification/latest` 404. Dossier documents resolve via `GET /media/:mediaId` (admin read path). Alternative (error state) rejected — no dossier is a normal queue condition.
- **Admin guard is route-local on the session role.** Each route wraps in a `RequireAdminManage` guard reading `useSessionQuery` (`GET /auth/me`): guest → `getLoginHref(locale, next)` redirect; non-admin role → 403 state; admin → children. Mirrors the F9–F13 route-local guard pattern without editing other files. Alternative (middleware role gate) rejected — role lives behind the authed `/auth/me` read, and sibling sessions own no shared guard file.
- **Page-size discipline.** List hooks default `pageSize` to the backend default (20) and cap at 50; the UI never offers 100. Alternative (page-size-100 option) rejected — exceeds the backend max-50 window.
- **No global topbar search.** Each table owns its own `q` input bound to its list endpoint; no shell-level search exists (no endpoint backs it). Alternative (global search box) rejected — roadmap acceptance forbids it.
- **Message ownership: `adminManage.*` prefix only.** All four routes share one catalog pair (`messages/admin-manage/{en,ar}.json`); no other prefix is touched, so catalog merges stay conflict-free with parallel F14/F16.

## Risks / Trade-offs

- [Risk] Parallel FE sessions (F14/F16) landing adjacent admin files → Mitigation: F15 touches only `adminLists.ts`/`useAdminLists.ts`/`admin/*` routes/`adminManage.*` keys; consumes `components/ui/*`, theme, i18n setup, `downloadBlob` read-only; any needed shared change is flagged, not edited; disjointness re-checked before archive.
- [Risk] Status transitions are whitelisted server-side (409 on race/no-op/deleted) → Mitigation: confirm dialogs, post-action re-read, error mapping for 400/404/409/422/429 via F0 error shape; `deleted` rows render actions disabled.
- [Risk] Volunteer latest-engagement and org dossier depend on secondary reads (experiences/latest/media) → Mitigation: detail-gated queries (`enabled` on selected id), per-section loading/empty/error states, no N+1 (one query per open detail).
- [Trade-off] Four spec capabilities sharing one hook file bends the one-capability-one-file intuition, accepted per roadmap mandate and the shared pagination/dialog/CSV/history logic.

## Migration Plan

None (new routes only). Rollback = revert the single F15 commit. Archive via `openspec archive frontend-admin-manage -y` after green verification.

## Open Questions

None — the prompt instructs proceeding directly to Phase 2 with no review gate. All endpoint lists, vocabularies, and acceptance criteria are pinned by roadmap §F15 + V2 §B#19–§B#21 + §A#16.
