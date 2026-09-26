## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/tasks.ts` (8 fns, zod-validated, base `/api/v1`): `listMyApplications` (`GET /applications/me`, `?status=&from=&to=`, ISO bounds per `ApplicationListQueryDto`, `CursorPage` totals), `getApplication` (`GET /applications/:applicationId`), `withdrawApplication` (`POST /applications/:applicationId/withdraw`), `listMyParticipations` (`GET /participations/me`, `?status=` per `ParticipationListQueryDto` — no date params), `getParticipation` (`GET /participations/:participationId`), `withdrawParticipation` (`POST /participations/:participationId/withdraw`), `getVolunteerActivity` (`GET /volunteers/me/activity`, newest first).
- [x] 1.2 Add `downloadAttestation` in `lib/api/tasks.ts` (`GET /experiences/:experienceId/attestation`) composed over the F0 shared `downloadBlob` helper (axios `responseType: 'blob'` + `Content-Disposition` filename, triggered save — never navigation, never a stored file URL). Add pure `shortApplicationId` helper (client-side ObjectId short form, last 6–8 chars uppercase; no backend id).
- [x] 1.3 No `lib/query/keys.ts` edit — the generic F0 factory covers the `volunteer-applications` / `volunteer-tasks` namespaces (no archived-file touch).

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useTasks.ts` (this session's single hook file): application list/detail queries + withdraw mutation (confirm-then-post, re-read detail on success), participation list/detail queries + withdraw mutation, activity-strip query, attestation-download mutation; all keys from the F0 factory. (BLOCKED on OQ1/OQ2 owner go — do not start Phase 2 until cleared.)

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/volunteer/applications/page.tsx` (+ `[applicationId]` segment in the same owned dir): exact-enum tabs (`pending`/`under_review`/`accepted`/`rejected`/`withdrawn`) with count banners from `total`, ISO `from`/`to` date inputs, detail with org/opp/position joins + cover `message` + decision actor + neutral timeline (Submitted → Under review → Accepted; terminal `reason` where present), short-form Application ID, withdraw-with-confirm, activity strip.
- [x] 3.2 Add `app/[locale]/volunteer/tasks/page.tsx` (+ `[participationId]` segment in the same owned dir): exact-enum tabs (`accepted`/`active`/`completed`/`withdrawn`/`removed`) with count banners (NO date filter — backend has no params), detail with org/task/schedule/location + position-deliverables joins, withdraw-with-confirm (seat freed), conditional attestation download button (renders only where an experience reference exists, else neutral empty state; OQ1: no briefing-file button), link to F7 submit route (no submission UI here), activity strip.
- [x] 3.3 Add `messages/volunteer-tasks/en.json` + `ar.json` (prefix `volunteerTasks.*` only); wire into next-intl config; RTL logical-properties check (`ms-/me-/ps-/pe-` only, no physical `ml-/mr-/pl-/pr-`).
- [x] 3.4 Error/empty/loading states on both routes via F0 error mapping incl. 401/403/404/429; guest access redirects to Login (decision 10); DOM asserts: no coordinator-contact/message-thread/evidence-upload/visibility-toggle affordances anywhere.

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: status-tab→`?status=` mapping incl. `under_review` (applications) and all five participant statuses (tasks); date-filter→`?from=`/`?to=` ISO params (applications) and absence of date params (tasks); `shortApplicationId` derivation (no `APL-` codes).
- [x] 4.2 Unit: withdraw-availability gating (applications: `pending`/`under_review`/`accepted` allowed, `rejected`/`withdrawn` blocked; participations: `accepted`/`active` allowed); attestation-button conditional render (renders iff experience reference present).
- [x] 4.3 E2E (applications): tab filtering incl. under_review; date-range re-query; withdraw incl. accepted path (seat freed — assert via detail re-read `withdrawn`); empty/error states.
- [x] 4.4 E2E (tasks): tab filtering; withdraw (seat freed via re-read); attestation downloads as attachment (blob, filename from `Content-Disposition`, no navigation); F7 submit link present with zero submission-upload UI; no messaging/contact affordances in DOM; empty/error states.
- [x] 4.5 E2E: full pass at 1440/1100/390 in en + ar (RTL mirror spot-check); no hardcoded theme/string/fetch violations (F0 grep gates).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-volunteer-tasks` + `openspec status --change frontend-volunteer-tasks` clean; archive only after owner go on OQ1 (briefing source) + OQ2 (detail presentation).
