## 1. Root-cause fix in the shared helper

- [x] 1.1 Change `getLoginHref(next?: string)` in `src/hooks/useSession.ts` to return the locale-less `/login`, keeping the `encodeURIComponent(next)` query and the no-`next` case, and remove the `locale` parameter so the double-prefixed string is unconstructible. Update the comment to state the locale-less contract and name `@/i18n/navigation` as the reason.
- [x] 1.2 Update `loginHrefForSave` in `src/hooks/useFavorites.ts` to delegate to the new signature (wrapper retained; no re-wrapping or behavior change) and update its comment.
- [x] 1.3 Update `src/hooks/useFavorites.test.ts` to the locale-less contract and add cases for a `next` carrying a query string and for the omitted-`next` case.

## 2. Call-site migration (mechanical, compiler-checked)

- [x] 2.1 Migrate every `getLoginHref(locale, next)` call to `getLoginHref(next)`: the admin guards (`RequireAdminManage`, `AdminModerationGuard`, `AdminDashboardPage`), the org pages (`OrgDashboardPage`, `OrgExperiencesPage`, `OrgOpportunitiesPage`), the volunteer surfaces (`OpportunityDetailsPage`, `OpportunityCard`, `TalentCard`, `SubmitContributionPage`), the `components.tsx` guards, and the public surfaces (`PublicOpportunityDetailsPage`, `PublicLandingPage`, `PublicTalentProfilePage`, `PublicTalentCard`). No site may change which navigation API it calls.
- [x] 2.2 Normalize every `next` value that is built from a literal to the locale-less form: F17's `PublicTalentProfilePage` (`/volunteers/{username}`), F17's `PublicTalentsPage` (`/talents` plus the active filter query string), and the `PublicOpportunityDetailsPage` fallbacks (`` /opportunities/${idOrSlug} ``). Sites already using `usePathname()` are unchanged.
- [x] 2.3 Revert F17's `window.location.assign` workaround in `PublicTalentProfilePage` and `PublicTalentCard` to the locale-aware router plus the shared helper, keeping a shortened comment recording the double-prefix invariant, and drop the now-unused `window` navigation.
- [x] 2.4 Confirm no call site remains on the old signature, that the `locale` import is still used wherever it is imported, and that `npx tsc --noEmit` reports no new diagnostics for these files.

## 3. Lock the invariant with exact-path assertions

- [x] 3.1 Add one shared e2e helper that asserts the guest redirect's exact pathname (`new URL(page.url()).pathname === '/${locale}/login'`) and, when a `next` is expected, that the decoded `next` round-trips to the expected locale-less path with its parameters intact.
- [x] 3.2 Replace the substring assertions with it: `e2e/volunteer-home.spec.ts` (guest Save on the opportunity feed) and `e2e/admin-manage.spec.ts` (session-expiry redirect). No `toContain('/…/login')` guest-redirect assertion may remain.
- [x] 3.3 Point F17's two guest-save tests (profile and directory card) at the shared helper so the same invariant is asserted once, and keep F17's existing `next` filter-preservation assertions intact.

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit` and confirm no new diagnostics in the touched files (pre-existing baseline in `auth.test.ts`, `portfolio.test.ts`, `volunteer-credentials.spec.ts` is out of scope).
- [x] 4.2 Run the unit suites covering the helper and the touched pages, and `npx next lint` scoped to the touched files.
- [ ] 4.3 Run the affected e2e specs (`volunteer-home`, `admin-manage`, `public-talent`) and confirm the guest-redirect assertions now pass on the corrected single-prefixed path, including the post-login destination. Blocked: the shared `.next` cache is corrupted by a concurrent build from the `frontend-public-orgs` work (`Cannot find module './vendor-chunks/next.js'`, `/en` returning 500), and `next start` cannot be used because `npm run build` fails on that same foreign work (`orgDisplayCode` undefined). Needs a decision on clearing `.next`.
- [x] 4.4 Confirm file-disjointness: no edit to `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts`, the Login page, `isSafeNextPath`/`resolvePostLoginTarget`/`ROLE_HOME`, `src/lib/query/keys.ts`, `components/ui/*`, `src/theme`, `/backend`, or any archived change artifact.
