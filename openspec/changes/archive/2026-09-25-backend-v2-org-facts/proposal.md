## Why

Org Profile, Profile Completion, and the Public Org Profile have no backend for their designed fact sheet: location, website, type, registration number, founded year, contact, focus disciplines, and operating scope do not exist on `organizations`, orgs have no profile-completion checklist or self-deletion route, and the public payload carries none of the new fields. Session 14 adds these real fields (RP Part 7 organizations row first part; RP §2.1#1/#2/#3/#6, §2.8#1–#13, §2.9#6, §4.4#1–#8; FCD #2).

## What Changes

- `organizations` add `coverMediaId` (purpose `organization_cover`), `type`, `registrationNumber`, `location {wilayaId, municipalityId, address}`, `website` (http/https validated), `foundedYear`, `contact {email, phone}`, `focusDisciplines[]` (skill_category refs), `operatingScope`, `publicProfile {enabled}` (default on, neutral platform-profile toggle), and optional `annualReportMediaId` (purpose `organization_document`, nullable, no workflow — FCD #2).
- `GET/PATCH /organizations/me` extended with the new fields (single-PATCH profile completion; registration stays `{email, password, phone?}` and is untouched).
- New `GET /organizations/me/profile-completion` (missing-fields checklist + percent) and new `DELETE /organizations/me` (soft-archive org + user, revoke sessions via the Session 6 helper, audit).
- Public `GET /organizations/:slug` extended with the new fields plus aggregates via a new `OrgPublicStatsProvider` seam (inert zeroed default; real implementation lands in Session 16 `org-dashboard`).
- Public `GET /organizations/:slug/opportunities?status=published|completed|closed` enriched read (per-status filtering; aggregates themselves stay in Session 16).
- Explicitly NOT built: `registryId` column (Session 1 owns it — read-only here), real aggregates (Session 16), perks-equivalent org fields (owner-confirmed cut), any registration-endpoint change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `organizations`: fact-sheet fields, extended own/public DTOs + projections, cover/report media assertions, profile-completion checklist, account deletion, per-status public opportunities read, `OrgPublicStatsProvider` seam (inert default).

## Impact

- Touches `backend/src/organizations` + one new seam file in `backend/src/common/seams/` only, plus a 3-line backward-compatible delegation in the opportunities controller/service (the canonical `GET organizations/:slug/opportunities` route lives there since Session 11 and shadows any organizations-side duplicate); S5 peer (`experience-enrichment`: verifications + volunteers dashboard) is file-disjoint.
- Depends on S1 `media-access` (`organization_cover` / `organization_document` purposes) and S1 `registry-ids` (read-only), reuses the S1 `org-ops` session-revocation helper. No new collections, no new packages, no migration (all fields optional/nullable; `publicProfile.enabled` defaults on).
