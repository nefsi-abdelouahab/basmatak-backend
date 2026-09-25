## MODIFIED Requirements

### Requirement: Read media

The system SHALL expose `GET /media/:mediaId` returning the media metadata and, for `type=file`, a signed URL, gated by the read matrix in `MediaAccessService.canRead` (§6). Guests SHALL read `visibility=public` media (no authentication required); any other read of private media SHALL be denied for guests (response `404`). An authenticated actor SHALL read `visibility=public` media. An admin SHALL read any media. The owner SHALL read their own media. The organization owning the opportunity SHALL read `visibility=private` `submission_evidence` attached to a submission on that opportunity via the real `OrganizationOpportunityMediaAccess` branch (submission resolved via the media's `submissionId`, else via the indexed `submissions.evidence.mediaId` reverse lookup; match on `submission.organizationId` → `organizations.userId`). Deleted media SHALL NOT be returned.

#### Scenario: Org reads evidence on its opportunity

- **WHEN** an organization reads `visibility=private` `submission_evidence` attached to a submission on one of its own opportunities
- **THEN** a signed URL is returned (status `200`)

#### Scenario: Org reads evidence via reverse lookup (no submissionId on the media)

- **WHEN** the evidence media carries no `submissionId` but is referenced by `submissions.evidence.mediaId` on the org's opportunity submission
- **THEN** a signed URL is returned (status `200`)

#### Scenario: Foreign org still denied

- **WHEN** an organization reads `visibility=private` `submission_evidence` attached to a submission on another organization's opportunity
- **THEN** the response is `403`

#### Scenario: Non-organization callers unaffected

- **WHEN** a volunteer (non-owner), a guest, or any actor reads private evidence outside the owner/admin/org branches
- **THEN** the existing matrix applies (`403` authenticated stranger, `404` guest)
