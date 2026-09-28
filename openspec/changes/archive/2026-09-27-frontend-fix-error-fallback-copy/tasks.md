## 1. Helper + unit tests

- [x] 1.1 Add `backendMessageOf(err)` to `src/lib/api/errors.ts` (+ unit cases in `errors.test.ts`)

## 2. Catalog + call sites

- [x] 2.1 Add `shared.actionError` to `messages/org-review/en.json` + `ar.json`
- [x] 2.2 Rewire 5 org-review mutation-error renders to `backendMessageOf(err) ?? t('shared.actionError')`
- [x] 2.3 Rewire 2 landing feed-error renders to `backendMessageOf(err) ?? t('shared.loadError')` (removes dead `||`)
- [x] 2.4 Rewire admin `errorMessageOf` to take the `reports.resolveError` fallback

## 3. Verification

- [x] 3.1 `npm run build`, `npm run lint`, `npm test` green
- [x] 3.2 Targeted e2e: `org-review`, `admin-moderation`, `public-orgs`, `volunteer-home` green
- [x] 3.3 `openspec validate frontend-fix-error-fallback-copy` + `--all --strict` clean
- [x] 3.4 Archive the change and commit locally (no push)
