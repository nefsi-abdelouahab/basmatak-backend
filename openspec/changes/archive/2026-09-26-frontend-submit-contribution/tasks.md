## 1. API layer (API ACCESS mandate: one typed fn per endpoint, via F0 axios client)

- [x] 1.1 Add `lib/api/submissions.ts`: `createSubmission` (`POST /participations/:participationId/submissions`, `{title?}` ≤200), `getSubmission` (`GET /submissions/:submissionId`), `listMySubmissions` (`GET /submissions/me`), `patchSubmission` (`PATCH /submissions/:submissionId`: `title`/`description` ≤5000/`evidence` ≤50/`consentConfirmed`), `submitSubmission` (`POST /submissions/:submissionId/submit`, `{consentConfirmed?}`), `createMediaUpload`+`confirmMediaUpload` re-export reuse (import-only from F2 `lib/api/media.ts`, no edits), `createMediaLink` (`POST /media/links`, purpose `submission_evidence`), `deleteMedia` (`DELETE /media/:mediaId`). THEME N/A; I18N: error-code keys only under `submitContribution.*`.
- [x] 1.2 Add local validators in `lib/api/submissions.ts`: `validateEvidenceFile` (jpeg/png/webp/pdf, 1..5 MB, blocks before `POST /media/uploads`) + `isAllowedEvidenceLink` (https + `youtube.com`/`youtu.be` exact/`drive.google.com`, mirrors backend `assertAllowedLinkHost`). Unit-tested; no edits to archived `lib/api/media.ts`.
- [x] 1.3 File-disjointness gate: verify `lib/api/submissions.ts` + `hooks/useSubmissions.ts` + `messages/submit-contribution/*` + route dir untouched by F4/F5/F6/F8 (STOP + flag on collision); no `lib/query/keys.ts` edit (generic F0 factory covers `submit-contribution` namespace).

## 2. Hooks (TanStack Query only; no fetch/axios in components)

- [x] 2.1 Add `hooks/useSubmissions.ts`: submission query (`getSubmission`/`listMySubmissions`), create/patch/submit mutations with query invalidation, upload-with-progress composer over F2 helper (`putPresignedBytes` + `onUploadProgress`), link-add, evidence-remove, consent-gated submit blocker (submit disabled until `consentConfirmed` when file/image evidence present; maps `400 CONSENT_REQUIRED` to checkbox error). API ACCESS + I18N mandates bind.
- [x] 2.2 Wire query keys via F0 factory (`['submit-contribution', scope, params?]`); guest/una authed access redirects to Login via `getLoginHref` (decision 10).

## 3. Route (THEME: tokens only; I18N: no hardcoded strings; RESPONSIVE: 1440/1100/390)

- [x] 3.1 Add `app/[locale]/volunteer/tasks/[participationId]/submit/page.tsx`: draft composer (`title` ≤200, `description` ≤5000, zod), evidence gallery (file picker + link input + per-file progress bar + remove), imagery-consent checkbox preceding submit, submit button, status banner (`draft`/`submitted`/`under_review`/`approved`/`rejected` + reason), rejected→edit→resubmit affordance. Consumes `components/ui/*` only (no shared edits). BLOCKED on OQ1 (progress pattern) + OQ2 (consent copy) — do not build gallery/consent UI until owner confirms.
- [x] 3.2 Add `messages/submit-contribution/en.json` + `ar.json` (prefix `submitContribution.*`, incl. allowlist hint, size-guard, consent, status, `CONSENT_REQUIRED` copy); wire into next-intl config; RTL logical-properties check (`ms-/me-/ps-/pe-` only, no physical `ml-/mr-/pl-/pr-`).
- [x] 3.3 Error/loading/empty states via F0 error mapping incl. 401/403/404/409 (duplicate create)/429/503; `CONSENT_REQUIRED` never surprises (checkbox precedes submit); assert no "500 MB / audio / zip / single-step gallery / Message coordinator" copy or affordance in DOM.

## 4. Tests (vitest + Playwright, viewports 1440/1100/390, locales en+ar)

- [x] 4.1 Unit: consent-gate (submit blocked without consent when imagery present; allowed without imagery), allowlist validation (youtube/drive ok incl. subdomains, `youtu.be` exact-only, vimeo/other rejected, non-https rejected), size/type guard (oversize + audio/video-file/zip blocked pre-upload).
- [x] 4.2 Unit: 2-step composer ordering (validate → `POST /media/uploads` purpose `submission_evidence` → PUT bytes with progress → `POST /media/:mediaId/confirm` → patch `evidence`), rejected→draft transition on PATCH (mocked).
- [x] 4.3 E2E: draft→upload w/ progress→consent→submit→`submitted`; rejected→edit→resubmit; link-add (youtube/drive ok, other host rejected client-side); 3 viewports × en+ar (RTL mirror spot-check); grep gates (no hardcoded theme/string/fetch outside layers).

## 5. Verify + archive (from /frontend, then repo root)

- [x] 5.1 `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` green.
- [x] 5.2 `openspec validate frontend-submit-contribution` + `openspec status --change frontend-submit-contribution` clean; archive only after owner go on OQ1/OQ2 (`openspec archive frontend-submit-contribution -y` in Phase 2).
