## 1. Media purpose vocabulary (§3 §2.13 inventory, F3/F11 closes)

- [ ] 1.1 Extend `MEDIA_PURPOSES` in `media.constants.ts` + schema `purpose` enum + SWAGGER decorator enum with `opportunity_cover`, `organization_cover`, `organization_document` (additive, keep existing order — the three belong to `opportunity-fields` S9/S4 and `org-facts` S11/S5)
- [ ] 1.2 Document each new purpose + which field consumes it (`opportunities.coverMediaId`, `organizations.coverMediaId`, `organizations.annualReportMediaId`) in `media.constants.ts` jsdoc / README

## 2. Upload default semantics (§ media §2.11/§2.13)

- [ ] 2.1 `submission_evidence` uploads default `visibility=private` when the DTO omits `visibility` (`dto.visibility ?? 'public'` → purpose-aware default in `createUploadIntent`)
- [ ] 2.2 Keep size/mime allowlist unchanged; no new storage/provider changes

## 3. Read matrix (§ media-access §6)

- [ ] 3.1 `MediaAccessService.canRead`: allow guests (no actor) to read `visibility=public` media; non-owner private reads keep resolving through `OpportunityMediaAccess`
- [ ] 3.2 Wire the real org-read branch inside `OpportunityMediaAccess.allows`: org reads private `submission_evidence` owned by `submission.organizationId` == org; return false otherwise (gates org vs foreign org)

## 4. Tests

- [ ] 4.1 Unit `media-access.spec`: guest×public → allow; stranger×public → allow; stranger×private → deny; org×own-submission private evidence → allow; org×foreign submission private → deny; volunteer-owner×own private → allow
- [ ] 4.2 Unit `media.service.spec`: `submission_evidence` upload intent without `visibility` → `private`; purpose allowlist incl. the three new purposes
- [ ] 4.3 E2E `media.e2e-spec`: guest GET public media → 200

## 5. Verify

- [ ] 5.1 `openspec validate backend-v2-media-access` green; `openspec status --change backend-v2-media-access` all artifacts complete
- [ ] 5.2 Backend build + jest suite green (media-access + media.service + e2e)
