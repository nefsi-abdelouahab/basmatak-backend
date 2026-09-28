## 1. Implementation

- [x] 1.1 Add `src/common/cors/cors-options.ts` (`parseCorsOrigins`, `buildCorsOptions`) + `cors-options.spec.ts` unit tests
- [x] 1.2 Wire `main.ts` to the builder + log effective allowlist at startup
- [x] 1.3 Set local `backend/.env` `CORS_ORIGIN=http://localhost:3000`; document explicit-list rule in `.env.example`

## 2. Verification

- [x] 2.1 `npm run build`, `npm run lint`, `npx jest cors-options` green
- [x] 2.2 Live `curl.exe` OPTIONS proof from the local server: listed origin gets `Allow-Origin` + methods/headers/expose; unlisted origin gets none
- [x] 2.3 `openspec validate backend-v2-fix-cors-allowlist` + `--all --strict` clean
- [x] 2.4 Archive the change and commit locally (no push)
