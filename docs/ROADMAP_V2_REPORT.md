# Backend V2 Roadmap — Final Report

> Spec-driven reconciliation build per `docs/ROADMAP_V2.md` (source of truth for scope:
> `docs/RESOLUTION_PLAN.md` Part 7). Version: 1 (2026-09-25).
> All work implemented in `/backend`, committed locally, never pushed.

**Scope delivered:** all ~215 `BUILD-BACKEND` reconciliation items from `docs/RESOLUTION_PLAN.md`
Part 7, built as 20 OpenSpec changes (Sessions 1–20) + 1 verification gate (Session 21) +
1 follow-up fix change. Same stack throughout (NestJS + TypeScript strict + Mongoose Atlas M0,
in-memory Throttler, no Redis, no queues, no push, no paid services).

## Session status (all ARCHIVED, all committed)

| # | Session / Change | Status | Commit | What shipped |
|---|---|---|---|---|
| 1 | `registry-ids` | Done | `3f90584` | `counters` collection, atomic `VOL-/ORG-/OPP-/EXP-` IDs, immutable, backfill script |
| 2 | `media-access` | Done (+F1 fix in #22) | `ee17e5c`/`182aefc` | 3 new media purposes, default-private evidence, guest public-media reads |
| 3 | `notification-prefs` | Done | `3e69cc8` | `notification_prefs` collection, `GET/PATCH /notifications/preferences`, event gating |
| 4 | `portfolio-meta` | Done | `b36e158` | `typeLabel` + `tags[]` on portfolio items, public projection |
| 5 | `application-states` | Done | `9b3b97e` (+`879e3c4` sync) | apply `message`, `under_review` + `start-review`, org aggregate inbox + joiner seam |
| 6 | `org-ops` | Done | `c8696b5` | session device metadata, `isCurrent`, `logout-others`, `lastActivityAt` |
| 7 | `pagination-totals` | Done | `fbd2275` | `total/page/pages`, `sort`, multi-value filters, `nearMe`, date ranges, `submissions.title` |
| 8 | `admin-analytics` | Done | `3bb28e8` | overview/deltas, series, attention queue, org footprints |
| 9 | `public-exposure` | Done | `bacc025` (+`891a0b3` route-order fix) | opt-out public profiles, public stats/headline, derived contribution areas, public reviews |
| 10 | `admin-lists` | Done | `158d91d` | filters/totals/CSV on all admin lists, status-histories read, dossier assign, reason/notes |
| 11 | `opportunity-fields` | Done | `4c1fe36` | mode, cover, endDate, duration, prerequisites, position deliverables, single-read, duplicate (no perks/logistics per FCD) |
| 12 | `activity-feed` | Done | `56f38f9` | org + volunteer activity streams |
| 13 | `settings-expansion` | Done | `aae4cf9` | settings whitelist, maintenance gate, `GET /system/status`, kill-switches |
| 14 | `org-facts` | Done | `98b0be6` | org fact sheet, profile-completion, public payload + stats seam, account deletion |
| 15 | `experience-enrichment` | Done | `509f786` | real durations, org identity/verifiedAt/code on payloads, org + admin lists + CSV, dashboard card |
| 16 | `org-dashboard` | Done | `b84ec6f` | participant roster, org stats, public aggregates (fills S14 seam) |
| 17 | `favorites` | Done | `1a7f7ea` | bookmarks for opps/talents, counts, `isFavorited` card state |
| 18 | `pdf-attestation` | Done | `e5cad9a` | streamed pdfkit attestation, owner/org/admin authz, no disk writes |
| 19 | `org-embed-labels` | Done | `64f8405` | org embeds, labels, `applicationCount`, assigned names, joined inboxes (fills S5 seam) |
| 20 | `moderation-actions` | Done | `49b6134` | atomic report resolution + consequence, admin close/unpublish, system notices |
| 21 | reconciliation gate | Done | `4aeebdd` | 41-test gate spec `backend/test/e2e/reconciliation.e2e-spec.ts` (no OpenSpec change, per plan) |
| 22 | `media-org-read` (F1 fix) | Done | `7ef7a39` | wired the owning-org evidence-read branch the gate proved missing |

**Preconditions also closed:** the two leftover v1 actives (`data-and-locale-fixes`,
`submissions-verification-experiences`) are archived; `openspec list` shows zero active changes.
No archived change was ever reopened.

## Notable events during the run

- **F1 (real gap, fixed):** Session 2's archived spec required direct owning-org reads of
  private evidence, but the `OpportunityMediaAccess` seam shipped as an inert deny (403).
  The Session 21 gate flagged it; change #22 (`OrganizationOpportunityMediaAccess`,
  submission → `organizationId` → `userId` match, deny-safe, indexed reverse lookup) wired
  it. Gate is 487/487 green since.
- **F2 (infra-only flake, untouched):** parallel jest workers race on `mongo-mem-*` tmp
  entries and memory-server teardown. Affects test snapshots/teardown only, never product
  code; every affected suite passes in isolation. Pre-existing suites were not modified.
- **Minor repairs inside sessions:** public-reviews route-order fix, shared spec/rig
  reconciliations (`767295d`, `9109489`).
- **§2 contract list:** all 13 rows verified by the gate and signed off by the owner
  (rows 1–5 BREAKING/☑ included).

## Final verification (post-fix)

- `npm run build` — clean
- `npm run lint` — clean
- `npm test` — 64 suites / 627 tests, all green
- `npm run test:e2e` — 42 suites / 487 tests, all green
- `openspec validate --all --strict` — 35/35 (pre- and post-archive)
- `openspec list` — no active changes; 21/21 v2 changes archived

## Frontend-readiness verdict: YES — with 5 handoff notes

1. **API surface is frozen and proven:** every screen in RP Parts 1–4 has its backend
   routes/fields; `docs/API.md` + OpenAPI describe them.
2. **Guest apply = frontend redirect** (decision 10): backend returns 401, never a fake
   application — the Login redirect is frontend's to build.
3. **Upload constraints to enforce in UI:** ≤5 MB images/PDF, 2-step flow with consent
   checkbox, video-as-link only (YouTube/Drive allowlist), no audio/ZIP.
4. **Dead ends to avoid:** no messaging, ranking, standalone portfolio, or `/verify` page
   routes exist — don't call them; CSV/PDF endpoints stream (just link them, don't expect
   stored files).
5. **Assumed public defaults:** new volunteer profiles are public (opt-out), orgs publish
   only when verified — build the UI around those states, including 401/429/403 +
   maintenance-503 handling.
