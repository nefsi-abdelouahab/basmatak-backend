## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry, TanStack Query + key factory, `components/ui/*` primitives, and the shared blob-download helper. FB (F1/F2/F3, archived) shipped auth guards, org onboarding (dossier, verification states), and the 2-step upload helper (`lib/api/media.ts`). F9 (org dashboard, in flight) owns `orgStats.ts`/`useOrgStats.ts` and the `org/dashboard` summary joins. F11 builds the three org action queues (delta doc V2 §B#12–§B#14) on those primitives. Backend route truth was re-verified in `backend/src`: `GET organizations/me/applications` + `GET opportunities/:opportunityId/applications` + `POST applications/:applicationId/start-review|accept|reject` (`applications.controller.ts`), `GET organizations/me/participants` (query `org-dashboard.dto.ts`) + `GET opportunities/:opportunityId/participants` + `POST participations/:participationId/remove` (`participations.controller.ts`), `GET organizations/me/submissions` + `POST submissions/:submissionId/start-review` (`submissions.controller.ts`), `POST submissions/:submissionId/verify|reject` + `GET verifications/:verificationId` (`verifications.controller.ts`), `GET volunteers/:username` (`public-volunteers.controller.ts`) all exist with the `:applicationId`/`:participationId`/`:submissionId`/`:verificationId`/`:opportunityId` param naming.

## Goals / Non-Goals

**Goals:**
- Three token-driven, en+ar, RTL-correct routes (`org/applications`, `org/participants`, `org/contributions`) at 1440/1100/390 with real `under_review` flows, aggregate + per-opportunity views, joins, reject/remove dialogs with required reason, single approve-and-mint, and owning-org evidence render.
- One typed api function per consumed endpoint in a single new module; all data via a single new hook file; unit + e2e coverage per roadmap §F11 Tests.

**Non-Goals:**
- Verified-experiences archive + CSV (F12), opportunity CRUD (F10), dashboard summaries (F9), org profile/settings (F13), any messaging UI, any `/backend` / `docs/API.md` / archived-change edits.

## Decisions

- **One api module + one hook file for three capabilities.** Roadmap mandates `lib/api/orgInbox.ts` + `hooks/useOrgInbox.ts` (singular). Rationale: all three routes share `CursorPage` handling, the required-reason dialog pattern, and the start-review→decide lifecycle; splitting would triple the tab/filter/dialog patterns. Alternative (one module per queue, F2-style) rejected — the roadmap file split is explicit and FD parallel-safety is by filename (`orgInbox.ts`/`useOrgInbox.ts` owned solely by F11).
- **Exact-enum tabs, no invented states.** Application tabs map 1:1 to real application statuses (`pending`, `under_review`, `accepted`, `rejected`, `withdrawn`); the contributions to-review filter sends multi-status `submitted,under_review`; "Verified (8)"-style tabs and "Changes requested" are forbidden (V2 §B#12/#B#14). Alternative (collapsing or adding archive tabs) rejected — the Verified tab is F12-owned and invented vocabularies fail review.
- **Reject/remove dialogs own `{reason}` client-side.** Each dialog holds local reason state, disables submit while empty, and posts `{reason}` on confirm followed by a re-read. Alternative (optional reason with server default) rejected — backend requires `reason` and the roadmap mandates the dialog.
- **Approve is the single atomic verify.** Contributions approve calls `POST /submissions/:submissionId/verify` once (backend transaction incl. mint); the UI never splits approve-then-mint. Approve copy states verification is issued on approval. Alternative (two-step approve UI) rejected — backend is atomic and V2 §B#14 forbids the split.
- **Applicant/participant context via public reads only.** Applicant skills/experiences come from `GET /volunteers/:username` (opt-out-gated blocks, neutral empty states); participant skills likewise. Alternative (calling volunteer-private or admin routes) rejected — 403 by `RolesGuard` and opt-out semantics.
- **Evidence via owning-org media read.** Submission evidence renders through `GET /media/:mediaId` on the owning-org path (F1-fix), images/PDF/link only, no audio player. Alternative (guest/public media path) rejected — evidence is private to the owning org.
- **Message ownership: `orgReview.*` prefix only.** All three routes share one catalog pair (`messages/org-review/{en,ar}.json`); no other prefix is touched, so catalog merges stay conflict-free with parallel F9/F10/F12/F13.

## Risks / Trade-offs

- [Risk] Parallel FD sessions (F9/F10/F12/F13 stubs active) touching shared primitives → Mitigation: F11 consumes `components/ui/*`, theme, i18n setup, `downloadBlob` read-only; any needed shared change is flagged, not edited; files are disjoint by name.
- [Risk] Accept-application and verify-submission are multi-document transactions (409 on race) → Mitigation: confirm dialogs, post-action re-read, error mapping for 404/409/422 via F0 error shape.
- [Risk] Applicant may hide public blocks via opt-out → Mitigation: neutral empty states per block; no private-field fallback.
- [Trade-off] Three spec capabilities sharing one hook file bends the one-capability-one-file intuition, accepted per roadmap mandate and the shared inbox/dialog/lifecycle logic.

## Migration Plan

None (new routes only). Rollback = revert the single F11 commit. Archive via `openspec archive frontend-org-review -y` after green verification.

## Open Questions

- **OQ1:** Detail presentation (inline expansion vs full sub-page) is unspecified by DESIGN.md for these three queues. Proposed: filterable list + expandable detail section with deep-linkable `[id]` segment inside each owned route dir (mirrors the F6 pattern). Owner confirm before Phase 2 (non-blocking: either shape satisfies the spec).
- **OQ2:** The per-opportunity applications/participants views (`GET /opportunities/:opportunityId/...`) could live as tabs inside the aggregate inboxes (with `?opportunityId=`) or as sections under the F10-owned `org/opportunities/[id]` route. Proposed: tabs/filters inside the F11 aggregate routes (stays inside F11-owned dirs, no cross-session file touch). Owner confirm before Phase 2.
