## Context

F0 foundation (theme, next-intl per-area catalogs, axios + 401 refresh-and-retry + `{statusCode,code,message}` mapping, TanStack Query + key factory, `downloadBlob` helper, `useSession` guard) is archived. FB sessions are archived. FE siblings F14 (`useAdminAnalytics`) / F15 (`useAdminLists`) are parallel-safe by file-disjointness: this session owns only `lib/api/adminModeration.ts`, `hooks/useAdminModeration.ts`, routes `admin/reports` + `admin/settings`, and the `adminModeration` message prefix. Backend v2 backs everything consumed here: `reports` + `moderation-actions` (atomic resolve-with-action, 4 neutral actions, compatibility matrix, `INCOMPATIBLE_MODERATION_ACTION`), `system-settings` (16-key whitelist + per-key shapes), `system-status` (public status + runtime maintenance gate + kill-switches). No backend edits, no shared-primitive edits, no `src/i18n/request.ts` edits.

## Goals / Non-Goals

**Goals:**

- Enriched report triage + assign + atomic resolve-with-action with consequence asserted via re-read, neutral vocabulary only.
- Stored-validated-key settings table + maintenance toggle with `GET /system/status` enforcement read and the maintenance → public-503 spot-check.
- 4-mandate compliance on both routes at 1440/1100/390 in en+ar.

**Non-Goals:**

- F14 analytics (overview/series/queue/audit display) and F15 manage tables/triage — consumed read-only shapes only, never imported components.
- Any new shared UI primitive, theme token, query-key namespace change, or backend contract change.

## Decisions

- **One function per endpoint in `adminModeration.ts`, zod-parsed, axios instance injected.** Mirrors F11/F12 (`orgInbox.ts`/`orgRecords.ts`) so the API-layer audit (`no fetch/raw axios outside lib/api`) holds; pure builders (`buildReportListParams`, `buildResolveActionPayload`, `validateSettingValue`, `isResolutionValid`, `isNoticeValid`) stay unit-testable without network. Alternative (hook-local fetch) rejected — violates mandate 3.
- **Single hook file `useAdminModeration.ts` over the F0 key factory (`queryKeys.list/detail` under `admin-moderation` / `admin-moderation-settings` domains).** List queries take column filters and read totals from the cursor page; mutations invalidate list + detail keys. Alternative (per-route hook files) rejected — violates the one-hook-file-per-session rule.
- **Resolve dialog builds the `action` envelope locally and validates compatibility client-side (action/target matrix + resolution-required + notice-payload-required) before sending.** The backend remains the authority (409/400 mapped to neutral copy); the client never invents statuses. Alternative (server-only validation with raw error passthrough) rejected — worse UX and risks leaking non-neutral backend phrasing.
- **Consequence asserted via re-read, not mutation echo.** After `resolved`, the client refetches the report plus the target (report history via `GET /admin/status-histories`) and renders the confirmed state; failure surfaces as unconfirmed rather than success. Alternative (trust the PATCH response) rejected — roadmap explicitly requires assert-via-re-read.
- **Settings editors are per-key typed controls (boolean switch / number input / text input / whitelisted select for locale keys) driven by a static key registry (`ADMIN_SETTING_KEYS` with kind + validation).** Unknown keys render read-only-never (defensive; backend never sends them). Maintenance toggle is a separate card posting `POST /admin/ops/maintenance` then re-reading `GET /system/status`. Alternative (generic string inputs) rejected — would pass wrong shapes the backend 400s.
- **Admin guard is route-local (`RequireAdminModeration`, mirrors F12 `RequireOrgRecords`): session pending → loader; session error → Login redirect; `role !== admin` → shared 403 state.** No new global guard file. Maintenance 503 on public reads is display-only context here (banner copy), not a router gate.

## Risks / Trade-offs

- [Risk] Backend `CursorPage` vs array shapes differ per admin list → Mitigation: parsers accept both (`CursorPageSchema` or raw array with derived total), unit-covered.
- [Risk] `limit`/`pageSize` are strings server-side → Mitigation: builders send numbers; axios serializes; e2e asserts the query string, not the type.
- [Risk] CSV filename comes from `Content-Disposition` → Mitigation: reuse the F6/F12 `downloadBlob` path (single blob-download implementation), never per-screen code.
- [Risk] Parallel FE sessions touching `messages/` → Mitigation: own `admin-moderation/` dir only; catalogs auto-merge by directory, no `request.ts` edit; pre-implementation `git status` path check for `adminAnalytics|adminLists` collisions aborts the session.
- [Risk] Sanction vocabulary slipping in via copy → Mitigation: e2e asserts the forbidden phrases ("Statutory Sanction", "100% compliance", "Contact Secretariat") are absent from both routes in both locales.
