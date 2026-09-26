## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, axios client with 401 refresh-and-retry + unified `{ statusCode, code, message, details? }` mapping, TanStack Query + key factory, `components/ui/*` primitives, and the blob-download helper. F2 (archived) added the single shared 2-step upload helper `lib/api/media.ts` (`createMediaUpload` → raw PUT with progress → `confirmMediaUpload`, `validateImageFile` jpeg/png/webp ≤5 MB, purpose-parametric). F7 builds the one missing volunteer flow (V2 §B#8, §G#4) on those primitives. Backend route truth re-verified read-only in `backend/src`: `submissions.controller.ts` (create/read/patch/submit + org `start-review` out of scope), `submissions/dto/submission.dto.ts` (`title` ≤200, `description` ≤5000, `evidence` ≤50 ObjectIds, `consentConfirmed`), `media.controller.ts` (uploads/confirm/links/get/delete), `media.constants.ts` (images+pdf ≤5 MB, `submission_evidence` defaults `private`, link hosts `youtube.com`/`youtu.be`/`drive.google.com`). FB guards + F6 `volunteer/tasks` provide the entry link (`participationId` param).

## Goals / Non-Goals

**Goals:**
- One token-driven, en+ar, RTL-correct route (`volunteer/tasks/[participationId]/submit`) at 1440/1100/390.
- One typed api function per consumed endpoint; all data via one hook file; unit + e2e coverage per roadmap §F7 Tests.
- v2-correct evidence: 2-step upload with progress, video-as-link allowlist, `consentConfirmed` gate preceding submit, rejected→draft→resubmit.

**Non-Goals:**
- Org review actions (`start-review`/`verify`/`reject`, F11), messaging UI, opportunity-PDF/attestation rendering (F8), any `/backend` or archived-change edits.

## Decisions

- **Reuse `lib/api/media.ts` import-only; extend its validator locally for PDF.** `media.ts` currently guards images only; F7's `lib/api/submissions.ts` adds a local `validateEvidenceFile` (images + `application/pdf`, ≤5 MB) and a local `isAllowedEvidenceLink` mirror of `assertAllowedLinkHost` — no edits to the archived helper. Alternative (editing `media.ts` to add PDF/link) rejected — exactly one session may own a shared file and F2 owns it.
- **Exactly one hook file: `hooks/useSubmissions.ts`.** Follows CONVENTIONS.md strictly (unlike F2's two-file deviation): submission query/mutations, upload-with-progress composition, link-add, remove, consent-gated submit. Rationale: single lifecycle owner; F11 reads via its own `useOrgInbox.ts`.
- **Consent checkbox precedes and gates submit.** Checkbox binds `consentConfirmed`; submit mutation is disabled until checked when gallery holds image/video (tracked via selected-file mime + confirmed media `mimeType` where returned, else presence-of-file-evidence heuristic). `400 CONSENT_REQUIRED` maps to the checkbox error. Alternative (server-error-only) rejected — acceptance requires the gate never surprises.
- **Progress UI reuses F2 pattern, pending OQ1 confirm:** thin token-driven bar (`primary`, `radius-full`) + existing `Loader`, per-file percent from `putPresignedBytes` `onUploadProgress`. No new visual language.
- **Rejected→draft is implicit on PATCH.** No separate "reopen" call: successful `PATCH` on `rejected` re-renders as `draft` with resubmit enabled, matching the backend transition (`['rejected','draft']` in `submissions.module.ts`).
- **Message prefix `submitContribution.*`.** Own catalog `messages/submit-contribution/{en,ar}.json`, disjoint from F4–F6/F8 prefixes (`useFeed`, `useOpportunity`, `useTasks`, `useExperiences` owners).

## Risks / Trade-offs

- [Risk] Media `GET /media/:mediaId` confirm payload shape drift (mime needed for consent heuristic) → Mitigation: heuristic falls back to "any file evidence requires consent"; contract spot-check in tasks pins the field.
- [Risk] Owner rejects progress/consent-copy proposal → Mitigation: isolated to two components; OQ1/OQ2 must clear before Phase 2.
- [Risk] FC-parallel collision on `messages/*` merge or `queryKeys` factory → Mitigation: own prefix + generic factory only (no factory edit); tasks verify `useSubmissions.ts` / `lib/api/submissions.ts` untouched by F4–F6/F8 before starting.
- [Trade-off] Client-side link-allowlist duplicates backend logic — accepted so invalid hosts never hit `POST /media/links`; backend remains the enforcer.

## Migration Plan

None (new route only). Rollback = revert the single F7 commit. Archive via `openspec archive frontend-submit-contribution -y` after green verification.

## Open Questions

- **OQ1 (STOP):** Confirm thin-bar upload-progress pattern (F2 precedent) for the evidence gallery — DESIGN.md shows no upload-progress state; V2 §G#4 requires progress.
- **OQ2 (STOP):** Confirm imagery-consent checkbox copy (proposed: "I confirm I have permission from the people visible in these photos/videos to share them." + helper "Required when your evidence shows people."), en+ar.
