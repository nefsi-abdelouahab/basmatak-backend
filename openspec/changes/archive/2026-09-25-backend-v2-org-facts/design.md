## Context

The `organizations` collection currently stores only the v1 core (`userId`, `slug`, `registryId`, `nameAr`/`nameFr`, `description`, `logoMediaId`, `verificationStatus`, `status`, `reliability`) plus the S3 `assignedAdminId` flow on `organization_verifications`. Org Profile / Profile Completion / Public Org Profile designs need the full fact sheet, a completion checklist, self-deletion, and an extended public payload. Dependencies are already shipped: `media-access` (S1) provides the `organization_cover` + `organization_document` purposes with `MediaOwnership.assertFor`, `registry-ids` (S1) owns `registryId` minting (read-only here), and `org-ops` (S1) provides the session-revocation helper reused by account deletion. Registration stays `{email, password, phone?}` (decision 7 minimalism, RP §5.2) — the auth module is untouched; facts arrive post-registration via PATCH.

## Goals / Non-Goals

**Goals:**
- Persist the eleven fact-sheet fields + optional `annualReportMediaId` with DTO validation and media-ownership assertions.
- Ship extended `GET/PATCH /organizations/me`, `GET /organizations/me/profile-completion` (read-only checklist + %), and `DELETE /organizations/me` (transactional soft-archive + session revocation + audit).
- Extend the public `GET /organizations/:slug` payload additively and serve per-status public opportunities, both backed by the inert `OrgPublicStatsProvider` seam Session 16 fills.

