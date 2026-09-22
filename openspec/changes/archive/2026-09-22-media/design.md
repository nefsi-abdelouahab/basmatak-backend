## Context

Sessions 1–7 are in place; the F9 `mediaId` seams in `src/common/seams/media-ownership.ts` (ObjectId-format only) and the avatar/logo/document-swallowing routes are live. No `submissions`/`verifications`/`volunteer_experiences` collections exist yet (they arrive in S10/S11), so anything this module must know about submission state is a data dependency on later sessions and follows the extension-seam convention. Media bytes must never touch MongoDB; storage is Supabase (free) behind a `StorageProvider`, with a local dev fallback. Env seam: `STORAGE_PROVIDER=local` → `./storage` (gitignored), fake signed URLs. Global API prefix `api/v1`; error envelope `{ statusCode, code, message, details? }` with `UPPER_SNAKE` codes; auth roles `volunteer | organization | admin`.

## Goals / Non-Goals

**Goals:**
- Full media lifecycle: presigned upload intent → confirm (server re-reads real metadata) → visibility-gated reads → soft delete, plus link-type media with a host allowlist.
- Encod the §6 read matrix in one `canReadMedia(actor, media)` helper; make it, plus `MediaOwnership.assertFor`, the single gatekeeper used by this module and by the F9 retrofit routes.
- Retrofit avatar/banner (`volunteers`), logo + verification documents (`organizations`) to assert real media.
- Tests fully green with no Supabase credentials (`STORAGE_PROVIDER=local` / a test double).

**Non-Goals:**
- Submissions/experiences data models (S10/S11) — only the seams they'll later wire.
- Video upload (link-only), client-side compression, portfolio-item linking (S14), frontend, admin media management.

## Decisions

### D1 — `StorageProvider` interface, three bindings
Interface: `createPresignedUpload(storageKey, mimeType): Promise<{ uploadUrl, expiresAt }>`, `objectMetadata(storageKey): Promise<{ size, mimeType }>`, `createSignedReadUrl(storageKey): Promise<string>`. Implementations: `SupabaseStorageProvider` (default; `@supabase/supabase-js`; service-role key for `objectMetadata`, anon key for signed URLs), `LocalStorageProvider` (`STORAGE_PROVIDER=local`; writes into gitignored `./storage`, fake signed URLs like `/storage/<key>`), and an exported `TestStorageProvider` double (in-memory object map + spies) used by unit tests. Selection via a factory on the `STORAGE_PROVIDER` token.
- *Why factory over provider-object per env:* keeps controllers/services agnostic and makes the test double injectable per-test.
- *Alternative considered:* mocking `supabase-js` directly — rejected, the interface keeps Supabase a detail.

### D2 — Presigned two-step upload (no probe of bytes)
`POST /media/uploads` validates `{ filename, mimeType, size, purpose, visibility }` (allowlist: `image/jpeg|image/png|image/webp` and `application/pdf` each ≤ 5 MB, else `400`), mints `storageKey = <purpose>/<ownerId>/<randomId>.<ext>`, inserts the `media` row (`type=file`, status not deleted), and returns `{ mediaId, uploadUrl }`. `size` stays advisory. `POST /media/:mediaId/confirm` (owner-only) reads real `{ size, mimeType }` from the provider and rejects a mismatch with `409 MEDIA_METADATA_MISMATCH` (F17); on success it marks the media confirmed (a `confirmedAt` timestamp) — confirm is idempotent once confirmed.
- *Why re-read at confirm:* F17 — the client-supplied `size` is untrusted; the provider metadata is ground truth.
- *Why keep `size` at all:* the client needs it to size the presigned PUT and describe intent.

### D3 — `canReadMedia(actor, media)` as the only read gate
`GET /media/:mediaId` requires auth; guests get `404` (media is invisible to them). Logic: `public` → any authenticated actor; `private` → owner (by `ownerId`), admin role, or the org that owns the opportunity the media's submission belongs to (§6). The org-of-opportunity branch resolves through a thin `OpportunityMediaAccess` seam (default: denies) — it needs `submissions → opportunity → organization`, which lands in S10; until then no row can carry a resolvable submission, so the default is behaviorally a no-op, exactly as §6 requires today.
- *Alternative considered:* resolving the org from the media row directly — impossible, the row only carries `submissionId`; keep the seam.
- Deleted media resolves to `404` before any matrix decision.

