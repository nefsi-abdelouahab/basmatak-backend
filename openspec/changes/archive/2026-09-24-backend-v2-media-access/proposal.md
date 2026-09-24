## Why

Extend the media purpose enum with `opportunity_cover`, `organization_cover`, `organization_document` (+ constants + upload allowlist), flip `submission_evidence` uploads to default-private, restore the org-read branch for private submission evidence on its own opportunities, and let guests read public media attached to public content.

## What Changes

- Add three purposes to the `media.purpose` enum + constants + upload allowlist: `opportunity_cover`, `organization_cover`, `organization_document`.
- `submission_evidence` uploads default `visibility=private` when `visibility` is omitted.
- Restore the owning-organization read branch for private `submission_evidence` on its own opportunity's submissions.
- Allow guests to read `visibility=public` media attached to public content (public opportunities/content).
- Document each new purpose and the field/entity that consumes it.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `media`: `media.purpose` enum + constants + upload allowlist extended with the three new purposes; `submission_evidence` upload default-visibility flipped to `private`; read matrix restores org-branch for private evidence and adds guest-read of public media on public content.

## Impact

- `backend/src/media/media.constants.ts` — `MEDIA_PURPOSES`, purpose→size/mime mapping.
- `backend/src/media/media.schema.ts` — `purpose` enum.
- `backend/src/media/dto/media.dto.ts` — `PostUploadMediaDto.purpose` `@IsIn` validation, visibility default logic.
- `backend/src/media/media-access.ts` — `OpportunityMediaAccess` real branch (org-owner reads private evidence) + guest public-media read branch in `MediaAccessService`.
- `backend/src/media/media.service.ts` — upload confirmation/read URL wiring following the read matrix.
- `backend/src/media/media.controller.ts` — read-media routing honoring public/private matrix.
- `backend/src/media/media-access.spec.ts`, `media.service.spec.ts`, plus E2E media specs — matrix incl. the three new purpose values.
- Docs for the new purposes: `docs/RESOLUTION_PLAN.md` §media row updated.
