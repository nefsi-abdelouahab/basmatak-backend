## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry, TanStack Query + key factory, `components/ui/*` primitives, and the shared blob-download helper. FB (F1/F2/F3, archived) shipped auth guards, session states, `lib/api/organizations.ts` (me read/patch, profile-completion, verification submit/status) + `hooks/useOrgOnboarding.ts`. F9 builds the single org home screen (delta doc V2 §B#9) on those primitives. Backend route truth was re-verified read-only in `backend/src`: `GET /organizations/me/stats` + `GET /organizations/me/participants` (`OrgDashboardController`/`OrgDashboardService`: stats `{ opportunitiesActive, opportunitiesCompleted, applicationsPending, applicationsUnderReview, participantsActive, participantsCompleted, verifiedHours (= sum(durationMinutes)), decisionsLast30d, decidedRatio?, medianDecisionHours? }`), `GET /organizations/me/submissions`, `GET /organizations/me/applications`, `GET /organizations/me/activity` (`ActivityController`), `GET /organizations/me/publish-gate` (`TrustController` → `{ locked, pendingCount, threshold, pendingOpportunities }`), and `GET /notifications` all exist with the `organizations/me/*` path shape that avoids the `:slug` collision.

## Goals / Non-Goals

**Goals:**
- One token-driven, en+ar, RTL-correct route (`org/dashboard`) at 1440/1100/390: fact header, stat cards, two inbox summaries + participants snapshot (all `total`-bannered, link-onward), activity feed, publish-gate banner, notifications strip.
- One typed api function per consumed endpoint in a single new module (`lib/api/orgStats.ts`); all data via a single new hook file (`hooks/useOrgStats.ts`); unit + e2e coverage per roadmap §F9 Tests.

**Non-Goals:**
- Opportunity CRUD (F10: `org/opportunities*`, `useOrgOpps.ts`); review-queue detail and approve/reject/remove (F11: `org/applications|participants|contributions`, `useOrgInbox.ts`); records/CSV (F12); profile/settings edits (F13/F3); any `/backend` / `docs/API.md` / archived-change edits.

## Decisions

- **One capability, one api module, one hook file.** `org-workspace` spec → `lib/api/orgStats.ts` + `hooks/useOrgStats.ts`. Rationale: the dashboard is a single read-model screen over 8 endpoints sharing `CursorPage`/`total` handling, the gate-locked branch, and the empty-state pattern; splitting would duplicate them. Alternative (per-panel modules) rejected — roadmap FD parallel-safety is by filename and F9 owns these two files outright.
- **Dashboard reads summaries only, never mutates.** Inbox panels use small pages (`limit` 5–8, status-filtered where supported) and link to F11 queues for all actions. Alternative (inline approve/reject on the dashboard) rejected — those mutations live in F11's `orgInbox.ts`; duplicating them here would break file-disjointness and the "publish gate" vs "review action" separation.
- **Stats cards are a pure function of the stats payload.** Every number renders from `GET /organizations/me/stats` fields; `verifiedHours` renders hours directly (backend already sums `durationMinutes`). Alternative (client-side hour math from durations) rejected — no duration list is fetched here and invented aggregation would violate acceptance.
- **Cover is real-or-absent.** `coverMediaId` resolves through the existing public media read; otherwise a neutral token-driven empty state renders. Alternative (gradient/stock placeholder) rejected — roadmap acceptance explicitly forbids cover placeholders.
- **`ORG-<registryId>` is display-only.** Rendered from `GET /organizations/me` (`registryId`), never used as a route key or link target. Alternative (linking by registryId) rejected — cross-cutting contract: `registryId` is display-only everywhere.
- **Gate banner is a pure function of publish-gate status.** `locked=true` → neutral locked banner with `pendingCount` + next-step link; `locked=false` → no banner. Alternative (dashboard publish CTA) rejected — publishing belongs to F10 under the verified gate; the dashboard only explains the lock.
- **Message ownership: `orgWorkspace.*` prefix only.** Single catalog pair (`messages/org-workspace/{en,ar}.json`); no other prefix touched, so catalog merges stay conflict-free and `src/i18n/request.ts` is never edited (auto-merge).

## Risks / Trade-offs

- [Risk] Inbox summary shapes (joins, status vocab) may drift from F11 detail reads → Mitigation: dashboard renders only shared scalar fields + names from joins, links to F11 for everything else; no status enum is re-declared beyond the summary filter it passes.
- [Risk] Stats payload omits optional reliability fields for some orgs → Mitigation: conditional cards (render iff present), covered by a dedicated unit test.
- [Risk] FC↔FD parallel work touching shared primitives → Mitigation: F9 consumes `components/ui/*`, theme, i18n setup, axios client read-only; any needed shared change is flagged, not edited.
- [Trade-off] Dashboard fires up to 8 parallel queries on load; accepted per read-only aggregate design — each panel has independent loading/empty/error states so one slow endpoint never blocks the rest.

## Migration Plan

None (new route only). Rollback = revert the single F9 commit. Archive via `openspec archive frontend-org-workspace -y` after green verification.

## Open Questions

- **OQ1:** Should the notifications strip deep-link anywhere (e.g., to F11 queues for review-type items), or render as a read-only strip with read/unread only? Proposed: read-only strip in F9; deep-linking deferred to F11 if needed. Owner confirm (non-blocking).
- **OQ2:** Should inbox summaries share one "View all → F11" panel chrome or three distinct cards (submissions / applications / participants)? Proposed: three distinct summary cards matching the three F11 queues. Owner confirm (non-blocking).
