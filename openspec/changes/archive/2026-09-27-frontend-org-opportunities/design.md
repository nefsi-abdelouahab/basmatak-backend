## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry, TanStack Query + key factory, `components/ui/*` primitives, and the shared blob-download helper. FB (F1/F2/F3, archived) shipped auth guards, volunteer account, and org onboarding (incl. the 2-step media helpers scoped to `lib/api/organizations.ts` and `lib/api/media.ts`). F5 (archived) built the volunteer-side opportunity detail against the public `GET /opportunities/:idOrSlug` plus the enriched position/org-embed shapes. F10 builds the org-side counterpart (delta doc V2 §B#10–§B#11, plus §A#18 fields, §D#7 real-field rule, §F FCD cuts) on those primitives: owner list/new/edit routes, owner single-read incl. drafts, duplicate, positions CRUD, cover upload, and verified + publish-gate lifecycle. Backend route truth is taken from roadmap §F10 (prima facie frozen v2); exact DTO/transition re-verification happens at Phase 2 start, read-only, with zero `/backend` edits.

## Goals / Non-Goals

**Goals:**
- Three token-driven, en+ar, RTL-correct route segments (`org/opportunities`, `org/opportunities/new`, `org/opportunities/[id]`) at 1440/1100/390 with `q`/`sort`/`page`, per-card counts, `OPP-<registryId>` refs, full v2 create/edit, positions CRUD, cover upload, duplicate → independent draft, delete-draft, and verified + publish-gate lifecycle.
- One typed api function per consumed endpoint in a single new module (`lib/api/orgOpps.ts`); all data via a single new hook file (`hooks/useOrgOpps.ts`); unit + e2e coverage per roadmap §F10 Tests.

**Non-Goals:**
- Applications on the opportunity in any form (F11: aggregate inbox, roster, review actions); opportunity-PDF button (no backend endpoint — never built); perks/logistics inputs (FCD CUT); attestation/CSV surfaces (F8/F12); org dossier/profile/settings (F3/F13); any `/backend` / `docs/API.md` / archived-change edits.

## Decisions

- **One api module + one hook file for both capabilities.** Roadmap mandates `lib/api/orgOpps.ts` + `hooks/useOrgOpps.ts` (singular). Rationale: list, editor, positions, lifecycle, and duplicate share `CursorPage` handling, the owner single-read re-read pattern, and the publish-gate join; splitting would duplicate the matrix/upload patterns. Alternative (two modules mirroring the two capabilities) rejected — the roadmap file split is explicit and FD parallel-safety is by filename (`orgOpps.ts`/`useOrgOpps.ts` owned solely by F10).
- **Own scoped readers for shared reference endpoints — never import sibling session files.** `orgOpps.ts` defines its own `listSkillCategories` (`GET /skill-categories`), `listWilayas` / `listMunicipalities` (`GET /locations/wilayas[/:wilayaId/municipalities]`), `requestUpload`/`confirmUpload` (`POST /media/uploads`, `POST /media/:mediaId/confirm`), and `getPublishGate` (`GET /organizations/me/publish-gate`) + `getOwnVerificationStatus` (via `GET /organizations/me` projection). Rationale: F2/F3/F4/F9 already scope these per-module (F3 comment precedent); importing `organizations.ts`/`orgStats.ts`/`media.ts` would break FD file-disjointness. Alternative (shared imports) rejected — cross-session file coupling.
- **Lifecycle matrix is a pure function of (`status`, `verificationStatus`, `publishGate.locked`).** Verified against backend source (read-only): `GET /organizations/me/publish-gate` returns `PublishGateStatus { locked: boolean, pendingCount: number, threshold: number, pendingOpportunities: [{ id, slug, title }] }` (`TrustPublishGateService.status`); allowed means `locked === false`. Publish renders only for draft + verified/active org + `locked === false`; locked renders an explanation citing `pendingCount`/`threshold` (plus pending opportunity titles where useful); close/cancel/complete render only from published; delete only on draft behind confirm. Rationale: backend `StatusTransitionService` + `publishOpportunity` are authoritative at POST time (403 `ORG_NOT_VERIFIED`, 409 `PUBLISH_GATE_LOCKED`, 403 `PUBLISHING_DISABLED` kill-switch), but the UI must never offer an action the backend will reject (except races). Alternative (rendering all actions and relying on error toasts) rejected — acceptance requires gated affordances, and the three publish-failure codes surface as neutral copy.
- **Duplicate navigates to the new draft; cover is referenced, not re-uploaded.** Verified against backend source (read-only): `OpportunitiesService.duplicateOpportunity` creates an independent `status: 'draft'` copy with fresh slug + `registryId`, full position copies with `filledCount: 0`, and descriptive/schedule/mode/cover/prerequisite content carried over unchanged — including `coverMediaId: source.coverMediaId` (no second upload). Rationale: duplicate is specified as independent-draft creation, not a media flow. Alternative (forcing cover re-upload post-duplicate) rejected — extra friction with no contract basis.
- **Detail lives inside the owned edit dir; list stays a pure list.** `org/opportunities/[id]` is the single edit surface (create lives at `org/opportunities/new`); no nested detail/read-only view is built — the list card links straight to edit. Alternative (separate read view) rejected — roadmap specifies edit-only for `[id]`, and F11 owns all review-side reads.
- **Message ownership: `orgOpportunities.*` prefix only.** One catalog pair (`messages/org-opportunities/{en,ar}.json`, auto-merged — never touch `src/i18n/request.ts`); no other prefix touched, so catalog merges stay conflict-free.

