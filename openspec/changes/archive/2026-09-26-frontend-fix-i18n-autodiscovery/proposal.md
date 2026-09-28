## Why

Every frontend session must hand-edit `src/i18n/request.ts` (two imports + two catalog entries + a comment line) to merge its message catalogs. Across 19 sessions this serializes parallel work onto one shared file, invites merge conflicts, and a forgotten wiring fails silently as missing strings at runtime.

## What Changes

- Replace the manual per-area imports and spreads in `src/i18n/request.ts` with build-time auto-discovery: a webpack `require.context` over `messages/*/{en,ar}.json`, merged into the next-intl catalog automatically.
- Area key is derived from the directory name via kebab-to-camelCase (`volunteer-account` becomes `volunteerAccount`), reproducing all 10 currently merged keys exactly — zero component or catalog changes.
- Loader fails fast with a descriptive error when an area ships an unpaired locale file (en without ar or vice versa).
- `MessageArea` becomes `string` (it is exported but consumed nowhere else; no `IntlMessages` augmentation exists).
- Add a structural vitest (`src/i18n/catalog-discovery.test.ts`, fs-based, framework-agnostic) asserting every `messages/*/` directory carries both locale files with unique derived keys.

## Capabilities

### New Capabilities
- None (mechanism change only; no new user-facing behavior).

### Modified Capabilities
- `frontend-i18n`: catalog merge moves from manual per-session wiring to automatic build-time discovery; per-area ownership and en+ar parity contracts are unchanged.

## Impact

- Frontend-only: `src/i18n/request.ts` (F0-owned, archived — hence this `frontend-fix-*` change per the never-reopen-archived rule) plus one new test file. No route, hook, api-module, or catalog content edits.
- After this change no future session touches `request.ts`: shipping `messages/<area>/{en,ar}.json` is sufficient for both locales.