### D4 — `MediaOwnership.assertFor(mediaId, actor, purpose?)` upgrade in place
Upgrade `src/common/seams/media-ownership.ts` to a real provider: inject the `media` model (registered in `CommonModule`'s `MongooseModule.forFeature`), keep `isValidIdFormat`, add `assertFor(mediaId, actor, purpose?)` that returns the media row when it exists, is not deleted, is owned by `actor`, and (when `purpose` given) has that purpose; otherwise raises `404` (missing/deleted) or `403 MEDIA_NOT_OWNED` or `409 MEDIA_PURPOSE_MISMATCH`. `MediaService` reuses the same helper so ownership logic has one home.
- *Why in-place instead of a DI provider override:* the seam is globally registered and exported; upgrading the class body keeps volunteers/organizations code unchanged in shape while the owning session swaps real behavior per the seam convention. Only the retrofit call sites are edited, and that is exactly this session's scope.

### D5 — Retrofit call sites (F9)
- `PATCH /volunteers/me`: `avatar` → `assertFor(mediaId, caller, 'avatar')`; `banner` → `assertFor(mediaId, caller)` (no `banner` purpose exists in the §3 enum — asserted for existence/ownership/non-deletion only; recorded as a deviation).
- `PATCH /organizations/me`: `logoMediaId` → `assertFor(mediaId, org, 'organization_logo')` (actor is the org resolved from the token).
- `POST /organizations/me/verification`: each `documents` entry → `assertFor(mediaId, org, 'verification_document')`, failing fast on the first bad entry.

### D6 — Delete guard as a policy seam (F6)
`DELETE /media/:mediaId` (owner only; `404` otherwise) soft-deletes via `deletedAt`. Before deleting it consults `MediaDeletionPolicy`, a seam owning the §7/F6 rule: deletion is blocked (`409 MEDIA_DELETION_BLOCKED`) when the media is referenced by a verified experience or by any submission not in a terminal (`rejected`/`withdrawn`) state. The S8 default is conservative — any `submissionId` or `portfolioItemId` reference blocks, because the collections to prove terminality do not exist yet; S10/S11 swap in the collection-aware policy. Today every uploadable row is unattached, so the default is already correct for reachable data.
- *Why a seam:* the rule must exist now (the roadmap lists it in-scope and e2e must exercise the block), but the referenced collections are later sessions' data.

### D7 — Link media + host allowlist (SSRF basis)
`POST /media/links` accepts `{ url, purpose, visibility }`, creates `type=link` media (no `storageKey`). A pure `assertAllowedLinkHost(url)` parses with `new URL`, requires `http:`/`https:`, and allows hosts `youtube.com`, `youtu.be`, `drive.google.com` plus their subdomains; anything else → `400` (business code `LINK_HOST_NOT_ALLOWED`). Future S19 SSRF work reuses this validator.

### D8 — Throttling
Apply `@Throttle` on `POST /media/uploads` and `POST /media/links` (and a lower-token confirm) — storage-listing abuse and URL injection are the cheap-to-block attack surfaces; in-memory throttler only, per the free-tier constraint.

### D9 — Model & indexes
`media`: `ownerId`, `purpose` (enum), `visibility` (enum, default `public`), `type` (`file|link`), `storageKey` (unique sparse — absent for links), `filename`, `mimeType`, `size`, `url`, `submissionId?`, `portfolioItemId?`, `confirmedAt?`, `deletedAt?`, timestamps. Indexes: unique `storageKey`, `ownerId`, `submissionId`, `portfolioItemId`. No byte of file content in Mongo.

## Risks / Trade-offs

- [No Supabase credentials in CI] → bind the local provider / test double via `STORAGE_PROVIDER=local`; `objectMetadata` from the double yields exact mismatch probes.
- [F6 delete rule is conservative until S10] → attached-but-terminal evidence is undeletable in the window; the seam documents the contract and the swap is a tiny S10 edit. Reachable data is unaffected.
- [Org-of-opportunity read inert until S10] → no submission evidence exists yet, so no legitimate reader is denied; S10 wires `OpportunityMediaAccess`.
- [`banner` has no §3 purpose] → asserted owner-only; recorded deviation, trivially tightened when/if the enum grows a `banner` value.
- [Presigned PUT bypasses backend] → upload URL is short-lived and bound to the declared storage key; server re-reads metadata at confirm, so forged size/mime never lands in Mongo.
- [storageKey unique-index race on parallel uploads] → random suffix makes collisions negligible; an `E11000` maps to a retriable client flow (re-issue upload intent).

## Migration Plan

Additive: new `backend/src/media/` module + two-line registration in `backend/src/app.module.ts`; upgrade `MediaOwnership` in place; edit the three retrofit call sites; add `media` to `CommonModule`'s `MongooseModule.forFeature`; `npm i @supabase/supabase-js`; document `STORAGE_PROVIDER|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_BUCKET` and gitignore `./storage`. Rollback = remove module registration + revert retrofit edits; no data migration either way.

## Open Questions

- S10/S11 must wire `OpportunityMediaAccess` (read) and upgrade `MediaDeletionPolicy` (terminal-state resolution); both are contract-signature-only today.