## Risks / Trade-offs

- [Risk] Roadmap endpoint paths vs current backend DTO/transition names may drift (positions PATCH vs PUT, lifecycle verb set, publish-gate shape) → Mitigation: Phase 2 starts with a read-only route/DTO check; any drift is flagged to the owner before coding (OQ1–OQ3), never patched in `/backend`.
- [Risk] `publish-gate` + `verificationStatus` double-read on every edit render (two joins) → Mitigation: both queries cached (staleTime 30–60 s, F3 precedent); publish button suspends on either loading state with neutral skeleton.
- [Risk] Cover upload races form submit (unconfirmed `coverMediaId` posted) → Mitigation: submit disabled while upload/confirm in flight; form posts only the confirmed `mediaId`.
- [Risk] FD parallel sessions (F9/F11/F12/F13) touching shared primitives → Mitigation: F10 consumes `components/ui/*`, theme, i18n setup read-only; any needed shared change is flagged, not edited.
- [Trade-off] Scoped duplicate reference readers (categories/wilayas/media/publish-gate) repeat ~5 small functions across sessions, accepted per the file-disjointness rule over DRY imports.

## Migration Plan

None (new routes only). Rollback = revert the single F10 commit. Archive via `openspec archive frontend-org-opportunities -y` after green verification.

## Open Questions

None — all three pre-Phase-2 verifications resolved read-only against backend source (zero `/backend` edits) with owner sign-off:

- **OQ1 (resolved): positions update verb is PATCH + DELETE only.** Roadmap endpoint line shows `POST` + `PATCH/DELETE`; backend-inventory §2.8 confirms `PATCH /opportunities/:opportunityId/positions/:positionId` + `DELETE` — no PUT exists. No PUT call is implemented.
- **OQ2 (resolved): publish-gate shape verified, differed from the draft assumption.** Actual `PublishGateStatus { locked, pendingCount, threshold, pendingOpportunities[] }` (see Decisions); specs/design/tasks corrected to `locked === false` = allowed. F9/F10 both read the same endpoint independently (D1 pattern) against this single verified shape.
- **OQ3 (resolved): duplicate carries `coverMediaId` forward.** Verified in `OpportunitiesService.duplicateOpportunity` (see Decisions); no re-upload flow.
