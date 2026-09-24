## Context

The reconciliation plan replaced every civic-narrative reference code (`DZ-`, `ALG-`, `TCA-` registry-style ids) with a neutral public registry identifier: `VOL-` on `volunteer_profiles`, `ORG-` on `organizations`, `OPP-` on `opportunities`, `EXP-` on `volunteer_experiences` (RP Part 7 core/common row; RP §1.3#6, §1.6#5, §1.7#5, §2.1#3, §2.7#8, §2.8#8, §3.2#6, §3.3#3, §3.4#6, §4.1#5, §4.4#6, §4.5#2, §5.2#6). None of those identifiers exist today.

Current state that this design builds on:

- All four entity schemas use the shared `createSchema` helper (`backend/src/common/schema/base.schema.ts`), whose `toJSON` transform stringifies every ObjectId. Services mostly return Mongoose models directly (e.g. `getMyProfile`, `getOwn`, `getPublicBySlug`, opportunity `create`/`list`/`requireById` return the models), so **any field added to a schema automatically appears in JSON payloads** — payload exposure work is only needed where a shaped projection is built by hand.
- Registration extras are chained: `VolunteerRegistrationExtrasService.createExtras` creates the `volunteer_profiles` row; `OrganizationRegistrationExtrasService.createExtras` creates the `organizations` row; the inert default handles other roles. Both are wired (and overridden) in the global `CommonModule`.
- `OpportunitiesService.createOpportunity` uses `createWithUniqueSlug(factory, baseSlug)`; a new `opportunities` document is created inside the factory closure (retried on slug collision).
- The verify transaction (`VerificationsService.verify`) creates the `volunteer_experiences` row inside `session.withTransaction` via `findOneAndUpdate` + `$set` with `upsert`, keyed by unique `submissionId` — the mint of an `EXP-` id belongs there.
- Deserialized payload shaping exists in exactly a few spots: `getPublicProfile` (object literal), `listPublicTalents` (`TalentCard`), `loadPublicExperiences` (`PublicExperienceCard`), and `ExperiencesService.getPublicProof` (object literal).
- Seed/backfill scripts follow the `scripts/seed.ts` pattern: `NestFactory.createApplicationContext(AppModule)` + a `--only <target>` switch, exposed via `package.json` `seed:*` scripts.
- `CommonModule` is `@Global()` — a provider exported there is injectable from every module without an import.

## Goals / Non-Goals

**Goals:**
- A `counters` collection `{_id: type, seq}` and a `RegistryIdService.getNext(type)` that is atomic, collision-proof under concurrency, and reusable by every later session that creates one of the four entities.
- `registryId` assigned at each create path (volunteer registration, org registration, opportunity create, verify transaction) and surfaced in the read payloads of those four entities.
- An idempotent `seed:backfill-registry-ids` script that brings legacy rows into compliance without ever overwriting.
- Guaranteed immutability of the column: it is server-minted, never client-settable, never updated.

**Non-Goals:**
- Changing any route, DTO contract beyond read-only exposure, or `verificationCode` (it stays as the possession proof).
- Adding a `registryId` column in any other session/module — this session is the **single owner**; later sessions only read what is exposed here.
- ObjectId-derived "APL-" short forms for applications (client-side rendering; no backend id).
- Any new package, env var, storage, or index feature beyond the counters collection's primary key.

## Decisions

**D1 — Placement: a `common/counters` module registered in the global `CommonModule`.**
```
backend/src/common/counters/
  counters.schema.ts          # CountersCollection = 'counters'; {_id: type, seq}
  registry-id.service.ts      # RegistryIdService.getNext(type, { session? })
  registry-id.service.spec.ts
```
`CommonModule` (already `@Global()`) adds `MongooseModule.forFeature([{ name: CountersCollection, schema: CountersSchema }])`, `RegistryIdService` to providers and exports. Rationale: RP Part 7 owns the counters row to **core (common)**; the service is consumed by four modules (volunteers, organizations, opportunities, verifications) and later by more (S11 duplicate opportunity, S15 experience), so a single global provider beats duplicating or per-module registration. The unique index cited by the roadmap is the `_id` primary key itself — one row per type by construction, no extra index.

**D2 — Atomic mint via `findOneAndUpdate { $inc }` + `returnDocument: 'after'`, optional session.**
`getNext(type)` maps `type` → prefix (`volunteer`→`VOL-`, `organization`→`ORG-`, `opportunity`→`OPP-`, `experience`→`EXP-`) and runs:
```
findOneAndUpdate({ _id: type }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session? })
```
then returns `\`${prefix}${String(seq).padStart(6, '0')}\``. The `findOneAndUpdate` on the `_id` primary key is a single atomic document operation — no two concurrent callers can read the same sequence (the upsert-on-demand case yields `seq=1` on the first mint via MongoDB's `$inc`-with-upsert semantics). The `session` parameter lets the verify transaction increment the counter inside itself so a rollback also rolls back the sequence (no phantom consumption). A "read-then-insert" alternative was rejected: it races under concurrency and is exactly the bug the roadmap calls out.

**D3 — Create-path integration points.**
- `VolunteerRegistrationExtrasService.createExtras`: mint `registryId = await registryIds.getNext('volunteer')` before `profileModel.create(...)`; include it in the created doc.
- `OrganizationRegistrationExtrasService.createExtras`: mint `registryId = await registryIds.getNext('organization')` before `organizationModel.create(...)`.
- `OpportunitiesService.createOpportunity`: mint `OPP-` id **once** before the `createWithUniqueSlug` retry loop (reused across slug-collision retries so a collision does not burn an identifier), and pass it into the factory closure.
- `VerificationsService.verify`: mint `registryId = await registryIds.getNext('experience', { session: txn })` inside the transaction and add `registryId` to the experience `$set` (alongside `verificationCode`). On re-verify (same `submissionId`, upsert path) the `$set` would overwrite with a *new* minted id — this is exactly the immutability hazard, so the `$set` SHALL carry `registryId` only when the upsert inserts (`$setOnInsert`), leaving an existing row's identifier untouched.
All three modules inject `RegistryIdService` (available globally via D1). No schema `required`-dependent enforcement is relied on for correctness because Mongoose's `required` does not run on `findOneAndUpdate` by default; tests assert presence on every create path instead.

**D4 — Immutability.** `registryId` is a plain schema field that no PATCH DTO accepts (DTOs use `whitelist` + `forbidNonWhitelisted`, so a client-supplied `registryId` is rejected as an unknown key), no service update path writes it, and the verify path guards the upsert with `$setOnInsert`. The counters collection, not per-collection unique indexes, is the uniqueness authority — a single owner means there is exactly one writer.

**D5 — Payload exposure.** Because model returns serialize automatically (Context), the following shape projections need explicit additions:
- `PublicVolunteerProfile` (`getPublicProfile`) and `TalentCard` (`listPublicTalents`) → `registryId` (unconditional, not behind a `show*` gate).
- `PublicExperienceCard` (`loadPublicExperiences`) → `registryId`.
- `ExperiencesService.getPublicProof` → `registryId`.
Own/org/public reads that return the schema model (own profile, own org, public org, opportunity public/own list) gain the field automatically; no projection edits. Org-side experience *list* reads arrive in S15 `experience-enrichment` and will serialize the field automatically — this session only guarantees the column exists and the own+public reads surface it.

**D6 — Backfill as a seed target.** Extend `scripts/seed.ts` with target `backfill-registry-ids` (+ `package.json` `seed:backfill-registry-ids`), implemented in a new `src/scripts/backfill-registry-ids.ts` that mirrors the `createApplicationContext` pattern: for each of the four collections, `bulkWrite` on documents matching `{ registryId: { $exists: false } }`, minting one `getNext(type)` per row. Idempotence falls out of the `$exists: false` filter — a second run finds nothing to do and reports `0` rows. The script intentionally never reads or rewrites rows that already have a value.

**D7 — Testing strategy.**
- Unit (`registry-id.service.spec.ts`): `Promise.all` over N concurrent `getNext` calls yields N distinct contiguous values; prefix/padding samples (`EXP-000042`); overflow keeps full digits; session-passing propagates to the query options.
- Unit at each create path / schema: `registryId` not writable via update paths; `$setOnInsert` guard on the verify upsert.
- E2E (`backend/test/registry-ids.e2e-spec.ts`): register volunteer + org, create opportunity, run a verify → each payload carries a well-formed, stable id; PATCH attempts carrying `registryId` are rejected; repeat the response read twice → identical value (stable); run the backfill twice over seeded legacy rows → second run changes nothing; assert **no** `DZ-`, `ALG-`, `TCA-` prefixed codes anywhere in the responses.

## Risks / Trade-offs

- [Concurrent mints after a rolled-back transaction can produce a numeric gap] → Gaps are acceptable by design; the invariant is uniqueness + contiguous-in-order allocation, never gaplessness. `$inc` on the primary key is atomic regardless.
- [A create path bypasses the mint and inserts a row without `registryId`] → Mitigated by minting at each of the four call sites, the `seed:backfill-registry-ids` sweep for legacy/entered rows, and the E2E assertion that every create payload carries the field.
- [Verify upsert overwrites an immutable id on re-verify] → The explicit `$setOnInsert` guard (D3) makes re-verify a no-op for the column; covered by the "re-verify does not reassign" scenario + E2E.
- [Later sessions add `registryId` themselves, violating single-owner] → The `counters` spec and roadmap identity rule state the ownership; S11/S14/S15 explicitly read-only.

## Migration Plan

1. Deploy the code (schema additions are additive; no collection/drop, no index work beyond the counters primary key).
2. Run `npm run seed:backfill-registry-ids` once — assigns `VOL-/ORG-/OPP-/EXP-` ids to all existing rows; safe to re-run.
3. New rows receive ids at create time; no rollback path needed (fully additive, no behavior change to existing consumers).

## Open Questions

None blocking. Org-side experience reads (S15 `experience-enrichment`) will inherit the column automatically when their route serializes the model; the payload-class contract for that route is owned by S15, not this session.