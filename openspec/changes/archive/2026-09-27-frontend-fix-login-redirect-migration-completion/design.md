## Context

The archived fix change established the locale-less contract (`getLoginHref(next?)` → `/login?next=…`, `next` locale-less per `usePathname()` semantics) and migrated all signatures, but left 32 literal-built `next` values prefixed. F18's verification proved the resulting 6 exact-path failures are deterministic and pre-existing relative to F18. No other session is active; the tree is settled at the fix commit plus F18.

## Goals / Non-Goals

**Goals:**
- Normalize all 32 literals (26 guard props + 6 client literals) to locale-less form; prove 0 e2e failures project-wide.

**Non-Goals:**
- Any helper/signature/copy/styling change; any edit beyond the one-line literals; reopening the archived fix change.

## Decisions

- **Literal-strip only, no refactoring.** Each edit removes the `/${locale}` interpolation prefix and nothing else (e.g., `` `/${locale}/admin/volunteers` `` → `` `/admin/volunteers` ``). Rationale: the values' paths are otherwise correct and covered by existing tests; any wider cleanup risks behavior drift in archived files. Alternative (central `stripLocale` helper) rejected — 32 static literals need no runtime helper.
- **Keep `locale` props/params untouched.** Guard components still receive `locale` for their own rendering; only the `next` argument changes. Alternative (removing now-unused `locale` where applicable) rejected — would widen the diff into archived component signatures for zero behavioral gain; `tsc`/`lint` will flag any genuinely unused binding.
- **Full-suite proof in chunks.** The machine cannot run 20 spec files in one invocation; run sequential chunks on the settled tree and require 0 failures in every chunk (rerunning any chunk that shows load flakes in isolation to classify).

## Risks / Trade-offs

- [Risk] A literal is load-bearing with its prefix somewhere unexpected (e.g., compared as a string in a test) → Mitigation: exact-path e2e assertions plus full-suite run; any failure is investigated, never force-fixed.
- [Risk] `locale` becomes unused in an edited file → Mitigation: build + lint gate catches it; fix is to leave the destructure (no signature change).

## Migration Plan

None (no API/data change). Rollback = revert the single fix commit. Archive after 0-failure proof.

## Open Questions

None.
