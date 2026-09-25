## Context

Session 14 (`org-facts`) left `OrgPublicStatsProvider` inert (public `aggregates` zeroed) and Session 8 (`admin-analytics`) left `OrgFootprintProvider` inert; both seam files name Session 16 as the filler. The sources exist: `task_participants` (statuses `accepted|active|completed|withdrawn|removed`), `opportunities` (statuses `draft|published|in_progress|completed|closed|cancelled`, `categoryId`, indexed `(organizationId,status)`), `applications` / `submissions` (both carry `organizationId`, both indexed `(organizationId,status)`), `volunteer_experiences` (`organizationId`, `duration` minutes minted by Session 15), `verifications` (`organizationId`, `decidedAt`), and the cached `organizations.reliability` snapshot maintained by `ReliabilityService`. S6 peers (`favorites`, `pdf-attestation`) are active on disjoint dirs. RP Part 7 names no private dashboard route, so `GET /organizations/me/stats` is roadmap-defined.

## Goals / Non-Goals

**Goals:** real database-backed public stats + footprint behind both seams with zero shape change; two additive Org routes (roster, private stats); binding swaps at the two designed extension points; M0-safe indexed reads.

**Non-Goals:** Session 17 name/label embeds (roster joins only the fields RP §2.5#5 names); new formulas for reliability (reuse); public-route changes; CSV/PDF exports; messaging-adjacent fields.

## Decisions

- **Two seam providers, one shared core.** `OrgPublicStatsProviderImpl` (bound in `organizations.module`) depends only on models available there after the approved +2 registrations (opportunities, task_participants, experiences, organizations, skill_categories); `OrgFootprintProviderImpl` (bound in `admin.module`, where all models already exist) additionally reads applications. The shared formula core lives in DI-free pure helpers (`org-dashboard.aggregates.ts`, models passed as arguments) reused by both providers and the route service — no logic duplication, and no cross-scope instantiation problem (a single class bound in both scopes would force an `Applications` registration into `organizations.module`, exceeding the approved diff).
- **Reliability via cached snapshot, not recompute.** `responseRate`/`decidedRatio`/`medianDecisionHours` read `organizations.reliability` (`0`/omitted when absent). Alternative (inject `ReliabilityService` / copy its status sets) rejected: heavier per-request reads, cross-module wiring, and a second formula definition to drift. The cache is refreshed by existing submission events + the `reliabilityRecompute` job.
- **New controller, archived controllers untouched.** New `OrgDashboardController` (`@Controller('organizations/me')`, `GET participants` / `GET stats`, `@Roles('organization')`) in the participations module — no edits to archived `organizations.controller.ts`/`service.ts`. One-segment `:slug` cannot swallow two-segment `me/*` paths.
- **Batched roster joins (N+1 guard).** Page first (`execPage`), then parallel id-batched reads: profiles by `userId`, opportunities by `_id` (positions embedded), latest submission per `participantId` (`createdAt` desc, null when none), experience-duration sums per (volunteer, opportunity). `q` resolves via bounded escaped regex (Session 14 precedent) in a two-phase id filter so cursor pagination stays correct.
- **Two lean indexes.** `task_participants(organizationId,status)` and `volunteer_experiences(organizationId)` — current indexes cannot serve the org-scoped aggregations; both are small, single-purpose, M0-cheap.
- **perDomain default.** Share of the org's non-draft opportunities grouped by `categoryId` → skill-category name (`nameFr`, fallback `nameAr`), desc, cap 8 (Session 9 `areasOfContribution` precedent).

## Risks / Trade-offs

- [S6 peers + dirty tree in flight] → Disjoint dirs confirmed against both peers' proposals; this change adds only `participations/org-dashboard.*` + two binding lines; at commit, stage only own files.
- [Reliability cache cold for new orgs] → Fallback `0`/omitted; existing events/job warm it; e2e seeds trigger a refresh first.
- [Aggregation cost on M0] → All aggregations are org-scoped counts/sums over indexed prefixes; roster joins are page-capped (≤50) with batched reads.
- [Binding touches archived module files] → Explicitly the seams' designed extension point (one provider line each); any wider diff stops per the critical rule.

## Migration Plan

None (additive, read-only). Rollback = revert the two binding lines (inert defaults return).

## Open Questions (resolved by owner before Phase 2 — answers baked into specs)

- **Q1 — verifiedHours window:** lifetime sum, no trailing-window restriction.
- **Q2 — initiative mapping:** active = `published|in_progress`; completed = `completed|closed`; `draft|cancelled` excluded.
- **Q3 — perDomain denominator:** share of non-draft opportunities by category (not experiences/hours/decided-submissions share).
- **Q4 — decisionsLast30d source:** `verifications.decidedAt` trailing-30-day count.
- **Q5 — roster hourlyTotal:** sum of the volunteer's verified `duration` on that specific opportunity.
