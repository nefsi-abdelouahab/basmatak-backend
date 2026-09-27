## Why

The archived `frontend-fix-login-redirect-locale` converted `getLoginHref` to the locale-less contract and migrated call signatures, but 32 `next` values built from locale-prefixed literals (`` `/${locale}/…` ``) were left unmigrated. Every guest redirect from those 32 sites still lands on a double-prefixed path, and the tightened exact-path assertions now fail project-wide (6 known: admin-manage guest-redirect ×3, volunteer-home guest-Save ×3).

## What Changes

- Mechanical literal normalization only: strip the `/${locale}` prefix from 26 guard `next` props and 6 client-page `next` literals, yielding locale-less paths consumed by the locale-aware router. No signature, behavior, copy, or styling change; no new helper.
- Covers admin (6 guard props + dashboard literal), volunteer (10 guard props + talents/feed/details/submit literals), and org (10 guard props + dashboard literal) surfaces.
- Out of scope: the helper itself, `loginHrefForSave`, e2e helper, specs beyond the completion note below; F18/F17 public surfaces already conform (verified by grep, no-ops).

## Capabilities

### New Capabilities
- `login-redirect-migration-completion`: pin the completed 32-site normalization and the 0-failure e2e proof.

### Modified Capabilities
- None (implements the already-specified `frontend-i18n` locale-less requirement verbatim; no requirement text changes).

## Impact

- Frontend-only, `/frontend`: 32 one-line literal edits across admin/volunteer/org route files (all owned by archived sessions — this follow-up is the owner-authorized completion; no other change to those files).
- Depends on archived `frontend-fix-login-redirect-locale` (contract + helper + exact-path assertions, consumed as-is).
- E2E proof: full suite to 0 failures before archive/commit.
