## Context

Source of truth: `design/Basmatak Tatatoua - Public Opportunities/code.html`
(643 lines) + per-screen `DESIGN.md`. `screen.png` never consulted. Current
state: no `(public)/opportunities` list route exists; `PublicNavbar` is
guest-only with no active-state; `GET /opportunities` feed DTO
(`OpportunityFeedQueryDto`) accepts `q categoryId skillId wilayaId
municipalityId from to hasOpenPositions nearMe sort cursor limit` — no `mode`
param (unknown params 400 via whitelist+forbidNonWhitelisted); mode enum is
`onsite|remote|hybrid` (`OPPORTUNITY_MODES`); page shape is
`{ items, nextCursor, limit, total, page?, pages? }`; verified pattern is
`verificationStatus === 'verified'` + neutral "Verified" badge; durations are
real `durationMinutes`; fallbacks `/public/org.png` + `/public/user.jpg` exist.

## Goals / Non-Goals

**Goals:**

- Structural port of `code.html` in DOM order (header/counter, search +
  4-filter toolbar, active-filter meta bar, article list, no-results + empty
  states, pagination footer, guest CTA band, legal note slot) with neutral copy
  only; every civic-narrative string removed and listed before/after.
- Real data exclusively: feed + facets from the backend; card shows org embed
  + verified badge, title, location labels, mode, hours from `durationMinutes`,
  seats from positions, skills from `skillNames`, deadline; no invented fields.
- Continuity: same `PublicNavbar`/`PublicFooter` components as landing via the
  existing `(public)` layout; lucide-react everywhere; 4 mandates hold.

**Non-Goals:**

- Other screens; pixel-perfect acceptance (byte-signal secondary only);
  backend/API changes (mode filter stays client-side); new image procurement.

## Decisions

- **New route, not a move.** Add `(public)/opportunities/page.tsx` (server,
  `setRequestLocale`, forwards `searchParams`) + `PublicOpportunitiesPage.tsx`
  (client). The authenticated `/volunteer/opportunities` screen is untouched.
  Alternative (reuse volunteer page publicly): rejected — different shell,
  different filters, auth-gated queries (`nearMe`, recommended, favorites).
- **New API module `publicOpportunities.ts` + hook `usePublicOpportunities.ts`.**
  One typed function per endpoint over `GET /opportunities` with the verified
  full param set; rich card schema (positions, deadline, labels, skillNames);
  facets via import-only reuse of `feed.ts` (`listSkillCategories`,
  `listSkills`, `listWilayas`) per the F17 precedent. Alternative (extend
  `publicOrgs.ts` feed params): rejected — keeps the change file-disjoint and
  the limited landing wrapper stable.
- **Mode filter is client-side.** The feed DTO has no `mode` field, so the
  Format select (`all|onsite|remote|hybrid`, neutral On-site/Remote/Hybrid
  labels replacing the mockup's Field/Hybrid/Remote-Engagement wording)
  filters the served items on their real `mode` value. Documented, not hidden.
- **Pagination reconciled, not faked.** `code.html` shows numbered `1, 2,
  Next`; the shared `Pagination` primitive (consumed unchanged) renders
  Prev/Next + status text from the real `page/pages/total/nextCursor`. No page
  numbers are invented when the API omits them. Recorded as allowed UI
  adjustment A-page.
- **Navbar upgraded in place.** `PublicNavbar` keeps its markup/shell and gains
  `usePathname` active-state (`aria-current="page"`) plus `useSessionQuery`
  auth-state (guest: Sign in + Create profile; volunteer: + Dashboard;
  organization: + Workspace; admin: + Admin). Both landing and this screen
  consume it through `(public)/layout.tsx` — no re-implementation, seamless
  transitions.
- **Copy rejection by deletion.** Each rejected string is deleted or replaced
  with neutral product language in the same structural slot; the footer drops
  Civic Integrity Code / Institutional Verification (About/Privacy/Terms
  modals already cover legal) and Community Guidelines (no backend concept);
  the per-card accreditation line is dropped (no certificate entity); the
  banner slot keeps neutral helper copy; the legal-note slot is removed.

## Risks / Trade-offs

- [Risk] Client-side mode filter only narrows the loaded page → Mitigation:
  page size 20 keeps it useful; labeled honestly; listed as known limitation.
- [Risk] `nearMe` needs a volunteer session; guests get 401 → Mitigation: the
  control is omitted on the public screen (no session-gated filters for
  guests); documented.
- [Risk] Playwright baseline needs the Tailwind CDN (offline → styles skipped)
  → Mitigation: same `styled`-gate pattern as the landing harness; counts
  always assert.

## Migration Plan

Frontend-only, no migration. Land order: change scaffolding → navbar upgrade →
API module + hook → messages en/ar → page + card → fidelity spec → iterate to
allowed-only diffs → build/unit/e2e → report table + removal list. Rollback is
a plain revert. Other screens untouched.

## Open Questions

- Should the public navbar link Opportunities to `/opportunities` (new public
  list) instead of `/volunteer/opportunities`? Default yes for guests; the
  volunteer dashboard keeps its own entry. Owner to confirm link policy.
