## Context

The create-publish test does ~15 sequential async steps (12 field fills +
wilaya/municipality cascade + cover 2-step upload + position add + create POST
+ locale navigation + lifecycle publish + notice). Under `fullyParallel: true`
with 4 workers on one dev server, the default 5s expect windows and 30s test
ceiling are marginal: observed 1/997 and 4/6 failures, all on the final steps,
all passing on immediate re-run. The submit-contribution spec (same shape)
sets `test.setTimeout(120000)` with a "loaded shared dev servers are slow"
comment and never flakes.

## Goals / Non-Goals

**Goals:**

- Remove the load-sensitive windows; keep every assertion identical.

**Non-Goals:**

- App-code, mock, fixture, or assertion-text changes; touching any other spec.

## Decisions

- Mirror the submit spec exactly: `test.setTimeout(120000)` on the viewport
  describes + `{ timeout: 20000 }` on the two post-mutation expects
  (`toHaveURL` after create, `toContainText` on the publish notice). Proven
  pattern, reviewer-familiar, minimal diff.
- Per-test ceiling raise is scoped to this file's describes (not global
  config): the flake evidence is specific to this flow's length.

## Risks / Trade-offs

- [Risk] Longer ceilings can mask a real hang → Mitigation: windows stay
  bounded (120s/20s); a true hang still fails loudly with traces retained.
