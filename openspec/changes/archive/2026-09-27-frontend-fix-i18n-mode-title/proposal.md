## Why

The F19 reconciliation gate (`src/gate/i18n-audit.test.ts`, committed as `5df33a3`) fails on one genuine violation: the volunteer opportunity-details screen renders a hardcoded English `title="Mode"` with no catalog backing, so the ar locale leaks English. Three breadcrumb landmarks carry the same class of hardcoded `aria-label`. Both breach mandate I18N (roadmap §2.2: no hardcoded UI strings in JSX).

## What Changes

- Add `detail.modeTitle` (`"Mode"` / ar `"طريقة المشاركة"`, matching the org editor's existing mode term) to `messages/opportunityDetails/en.json` + `ar.json`, and use it for the mode `MetaItem` in the volunteer opportunity-details page.
- Add `a11y.breadcrumb` (`"breadcrumb"` / ar `"مسار التنقل"`) to `messages/common/en.json` + `ar.json`, and wire it into the three breadcrumb `<nav>` landmarks (volunteer opportunity details, public opportunity details, public talent profile).
- No visual, routing, or API change; English strings stay byte-identical.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `frontend-i18n`: the "No hardcoded UI strings in JSX" requirement is extended to UI-string attributes including ARIA landmark labels (delta spec pins the two new keys and the zero-literal rule).

## Impact

- Files: `frontend/src/messages/opportunityDetails/{en,ar}.json`, `frontend/src/messages/common/{en,ar}.json`, one `MetaItem` call site, three `aria-label` call sites.
- Tests: F19 `i18n-audit` goes green; affected e2e specs re-run (opportunity-details, public-orgs, public-talent).
- No backend, no archived-change edits, no push.
