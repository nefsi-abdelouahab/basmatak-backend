## ADDED Requirements

### Requirement: Attestation PDF route and access rule
The system SHALL expose `GET /experiences/:experienceId/attestation` (authenticated; exact RP Part 7 route name, no `.pdf` suffix) streaming the verified-experience attestation PDF (RP §1.3#2, §1.6#2, §1.7#1, §2.7#10; RP PART 5 "Download Attestation stays, BB"). Access SHALL be granted to the owning volunteer (`volunteerId` matches the caller), the verifying organization (`organizationId` matches the caller's own organization), or an admin. Guests SHALL receive `401`. An authenticated caller related to neither the volunteer nor the verifying organization SHALL receive `403`. An unknown `experienceId` SHALL receive `404` (experiences exist only post-verify, so "not verified" and "nonexistent" share the `404`). The route SHALL accept optional `?lang=ar|en` (default `en`, matching the platform UI language convention); any other value SHALL be rejected with `400`. Full Arabic-script fidelity is explicitly deferred (see design): with `lang=ar` the layout and available Latin-script labels are served, and Arabic glyph shaping is a flagged follow-up, not built here.

#### Scenario: Owner downloads own attestation
- **WHEN** the owning volunteer requests the attestation route for their experience
- **THEN** the response is `200` with `Content-Type: application/pdf` and a `Content-Disposition: attachment` header

#### Scenario: Verifying org and admin can download
- **WHEN** the verifying organization (caller org equals the experience `organizationId`) or an admin requests the route
- **THEN** the response is `200` with the PDF stream

#### Scenario: Stranger is forbidden
- **WHEN** an authenticated volunteer or organization unrelated to the experience requests the route
- **THEN** the response is `403` with the standard error envelope

#### Scenario: Unknown experience is not found
- **WHEN** any authenticated caller requests the route with an unknown `experienceId`
- **THEN** the response is `404`

#### Scenario: Guest is unauthorized
- **WHEN** an unauthenticated caller requests the route
- **THEN** the response is `401`

#### Scenario: Language defaults to English and rejects unknown values
- **WHEN** the caller omits `lang` or passes `lang=en`
- **THEN** the certificate renders in English; when the caller passes any other value than `ar|en`, the response is `400`

### Requirement: Neutral certificate content from the enriched payload
The generated PDF SHALL render only fields already present on the enriched experience payload (Session 15) plus read-only label lookups — no new stored fields, no invented data: volunteer full name (`firstName` + `lastName`) with the volunteer's `VOL-` registryId; experience title, description, `duration` in minutes (real minted value), verified date (`verifiedAt`), `EXP-` registryId as the reference number, and `verificationCode`; organization display name (`nameAr` when `lang=ar`, otherwise `nameFr`, each falling back to the other when unset), slug, and `ORG-` registryId; position title with its deliverables summary (read from the opportunity/position); skills rendered as resolved names via a read-only skills lookup (`nameAr` when `lang=ar`, otherwise `nameFr`, falling back to ids when unresolvable). The certificate SHALL carry the neutral statement "Verified by \<org> on \<date> — code: …" mirroring the inline indicator under the title "Certificate of Verified Experience". It SHALL NOT contain civic-narrative wording ("Civic", "Sovereign", "Ledger", "Statute", "Accredited"), fabricated legal/registry seals, SHA-256 claims, or opportunity-statistics sections (RP §2.2#5 opportunity PDF is explicitly out of scope).

#### Scenario: PDF carries the real registry identity
- **WHEN** the attestation is generated for a verified experience
- **THEN** the document contains the volunteer's `VOL-` id, the experience's `EXP-` id as reference number, the org's `ORG-` id, the `verificationCode`, the real `duration` (minutes), and the verified date

#### Scenario: No civic or fabricated content
- **WHEN** the attestation bytes are inspected (text extraction in tests)
- **THEN** none of the civic-narrative tokens (`Civic`, `Sovereign`, `Ledger`, `Statute`, `Accredited`, `DZ-`, `ALG-`, `TCA-`, `SHA-256`) appear, and no seal/registry-claim graphics or copy are present

#### Scenario: No new stored fields
- **WHEN** the attestation is generated
- **THEN** no write occurs to any collection (read-only assembly from `volunteer_experiences`, `volunteer_profiles`, `organizations`, `opportunities`, `skills`, `verifications`, `reviews`-joined payload)

### Requirement: In-process PDF streaming with no disk writes
The PDF SHALL be generated in-process with `pdfkit` and piped directly to the HTTP response (`application/pdf`, `Content-Disposition: attachment; filename="attestation-<EXP-registryId>.pdf"`). No PDF bytes SHALL ever be written to disk (no temp files, no `./storage` artifacts — Render free tier has no persistent disk). Generation logic SHALL live in a pure, unit-testable generator function taking the assembled certificate data (not the response object), so content assertions run without HTTP.

#### Scenario: Streamed response with correct headers
- **WHEN** an authorized caller requests the route
- **THEN** the response streams `application/pdf` bytes (non-empty) with the attachment disposition naming the `EXP-` registryId

#### Scenario: No disk artifact
- **WHEN** the attestation is generated under test
- **THEN** no file is created in the working tree or temp dirs (asserted by directory snapshot before/after)
