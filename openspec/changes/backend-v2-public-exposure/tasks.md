## 1. Schema Default Flip and New Fields

- [ ] 1.1 Flip `defaultPublicProfile()` and the `publicProfileSchema` defaults: `enabled`, `showBiography`, `showSkills`, `showExperiences`, `showPortfolio` to `true` (decision 5, breaking); leave `showAvatar`, `showLocation`, `showAvailability` at `false` pending Open Question 5.
- [ ] 1.2 Add `showStats: boolean` to `VolunteerPublicProfile`, the schema (default `true`), and `PublicProfileDto`/`updatePublicSettings` whitelist; add optional `headline`, `availabilityNote`, `preferredDomains`, `geographicBase` to the schema.
- [ ] 1.3 Extend `UpdateVolunteerProfileDto` with the four new optional fields and bounds (headline ≤ 120, availabilityNote ≤ 500, preferredDomains ≤ 10 × ≤ 60, geographicBase ≤ 120); wire writes in `updateProfile`.
- [ ] 1.4 Add the idempotent dev-data backfill note (flip only rows still matching the old all-`false` default; never overwrite an explicit choice; document the explicit-all-off ambiguity).

## 2. Public Payload Projection

- [ ] 2.1 Extend `PublicVolunteerProfile` with `fullName` (first + last merged), `createdAt`, `headline`, `availabilityNote`, `preferredDomains`, `geographicBase`, `stats` (only when `showStats`), and `areasOfContribution`.
- [ ] 2.2 Honor all `show*` gates per v1 A5 in `getPublicProfile` (headline/note/domains/base under `showBiography`; `stats` under `showStats`); assert no `userId`/`email`/`phone`/`birthDate` leaks and no free-form contributions list anywhere in the payload.
- [ ] 2.3 Extend `TalentCard` with the `stats` block gated by `showStats` (RP §1.4#2); keep `registryId` unconditional; batch-populate without N+1.

## 3. Derived Areas of Contribution

- [ ] 3.1 Implement read-time `areasOfContribution` aggregation in `VolunteersService` (verified experiences → skills → catalog → `skill_categories` labels; count-based share, sorted desc, cap 8; batched queries only) per the owner-confirmed Open Question 1 definition.
- [ ] 3.2 Assert no stored field: schema keys contain no `areasOfContribution` (or equivalent) and no write path sets one.

## 4. Public Reviews Route

- [ ] 4.1 Add public `GET /volunteers/:username/reviews` (username → enabled-profile resolution else 404; `status=visible` only; cursor pagination with totals via the shared helper; org-identity join per the confirmed Open Question 7 shape).
- [ ] 4.2 Wire the `reviews` model into the volunteers read path (module import or model registration) without touching archived changes or the S3 peer's files.

## 5. Automated Coverage

- [ ] 5.1 Add unit coverage: defaults flip (six flags true on create), `showStats` gating, derivation math (shares sum to 100, desc order, ≤ 8 cap), opt-out exclusion.
- [ ] 5.2 Add E2E coverage: new volunteer is public by default (talents/profile show stats); disabling `enabled` flips to 404/public-exclusion; new fields round-trip via `PATCH /volunteers/me`; public reviews list only `visible` rows; guests read without auth; `registryId` present on the public payload.

## 6. Verification

- [ ] 6.1 Run `npm run build` from `/backend`.
- [ ] 6.2 Run `npm run lint` from `/backend`.
- [ ] 6.3 Run `npm test` from `/backend`.
- [ ] 6.4 Run `npm run test:e2e` from `/backend`.
- [ ] 6.5 Run `openspec validate backend-v2-public-exposure` from the repository root.