**Non-Goals:**
- Real aggregates (Session 16 `org-dashboard`); `position.applicationCount` / assigned names / label embeds (Session 17/19); `registryId` writes (Session 1); registration-endpoint changes; perks-equivalent org fields (CUT); annual-report workflow (KEPT as bare nullable attach only, FCD #2).

## Decisions

- **Single-PATCH completion, no multi-step flow** (RP Part 7 row is exact: extended `PATCH` + new `GET .../profile-completion` + new `DELETE`; no step state exists in the row). Alternative (step machine with `completionStep`) rejected: no RP item requires it and it would add a column + transitions for a client-wizard concern.
- **Checklist = 11 keys; `annualReportMediaId` excluded from the percent** (`name` = either `nameAr`/`nameFr`, `description`, `type`, `registrationNumber`, `location`, `website`, `foundedYear`, `contact`, `focusDisciplines`, `operatingScope`, `coverMediaId`). Rationale: the report is owner-confirmed optional with no workflow — counting it would hold `complete` hostage to an optional attachment.
- **`focusDisciplines[]` = ObjectId refs to `skill_categories`** (roadmap §4 Session 14 verbatim), bounded to 12, existence-validated via a skills-module read; unknown ids → `400 INVALID_FOCUS_DISCIPLINE`. Alternative (slug strings) rejected: slugs are display-mutable, ObjectIds stable — same pattern as `positions.requiredSkills`.
- **`type` / `operatingScope` = bounded free-form short texts** (`type` max 80, `operatingScope` max 120). No vocabulary exists in RP/roadmap, so no enum is invented — see Open Questions for owner confirmation. Alternative (ad-hoc enum) rejected: inventing `local|national|…` values without owner sign-off risks a wrong taxonomy baked into stored data.
- **Location refs validated against seeded wilaya/municipality data** (same reference source the feed uses); unknown refs → `400 INVALID_LOCATION`. `address` is free text max 500. Alternative (accept-and-store) rejected: public profile renders location labels, so dangling refs would surface as blank geography.
- **Website = `http(s)` URL max 500** (`IsUrl` with `require_protocol`, protocols `http|https`); contact reuses canonical validators (`IsEmail` max 254; phone `^\+?[0-9]{8,15}$` from auth/users DTOs). `foundedYear` int in `[1800, currentYear]`.
- **Cover/report via existing `MediaOwnership.assertFor`** (`coverMediaId` → `organization_cover`, `annualReportMediaId` → `organization_document`, actor = caller's organization). No new media code, no new size/aspect rules — inherits the `media-access` allowlist.
- **`publicProfile {enabled}` default `true`, NOT a visibility gate** (RP §2.9#6: orgs are not in the talent directory; the toggle is a neutral platform-profile preference). Public slug reads keep verified+active gating only — no 404 regression for `enabled=false`. Legacy rows missing the key read as enabled (opt-out default, decision-5 style).
- **`DELETE /organizations/me` = one transaction** (org `status=deleted` + user retired + sessions revoked via the Session 6 helper + `status_histories`/`audit_logs` writes). Alternative (sequential non-atomic) rejected: a half-deleted org (row archived, sessions alive) is a security hole. Facts PATCH stays email-gate-free (only dossier submission requires verification — asserted by scenario, no regression).
- **Per-status public opportunities live on the opportunities-side route by delegation.** Session 11 registered `GET organizations/:slug/opportunities` in `OpportunitiesController` (its header documents that the module registers ahead of `OrganizationsModule`, shadowing the V1 `OrganizationsController` stub — S5 file-disjointness is approximate here, as Section 4 already showed it can be). Rather than a second shadowed route, this session extends the canonical handler with `?status=` (default `published`, backward-compatible) delegating to `OrganizationsService.listOrgOpportunities`, which owns the verified+active gating and the status filter; the dead V1 stub route in `OrganizationsController` is removed. No new DI edges (`OpportunitiesService` already injects `OrganizationsService`). Alternative (duplicate route in `OrganizationsController`) rejected: unreachable dead code behind the documented registration order.
- **`OrgPublicStatsProvider` seam in `src/common/seams/`** (`ORG_PUBLIC_STATS_PROVIDER` token, `getStats(organizationId)` → `{volunteers, initiativesActive, initiativesCompleted, verifiedHours, responseRate, perDomain[], activeSince}`, inert zeros, `activeSince` from `foundedYear` else `null`). Mirrors the `OrgFootprintProvider`/`ApplicationInboxJoiner` pattern; Session 16 swaps the binding via DI with zero changes to the organizations module. Kept distinct from `OrgFootprint` (admin-analytics seam): different consumer (public payload vs admin analytics) and different shape (per-domain + activeSince) — merging them would couple public and admin contracts.
- **Route order**: `me`, `me/profile-completion` declared before `:slug` (the §2.7 route-order trap).

## Risks / Trade-offs

- [Risk] Legacy rows lack all new fields → public/own payload shape varies → Mitigation: null-safe reads (absent scalars → null/absent, arrays default `[]`); dedicated scenario + e2e on a pre-facts fixture.
- [Risk] Cover/report media soft-deleted after attach → dangling id → Mitigation: out of scope (stable reference, bytes hidden by media layer); documented, not handled.
- [Risk] `focusDisciplines` refs to inactive (not deleted) categories → Mitigation: existence-only check; `active` flag ignored for stability of stored facts.
- [Risk] DELETE transaction on Atlas M0 / memory-server replica set → Mitigation: single replica-set transaction like the three existing ones (accept/verify/withdraw precedent); e2e asserts atomicity via forced mid-failure mock.
- [Risk] `type`/`operatingScope` free text diverges across orgs (no taxonomy) → Mitigation: accepted consciously pending owner vocabulary decision (Open Questions); a later enum migration only tightens validation.

## Migration Plan

Additive, no migration: all new fields optional/nullable with schema defaults (`focusDisciplines: []`, `publicProfile: {enabled: true}`); existing rows read back null-safe. Rollback = revert code; stored new fields are inert to old code. No index changes required (no new query shapes: own reads by `userId`, public reads by `slug`, both already indexed).

## Open Questions

- **Q1 (needs owner confirmation): `operatingScope` vocabulary.** Proposed: bounded free-form text (max 120) as spec'd. Alternative: closed enum (e.g. `local | wilaya | national | international`). No RP/roadmap item defines values — confirm free-form or supply the enum before implementation.
- **Q2 (needs owner confirmation): org `type` vocabulary.** Proposed: bounded free-form text (max 80) as spec'd. Alternative: closed enum (e.g. `association | foundation | club | …`). Same status as Q1 — confirm or supply values.
- Resolved without re-asking (documented for the record): `focusDisciplines` = skill-category ObjectId refs (roadmap §4 Session 14 in-scope line is explicit); profile-completion = single extended PATCH + read-only `GET` checklist (RP Part 7 organizations row lists exactly those routes — no multi-step flow exists in the row).
