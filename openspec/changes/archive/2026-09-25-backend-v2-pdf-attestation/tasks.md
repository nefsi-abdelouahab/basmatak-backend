## 1. Dependency + module skeleton (new files only)

- [x] 1.1 Add `pdfkit` + `@types/pdfkit` (dev) to `backend/package.json` (no PDF lib present today); verify `npm install` succeeds offline-clean
- [x] 1.2 Create `backend/src/verifications/attestation/` with controller, service, pure generator, and `AttestationQueryDto` (`lang?: ar|en`, whitelist + `forbidNonWhitelisted`); no edits to any existing file in this step

## 2. Data assembly (read-only reuse)

- [x] 2.1 Assemble certificate data by importing (not editing) the Session 15 enriched-experience path plus lean lookups: `volunteer_profiles` (fullName + `VOL-`), `organizations` (display name/slug + `ORG-`), opportunity + position (title + deliverables), `skills` (names per `lang`, ids fallback), platform name from `system_settings` `platform.name` (canonical `SETTING_DEFAULTS` fallback when unset); zero writes

## 3. Generator + route

- [x] 3.1 Implement the pure pdfkit generator (data in → `PDFDocument` stream out): neutral professional layout in English — platform name, volunteer name + `VOL-`, experience title/description, org display name/slug + `ORG-`, position/deliverables, duration, verified date, `EXP-` reference number, `verificationCode`, "Verified by \<org> on \<date> — code: …" line; `lang=ar` selects Arabic string variants where available (Latin-script labels served as-is; no shaping built)
- [x] 3.2 Implement `GET /experiences/:experienceId/attestation` (owner volunteer, verifying org, admin; guest `401`, stranger `403`, unknown id `404`, bad `lang` `400`) piping the generator to the response with `application/pdf` + `Content-Disposition: attachment; filename="attestation-<EXP-registryId>.pdf"`, never touching disk
- [x] 3.3 Register controller + provider in `backend/src/verifications/verifications.module.ts` — registration-line-only edit, owner-approved at Phase 1 gate (archived-owned file; no other archived file touched)
- [x] 3.4 Record the deferred Arabic-fidelity TODO in a code comment at the generator's font site (Amiri/Noto Sans Arabic TTF under `backend/src/assets/fonts/` + reshaping/bidi support needed later) — document only, do NOT build

## 4. Tests

- [x] 4.1 Unit: generator text assertions (all real fields present; civic tokens `Civic/Sovereign/Ledger/Statute/Accredited/DZ-/ALG-/TCA-/SHA-256` absent); access-rule matrix (owner/org/admin allow, stranger deny, guest deny)
- [x] 4.2 E2E: verify → download attestation → `200 application/pdf`, non-empty bytes, correct headers/filename; no disk artifact (directory snapshot); stranger `403`; unknown id `404`; bad `lang` `400`

## 5. Verification

- [x] 5.1 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`, then `openspec validate backend-v2-pdf-attestation` from repo root
