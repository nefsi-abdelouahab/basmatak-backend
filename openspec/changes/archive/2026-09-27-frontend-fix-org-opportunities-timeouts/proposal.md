## Why

The F10 `create with all v2 fields then publish` e2e fails nondeterministically
under parallel-worker load (1 failure in a 997-test full run; 4 in one isolated
6-test run; clean solo and in two repeat parallel runs). Investigation showed a
test-timing problem, not an app bug: the suite's default 30s test ceiling and
5s expect windows are marginal for this 12-field + cover-upload + position +
create + navigate + publish flow when the shared dev server is loaded. The
equally long submit-contribution flow never flakes because it sets
`test.setTimeout(120000)` plus extended waits.

## What Changes

- Spec-only: set a 120s ceiling on the `org-opportunities` viewport describes
  and extend the two load-sensitive expects in the create-publish test
  (post-create navigation, post-publish notice) to 20s polls.
- No app code, no mock, no assertion-text change; pass criteria are unchanged.

## Capabilities

### New Capabilities

- None (test infrastructure only; no user-facing behavior).

### Modified Capabilities

- None (no requirement changes; the suite asserts the same behavior with
  load-tolerant windows).

## Impact

- One file: `frontend/e2e/org-opportunities.spec.ts`. No route, hook,
  api-module, component, or catalog edits. No backend.
