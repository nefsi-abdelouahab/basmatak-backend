## Context

F0 (archived) shipped theme tokens, next-intl per-area catalogs, the axios singleton with 401 refresh-and-retry (`lib/api/client.ts`), the unified error shape + mapper (`lib/api/errors.ts`), token storage, the query-key factory, `useSession.ts` + `getLoginHref(locale, next)`, `components/ui/*` primitives, and system screens (404/403/500/maintenance/network/expired/rate-limited). FA + all FB sessions are archived, so auth guards, session states, and volunteer/org baselines exist. Verified: `lib/api/opportunity.ts` and `hooks/useOpportunity.ts` do not exist yet, so F5 creates them fresh. Backend route truth re-verified in `backend/src`: `GET /opportunities/:idOrSlug` (published-only, else 404), `GET /opportunities` (published feed, supports `categoryId`), `POST /opportunities/:opportunityId/positions/:positionId/applications` (`{message?}`, volunteer-only), `POST /applications/:applicationId/withdraw`, `POST /reports` (`targetType/targetId/reason`), `GET /media/:mediaId` (public reads allowed) all exist. F4 (`useFeed.ts`), F6 (`useTasks.ts`), F7 (`useSubmissions.ts`), F8 (`useExperiences.ts`) are file-disjoint with F5 by route dir, api module, hook file, and message prefix. Design source: `design/Basmatak Tatatoua - Opportunity Details/code.html` + system tokens; delta doc V2 §B#3 governs field swaps and cuts.

## Goals / Non-Goals

**Goals:**
- One token-driven, en+ar, RTL-correct details route (`volunteer/opportunities/[idOrSlug]`) at 1440/1100/390 with positions, org sidebar, certificate note, related strip.
- One typed api function per consumed endpoint; all data via the single hook file; unit + e2e coverage per roadmap F5 Tests.
- Apply/withdraw/report wired to exact v2 endpoints with deadline/seat gating and guest→Login redirects.

**Non-Goals:**
- Attestation rendering (F8 owns it; F5 links only where an experience exists).
- Org-side editing (F10), public opportunity details (F18), feed/dashboard screens (F4), any `/backend` or archived-change edits.

## Decisions

- **Single `lib/api/opportunity.ts` with 6 typed functions (detail, related, apply, withdraw, report, cover).** Rationale: roadmap lists exactly these endpoints; one module keeps "one typed function per endpoint" auditable. Alternative (splitting report/withdraw into other modules) rejected — breaks file-disjointness with F6/F16 owners.
- **Single `hooks/useOpportunity.ts` with detail query + related query + three mutations.** Rationale: one-hook-file-per-session rule; detail invalidation on apply/withdraw keeps seats truthful. Alternative (separate action hooks) rejected — unnecessary surface.
- **Route at `app/[locale]/volunteer/opportunities/[idOrSlug]` accepting id or slug.** Rationale: backend resolves both; volunteer-side details stay disjoint from F18's public `(public)/opportunities/[idOrSlug]`. Alternative (id-only) rejected — breaks slug links from F4 cards.
- **Positions as selectable radio cards; Apply per selected position.** Rationale: matches design's position-selection pattern and the per-position apply endpoint. Alternative (one Apply for the whole opportunity) rejected — backend requires `positionId`.
- **Perks/logistics blocks deleted, not hidden.** Rationale: FCD CUT is owner-confirmed; schema has no such paths, so rendering them would invent data. "Certificate" is neutral copy, not a status claim.
- **Message keys under `opportunityDetails.*` prefix in a new `messages/opportunityDetails/` area merged additively in `i18n/request.ts`.** Rationale: catalog merge-by-prefix ownership keeps FC sessions disjoint.
- **Cover via `GET /media/:mediaId` signed URL with neutral empty state.** Rationale: public read needs no auth; avoids placeholder imagery.

## Risks / Trade-offs

- [Risk] Non-published details 404 for volunteers too (backend serves published-only on this route; owner reads live elsewhere) → Mitigation: 404 state links back to the opportunities feed; no status invented.
- [Risk] Own-application id for withdraw is not on the detail payload → Mitigation: hook resolves it via the volunteer's application state for the selected position; if absent, Withdraw is hidden (never guessed).
- [Risk] Related-by-category returns the current item or empty → Mitigation: filter self client-side; empty strip collapses with no error.
- [Risk] F6 (`useTasks.ts`) also calls withdraw on applications → Mitigation: F5's withdraw function lives in `opportunity.ts` only; F6 keeps its own — no shared-file edits either direction.
- [Trade-off] Single hook file carries queries + mutations together, accepted per the one-file rule.

## Migration Plan

None (new route only). Rollback = revert the single F5 commit. Archive via `openspec archive frontend-opportunity-details -y` after green verification.

## Open Questions

- **OQ1 (STOP):** Where does the volunteer's own-application id for Withdraw come from at implementation time (detail embed vs a lightweight `GET /applications/me?` lookup scoped to this opportunity)? Proposed: lookup scoped to the opportunity, no new endpoint — owner confirm before Phase 2.
- **OQ2 (STOP):** "Certificate" box copy and attestation-link rule (link shown only when the viewer already holds an experience for this opportunity vs always informational)? Proposed: informational copy + link only where an experience exists (F8 renders) — owner confirm before Phase 2.
