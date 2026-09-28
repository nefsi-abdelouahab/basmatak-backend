## Context

`mapToApiError` guarantees a non-empty English `message` (backend message or
`FALLBACK_BY_STATUS`), so render sites using `.message` can never show catalog
copy — and two landing sites carry a dead `|| t('shared.loadError')` fallback
that can never fire. Eight render sites are affected (5 org-review mutations,
2 landing feeds, 1 admin resolve helper).

## Goals / Non-Goals

**Goals:**

- No hardcoded English in any user-facing error render when the backend is
  silent; backend messages keep displaying verbatim.
- Smallest possible diff: one helper, one new key pair, site rewires.

**Non-Goals:**

- Translating backend messages client-side (impossible); backend localization.
- Removing `FALLBACK_BY_STATUS` (still needed for programmatic `message`).

## Decisions

- `backendMessageOf(err): string | null` in `errors.ts` (axios-envelope check,
  blank-safe) over extending `ApiError`: keeps the mapped shape untouched and
  stays unit-testable without component harnesses.
- New `orgReview/shared.actionError` (`"This action could not be completed.
  Please try again."`) rather than reusing `loadError`: failed actions are not
  failed loads; wrong semantics would confuse both locales.
- Landing reuses existing `shared.loadError`; admin reuses existing
  `reports.resolveError` — no new keys where semantics already fit.
- `errorMessageOf` takes the fallback as a parameter (module scope has no `t()`).

## Risks / Trade-offs

- [Risk] Backend English still shows when the envelope has a message → Accepted:
  backend-owned specificity; documented in the spec scenario.
- [Risk] ar wording nuance for the new key → Mitigation: short standard MSA;
  owner confirms on review.
