## 1. Refactor (THEME untouched; I18N mandate: identical catalogs, no hardcoded strings)

- [x] 1.1 Rewrite `src/i18n/request.ts`: single `require.context` over `messages/` collecting `./<area>/{en,ar}.json`, kebab-to-camelCase area keys, fail-fast throw on unpaired locale files, `MessageArea` widened to `string`; remove all per-area imports, spreads, and per-session comment lines.
- [x] 1.2 Add `src/i18n/catalog-discovery.test.ts` (fs-based): every `messages/*/` directory carries `en.json` + `ar.json`; derived keys unique; derived key set covers the 10 shipped areas.

## 2. Verify (zero visual/behavior change; viewports 1440/1100/390, locales en+ar)

- [x] 2.1 `npx tsc --noEmit` clean on touched files; `npm run lint` clean.
- [x] 2.2 `npm run build` green.
- [x] 2.3 Full `npm test` green (incl. the new structural test + all existing parity tests).
- [x] 2.4 E2E render specs for all 7 named areas green in en+ar: auth, volunteer-home, opportunity-details, volunteer-tasks, submit-contribution, volunteer-credentials, org-onboarding.

## 3. Archive + commit

- [x] 3.1 `openspec validate frontend-fix-i18n-autodiscovery` clean; archive with `openspec archive frontend-fix-i18n-autodiscovery -y`.
- [x] 3.2 Stage only the fix files; local commit (never push).
