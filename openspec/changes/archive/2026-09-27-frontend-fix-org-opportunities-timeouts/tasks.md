## 1. Timeout hardening (spec-only)

- [x] 1.1 Set `test.setTimeout(120000)` on the `org-opportunities` viewport describes
- [x] 1.2 Extend the create-publish post-create navigation and post-publish notice expects to 20s polls

## 2. Verification

- [x] 2.1 `npm run lint` green; no app files touched (`git status` shows the spec only)
- [x] 2.2 `e2e/org-opportunities.spec.ts` fully green (all viewports/locales)
- [x] 2.3 `openspec validate frontend-fix-org-opportunities-timeouts` + `--all --strict` clean
- [x] 2.4 Archive the change and commit locally (no push)
