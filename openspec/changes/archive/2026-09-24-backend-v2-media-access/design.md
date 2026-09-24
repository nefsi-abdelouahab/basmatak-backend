## Context

Existing `media` capability (openspec/specs/media/spec.md) covers: media collection (metadata-only, purpose/visibility enums, unique `storageKey`), upload intent `POST /media/uploads`, confirm, external link `POST /media/links`, read `GET /media/:mediaId`, delete, storage provider interface, and the `MediaOwnership` seam. Backend: `MedisMediaAccessService` exists with the §6 matrix; but `submission_evidence` rows are defaulting `public` and the owning-org read branch is an inert deny (`OpportunityMediaAccess.allows()` returns `false` — "S10 wires the real lookup"). Guests are uniformly `404`'d on read. This session ends that seam-openness per ROADMAP_V2 (session 2: `backend-v2-media-access`) and adds three new purposes (`opportunity_cover`, `organization_cover`, `organization_document`) that sessions 9/11 (`opportunity-fields`, `org-facts`) will consume via `coverMediaId`/`annualReportMediaId`.

Note on purpose count: ROADMAP_V2's prose lists two purposes in one spot, but the additive table, RESOLUTION_PLAN.md §media row, commit message ("cover/document purposes"), and test inventory all name three. **This design ships all three.**

## Goals / Non-Goals

**Goals:**
- Three new media purposes default `public` visibility, accepted by upload validation and the purpose allowlist.
- `submission_evidence` uploads default `visibility=private` (additive; caller may still pass `visibility`).
- Restore the owning-organization read branch for private `submission_evidence` on its own opportunity's submissions (replace the inert deny with a real lookup via `OpportunityMediaAccess`).
- Guests may read `visibility=public` media attached to public content; guests still `404` on private media.
- Owner/admin/org read matrix retained; soft-deleted media hidden.

**Non-Goals:**
- Storage provider changes (no new provider, no TTL/allowlist/5 MB changes).
- No renames/removals of existing purposes or visibility semantics.
- No changes to `MediaOwnership.assertFor` call sites beyond the new purposes; fields `coverMediaId`/`annualReportMediaId` enforcement live in sessions 9/11.
- No new endpoints beyond the existing `GET /media/:mediaId` read branch.

## Decisions

1. **Extend `MEDIA_PURPOSES` constant + `MediaPurpose` enum additively.** Add `opportunity_cover`, `organization_cover`, `organization_document` to `medium: `backend/src/media/media.constants.ts` (`MEDIA_PURPOSES`) and the Mongoose enum in `media.schema.ts`. Default `visibility=public` at the DTO/service layer for all three so uploads with no explicit visibility are public. Rationale: mirrors existing default-public behavior for all non-evidence purposes, keeps the change additive, and sessions 9/11 attach these to public content.
   - Alternative rejected: routing `visibility` default off purpose — rejected because evidence is the only private-by-purpose case and a caller may still want a private cover; explicit segmentation is clearer.

2. **`submission_evidence` defaults to `visibility=private`** at the upload-intent DTO/service seam (only for `purpose === 'submission_evidence'` and only when the caller omits `visibility`). Rationale: submissions are sensitive until published/approved; matches RESOLUTION_PLAN §F "default-private evidence."
   - Alternative rejected: blanket default-private for all purposes — rejected; covers/documents must stay public to be embedded on public org/opportunity pages.

3. **Restore the org-read branch in `MediaAccessService` via the existing `OpportunityMediaAccess` seam** rather than bypassing it. `canReadMedia` keeps guest(public→allow / private→deny), owner→allow, admin→allow, and now: `opportunityAccess.allows(actor, media)` → allow for the owning org reading private `submission_evidence` on submissions of its own opportunities. Rationale: single source of truth (§6 matrix + `backend-inventory.md` §media), no duplicated matrix logic, and the seam was explicitly designed for exactly this (its comment says S10 wires the real lookup — actually it says "S10 wires the real lookup"; we restore the org branch now, under-session-standby for full S10). This is the same branch `OpportunityMediaAccess.allows()` is meant to provide; we implement it as a real lookup keyed on `media.submissionId → submission.opportunityId → organizationId`.
   - Alternative rejected: adding a parallel `orgCanRead` flag on the schema — rejected; keeps authorization immutable.

4. **Guest read of public media attached to public content.** `GET /media/:mediaId` already answers guests `404` for everything; change: when media `visibility=public` AND the referencing content (`submissionId`'s opportunity or `portfolioItemId`'s portfolio) is `status=published`, the guest reads metadata + signed URL. Guests on private media still `404`. Rationale: cover media on published opportunities must be guardedly readable pre-auth, matching §6 guest×public row.
   - Alternative rejected: letting guests read ALL public media regardless of attached content — rejected; a public media row attached to a `draft` opportunity should not leak while the content is unpublished.

5. **Purpose docs.** Add a short doc block per new purpose stating which field consumes it (`opportunities.coverMediaId`, `organizations.coverMediaId`, `organizations.annualReportMediaId`), plus explicit "default private" note for `submission_evidence`. Rationale: `backend-inventory.md` and spec-level docs are the seam contract for sessions 9/11.

## Risks / Trade-offs

- Guest-read of public media could expose cover bytes before content is fully public → mitigated: gate on the attached content being `published`.
- Restoring the org branch adds a submission→opportunity→org lookup per private-media read → mitigated: cheap indexed lookups (`submissionId`, `opportunityId`); also only runs for the private-evidence path.
- Purpose-count mismatch (2 vs 3) between roadmap prose and inventory → resolved to 3; noted as a deviation for the user.
- Soft-delete already handled (deleted media → 404); no new risk.

## Migration Plan

Additive, no data backfill required. Rollout: extend constants + enum, DTO/service default logic, and the `canReadMedia` matrix in one change (this session); sessions 9/11 then attach the new purpose rows to the new fields. Rollback: revert constants/enum + matrix without data loss since no existing rows are touched (new rows only). No schema data migration is needed — `purpose`/`visibility` are string enums in MongoDB, additive values.

## Open Questions

- None blocking for this session. (The purpose-count deviation is flagged for the user at the stop-gate.)
