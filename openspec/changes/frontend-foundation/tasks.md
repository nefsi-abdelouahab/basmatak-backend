## 1. Scaffold `/frontend`

- [ ] 1.1 Create Next.js App Router + TS strict app with `src/` layout (`app/[locale]`, `lib/api`, `hooks`, `components/ui`, `messages`, `theme`), eslint + prettier, and `build`/`lint`/`test`/`test:e2e` scripts with viewport matrix 1440/1100/390.
- [ ] 1.2 Install runtime deps (`next react react-dom typescript tailwindcss axios @tanstack/react-query next-intl zod`) and dev deps (`vitest @testing-library/react @playwright/test eslint prettier`); verify clean `npm install`.

## 2. Theme [THEME]

- [ ] 2.1 Emit DESIGN.md tokens as CSS variables + Tailwind config extension (primary `#6D28D9`, hover `#5B21B6`, borders `#E2E8F0`/`#F1F5F9`, green `#16A34A` verification-only, amber `#F59E0B` pending-only, error `#DC2626`, radii, type scale, Plex Sans Arabic + Inter); no gradients/glass/floating cards.
- [ ] 2.2 Add the grep gate (`grep -rn "#[0-9a-fA-F]\{3,6\}" src/components src/app` empty outside `theme/`) and prove it passes.

## 3. i18n [I18N]

- [ ] 3.1 Wire next-intl locale routing with per-area catalogs (`messages/<area>/en.json` + `ar.json`, merged by config; seed `common` + `system` areas), en/ar parity check failing fast on missing keys.
- [ ] 3.2 Prove RTL smoke: logical properties only, Arabic font swap, Playwright en↔ar mirror check on shell at 1440/1100/390 with zero overflow.

## 4. API client [API ACCESS]

- [ ] 4.1 Build the axios instance: base `/api/v1`, JWT attach, single-flight 401 refresh-and-retry via `POST /auth/refresh` (exactly once, queued), refresh-failure logout via `POST /auth/logout` + token clear.
- [ ] 4.2 Implement the unified error type mapping `{ statusCode, code, message, details? }` → states incl. 401/403/404/429 (`RATE_LIMITED`)/503; unit-test every code path.
- [ ] 4.3 Implement the shared authed blob-download helper (`responseType: blob`, `Content-Disposition: attachment` filename, no navigation/URL persistence); unit-test headers + filename handling.
- [ ] 4.4 Add the typed api-module skeleton (index + `system.ts` hitting `GET /health` and `GET /system/status`; session read hitting `GET /auth/me`); assert no `fetch(`/raw `axios.` outside `lib/api` via grep audit.
- [ ] 4.5 Unit-test interceptors: 401→refresh→retry once with result passthrough; concurrent 401s share one refresh; refresh-fail→logout + session-expired signal, no retry loop.

## 5. Query provider + conventions [API ACCESS]

- [ ] 5.1 Provide the TanStack Query provider plus the namespaced key factory; unit-test deterministic keys across list/detail/params shapes.
- [ ] 5.2 Write short `hooks/CONVENTIONS.md` (one hook file per session, keys namespaced per domain, components fetch only via hooks; cross-reference roadmap §3 file-disjointness).

## 6. Shell + system screens [THEME] [I18N] [API ACCESS] [RESPONSIVE]

- [ ] 6.1 Build navbar/sidebar per DESIGN.md + mobile bottom-nav; component-test rendering at 1440/1100/390 (3-col / 2-col / single-col, no overlap/scroll).
- [ ] 6.2 Build error boundary + 6 system screens (404/403/500/Maintenance/Network-Error/session-expired) bound to `{code}` (`FORBIDDEN`/`ACCOUNT_SUSPENDED`/`ACCOUNT_INACCESSIBLE`/`EMAIL_NOT_VERIFIED`, 401→session-expired, 503 via `GET /system/status`, liveness `GET /health`); neutral copy, en+ar, no civic narrative.
- [ ] 6.3 Build `components/ui/*` primitives (button/input/select/checkbox/pill/card/table/pagination/empty/loader) token-driven, both locales; freeze rule documented (later sessions consume, exceptions declared singly).
- [ ] 6.4 E2E: 404/500/maintenance routes + locale switch en↔ar mirror at 1440/1100/390, all green.
- [ ] 6.5 Implement token storage + session hydration (`GET /auth/me` resolves session without forced re-login); guest authed-action redirect hook-point stubbed for FB/F1 (structure only, no auth copy).

## 7. OpenSpec context update

- [ ] 7.1 Update `openspec/config.yaml` context: frontend stack + the 4 mandates + one-hook-file-per-session rule; backend context lines untouched.

## 8. Baseline verification

- [ ] 8.1 Run full gate from `/frontend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green; then `openspec validate frontend-foundation` from repo root.
