## Context

`volunteer_experiences` rows exist only post-verify and every surface already returns the enriched shape (Session 15: `toEnrichedExperience` assembler in `backend/src/verifications/experience-enrichment.ts`, org `{ id, slug, nameFr, nameAr }`, `verifiedAt`, `verificationCode`, `EXP-` registryId, real `duration`, neutral `review`). Volunteer identity resolves via `volunteer_profiles` (`fullName = firstName + lastName`, Session 9; `VOL-` registryId, Session 1). What is missing is the downloadable artifact every one of RP §1.3#2, §1.6#2, §1.7#1, §2.7#10 resolves to **BB**. `backend/package.json` has no PDF library (`csv-stringify` is the only streaming-export dep). No `backend/src/assets/` font exists. S6 peers (`org-dashboard` on participations/organizations, `favorites` new module) are disjoint from the verifications dir, which is this session's per roadmap §3.

## Goals / Non-Goals

**Goals:**
- `GET /experiences/:experienceId/attestation` streaming a neutral, professional "Certificate of Verified Experience" built strictly from already-stored fields plus read-only label lookups.
- In-process generation with zero disk writes; unit-testable generator decoupled from HTTP.
- `?lang=ar|en` plumbing (default `en`, matching the platform UI language convention) with Arabic-script fidelity explicitly deferred as a flagged TODO, not silently half-built.

**Non-Goals:**
- Transcripts/bundles, emailed PDFs, watermarking/tamper-proofing, opportunity-statistics PDF (RP §2.2#5, explicitly out), frontend button, any schema/collection change, any edit to archived-owned route/service files without explicit approval.

## Decisions

- **`pdfkit` (+ `@types/pdfkit`), per roadmap stack + session package line.** `package.json` was checked first: no PDF lib is present, so this is a new (minimal, pure-JS, no native deps) dependency. Alternative (`pdf-lib`) rejected: its build-then-serialize model fits editing existing PDFs, while `pdfkit`'s streamable document fits "pipe to response, never touch disk".
- **New `backend/src/verifications/attestation/` directory** (controller, service, pure generator, DTO) — new files only. Reuses (imports, never edits) the Session 15 assembler path for the enriched experience, plus lean read-only lookups: `volunteer_profiles` (fullName + `VOL-`), `organizations` (name/slug + `ORG-`), opportunity + position (title + deliverables), `skills` (names, ids fallback). Keeps the S6 file-disjointness promise and avoids touching `experiences.controller.ts` / `experiences.service.ts` (archived-owned).
- **Generator takes data, returns a `PDFDocument` stream; controller pipes it** with `application/pdf` + `Content-Disposition: attachment; filename="attestation-<EXP-registryId>.pdf"`. E2E asserts headers + non-empty bytes + no disk artifact (directory snapshot); unit tests feed the pure generator and assert extracted text fields.
- **Platform name header** reads the Session 13 `system_settings` `platform.name` key (read-only), falling back to the canonical `SETTING_DEFAULTS['platform.name']` — no invented literal.
- **Access rule follows the roadmap session (owner volunteer, verifying org, admin; stranger `403`, unknown `404`, guest `401`)** — owner-approved at the Phase 1 gate (wider than the RP Part 7 "Auth/owner" cell).

## Risks / Trade-offs

- [Registration touches archived-owned `verifications.module.ts` (last edited by Session 15)] → Mitigation: registration-line-only edit **owner-approved** at the Phase 1 gate; no other archived file is touched.
- [pdfkit has no Arabic glyph shaping (RTL joining) and built-in fonts are Latin-only] → Mitigation: per owner decision, English is the default/fallback content language; `lang=ar` serves the same layout/labels, and full Arabic fidelity (Amiri/Noto Sans Arabic TTF under `backend/src/assets/fonts/` + reshaping/bidi support) is a flagged TODO recorded in tasks.md and NOT built here. No silent broken-Arabic ship.
- [PDF text-extraction assertions in tests] → Mitigation: keep certificate text-based (no rasterized text), so unit tests extract and assert field presence/absence of civic tokens.
- [S6 peers in flight] → Mitigation: disjoint dirs (verifications vs participations/organizations vs favorites); no shared-file edits; single OpenSpec worker in this tree.

## Migration Plan

Additive only: `npm i pdfkit` + `npm i -D @types/pdfkit`, new module files, one approved registration line. No schema/index/env changes. Rollback: unregister the controller route and uninstall — stored data untouched.

## Open Questions

Resolved at the Phase 1 gate (owner answers): (1) registration-line-only edit to `verifications.module.ts` APPROVED; (2) wider access rule (owner + verifying org + admin) APPROVED; (3) English default/fallback, Arabic fidelity deferred as flagged TODO — recorded in tasks.md, not built; (4) skills-as-names (ids fallback) and canonical settings fallback APPROVED. None outstanding.
