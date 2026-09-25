## 1. Mint-path real duration

- [x] 1.1 Replace the `positionDuration()` stub in `backend/src/verifications/verifications.service.ts` with `opportunity.durationMinutes ?? 0` at the experience snapshot write; keep `$setOnInsert` registryId and unique-code retry behavior unchanged
- [x] 1.2 Confirm `volunteerHours` `$inc` uses the stamped duration (no separate change; covered by unit/e2e assertions)

## 2. Enriched payload assembler

- [x] 2.1 Implement the shared assembler in the verifications module (org `{ id, slug, nameFr, nameAr }`, `verifiedAt` from `verifications.decidedAt` with `createdAt` fallback, `verificationCode`, `registryId`, real `duration`, neutral `review { rating, notes } | null`) with batched `$in` joins (no N+1) and per-variant evidence gating (own detail keeps media-read loop; public keeps public-only metadata; list rows embed no evidence)
- [x] 2.2 Wire the assembler into own list/detail (`ExperiencesService`), public proof + public cards (`VolunteersService` reads), keeping `skills` as string ids and the `duration` field name

## 3. Org experiences list + CSV

- [x] 3.1 Add `GET /organizations/me/experiences` (org role) with `q`/`opportunityId`/`visibility`/`sort` DTO (whitelist + `forbidNonWhitelisted`), Session 7 counted pagination, and per-row `verificationCode` + `publicVisibility`
- [x] 3.2 Add `?format=csv` in-process streaming via `csv-stringify` (header + filtered rows, no disk, no admin-file edits)

## 4. Admin seam fill + dashboard card

- [x] 4.1 Implement the real `AdminExperienceDisplayProvider` in the verifications module (newest-first single counted page, enriched rows any visibility) and swap the `ADMIN_EXPERIENCE_DISPLAY` binding in `backend/src/admin/admin.module.ts` (+ `VolunteerExperiences` `forFeature` entry; no route/service/controller edits)
- [x] 4.2 Implement `latestVerifiedExperience` in `VolunteersService.getDashboard` (newest own experience, enriched own-variant, `null` when none)

## 5. Tests

- [x] 5.1 Unit: duration stamp (set vs legacy-unset opportunity), assembler variant gating (private evidence hidden on public, hidden-status review nulled on public), CSV header/escaping
- [x] 5.2 E2E: verify → experience carries duration/org/verifiedAt/code/registryId; org list filters + totals + CSV; admin read returns real rows (403 non-admin, 404 unknown); dashboard card populated; public profile shows enriched record; Session 9 derivation (`areasOfContribution`) unchanged

## 6. Verification

- [x] 6.1 Run `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` from `/backend`, then `openspec validate backend-v2-experience-enrichment` from repo root
