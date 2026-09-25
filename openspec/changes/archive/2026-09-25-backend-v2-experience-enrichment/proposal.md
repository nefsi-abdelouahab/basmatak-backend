## Why

Experience records are the volunteer's portable proof of work (RP §1.7#4, §2.7#1), yet they still mint `duration: 0`, carry no organization identity on most surfaces, and the org/admin experience surfaces they were designed for do not exist. Session 11 shipped real `durationMinutes`/`endDate` on opportunities and Session 1 minted `EXP-` registry ids — this session consumes both so every experience surface becomes enriched and neutral ("Verified by \<org> on \<date>").

## What Changes

- Mint-time: verify transaction stamps `volunteer_experiences.duration` from the opportunity's `durationMinutes` (fallback `0` for legacy rows predating Session 11 fields, per roadmap task 1); `volunteerHours` stats inherit the real value.
- Enriched experience payload assembly (own/org/public variants): `organization { id, slug, nameFr, nameAr }`, `verifiedAt` (from the verification's `decidedAt`), `verificationCode`, `registryId`, real `durationMinutes`, and neutral `review { rating, notes }` joined read-only from the visible review; public variants never include private evidence.
- New `GET /organizations/me/experiences` (Org; `?q=&opportunityId=&visibility=&sort=&page=` with Session 7 totals, plus `verificationCode` and `publicVisibility` per row and `format=csv` streaming via the `csv-stringify` helper).
- Fill the `AdminExperienceDisplay` seam: real provider behind `GET /admin/volunteers/:volunteerId/experiences` (DI swap only; Session 10 route files untouched).
- Volunteer `GET /volunteers/me/dashboard` returns the real `latestVerifiedExperience` (newest verified experience, enriched).
- No schema additions (duration/registryId/verificationCode already stored); no category/skill field changes, so Session 9's read-time `areasOfContribution` derivation is unaffected.

## Capabilities

### New Capabilities
- None (all behavior extends existing capabilities).

### Modified Capabilities
- `experiences`: real minted duration, enriched own/org/public payloads, new org experiences list with filters/totals/CSV.
- `verifications`: verify transaction duration source (opportunity `durationMinutes`, fallback `0`).
- `volunteers`: dashboard `latestVerifiedExperience` becomes real; public experience cards enriched.
- `admin`: volunteer-experiences read returns real rows via the filled seam.

## Impact

- Code: `backend/src/verifications/` (mint path, payload assembler, org experiences controller/service/DTO, real seam provider), `backend/src/volunteers/volunteers.service.ts` (dashboard join only), `backend/src/admin/admin.module.ts` (DI binding swap only — no route/controller edits).
- Reads `organizations`, `reviews`, `submissions`; writes none new. No new packages (`csv-stringify` already present), env vars, or collections.
