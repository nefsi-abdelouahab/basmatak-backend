## Why

Verified experiences are the volunteer's portable proof of work, yet there is no downloadable artifact: RP §1.3#2, §1.6#2, §1.7#1 and §2.7#10 all resolve "Download attestation (PDF)" to **BB** (pdf-attestation), and RP Part 5 keeps "Download Attestation stays, BB". Session 15 already enriched every experience payload (org identity, `verifiedAt`, `verificationCode`, `EXP-` registryId, real duration) — this session renders those real fields as a streamed, neutral "Certificate of Verified Experience" (no civic wording, no seals).

## What Changes

- New `GET /experiences/:experienceId/attestation` (Auth; exact RP Part 7 name — no `.pdf` suffix) streaming an in-process-generated PDF (`Content-Disposition: attachment`, `application/pdf`, never written to disk — Render free has no persistent disk).
- Certificate content pulled strictly from the already-enriched experience payload: volunteer full name + `VOL-` registryId, experience title, organization name/slug + `ORG-` registryId, position/deliverables summary, `durationMinutes`, verified date, `verificationCode` + neutral "Verified by \<org> on \<date> — code: …" line. No new stored fields.
- New `pdfkit` (+ `@types/pdfkit`) dependency — `backend/package.json` currently has no PDF library (`csv-stringify` is the only streaming export dep, from Session 10).
- Optional `?lang=ar|en` (default `en`, platform UI convention); Arabic-script fidelity deferred as flagged TODO.
- Access: owning volunteer, the verifying org, or admin (roadmap Session 18 rule, owner-approved — wider than RP Part 7's "Auth/owner" cell); strangers `403`; unknown id `404`.

## Capabilities

### New Capabilities
- `attestation`: streamed verified-experience attestation PDF (route, access rule, PDF content/layout, streaming headers, no-disk guarantee).

### Modified Capabilities
- None (no existing requirement changes — existing experience routes, schemas, and payloads are read-only inputs; no behavior change to any archived capability).

## Impact

- Code: new files under `backend/src/verifications/attestation/` (controller, service, pdfkit generator, DTO) + `pdfkit` dependency. S6 file-disjointness holds (verifications dir is this session's; peers own participations/organizations and favorites).
- **Ownership flag (critical rule):** registering the new controller requires a registration-line edit in `verifications.module.ts` (last touched by archived Session 15) — owner-approved at the Phase 1 gate; no other archived file is edited.
- Out of scope: transcripts/bundles, emailed PDFs, watermarking/tamper-proofing, opportunity-statistics PDF (RP §2.2#5 — explicitly out per roadmap), frontend download button.
