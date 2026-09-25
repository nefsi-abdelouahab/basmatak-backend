## Context

Session 21 gate finding F1: the archived `backend-v2-media-access` spec (scenario "Org reads evidence on its opportunity") requires the owning org to read private `submission_evidence` on its opportunities' submissions with a signed URL, but `OpportunityMediaAccess.allows()` (`backend/src/media/media-access.ts:14`) is the inert deny and no override exists in `src` — owning-org `GET /media/:mediaId` returns `403 MEDIA_ACCESS_DENIED`. The submissions side even notes the gap ("Open Question: Part B wires OpportunityMediaAccess", `submissions.service.ts`), and `withEvidence` papers over it by surfacing metadata with `url: null` on the 403 path. Archived changes are never reopened, so this change completes that intent in a new change. Evidence rows resolve cleanly: `submissions` carry `organizationId` directly (indexed) plus `evidence[].mediaId`; `organizations` carry `userId` (unique); media rows optionally carry `submissionId` (indexed).

## Goals / Non-Goals

**Goals:**
- Owning org reads private `submission_evidence` on its own opportunities' submissions via direct `GET /media/:mediaId` (200 + signed URL), resolved through the existing `OpportunityMediaAccess` seam.
- Deny-safe seam: misses deny, never throw; non-org roles and non-evidence purposes never allowed by this branch.
- Reverse lookup (`evidence.mediaId`) indexed; no N+1 or collection scans.
- Reconciliation gate F1 goes green; fallback test updated to the fixed behavior.

**Non-Goals:**
- No route, enum, visibility-default, or storage changes.
- No changes to the owner/admin/guest matrix rows.
- No changes to `withEvidence` logic (it transparently improves: owning orgs now get URLs).
- No reopening or editing of the archived `backend-v2-media-access` change.

## Decisions

1. **Implement the seam as `OrganizationOpportunityMediaAccess extends OpportunityMediaAccess` in a new file** (`backend/src/media/org-opportunity-media-access.ts`), injecting the `submissions` and `organizations` models. Rationale: keeps the base seam importable for unit tests and makes the override explicit and reviewable.
   - Alternative rejected: editing the base class in place — rejected; the base documents the seam contract and is referenced by existing unit tests.

2. **Bind app-wide via `{ provide: OpportunityMediaAccess, useClass: OrganizationOpportunityMediaAccess }` in `MediaModule`**, registering the two schemas with `MongooseModule.forFeature` (schema objects only). Rationale: no module import cycle (`SubmissionsModule` already depends on `MediaModule` via `MediaService`; importing it back would cycle), single binding point, zero changes to `MediaAccessService` call sites.
   - Alternative rejected: implementing the override inside `SubmissionsModule` and re-exporting — rejected; splits the matrix across modules and complicates provider precedence.

3. **Resolution order: `media.submissionId` first, then `submissions.evidence.mediaId` reverse lookup; match on `submission.organizationId → organizations._id → organizations.userId === actor.sub` with `actor.role === 'organization'` and `media.purpose === 'submission_evidence'` gates.** Rationale: direct reference when present (one indexed read), robust fallback when evidence was attached via the submission PATCH path (which does not stamp `media.submissionId`); `organizationId`-level match mirrors `requireOwnOrganization` semantics in the submissions service.
   - Alternative rejected: matching via opportunity → organization join — rejected; `submission.organizationId` is authoritative and already indexed, one fewer hop.

4. **Add `SubmissionSchema.index({ 'evidence.mediaId': 1 })`.** Rationale: the reverse lookup must stay an indexed point query; evidence arrays are tiny and the index is additive.
   - Alternative rejected: stamping `submissionId` onto media at attach time — rejected; touches the submissions write path and backfill for a read-side need.

5. **Update the Session 21 reconciliation spec in this change** (F1 test passes as written; fallback test's `403`/`url: null` become `200`/signed URL). Rationale: the gate must encode the fixed behavior; the spec file is a living gate, not an archived artifact.

## Risks / Trade-offs

- Two extra indexed reads per private-evidence read by non-owner/non-admin callers — negligible (point lookups on indexed fields, only on the evidence path).
- `withEvidence` now yields real URLs to owning orgs — intended improvement; stranger path still catches 403 → metadata-only.
- Stale `submissionId` on a media row (set but submission deleted) falls through to the reverse lookup, then denies — safe by construction.

## Migration Plan

Additive, no backfill. Deploy order irrelevant (reads only). Rollback: revert the provider binding to the base class — behavior returns to today's 403 + metadata fallback with no data effects.

## Open Questions

- None.
