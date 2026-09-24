# Tasks

## 1. Counters collection and RegistryIdService

- [x] 1.1 Create `backend/src/common/counters/counters.schema.ts`: `CountersCollection = 'counters'`; schema via `createSchema` with `_id` (`String`, required — the per-type key: `volunteer` | `organization` | `opportunity` | `experience`, unique by constructor) and `seq` (`Number`, required, default `0`, `min: 0`); export the `CounterRow` interface
- [x] 1.2 Create `backend/src/common/counters/registry-id.service.ts`: `export type RegistryType = 'volunteer' | 'organization' | 'opportunity' | 'experience'`; a `REGISTRY_PREFIX: Record<RegistryType, string>` map (`VOL-`, `ORG-`, `OPP-`, `EXP-`); `@Injectable() RegistryIdService` with `getNext(type: RegistryType, options?: { session?: ClientSession })` implementing `findOneAndUpdate({ _id: type }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session })` and returning `` `${prefix}${String(seq).padStart(6, '0')}` ``
- [x] 1.3 Register the counters model + service in `backend/src/common/common.module.ts` (read the file first; append-only changes to `MongooseModule.forFeature([...])` and the `providers`/`exports` arrays; existing style preserved)
- [x] 1.4 Re-read `backend/src/common/common.module.ts`: any module importing `CommonModule` already gets `RegistryIdService` (global) — confirm no module-level import is needed for volunteers/organizations/opportunities/verifications and note it in the code comment if helpful

## 2. Schema field additions (registryId on the four entities)

- [x] 2.1 `backend/src/volunteers/schemas/volunteer-profile.schema.ts`: add `registryId: { type: String, trim: true, maxlength: 32 }` to `VolunteerProfile` + `VolunteerProfileModel` + the `createSchema` definition — server-minted only, no default
- [x] 2.2 `backend/src/organizations/schemas/organization.schema.ts`: add `registryId` (same shape) to `Organization` + `OrganizationModel` + schema definition
- [x] 2.3 `backend/src/opportunities/schemas/opportunity.schema.ts`: add `registryId` (same shape) to `Opportunity` + `OpportunityModel` + schema definition
- [x] 2.4 `backend/src/verifications/schemas/volunteer-experience.schema.ts`: add `registryId` (same shape) to `VolunteerExperience` + `VolunteerExperienceModel` + schema definition

## 3. Mint on each create path

- [x] 3.1 `backend/src/volunteers/volunteer-registration-extras.service.ts`: inject `RegistryIdService`; before `profileModel.create(...)` mint `const registryId = await this.registryIds.getNext('volunteer')` and include it in the created document — no behavior change for non-volunteer roles
- [x] 3.2 `backend/src/organizations/organization-registration-extras.service.ts`: inject `RegistryIdService`; mint `getNext('organization')` and include `registryId` in the `organizationModel.create(...)` inside `createWithUniqueSlug`
- [x] 3.3 `backend/src/opportunities/opportunities.service.ts`: inject `RegistryIdService`; in `createOpportunity` mint `getNext('opportunity')` **once before** the `createWithUniqueSlug` retry loop and pass `registryId` into the factory closure (reused across slug-collision retries, never re-minted per attempt)
- [x] 3.4 `backend/src/verifications/verifications.service.ts`: inject `RegistryIdService`; inside the verify transaction mint `getNext('experience', { session: txn })` and set `registryId` on the experience upsert with `$setOnInsert` (never overwrite on re-verify — leave the existing value untouched); assert re-verify does not reassign

## 4. Payload exposure on reads

- [x] 4.1 `backend/src/volunteers/volunteers.service.ts`: add `registryId` to the `PublicVolunteerProfile` return object in `getPublicProfile` (unconditional — not behind a `show*` gate) and to the `TalentCard` mapping in `listPublicTalents`
- [x] 4.2 `backend/src/volunteers/volunteers.service.ts`: add `registryId: row.registryId` to the `PublicExperienceCard` mapping in `loadPublicExperiences`
- [x] 4.3 `backend/src/verifications/experiences.service.ts`: add `registryId: experience.registryId` to the `getPublicProof` return object
- [x] 4.4 Verify-by-parity (no code if automatic): own/org/public reads that serialize the schema model directly — `GET /volunteers/me`, `GET /organizations/me`, `GET /organizations/:slug`, `GET /organizations/:slug/opportunities`, `GET /opportunities`, `GET /opportunities/:idOrSlug`, `GET /organizations/me/opportunities`, `GET /experiences/me`, `GET /experiences/:experienceId` — already carry `registryId` via the `createSchema` toJSON transform; confirm in E2E and only add projection code where a shaped literal omits it

## 5. Backfill script (seed:backfill-registry-ids)

- [x] 5.1 Create `backend/src/scripts/backfill-registry-ids.ts` mirroring the `seed.ts` pattern: export `backfillRegistryIds(app?)` that takes `RegistryIdService` + the four models and for each collection bulk-updates rows matching `{ registryId: { $exists: false } }`, minting `getNext(type)` per row (`VOL-` volunteers, `ORG-` organizations, `OPP-` opportunities, `EXP-` experiences); never reads or overwrites rows that already have a value; returns per-collection counts
- [x] 5.2 Wire the target into `backend/src/scripts/seed.ts`: add `'backfill-registry-ids'` to `SeedTarget` + `TARGETS`, resolve the registry-id script in the `run()` switch for that target and `--only all`, and add `` `seed:backfill-registry-ids`: `ts-node -r tsconfig-paths/register src/scripts/seed.ts --only backfill-registry-ids` `` to `backend/package.json`

## 6. Unit tests

- [x] 6.1 Create `backend/src/common/counters/registry-id.service.spec.ts`: `Promise.all` of N concurrent `getNext('volunteer')` returns N distinct contiguous values (atomicity); prefix/zero-padding samples (`EXP-000042` for seq 42); overflow keeps full digits (`VOL-1000000`); session option is propagated to the query; unknown type rejected

## 7. E2E tests

- [x] 7.1 Create `backend/test/registry-ids.e2e-spec.ts`: register a volunteer and an organization → `GET /volunteers/me`, `GET /organizations/me`, the public org/profile payloads (`GET /organizations/:slug`, `GET /volunteers/:username`) each carry a well-formed `VOL-`/`ORG-` registryId; create an opportunity → public detail + `GET /organizations/me/opportunities` carry a stable `OPP-` id; submit + verify → `GET /experiences/me` list/detail and the public proof (`GET /verify/:code`) carry a stable `EXP-` id; re-read twice and assert identical values (stability/immutability)
- [x] 7.2 Same E2E file: a PATCH body carrying `registryId` is rejected (`400`, forbidNonWhitelisted) and the stored value is unchanged; re-verify of the same submission does not reassign the `EXP-` id
- [x] 7.3 Same E2E file (backfill idempotence): seed rows across the four collections **without** `registryId` via direct model insert, run `backfillRegistryIds` twice → first run assigns each a well-formed id, second run reports `0` rows and changes nothing
- [x] 7.4 Same E2E file (absence of civic codes): assert no API response across the exercised routes contains a `DZ-`, `ALG-`, or `TCA-` prefixed string