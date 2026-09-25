## Why

Session 21 (reconciliation gate, F1 flag) proved the archived `backend-v2-media-access` spec is violated: its scenario "Org reads evidence on its opportunity" requires the organization owning the opportunity to read `visibility=private` `submission_evidence` attached to a submission on that opportunity (`GET /media/:mediaId` → 200 + signed URL), but `OpportunityMediaAccess.allows()` in `backend/src/media/media-access.ts` is still the inert deny (`return false`) with no override anywhere in `src`, so the owning org gets `403 MEDIA_ACCESS_DENIED`. The only delivered path is the `withEvidence` metadata fallback (`url: null`) on the submission detail. This change wires the real branch and completes archived task 3.2's intent without reopening that change.

## What Changes

- Add `OrganizationOpportunityMediaAccess extends OpportunityMediaAccess`: allows iff the actor is an `organization` whose `organizations.userId` owns the organization referenced by the submission the evidence belongs to (resolved via `media.submissionId`, else via `submissions.evidence.mediaId`), and the media is private `submission_evidence`. Deny-safe: every miss returns `false`, never throws.
- Bind it app-wide as the `OpportunityMediaAccess` provider (keeping the base class for unit tests); register the `submissions` + `organizations` schemas in `MediaModule` (schema imports only — no module cycle).
- Add `SubmissionSchema.index({ 'evidence.mediaId': 1 })` for the reverse lookup.
- Owning-org reads now receive signed URLs, including inside `withEvidence` (the 403-catch fallback stays for true strangers).
- Update the Session 21 reconciliation spec: F1 test goes green as written; the fallback test's `403`/`url: null` assertions become `200`/signed-URL assertions.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `media`: the `OpportunityMediaAccess` seam is now a real submission→organization lookup; the §6 matrix org branch is restored per the archived spec. No route, enum, or visibility-semantics changes.

## Impact

- `backend/src/media/org-opportunity-media-access.ts` (new) — the real seam implementation.
- `backend/src/media/media.module.ts` — schema registrations + provider binding.
- `backend/src/media/media-access.ts` — doc-comment update only (seam no longer inert).
- `backend/src/submissions/schemas/submission.schema.ts` — one additive index.
- `backend/src/media/media-access.spec.ts` — unit coverage for the new class (allow/deny matrix, deny-safe misses).
- `backend/test/e2e/reconciliation.e2e-spec.ts` — F1 assertions updated to the fixed behavior.
- No migration, no new routes, no storage changes; admin/owner/guest matrix rows untouched.
