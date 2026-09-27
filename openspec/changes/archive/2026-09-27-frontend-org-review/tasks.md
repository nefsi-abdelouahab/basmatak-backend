## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/orgInbox.ts` — applications fns (base `/api/v1`, zod-validated, `CursorPage` totals): `listOrgApplications` (`GET /organizations/me/applications`, `?opportunityId=&status=&q=&page=`), `listOpportunityApplications` (`GET /opportunities/:opportunityId/applications`), `startReviewApplication` (`POST /applications/:applicationId/start-review`), `acceptApplication` (`POST /applications/:applicationId/accept`), `rejectApplication` (`POST /applications/:applicationId/reject`, `{reason}` required), `getApplicantProfile` (`GET /volunteers/:username`, public blocks only).
- [x] 1.2 Add `lib/api/orgInbox.ts` — participants fns: `listOrgParticipants` (`GET /organizations/me/participants`, `?q=&opportunityId=&status=&page=`), `listOpportunityParticipants` (`GET /opportunities/:opportunityId/participants`), `removeParticipation` (`POST /participations/:participationId/remove`, `{reason}` required).
- [x] 1.3 Add `lib/api/orgInbox.ts` — contributions fns: `listOrgSubmissions` (`GET /organizations/me/submissions`, multi-status `submitted,under_review`, `?q=&format=&sort=`), `getSubmission` (`GET /submissions/:submissionId`), `startReviewSubmission` (`POST /submissions/:submissionId/start-review`), `verifySubmission` (`POST /submissions/:submissionId/verify`, single atomic approve-and-mint), `rejectSubmission` (`POST /submissions/:submissionId/reject`, `{reason}` required), `getVerification` (`GET /verifications/:verificationId`), `getEvidenceMedia` (`GET /media/:mediaId`, owning-org private path).
- [x] 1.4 Add pure `buildInboxQuery` helper (multi-status join + `opportunityId`/`q`/`format`/`sort`/`page` composition) shared by the three queues; no `lib/query/keys.ts` edit — the generic F0 factory covers the `org-review` namespace (no archived-file touch).

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useOrgInbox.ts` (this session's single hook file): inbox/roster/queue list queries + detail queries + start-review/accept/verify/reject/remove mutations (confirm-then-post with required-reason gating, re-read on success), applicant-profile query, verification-read query; all keys from the F0 factory. (BLOCKED on OQ1/OQ2 owner go — do not start Phase 2 until cleared.)

## 3. Routes (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/org/applications/page.tsx` (+ `[applicationId]` segment in the same owned dir): exact-enum tabs (`pending`/`under_review`/`accepted`/`rejected`/`withdrawn`) with count banners from `total`, combined `opportunityId`+status+`q` filters, per-opportunity view (OQ2: tab/filter inside this owned dir), detail with name joins + cover `message` + applicant public skills/experiences (opt-out empty states), start-review→accept flow, reject dialog with required reason, no messaging UI.
- [x] 3.2 Add `app/[locale]/org/participants/page.tsx`: aggregate roster incl. `completed` with submission-state/files join per row, combined `q`+`opportunityId`+status filters, per-opportunity view (OQ2: inside this owned dir), real status labels, remove dialog with required reason, no messaging UI.
- [x] 3.3 Add `app/[locale]/org/contributions/page.tsx` (+ `[submissionId]` segment in the same owned dir): to-review multi-status (`submitted,under_review`) filter + `q`/`format`/`sort`, totals banners + volunteer join, detail with owning-org evidence render (images/PDF/link only, neutral empty state), start-review→single "Approve & issue verification" (copy states minting happens on approval, neutral `review` notes), reject dialog with required reason mapping to `rejected`, no Verified tab (F12), no council/compliance copy.
- [x] 3.4 Add `messages/org-review/en.json` + `ar.json` (prefix `orgReview.*` only); wire into next-intl config (catalogs auto-merge — never touch `src/i18n/request.ts`); RTL logical-properties check (`ms-/me-/ps-/pe-` only, no physical `ml-/mr-/pl-/pr-`).
- [x] 3.5 Error/empty/loading states on all three routes via F0 error mapping incl. 401/403/404/409/422/429; org-gated access (non-org → 403 state); DOM asserts: no message/contact/clarification, no Verified-tab, no council/compliance/ledger affordances anywhere.

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: tab→`?status=` mapping incl. real `under_review` (applications) and multi-status `submitted,under_review` builder (contributions); combined-filter→query-params mapping (all three queues); reason-required gating (submit blocked while empty).
- [x] 4.2 Unit: action-availability gating (applications: start-review iff `pending`, accept iff `under_review`; submissions: start-review iff `submitted`, verify iff `under_review`; participants: remove iff not already `removed`); approve-copy asserts mint-on-approval wording; "Changes requested"→`rejected` mapping.
- [x] 4.3 E2E (applications): cross-opp inbox filters; pending→start-review→accept; reject-with-reason dialog (empty blocked, non-empty posts, re-read `rejected`); applicant public blocks render; no messaging affordances in DOM; empty/error states.
- [x] 4.4 E2E (participants): roster incl. completed with submission join; combined filters; remove-with-reason (re-read without row); no messaging affordances; empty/error states.
- [x] 4.5 E2E (contributions): multi-status to-review filter; search/format/sort re-query; start-review→approve-and-mint (verification readable, copy states minting on approval); reject-with-reason→`rejected`; evidence renders for owning org; no Verified tab / council / compliance copy in DOM; empty/error states.
- [x] 4.6 E2E: full pass at 1440/1100/390 in en + ar (RTL mirror spot-check); no hardcoded theme/string/fetch violations (F0 grep gates).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-org-review` + `openspec status --change frontend-org-review` clean; file-disjointness re-check vs parallel FD sessions (F9/F10/F12/F13) before archive; archive only after owner go on OQ1 (detail presentation) + OQ2 (per-opportunity placement).
