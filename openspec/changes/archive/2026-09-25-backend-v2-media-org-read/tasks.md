## 1. Seam implementation

- [ ] 1.1 New `backend/src/media/org-opportunity-media-access.ts`: `OrganizationOpportunityMediaAccess extends OpportunityMediaAccess` injecting `SubmissionsCollection` + `OrganizationsCollection` models; `allows(actor, media)` returns true only for `actor.role === 'organization'`, `media.purpose === 'submission_evidence'`, submission resolved via `media.submissionId` else `evidence.mediaId`, `submission.organizationId` → organization with `userId == actor.sub`; all misses → `false`, never throws
- [ ] 1.2 `MediaModule`: `forFeature` the two schemas; bind `{ provide: OpportunityMediaAccess, useClass: OrganizationOpportunityMediaAccess }`; update the module jsdoc + `media-access.ts` seam comment (no longer inert)
- [ ] 1.3 `SubmissionSchema.index({ 'evidence.mediaId': 1 })` (additive; verify with existing index-declaration spec conventions)

## 2. Tests

- [ ] 2.1 Unit `media-access.spec.ts`: new class — org×own-submission evidence → allow (direct + reverse-lookup variants); org×foreign → deny; volunteer/guest/admin-unchanged rows; missing submission/org → deny without throwing
- [ ] 2.2 Reconciliation spec `backend/test/e2e/reconciliation.e2e-spec.ts`: F1 test passes as written (200); fallback test updated — owner direct read 200, submission-detail evidence entry carries a signed URL (no longer `url: null`); foreign-org 403 + guest 404 unchanged
- [ ] 2.3 Regression sweep on suites touching evidence reads (`media`, `submissions`, `org-embed-labels`, `experience-enrichment`, `attestation`) — no `url: null` / 403-on-own-evidence assertions may remain

## 3. Verify

- [ ] 3.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` (full; gate target 487/487)
- [ ] 3.2 From repo root: `openspec validate backend-v2-media-org-read`; `openspec status --change backend-v2-media-org-read`
- [ ] 3.3 Archive: `openspec archive backend-v2-media-org-read -y`
- [ ] 3.4 Commit locally: `git add -A`; `git commit -m "feat(backend-v2-media-org-read): owning-org private-evidence reads"`. Never push, never amend, never branch unless asked
