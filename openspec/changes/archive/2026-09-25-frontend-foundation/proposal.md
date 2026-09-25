## Why

All 19 frontend sessions (F0–F18) build on one shared ground: scaffold, theme, i18n, API layer, and shell. Without it, every session would re-invent tokens, strings, fetching, and layout — violating the 4 mandates (docs/FRONTEND_ROADMAP.md §2) and risking the stale-name hazard (docs/DESIGN_BACKEND_RECONCILIATION_V2.md §G#1). F0 ships that ground first; every later session only consumes it.

## What Changes

- Scaffold `/frontend`: Next.js App Router + TypeScript strict, `src/` layout (`app/[locale]`, `lib/api`, `hooks`, `components/ui`, `messages`, `theme`), eslint + prettier, `build`/`lint`/`test`/`test:e2e` scripts.
- Centralized theme from DESIGN.md tokens (CSS variables + Tailwind config); zero hardcoded values outside `theme/`.
- next-intl with per-area catalogs (`messages/<area>/en.json` + `ar.json`, merged by config), locale routing, RTL via logical properties.
- Centralized axios client: JWT attach, 401 refresh-and-retry via `POST /auth/refresh`, unified error shape, authed blob-download helper; TanStack Query provider + key factory + `hooks/CONVENTIONS.md`.
- Auth token storage + refresh-failure logout (`POST /auth/logout`) + session-expired handling; session read via `GET /auth/me`.
- Base shell (navbar/sidebar, mobile bottom-nav) + error boundary + 6 system screens (404/403/500/Maintenance/Network-Error/session-expired) bound to backend `{code}` values, 503 via `GET /system/status`, liveness via `GET /health`.
- `components/ui/*` primitives; `openspec/config.yaml` context update (frontend stack + 4 mandates + one-hook-file-per-session rule).

## Capabilities

### New Capabilities

- `frontend-scaffold`: Next.js App Router scaffold, strict TS, lint/format, directory layout, npm scripts.
- `frontend-theme`: DESIGN.md tokens as CSS variables + Tailwind config; grep-gate against hardcoding.
- `frontend-i18n`: per-area en/ar catalogs, locale routing, RTL mirroring.
- `frontend-api-client`: axios instance, interceptors, unified error type, blob-download helper, Query provider + key factory + hook-file conventions.
- `frontend-shell`: layout shell, error boundary, 6 system screens bound to error codes + system-status polling.
- `frontend-ui-primitives`: shared `components/ui/*` set (button/input/select/checkbox/pill/card/table/pagination/empty/loader).

### Modified Capabilities

- None (greenfield frontend; no backend requirement changes — `/backend`, `backend-inventory.md`, `docs/API.md` untouched).

## Impact

- New `/frontend` tree only; no backend, API contract, or archived-change impact.
- All later `frontend-*` changes depend on these primitives (consumed, not re-edited); `openspec/config.yaml` gains frontend context.
