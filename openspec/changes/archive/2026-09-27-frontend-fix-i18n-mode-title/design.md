## Context

F19 gate finding: `OpportunityDetailsPage.tsx:290` renders `<MetaItem title="Mode">`
while every sibling meta label resolves via `t('detail.*Title')`. The
`opportunityDetails` catalog holds the mode *values* but no mode *title* key.
Separately, three breadcrumb landmarks hardcode `aria-label="breadcrumb"`.
Current state otherwise complies (all `placeholder=` props already use `t()`).

## Goals / Non-Goals

**Goals:**

- Zero hardcoded UI-string attributes on the three touched screens, both locales.
- Turn the red F19 `i18n-audit` test green with no gate-file edits.

**Non-Goals:**

- Error-fallback copy catalog-ization (separate `frontend-fix-error-fallback-copy` change).
- Any visual, routing, API, or English-copy change.

## Decisions

- New `detail.modeTitle` in the `opportunityDetails` area (owns the screen) rather
  than reusing the org editor's `modeLabel`: area ownership stays disjoint per the
  section file-disjointness rule; ar value reuses the editor's established term
  (`"طريقة المشاركة"`) for cross-surface consistency.
- New `a11y.breadcrumb` in the `common` area (shared chrome vocabulary, same as
  `actions.*`); each of the three components adds `useTranslations('common')`
  alongside its existing area hook, mirroring `ForbiddenScreen`.
- English values stay byte-identical (`"Mode"` is title-case as rendered today;
  `"breadcrumb"` keeps its current lowercase landmark name) so no e2e text
  assertion changes.

## Risks / Trade-offs

- [Risk] ar wording nuance (`"طريقة المشاركة"`, `"مسار التنقل"`) → Mitigation:
  short standard terms; owner (Arabic-speaking) confirms on review, one-line fix.
- [Risk] `useTranslations('common')` adds a catalog dependency to three
  components → Mitigation: common is already loaded on every route; parity tests
  cover the new keys.
