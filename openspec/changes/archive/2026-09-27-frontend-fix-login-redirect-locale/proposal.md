## Why

`getLoginHref` returns a locale-prefixed path (`/{locale}/login`), but every consumer navigates with the locale-aware router from `@/i18n/navigation` (next-intl `createNavigation`, `localePrefix: 'always'`), which prepends the locale itself. Every guest authed-action redirect therefore lands on `/en/en/login`, a path that does not exist. F17 surfaced it because its e2e asserts the exact pathname; the pre-existing F4/F5 assertions use `toContain('/en/login')`, and `/en/en/login` *contains* that substring, so the defect shipped masked in every earlier session.

The same mismatch exists in the `next` value: post-login navigation calls `router.push(resolvePostLoginTarget(role, next))` with that same locale-aware router, so a locale-prefixed `next` double-prefixes a second time after a successful login. The codebase convention is unambiguously locale-less paths for navigation (`usePathname()` returns locale-less, `ROLE_HOME` is locale-less, and F1's own `CompleteProfileForm` already does `router.replace('/login')`), so the helper — not its callers — is the defect.

## What Changes

- **BREAKING (internal helper signature):** `getLoginHref(next?: string)` drops its `locale` parameter and returns the locale-less `/login?next=<encoded>`. The single shared helper is the root-cause fix; the alternative (keep the localized form for anchors and add a second router-safe helper) would leave the footgun in place for the next session.
- Migrate all existing call sites to the new signature. Every one of them already passes the result to a locale-aware router, so each becomes correct purely by the shared fix — no per-site path surgery.
- Normalize `next` values to locale-less paths at the sites that build them from a literal (F17's profile/directory pages, and the `/${locale}/opportunities/...` fallbacks), so the post-login `router.push(next)` does not double-prefix.
- Revert F17's `window.location.assign` workaround to the shared helper on the locale-aware router. This is now required, not optional: after the fix the helper returns a locale-less path, which `window.location.assign` would follow without a locale and 404.
- Tighten the F4/F5 guest-redirect assertions from `toContain('/en/login')` to an exact pathname match, and add a shared exact-match helper so the class of bug cannot hide behind a substring assertion again.
- Update the `loginHrefForSave` unit expectations in `src/hooks/useFavorites.test.ts` to the new contract, and add cases for the `next` encoding and the no-`next` case.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `frontend-i18n`: the guest authed-action redirect target is specified as a locale-less `/login?next=…` path consumed by the locale-aware router, with an exact-path requirement; the existing requirement text is silent on the locale-prefix interaction, which is why the defect was possible.

## Impact

- Shared helper: `frontend/src/hooks/useSession.ts` (`getLoginHref`).
- Shared wrapper: `frontend/src/hooks/useFavorites.ts` (`loginHrefForSave`) and its unit test.
- Call sites (mechanical signature migration only, no behavior authored here): `RequireAdminManage`, `AdminModerationGuard`, `AdminDashboardPage`, `OrgDashboardPage`, `OrgExperiencesPage`, `OrgOpportunitiesPage`, `OpportunityDetailsPage`, `OpportunityCard`, `TalentCard`, `SubmitContributionPage`, `components.tsx` (admin/org/public guards), `PublicOpportunityDetailsPage`, `PublicLandingPage`, `PublicTalentProfilePage`, `PublicTalentCard`.
- Tests tightened: `e2e/volunteer-home.spec.ts`, `e2e/admin-manage.spec.ts`, `e2e/public-talent.spec.ts`.
- No backend, no API contract, no new dependency, no archived change reopened. F17's change stays archived; this change corrects the shared helper it depends on.
