## Why

Every civic-narrative reference code the reconciliation plan replaces (`DZ-`, `ALG-`, `TCA-` registry-style ids) has nowhere neutral to land: the four top-level entities — volunteer profiles, organizations, opportunities, volunteer experiences — have no public registry identifier today. This session builds the single neutral registry-identity surface the rest of the V2 roadmap reads: an atomic per-type `counters` collection minting `VOL-`/`ORG-`/`OPP-`/`EXP-` identifiers, owned by exactly one session so later sessions never touch the column.

## What Changes

- New `counters` collection `{_id: type, seq}`; `RegistryIdService.getNext(type)` mints the next identifier with atomic `findOneAndUpdate({ $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })` — collision-proof under concurrency.
- `registryId` field added to `volunteer_profiles`, `organizations`, `opportunities`, `volunteer_experiences`; required on new documents, immutable once assigned, server-minted only (never client-settable).
- Mint on every create path: volunteer registration extras, organization registration extras, opportunity create, and the verify transaction (experience mint).
- Payload exposure of `registryId` on reads: volunteer profile (own + public + talents card), organization (own + public), opportunity (public detail + org own list), experience (own list/detail + public proof + public experience cards).
- Idempotent `seed:backfill-registry-ids` script backfills existing rows (assigns only where missing, never overwrites).

## Capabilities

### New Capabilities
- `counters`: the per-type counter collection, the atomic `RegistryIdService` minting `VOL-`/`ORG-`/`OPP-`/`EXP-` + 6 zero-padded digit identifiers, the immutability rule, and the idempotent backfill entrypoint.

### Modified Capabilities
- `volunteers`: `volunteer_profiles.registryId` field; own + public profile and talents-card payloads include it.
- `organizations`: `organizations.registryId` field; own + public organization payloads include it.
- `opportunities`: `opportunities.registryId` field; public detail + org own-list payloads include it.
- `experiences`: `volunteer_experiences.registryId` field; own list/detail, public proof, and public experience-card payloads include it.

## Impact

- Backend: new `backend/src/common/counters/` (schema + service) registered in the global `CommonModule`; additive edit to the two registration-extras providers, the opportunity create path, and the verify transaction; additive projection changes in the volunteers/organizations/opportunities/verifications read paths; new `backfill-registry-ids` script target + package.json entry.
- No new packages, no new env vars, no route changes, no schema deletions — fully additive and backward compatible.
- OpenSpec: new `openspec/specs/counters`; delta specs for `volunteers`, `organizations`, `opportunities`, `experiences`.