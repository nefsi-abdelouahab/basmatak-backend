## Context

`src/i18n/routing.ts` sets `localePrefix: 'always'`, and `src/i18n/navigation.ts` exports next-intl's `createNavigation(routing)`. Every navigation API that file exports follows one contract: **paths are locale-less, the library adds the prefix.** `usePathname()` returns `/talents`, not `/en/talents`; `router.push('/login')` navigates to `/en/login`; `Link href="/talents"` renders `/en/talents`.

`getLoginHref` in `src/hooks/useSession.ts` violates that contract:

```ts
export function getLoginHref(locale: string, next?: string): string {
  const base = `/${locale}/login`;   // already prefixed
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}
```

All 20-odd call sites feed that result straight into `router.push`/`router.replace` from `@/i18n/navigation`, so each one produces `/en/en/login`. F1's own `CompleteProfileForm` already does `router.replace('/login')` — the correct pattern was in the codebase the whole time, which is the strongest evidence the helper, not the callers, is the defect.

The `next` value has the same shape problem from the other direction. `resolvePostLoginTarget(role, next)` returns `next` verbatim when `isSafeNextPath` accepts it (a leading `/`, not `//`), and `useLoginMutation` then calls `router.push(target)` on the locale-aware router. `ROLE_HOME` is locale-less for exactly that reason. So a locale-prefixed `next` survives the login form and double-prefixes *after* a successful login — a second, currently unobserved instance of the same bug. Two live sites build `next` from a literal with the locale in it: F17's profile and directory pages (`/${locale}/volunteers/…`, `/${locale}/talents…`), and the public opportunity details fallback (`` `/${locale}/opportunities/${idOrSlug}` ``). Sites that use `pathname` from `usePathname()` are already locale-less and correct.

How the defect survived: F4's and F5's guest-redirect tests assert `expect.poll(() => page.url()).toContain('/en/login')`. `'/en/en/login'.includes('/en/login')` is `true`, so the assertion passes against the broken URL. F17 asserted the exact pathname and caught it.

## Goals / Non-Goals

**Goals:**
- One root-cause fix in the shared helper so all call sites become correct at once, with no per-site path authoring.
- The returned path is a valid input to the locale-aware router, and the `next` it carries survives the post-login `router.push` without a second prefix.
- The class of bug cannot hide again: guest-redirect assertions compare the exact pathname, and the reason lives in one shared test helper rather than being re-derived per spec.

**Non-Goals:**
- Not re-opening or editing any archived change. F4/F5/F17 artifacts stay as archived; only the code and the assertions they own are corrected here.
- No change to the Login page, `isSafeNextPath`, `resolvePostLoginTarget`, `ROLE_HOME`, routing config, or the backend.
- No redesign of the guest-continue flow. The `next` round-trip, its encoding, and its same-origin safety check are unchanged.
- No attempt to fix the concurrent `frontend-public-orgs` work in the shared tree, beyond the mechanical call-site migration its two pages happen to need.

## Decisions

**D1 — Fix the helper's contract, not its callers.** Change the signature to `getLoginHref(next?: string): string` returning `/login?next=…`, and drop `locale`. Every consumer is a locale-aware router, so the shared edit corrects all of them at once.

*Alternative considered:* keep `getLoginHref(locale, next)` returning the localized href and add `getLoginRouterTarget(next)` for routers. Rejected: it keeps a footgun whose only correct use is the one that is currently broken everywhere, doubles the API surface, and the next session picks the wrong one. The parameter is also the defect's carrier — after D1 there is no way to build the wrong string, which is the property worth having.

*Cost accepted:* the signature change touches ~16 files. It is a mechanical, compiler-checked edit (`locale` becomes an unused argument otherwise, and `noUnusedLocals`/`noUnusedParameters` surface it) with no behavior authored per site. This is the "not small" part of a small change, and it is the honest cost of a one-line root-cause fix.

**D2 — `next` stays the caller's value; only its *shape* is normalized.** `getLoginHref` does not parse, re-prefix, or strip a locale from `next`. Callers that already have a locale-less `pathname` keep passing it. Callers that build a literal must pass the locale-less form. The helper stays a pure encoder, so it cannot become a second source of truth about what a pathname looks like.

**D3 — Revert F17's `window.location.assign` workaround now.** F17's two components navigate with `window.location.assign(getLoginHref(locale, next))` specifically to dodge the double prefix. After D1 that call would follow a locale-less `/login` with a full document load and miss the locale entirely — the workaround becomes a new bug. So it is reverted to the shared helper on the locale-aware router, and the code comment explaining *why* the double prefix happened is kept (shortened) so the invariant is documented at the site that discovered it.

**D4 — Exact-path assertions via one shared helper.** Add a small helper in the e2e support layer, e.g. `expectLoginRedirect(page, locale, next?)`, that asserts `new URL(page.url()).pathname === '/${locale}/login'` and, when `next` is supplied, that the decoded `next` round-trips to the expected locale-less path. Replace the `toContain('/en/login')` assertions in `volunteer-home.spec.ts` and `admin-manage.spec.ts` with it, and point F17's guest-save tests at it too.

*Alternative considered:* inline `expect.poll(() => new URL(page.url()).pathname).toBe('/en/login')` at each site. Rejected: it is the same three lines copied N times, and the substring mistake is exactly what a reviewer failed to notice the first time. One named helper states the invariant once.

**D5 — Unit coverage on the contract, not the string.** `useFavorites.test.ts` currently asserts the localized string via `loginHrefForSave`; it moves to the locale-less contract and gains a case for the `next`-with-query-string encoding (F17's `?sort=…&portfolio=true` shape) and for the omitted-`next` case. The wrapper `loginHrefForSave` is kept so F4 call sites stay untouched.

## Risks / Trade-offs

- [A migration site is missed and now double-prefixes in a different way, or a site passes a localized `next`] → `tsc` flags every un-migrated call site (the `locale` argument no longer fits the signature), and each page's guest-redirect is covered by an exact-path assertion, so a regression is a test failure rather than a silent 404.
- [Editing ~16 files owned by previously archived changes collides with concurrent work in the shared tree] → stage by explicit path and never `git add -A`; the only concurrent files in the blast radius are `PublicOpportunityDetailsPage` and `PublicLandingPage`, and both edits are single-token signature changes that must be re-read immediately before committing.
- [The `next` shape change is a behavior change for a guest who saved mid-filter and then logged in] → this is the fix, not a regression: today that guest lands on `/en/en/talents`; the exact-path plus `next`-round-trip assertion in F17's e2e pins the corrected destination.
- [Dropping `locale` is a breaking signature change for any future caller outside the repo] → not applicable: the helper is internal to this frontend, and `openspec` records it as an internal breaking change.
