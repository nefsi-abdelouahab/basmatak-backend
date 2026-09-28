## Why

Mutation- and feed-error renders show `mapToApiError(err).message`, which falls
back to hardcoded English strings (`errors.ts` `FALLBACK_BY_STATUS`) whenever
the backend envelope carries no message — so ar users see untranslated copy
with no catalog key. The F19 gate's contract holds only if user-facing copy
always resolves from a catalog.

## What Changes

- Add `backendMessageOf(err)` to `lib/api/errors.ts`: returns the backend
  envelope message when present and non-blank, else `null` (never English).
- Render sites show the backend message when present, else catalog copy:
  org-review mutation errors → new `shared.actionError`; landing feed errors →
  existing `shared.loadError`; admin resolve errors → existing
  `reports.resolveError` (helper takes the fallback instead of embedding English).
- English backend messages still display verbatim (backend-owned copy, same in
  both locales — nothing client-side can translate them).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `frontend-i18n`: "No hardcoded UI strings in JSX" now covers error-surface
  renders — user-facing error copy SHALL resolve from en+ar catalogs unless it
  is a verbatim backend message.

## Impact

- Files: `frontend/src/lib/api/errors.ts` (+helper, +unit cases), 4 screen
  files (3 org-review, 1 public landing, 1 admin reports), `messages/org-review`
  en+ar (+1 key). No endpoint, routing, or visual change.
- Tests: full `npm test`, targeted e2e (org-review, admin-moderation,
  volunteer-home feed states, public-orgs landing), gate suites stay green.
