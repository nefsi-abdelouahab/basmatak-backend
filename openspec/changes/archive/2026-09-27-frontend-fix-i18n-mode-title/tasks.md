## 1. Catalog keys

- [x] 1.1 Add `detail.modeTitle` (`"Mode"` / `"طريقة المشاركة"`) to `messages/opportunityDetails/en.json` + `ar.json`
- [x] 1.2 Add `a11y.breadcrumb` (`"breadcrumb"` / `"مسار التنقل"`) to `messages/common/en.json` + `ar.json`

## 2. Call sites

- [x] 2.1 Use `t('detail.modeTitle')` for the mode `MetaItem` in the volunteer opportunity-details page
- [x] 2.2 Wire `a11y.breadcrumb` into the three breadcrumb landmarks (volunteer opportunity details, public opportunity details, public talent profile)

## 3. Verification

- [x] 3.1 `npm run build`, `npm run lint`, `npm test` green (F19 `i18n-audit` red→green)
- [x] 3.2 Targeted e2e: `opportunity-details`, `public-orgs`, `public-talent` specs green
- [x] 3.3 `openspec validate frontend-fix-i18n-mode-title` + `openspec validate --all --strict` clean
- [x] 3.4 Archive the change and commit locally (no push)
