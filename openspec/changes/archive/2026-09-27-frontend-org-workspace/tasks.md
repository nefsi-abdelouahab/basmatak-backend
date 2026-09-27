## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/orgStats.ts` (8 fns, zod-validated, base `/api/v1`): `getMyOrganization` (`GET /organizations/me` → fact header incl. `registryId`/`coverMediaId`/location/`foundedYear`), `getOrgStats` (`GET /organizations/me/stats` → `opportunitiesActive`, `opportunitiesCompleted`, `applicationsPending`, `applicationsUnderReview`, `participantsActive`, `participantsCompleted`, `verifiedHours`, `decisionsLast30d`, optional `decidedRatio`/`medianDecisionHours`), `listParticipantsSummary` (`GET /organizations/me/participants`, small page, `CursorPage` `total`), `listSubmissionsSummary` (`GET /organizations/me/submissions`, pending-family filter, small page, joins, `total`), `listApplicationsSummary` (`GET /organizations/me/applications`, newest-first, small page, joins, `total`), `getOrgActivity` (`GET /organizations/me/activity`, newest first), `getPublishGate` (`GET /organizations/me/publish-gate` → `{ locked, pendingCount, threshold, pendingOpportunities }`), `listNotifications` (`GET /notifications`, polled read).
- [x] 1.2 Add pure helpers in `lib/api/orgStats.ts`: `orgDisplayCode` (`ORG-<registryId>`, display-only, empty-safe) and `statCards` mapper (stats payload → card list; hours from `verifiedHours`; optional reliability cards render iff present; no invented totals).
- [x] 1.3 No `lib/query/keys.ts` edit — the generic F0 factory covers the `org-workspace` namespace (no archived-file touch).

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useOrgStats.ts` (this session's single hook file): org + stats + three inbox-summary + activity + publish-gate + notifications queries, all keys from the F0 factory, independently loading (one slow endpoint never blocks the rest). (BLOCKED on OQ1/OQ2 owner go — do not start Phase 2 until cleared.)

## 3. Route (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/org/dashboard/page.tsx` fact header + stats + gate: `ORG-<registryId>` display (never a route key), location/founded/verification facts, real `coverMediaId` cover or neutral empty state (no placeholder), stat cards from `statCards` mapper, publish-gate locked banner (`locked=true` → pending count + next-step link; `false` → no banner, neutral copy).
- [x] 3.2 Add dashboard panels in the same owned dir: submissions-to-review summary + recent-applications summary + participants snapshot (each with `total` banner and onward link to `org/contributions` | `org/applications` | `org/participants`; zero approve/reject/remove affordances), activity feed (newest first), notifications strip (newest first, unread markers, no push UI).
- [x] 3.3 Add `messages/org-workspace/en.json` + `ar.json` (prefix `orgWorkspace.*` only; catalogs auto-merge — never touch `src/i18n/request.ts`); wire into next-intl config; RTL logical-properties check (`ms-/me-/ps-/pe-` only, no physical `ml-/mr-/pl-/pr-`).
- [x] 3.4 Error/empty/loading states on every panel via F0 error mapping incl. 401/403/404/429/503; guest access redirects to Login (decision 10); DOM asserts: no opportunity-CRUD, review-action, records/CSV, profile-edit, messaging, or placeholder-cover affordances anywhere.

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: `statCards` mapping (every card from its stats field; hours = `verifiedHours`); optional `decidedRatio`/`medianDecisionHours` conditional render; `orgDisplayCode` (`ORG-<registryId>`, empty-safe); gate-locked messaging branch (`locked` true/false).
- [x] 4.2 Unit: summary query params (small-page `limit`, pending-family/newest-first intent) and no-mutation guard (no start-review/verify/reject/accept params built in this module).
- [x] 4.3 E2E: dashboard numbers match API fixtures (all cards + `total` banners); pending-org sees publish-locked explanation with no publish CTA; activity + notifications render; inbox summaries link to the three F11 queues; neutral cover empty state when `coverMediaId` absent.
- [x] 4.4 E2E: full pass at 1440/1100/390 in en + ar (RTL mirror spot-check); no hardcoded theme/string/fetch violations (F0 grep gates); no out-of-scope affordances in DOM (F10 CRUD, F11 actions, messaging, placeholder cover).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-org-workspace` + `openspec status --change frontend-org-workspace` clean; archive only after owner go on OQ1 (notifications linking) + OQ2 (summary card chrome).
