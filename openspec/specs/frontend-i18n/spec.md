# frontend-i18n Specification

## Purpose
TBD - created by archiving change frontend-foundation. Update Purpose after archive.
## Requirements
### Requirement: Per-area message catalogs merged by config

The system SHALL organize translations as per-area files (`messages/<area>/en.json` + `messages/<area>/ar.json`, e.g. `messages/auth/en.json`, `messages/common/en.json`) merged by the next-intl configuration — per owner decision — so that sessions own disjoint key-prefix areas and never collide in one monolithic catalog.

#### Scenario: Both locales load per-area catalogs

- **WHEN** the app boots under `locale=en` and under `locale=ar`
- **THEN** every shipped area contributes its strings in the active locale with zero missing-key errors, and each session's keys live under its declared area prefix

### Requirement: No hardcoded UI strings in JSX

The system SHALL render no hardcoded user-facing string in JSX — all copy resolves through next-intl keys present in both `en` and `ar` catalogs — per mandate I18N (roadmap §2.2).

#### Scenario: Catalog coverage check

- **WHEN** the key-coverage audit runs over route and component sources
- **THEN** every user-facing literal is backed by an en+ar key pair, and any hardcoded JSX string fails the session

### Requirement: RTL correctness at locale=ar

The system SHALL mirror layout at `locale=ar` via logical CSS properties with the Arabic font swap, so that en↔ar locale switching mirrors the shell and system screens without overlap or clipping.

#### Scenario: Locale switch mirrors layout

- **WHEN** a Playwright test switches locale en↔ar on the shell and a system screen at viewports 1440/1100/390
- **THEN** layout mirrors (start/end flip), Arabic type renders in the Arabic font, and no horizontal overflow occurs

### Requirement: Locale-less path contract for navigation helpers

The system SHALL treat every path passed to the locale-aware navigation APIs exported by `src/i18n/navigation.ts` (next-intl `createNavigation` with `localePrefix: 'always'`) as locale-less, and the shared guest-redirect helper `getLoginHref` SHALL return such a path. `getLoginHref` SHALL NOT accept a locale parameter and SHALL NOT embed a locale prefix in its return value, so that no caller can construct a double-prefixed path such as `/en/en/login`.

#### Scenario: Guest authed-action redirect reaches a single-prefixed login route

- **WHEN** a guest triggers an authed action (saving a favorite, applying, submitting) on any page
- **THEN** the redirect target's pathname is exactly `/{locale}/login` with no repeated locale segment

#### Scenario: Helper output is a valid input to the locale-aware router

- **WHEN** a caller passes the value returned by `getLoginHref` to `router.push` or `router.replace` from `@/i18n/navigation`
- **THEN** the resulting browser pathname is `/{locale}/login`, never `/{locale}/{locale}/login`

### Requirement: Guest-continue `next` values are locale-less and round-trip exactly

A `next` value carried through `getLoginHref` SHALL be a locale-less same-origin path (leading `/`, not `//`), matching `usePathname()` output and the locale-less `ROLE_HOME` defaults, so that the post-login navigation `router.push(resolvePostLoginTarget(role, next))` on the locale-aware router does not re-prefix it. A caller that constructs `next` from a literal rather than from `usePathname()` SHALL use the locale-less form.

#### Scenario: Guest returns to the originating view after authenticating

- **WHEN** a guest is redirected to login with `?next=` and then authenticates successfully
- **THEN** the browser lands on the same locale-less path it came from, with its query string preserved and no duplicated locale segment

#### Scenario: `next` query string is preserved through the login hop

- **WHEN** the originating view carries filter state, for example `?sort=newest&portfolio=true`
- **THEN** the decoded `next` returned to the post-login navigation still carries both parameters with their values

### Requirement: Exact-path assertions for guest redirects

Guest-redirect assertions SHALL compare the login route's exact pathname, via a single shared test helper, and SHALL NOT rely on a substring match against a localized login path. A substring assertion SHALL NOT be used, because a double-prefixed path such as `/en/en/login` contains `/en/login` and would pass while the route does not exist.

#### Scenario: Double-prefixed regression fails the suite

- **WHEN** a change causes a guest redirect to resolve to `/{locale}/{locale}/login`
- **THEN** the shared exact-path assertion fails for that spec

#### Scenario: Multiple specs share one assertion of the invariant

- **WHEN** more than one spec asserts the guest redirect
- **THEN** each delegates to the same shared helper rather than re-deriving the expected path inline

