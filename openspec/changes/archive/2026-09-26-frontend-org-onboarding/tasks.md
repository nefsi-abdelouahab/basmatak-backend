## 1. API layer (`lib/api/organizations.ts`)

- [x] 1.1 Add typed functions `getOwnOrganization`, `updateOwnOrganization`, `getProfileCompletion`, `deleteOwnOrganization`, `submitOrganizationVerification({documents})`, `getOrganizationVerificationStatus` (axios instance only, no ad-hoc fetch)
- [x] 1.2 Add typed location functions `listWilayas`, `listMunicipalities(wilayaId)` and 2-step upload functions `createMediaUpload` (purposes `verification_document` / `organization_cover`) + `confirmMediaUpload` reusing the F0 upload path
- [x] 1.3 Map error codes `EMAIL_NOT_VERIFIED` (403), `ORG_ALREADY_VERIFIED` (409), `INVALID_LOCATION` (400), 429/503 to the unified error shape

## 2. Hooks (`hooks/useOrgOnboarding.ts`)

- [x] 2.1 Add TanStack Query hooks for org read, profile-completion read, PATCH mutation, delete mutation, verification status read + submit mutation with query-key factory entries
- [x] 2.2 Add completion-checklist display mapping (percent + missing keys verbatim from response) and wilaya→municipality select chaining
- [x] 2.3 Add per-file upload-progress state machine (queued → uploading → confirming → confirmed → failed) with client-side ≤5 MB jpeg/png/webp/pdf validation
- [x] 2.4 Add email-gate logic: unverified account or 403 `EMAIL_NOT_VERIFIED` redirects to F1 Email Verification with return CTA

## 3. Routes (`app/[locale]/org/`)

- [x] 3.1 Build `complete-profile` screen: fact form (no statute/legal fields), phone `/^\+?[0-9]{8,15}$/` + website validation, cover upload, checklist display, delete-own behind confirm (tokens only, `components/ui/*` only)
- [x] 3.2 Build `verification-dossier` screen: generic document list, progress, submit, rejected→resubmit with `rejectionReason`, `ORG-<registryId>` display
- [x] 3.3 Build post-registration "Pending review" state with `ORG-<registryId>` and verify-email + dossier CTAs
- [x] 3.4 Wire responsive layouts at 1440/1100/390 and RTL mirroring at `locale=ar`

## 4. i18n + tests

- [x] 4.1 Add `orgOnboarding` keys to `messages/en.json` + `messages/ar.json` (neutral copy; no civic/registry/seal wording); no hardcoded JSX strings
- [x] 4.2 Unit tests: checklist display mapping, phone/website validation, status-machine mapping (`pending → verified | rejected → pending`), gate-redirect logic
- [x] 4.3 E2E: complete-profile PATCH → checklist 100%; dossier upload→confirm→submit→pending; rejected→resubmit; unverified-email CTA; 3 viewports; en+ar

## 5. Verification + archive

- [x] 5.1 From `/frontend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`
- [ ] 5.2 From repo root: `openspec validate frontend-org-onboarding`; archive with `openspec archive frontend-org-onboarding -y`
