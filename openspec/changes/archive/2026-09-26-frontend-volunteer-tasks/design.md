## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry, TanStack Query + key factory, `components/ui/*` primitives, and the shared blob-download helper (`lib/api/download.ts` `downloadBlob`). FB (F1/F2/F3, archived) shipped auth guards, volunteer profile/settings, and the 2-step upload helper (`lib/api/media.ts`). F6 builds the two volunteer post-apply screens (delta doc V2 §B#5–§B#6) on those primitives. Backend route truth was re-verified in `backend/src`: `GET /applications/me` (`?status=&from=&to=`, `ApplicationListQueryDto`), `GET /applications/:applicationId`, `POST /applications/:applicationId/withdraw`, `GET /participations/me` (`?status=`, `ParticipationListQueryDto` — no `from`/`to`), `GET /participations/:participationId`, `POST /participations/:participationId/withdraw`, `GET /volunteers/me/activity`, and `GET /experiences/:experienceId/attestation` (streamed `attachment`, never persisted) all exist with the `:applicationId`/`:participationId`/`:experienceId` param naming.

## Goals / Non-Goals

**Goals:**
- Two token-driven, en+ar, RTL-correct routes (`volunteer/applications`, `volunteer/tasks`) at 1440/1100/390 with real `under_review` tabs, joins, date filter (applications only), neutral timelines, withdraw flows, activity strips, and blob-download attestation links.
- One typed api function per consumed endpoint in a single new module; all data via a single new hook file; unit + e2e coverage per roadmap §F6 Tests.

**Non-Goals:**
- Submission editing/uploading (F7), experience visibility/portfolio (F8), opportunity details/apply (F5), any messaging UI, any `/backend` / `docs/API.md` / archived-change edits.

## Decisions

- **One api module + one hook file for both capabilities.** Roadmap mandates `lib/api/tasks.ts` + `hooks/useTasks.ts` (singular). Rationale: both routes share `CursorPage` handling, the activity strip, and the attestation download; splitting would duplicate the tab/filter/download patterns. Alternative (two modules mirroring the two capabilities, F2-style) rejected — the roadmap file split is explicit and FC parallel-safety is by filename (`tasks.ts`/`useTasks.ts` owned solely by F6).
- **Exact-enum tabs, no invented states.** Application tabs map 1:1 to `APPLICATION_STATUSES` (`pending`, `under_review`, `accepted`, `rejected`, `withdrawn`); participation tabs map 1:1 to `PARTICIPANT_STATUSES` (`accepted`, `active`, `completed`, `withdrawn`, `removed`). Alternative (collapsing to "Active/History" or adding a "Verified" tab) rejected — V2 §C#4 and §B#14 forbid invented vocabularies.
- **Date filter on applications only.** `ApplicationListQueryDto` supports `?from=&to=` (ISO created-at bounds); `ParticipationListQueryDto` has no date params. The tasks route SHALL NOT offer a date filter (no client-side faking over the current page). Alternative (symmetric filters) rejected — backend contract differs per endpoint.
- **Timeline renders from `status` + activity, never admin histories.** Volunteer timeline is a pure function of application/participation `status` plus `GET /volunteers/me/activity` items (Submitted → Under review → Accepted; rejected/withdrawn/removed terminal with `reason` where present). Alternative (calling `GET /admin/status-histories`) rejected — admin-only route, 403 for volunteers by `RolesGuard`.
- **"Application ID" is a client-side ObjectId short form.** Last 6–8 chars uppercased, labelled as reference only. Alternative (waiting for a backend id) rejected — V2 §C#2 confirms applications intentionally have no `registryId`.
- **Attestation is a conditional blob-download link.** `downloadAttestation` in `tasks.ts` calls `GET /experiences/:experienceId/attestation` through the F0 `downloadBlob` helper (single shared path, never navigation). The button renders only when the participation/detail payload carries an experience reference; otherwise a neutral empty state renders. No `GET /experiences/me` list in F6 (F8-owned file; importing it would break FC file-disjointness). Alternative (F6 owning an experiences list function) rejected — belongs to F8's `experiences.ts`.
- **Detail lives inside the two owned route dirs.** List + detail expansion plus deep-linkable `[applicationId]` / `[participationId]` segments under `volunteer/applications` and `volunteer/tasks` respectively (still F6-owned dirs). Alternative (top-level detail routes) rejected — would collide with F5/F7 route space.
- **Message ownership: `volunteerTasks.*` prefix only.** Both routes share one catalog pair (`messages/volunteer-tasks/{en,ar}.json`); no other prefix is touched, so catalog merges stay conflict-free.

## Risks / Trade-offs

- [Risk] Participation payloads may not always carry the experience reference needed for the attestation button → Mitigation: button hidden with neutral empty state per spec; no extra endpoint called; OQ1 tracks the briefing ambiguity.
- [Risk] Withdraw-accepted-application is a multi-document transaction (seat + participation) → Mitigation: confirm dialog, post-withdraw re-read of detail, error mapping for 409/404 via F0 error shape.
- [Risk] FC parallel sessions (F4/F5/F7/F8) touching shared primitives → Mitigation: F6 consumes `components/ui/*`, theme, i18n setup, `downloadBlob` read-only; any needed shared change is flagged, not edited.
- [Trade-off] Two spec capabilities sharing one hook file bends the one-capability-one-file intuition, accepted per roadmap mandate and the shared activity/download logic.

## Migration Plan

None (new routes only). Rollback = revert the single F6 commit. Archive via `openspec archive frontend-volunteer-tasks -y` after green verification.

## Open Questions

- **OQ1 (STOP): "Briefing download" source is undefined.** Roadmap §F6 lists "attestation/briefing downloads" but the backend ships only `GET /experiences/:experienceId/attestation` — no briefing-file endpoint exists. Proposed: ship attestation-only; treat joined deliverables/schedule as the "briefing" context (no file button). Owner confirm before Phase 2.
- **OQ2:** Detail presentation (inline expansion vs full sub-page) is unspecified by DESIGN.md for these two screens. Proposed: expandable detail section + deep-linkable `[id]` segment in each owned route dir. Owner confirm before Phase 2 (non-blocking: either shape satisfies the spec).
