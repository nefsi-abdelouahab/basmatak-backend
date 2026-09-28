## 1. Change scaffolding + backend verification

- [x] 1.1 Confirm `2026-09-28-frontend-fix-design-fidelity` archived; create
  `openspec/changes/frontend-public-opportunities-fidelity/` (proposal, design,
  tasks) without touching the archive
- [x] 1.2 Verify `GET /opportunities` params, mode enum, pagination shape,
  verified-badge pattern, `durationMinutes`, fallback images against backend +
  docs; record deviations (no `mode` filter, numbered-pagination reconcile)

## 2. Navbar continuity

- [x] 2.1 Upgrade `PublicNavbar` in place: `usePathname` active-state +
  `useSessionQuery` guest/volunteer/org/admin auth-state, same markup/shell
- [x] 2.2 Verify landing + shell specs still pass (same component via
  `(public)/layout.tsx`); grep gate for zero hardcoded strings

## 3. API layer + hooks

- [x] 3.1 Add `src/lib/api/publicOpportunities.ts` (rich card schema, full
  verified feed params, no `mode` sent) + `publicOpportunities.test.ts`
- [x] 3.2 Add `src/hooks/usePublicOpportunities.ts` (feed + facet lookups via
  import-only `feed.ts` reuse, namespaced keys)

## 4. Messages (i18n)

- [x] 4.1 Add `publicOrgs.oppsList.*` keys to `messages/public-orgs/en.json` +
  `ar.json`; run parity tests

## 5. Page port

- [x] 5.1 Add `(public)/opportunities/page.tsx` + `PublicOpportunitiesPage.tsx`
  (header/counter, search + wilaya/category/skill/mode toolbar, meta bar,
  article cards, no-results/empty states, `Pagination`, guest CTA band) with
  lucide-react icons, tokens, logical properties, neutral copy only
- [x] 5.2 Wire guest Apply/View to Login-`next` redirect; org logo fallback
  `/org.png` where rendered; no mock data

## 6. Fidelity gate

- [x] 6.1 Add `e2e/opportunities-fidelity.spec.ts` (code.html vs
  `/en/opportunities` at 1440x900: counts, computed styles, boxes; printed
  table; informational byte-signal) with mocked API
- [x] 6.2 Iterate until only allowed differences remain; record each explicitly

## 7. Stop and report

- [x] 7.1 Run build, unit, and opportunities e2e; print final diff table +
  before/after civic-narrative removal list; touch no other screens, push
  nothing
