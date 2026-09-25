## Context

`volunteer_experiences` rows are minted by the verify transaction (`VerificationsService.verify`) with `duration` hardcoded to `0` via the `positionDuration()` stub — no source schema carried a duration at v1 time. Session 11 added optional `opportunities.durationMinutes` (positive int, minutes) and Session 1 added immutable `EXP-` `registryId`. Experience reads are split across three services: `ExperiencesService` (own list/detail + public proof), `VolunteersService` (dashboard placeholder `latestVerifiedExperience: null`, public cards), and the inert `AdminExperienceDisplay` seam behind `GET /admin/volunteers/:volunteerId/experiences`. No org-scoped experiences route exists. `csv-stringify` is already a dependency (Session 10). S5 peer `org-facts` owns `backend/src/organizations/`; this change stays in `verifications` + `volunteers.service.ts` (dashboard join) + the admin DI binding.

## Goals / Non-Goals

**Goals:**
- Real minted durations flowing into experiences, `volunteerHours` stats, and (later) Session 16 aggregates.
- One enriched payload assembler reused by own/org/admin/public/dashboard variants with variant-level evidence gating.
- Org experiences list with filters/totals/CSV; real admin seam provider; real dashboard card.

**Non-Goals:**
- Schema additions or migrations (all fields already stored); backfill of legacy `duration: 0` rows (kept as-is).
- Attestation PDF (Session 18); org hours aggregates (Session 16); label embeds on other payloads (Session 19); any Session 9/10 route-file edits.

## Decisions

- **Mint reads `opportunity.durationMinutes ?? 0` inside the existing transaction; delete the `positionDuration()` stub.** The opportunity already carries the configured duration at verify time (loaded in-txn); positions have no duration field, so position-level math is impossible. Fallback `0` is roadmap-defined (task 1), not an open question. Alternative (derive from `endDate − startDate`) rejected: wall-clock span is not volunteered hours and conflates scheduling with effort.
- **New `experience-enrichment` assembler in the verifications module** (`toEnrichedExperience`): one lean `organizations` read (batched per page: single `$in` query, never per-row), one `verifications` read per `submissionId` batch for `verifiedAt = decidedAt ?? experience.createdAt`, one `reviews` read per `submissionId` batch mapped to neutral `{ rating, notes }`. All variants share it; evidence handling differs per variant (own detail keeps the existing media-read loop; public keeps public-only metadata; org/admin list rows embed no evidence).
- **Org list lives in the verifications module** (`GET /organizations/me/experiences` on the experiences controller), following the `organizations/me/applications` (applications module) and `organizations/me/submissions` precedents — keeps the S5 file-disjointness promise (organizations dir untouched). CSV streams via `csv-stringify` directly in the verifications module (same in-process pattern as Session 10) rather than extending `AdminCsvList`, so no admin files are edited for CSV.
- **Real seam provider lives in the verifications module** (owns the data + models), exported; `admin.module.ts` swaps only the `ADMIN_EXPERIENCE_DISPLAY` binding (`useClass`) plus a `VolunteerExperiences` `forFeature` entry (organizations/reviews models already registered there). Admin route/service/controller files untouched. Alternative (provider inside admin/) rejected: it would duplicate experience-assembly logic outside its owning module.
- **`skills` payload shape unchanged (string ObjectIds).** Session 9's derivation reads DB rows, not payloads; no payload rename (`duration` keeps its name) so existing clients and the reconciliation gate see additive fields only.
- **No new indexes by default.** Org list filters `(organizationId, _id)` plus existing `(volunteerId, publicVisibility)`; add a declared `(organizationId, _id)` compound only if `explain()` shows a scan at pilot scale (v1 Session 19 discipline).

## Risks / Trade-offs

- [Legacy rows keep `duration: 0`, understating lifetime hours] → Mitigation: documented, no backfill per roadmap; Session 16 aggregates sum stored values as-is.
- [Admin seam swap touches `admin.module.ts`] → Mitigation: binding-only edit (no route/service logic); flagged explicitly as the sanctioned seam fill.
- [`verifiedAt` join cost on list pages] → Mitigation: batched `$in` reads per page (constant queries, no N+1); lean projections.
- [S5 peer `org-facts` in flight] → Mitigation: disjoint dirs (organizations vs verifications/volunteers-service); no shared-file edits; verified no concurrent OpenSpec worker in this tree.

## Migration Plan

Additive only: no schema/index changes required, no backfill, no env changes. Deploy with the normal build. Rollback: revert the mint line (durations return to `0` for new rows), unregister the org route, rebind the inert seam — stored data untouched.

## Open Questions

None blocking. Duration fallback (`0` for pre-Session-11 opportunities) is defined by the roadmap task list and encoded in spec scenarios; owner review at Phase 1 gate confirms.
