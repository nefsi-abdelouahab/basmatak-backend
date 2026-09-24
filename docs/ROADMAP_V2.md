# Basmatak Tatatoua (بصمتك تطوع) — Backend V2 Roadmap

> Spec-driven build plan for the **reconciliation work** identified in `docs/RESOLUTION_PLAN.md` (the "New backend scope", Part 7). Source of truth for scope: `docs/RESOLUTION_PLAN.md` (referred to as "the plan"; Part 1 item codes are cited as `RP §x.y#n`) and `backend-inventory.md` (referred to as "the inventory") for module ownership. Tooling: OpenSpec **1.5.0**, verb-first commands. Every numbered session produces exactly one **new** `backend-v2-<topic>` OpenSpec change, is implemented in `/backend`, is validated, archived, and committed locally (never pushed). The last session is the `backend-v2-reconciliation-check` gate.
>
> Version: 1 (2026-09-24)

---

## 1. Summary

**Goal.** Deliver every `BUILD-BACKEND` item from the reconciliation plan (≈215 resolutions grouped into 20 OpenSpec change topics) on top of the already-shipped backend from `docs/ROADMAP.md`, without opening a single archived change. Same stack, same free-tier discipline, same OpenSpec workflow — only the scope is new.

**Baseline (what this roadmap builds on).** The fully archived backend v1: modules `auth, users, volunteers, organizations, opportunities, applications, participations, submissions, verifications (experiences), reviews, media, notifications, portfolio, locations, skills, admin, trust, core (status-transitions/settings/jobs), common (pagination)`. All v1 changes are archived. Verify with `openspec list` + `openspec validate --all --strict`.

**Active changes to close first.** Two changes are **still active** (implemented in the working tree but not archived): `data-and-locale-fixes` and `submissions-verification-experiences`. **Precondition for any V2 session:** both must be fully implemented and archived (they already exist in `/backend`, so archiving should be mechanical). None of the V2 sessions reopen them; `submissions-*` routes edited by V2 belong to the archived baseline, not those changes.

**Stack.** Unchanged from v1: NestJS + TypeScript strict + Mongoose (Atlas M0), in-memory Throttler, no Redis, no queues, no push, no paid services. PDF attestation and CSV exports use **in-process streaming libraries** (`pdfkit`, `csv-stringify`) — Render free has no persistent disk, so documents are streamed to the HTTP response, never written to disk.

**Phases (this roadmap).** P1 = data model & core (`Section 1–3`, sessions 1–8), P2 = organizations & experience enrichment (`Section 4–6`, sessions 9–16), P3 = cross-cutting embeds & moderation (`Section 7–8`, sessions 17–20), Final = reconciliation gate (session 21).

**How Sections work (parallel-safety).** Sessions are grouped into **Sections (S1–S9)**. Within a Section, every session touches **disjoint module directories** (verified against `/backend/src`), so its files, routes, schemas and collection fields never collide — sessions in one Section may be run **in any order, or in parallel on separate branches/worktrees** (never concurrently inside one working tree: `openspec/changes/` and `openspec/specs/` must not be written by two workers at once). Across Sections, order is **strict**: a Section starts only after the previous Section's changes are all archived and committed. The dependency rules are: (a) none of the 4 "new collection/module" and single-module sessions share a module with their Section peers; (b) heavy cross-cutting sessions (`pagination-totals`, `org-embed-labels`) are isolated in their own Section; (c) data-producers precede data-consumers across Sections (listed in §3).

**Extension seams (kept from v1).** When a session needs a capability owned by a *later* Section, it programs against a small interface with an inert default and the later session swaps the real implementation in. Used here: `OrgPublicStatsProvider` (public org payload aggregates: seam defined in `org-facts`, filled by `org-dashboard`), `ApplicationInboxJoiner` (aggregate inbox embeds: seam in `application-states`, filled by `org-embed-labels`), `AdminExperienceDisplay` ("Latest Verified Engagement" row: seam in `admin-lists`, filled by `experience-enrichment`).

**Identity rule.** The single owner of registry IDs (`registry-ids` session) owns the `registryId` column on all four entities, the `counters` collection and its use in API payloads. `org-facts` and `opportunity-fields` **must not** add a `registryId` column (they only read what `registry-ids` exposed). Civic-narrative codes are removed from the design; `registryId` (`VOL-/ORG-/OPP-/EXP-`) is their neutral replacement — a real feature, unrelated to the (removed) civic theme.

**Flavor-copy decisions applied (owner-confirmed, not re-asked).**
1. Opportunity **perks / "what you receive"** — CUT. `opportunities.perks[]` is **not** built by `opportunity-fields`.
2. Organization **annual report** — KEPT as an optional `organizations.annualReportMediaId` (nullable, no workflow) in `org-facts`, using the `organization_document` media purpose.
3. Public opportunity **mission logistics** (host logistics / accommodation / language) — CUT. No fields built.
4. Merged profile **"areas of contribution"** — DERIVED at read time from verified-experience category/skill breakdown in `public-exposure` (no stored field); the free-form **Mad "Community Contributions & Fieldwork" list is CUT**.

---

## 2. Contract changes — READ THIS (owner review)

All additions are **additive** unless marked **BREAKING**. Rows marked ☑ are intentional behavior changes that expose previously-hidden data or widen permissions — the owner accepted them via decisions 5/8/9, but they should be signed off against the production contract before/during Session 21.

| # | Change | Type | Details |
|---|---|---|---|
| 1 | Public profile defaults flip | **BREAKING (behavior)** | `volunteer_profiles.publicProfile` defaults become `enabled:true` (+ `showBio, showSkills, showPortfolio, showExperiences, showStats` on). Opt-out. Previously-on-private profiles become publicly visible by default. Decision 5. |
| 2 | New public volunteer data | ☑ exposure widening | Public payload now shows `stats`, `createdAt`, `headline`, availability note, `preferredDomains`, `geographicBase`, and a new public `GET /volunteers/:username/reviews`. `showStats` gates the stats block. |
| 3 | Media guest read | ☑ permission widening | `GET /media/:mediaId` now lets **guests** read `visibility=public` media attached to public content (was 404 for any guest). Private evidence stays private. |
| 4 | Org reads volunteer evidence (fix) | ☑ behavior fix | Inventory promised the owning org could read a submission's `visibility=private` evidence; the branch was never wired. `media-access` restores it. Orgs see only evidence on **their** opportunities. |
| 5 | Public opportunity archive + names | ☑ new public data | `GET /organizations/:slug/opportunities?status=completed` returns closed/completed public archive; public opportunity detail adds `position.applicationCount` and **assigned volunteer names** (decision 5). |
| 6 | Org public payload extended | Additive | New fields (location, website, type, registrationNumber, foundedYear, contact, focusDisciplines, operatingScope, aggregates, `annualReportMediaId`). |
| 7 | `CursorPage` gains `total`/`page`/`pages` | Additive | `total` already optional; becomes populated; `page`/`pages` added. Existing parsers unaffected. |
| 8 | Apply body + application states | Additive | `POST .../applications` accepts optional `message`; new state `under_review` + `POST /applications/:id/start-review`; accept/reject also valid from `under_review`. |
| 9 | New routes | Additive | Favorites toggle/list/counts; `DELETE /organizations/me`; `POST /auth/logout-others`; profile-completion; duplicate + single-read opportunity (org); org applications/participants/experiences/activity aggregates; admin analytics, status-histories, assign, notice; attestation PDF; `GET /system/status`. |
| 10 | Media purpose enum extended | Additive | `opportunity_cover`, `organization_cover`, `organization_document`. |
| 11 | Admin list payloads | Additive | `total/pages`, `format=csv`, `q`/filters/`sort`, embedded labels; status PATCH body gains `{reason, notes}`. |
| 12 | Experience payloads | Additive | Add org identity (`organization {id,slug,nameFr,nameAr}`), `verifiedAt`, `verificationCode`, `registryId`; real `duration`. |
| 13 | Registry IDs | Additive | `registryId` on volunteer_profile, organization, opportunity, experience payloads + `counters` collection. |

No deletions of routes or fields. `GET /verify/:verificationCode` stays (only the standalone page is removed on the design side — API untouched).

---

## 3. Sections — order, membership, parallel-safety rationale

Strict order S1 → S9. Within a Section the listed sessions are pairwise file-disjoint (module-dir check against `/backend/src`).

| Section | Sessions (change names) | Parallel-safe rationale |
|---|---|---|
| **S1** | `registry-ids`, `media-access`, `notification-prefs`, `portfolio-meta`, `application-states`, `org-ops` | 6 disjoint module sets: core+vol/org/opp/verif · media · notifications · portfolio · applications · auth+users. No two touch the same module directory. |
| **S2** | `pagination-totals`, `admin-analytics` | `pagination-totals` touches common+CursorPage and many list services (opp/vol/app/sub/verif/org/notif); `admin-analytics` is admin-only aggregation endpoints. Disjoint. |
| **S3** | `public-exposure`, `admin-lists` | volunteers+reviews vs admin+organizations(org_verifications). Disjoint. |
| **S4** | `opportunity-fields`, `activity-feed`, `settings-expansion` | opportunities+organizations-controller vs new activity module vs core-settings+admin-settings-controller. Disjoint. |
| **S5** | `org-facts`, `experience-enrichment` | organizations vs verifications+volunteers(dashboard). Disjoint. |
| **S6** | `org-dashboard`, `favorites`, `pdf-attestation` | participations+organizations vs new favorites+feed/talent embeds vs verifications. Disjoint. |
| **S7** | `org-embed-labels` | Alone (touches opportunities+applications+participations+submissions read payloads — the highest fan-out; cannot share with any list-driving session). |
| **S8** | `moderation-actions` | Alone (admin+opportunities+notifications writes). |
| **S9** | `backend-v2-reconciliation-check` | Alone (gate; no change). |

**Cross-Section data dependencies (why the order is what it is).**
- `media-access` (S1) provides purposes `opportunity_cover` / `organization_cover` / `organization_document` **before** `opportunity-fields` (S4) and `org-facts` (S5) validate `coverMediaId`/`annualReportMediaId`.
- `registry-ids` (S1) owns the registry columns **before** `org-facts`/`opportunity-fields` read them.
- `pagination-totals` (S2) ships `CursorPage.total/page/pages` + `sort`/multi-filters **before** `admin-lists` (S3) and `org-embed-labels` (S7) extend the same list endpoints.
- `application-states` (S1) adds `message`/`under_review` **before** `org-embed-labels` (S7) joins names onto those payloads.
- `opportunity-fields` (S4) adds `durationMinutes`/`endDate` **before** `experience-enrichment` (S5) mints real duration and `org-dashboard` (S6) sums it.
- `experience-enrichment` (S5) enriches experience identity/`verifiedAt` **before** `pdf-attestation` (S6) renders attestations and `org-dashboard` (S6) aggregates hours.
- `org-facts` (S5) defines the public-org-aggregates seam **before** `org-dashboard` (S6) implements it; `experience-enrichment` fills the `AdminExperienceDisplay` seam left by `admin-lists` (S3).
- `admin-lists` (S3) extends reports/`assignedAdminId` **before** `moderation-actions` (S8) executes report actions.
- Two active v1 changes must be archived **before** S1 (see §1, precondition).

---

## 4. Sessions

Conventions identical to v1's roadmap: "verify" always includes `openspec validate <change>` + `openspec status --change <change>` from the repo root, and from `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`. Each session = one new change `backend-v2-<topic>`; split-Part reuse does **not** apply to v1 changes (never `openspec new change` on an archived name). Commit messages use `feat(backend-v2-<topic>): …`.

---

### Session 1 — backend-v2-registry-ids
**Phase:** P1 · **Section:** S1 · **Change:** `backend-v2-registry-ids` · **Depends on:** v1 baseline (volunteers, organizations, opportunities, verifications modules); S1 peers are parallel-safe.

**Objective.** Neutral public registry identifiers replacing every civic-narrative reference code: atomic per-type `counters` collection and `RegistryIdService` with `findOneAndUpdate {$inc}`; `VOL-` / `ORG-` / `OPP-` / `EXP-` + 6 zero-padded digits; immutable once assigned; surfaced in API payloads for volunteers, organizations, opportunities, experiences.

**In scope.** `counters` collection `{_id: type, seq}` + unique index; `RegistryIdService` (atomic, collision-proof, reusable); assignment on create for volunteer_profile, organization, opportunity, volunteer_experience; `registryId` field on all four schemas; payload exposure on public/own/org/admin reads of those entities; seed/backfill data script notes for existing rows (idempotent); **single owner** of `registryId` — later sessions only read.

**Out of scope.** Replacing `verificationCode` (stays); ObjectId-derived "APL-" short forms on the design side (client-side rendering, no backend id); any change to routes.

**Inventory references & coverage.** RP Part 7 row 1 (core/counters); RP §1.3#6, §1.6#5, §1.7#5, §2.1#3, §2.7#8, §2.8#8, §3.2#6, §3.3#3, §3.4#6, §4.1#5, §4.4#6, §4.5#2, §5.2#6 (**RR(civic)** → registry IDs) + all PART 5 rows naming the replacement `VOL-`/`ORG-`/`OPP-`/`EXP-`. Collections: `counters`(new), `volunteer_profiles`, `organizations`, `opportunities`, `volunteer_experiences`.

**Packages & env vars.** None new.

**Task checklist**

1. `counters` schema + `RegistryIdService.getNext(type)` using `findOneAndUpdate({$inc:{seq:1}}, {upsert:true, returnDocument:'after'})`; unit-test atomicity under `Promise.all`.
2. Add `registryId` (require: true if new docs; backfill existing via script) to the four schemas.
3. Call site in each create path (volunteer registration extras, org registration, opportunity create, verify transaction mint → of experience).
4. Include `registryId` in the payload projections of: profile (own+public), org (own+public), opportunity (public+own+org list), experience (own+org+public per decision).
5. `seed:backfill-registry-ids` idempotent script (upsert missing registryIds, never overwrite).
6. OpenSpec artifacts for capability `counters` (ADDED) + MODIFIED `volunteer_profiles`, `organizations`, `opportunities`, `volunteer_experiences` (field additions).

**Tests to write.** Unit: counter atomicity (parallel `getNext` yields unique sequence), prefix/zero-padding format, immutability (update attempt rejected). E2E: create volunteer/org/opportunity/verify → each payload carries a well-formed stable `registryId`; backfill double-run idempotent.

**Acceptance criteria & verification** — registryId present + immutable; no civic-format codes anywhere in API responses (assert absence of `DZ-`, `ALG-`, `TCA-` prefixes). Verify: build/lint/test/e2e + `openspec validate backend-v2-registry-ids`.

**Commit message.** `feat(backend-v2-registry-ids): counters and VOL-/ORG-/OPP-/EXP- registry identifiers`

---

### Session 2 — backend-v2-media-access
**Phase:** P1 · **Section:** S1 · **Change:** `backend-v2-media-access` · **Depends on:** v1 media module; S1 peers parallel-safe. **Supplies the media purposes later sessions consume.**

**Objective.** Extend the media purpose enum, flip `submission_evidence` to default-private, restore the org-read branch for private evidence, and let guests read public media attached to public content.

**In scope.** `media.purpose` enum + constants extend with `opportunity_cover`, `organization_cover`, `organization_document`; upload validation accepts the new purposes (size/mime allowlist unchanged); `submission_evidence` uploads default `visibility=private`; `canReadMedia`/`GET /media/:mediaId` matrix updated: guests read `visibility=public` media on public content; the owning org reads `private` `submission_evidence` of submissions on its opportunities; docs for each new purpose + which field consumes it.

**Out of scope.** Deleting/renaming existing purposes; storage provider changes; the consuming `coverMediaId`/`annualReportMediaId` fields (Session 9 `opportunity-fields`, Session 11 `org-facts`).

**Inventory references & coverage.** RP Part 7 media row; RP §1.8#4, §2.6#11 (evidence privacy → org read), §2.1#1, §2.3#5, §2.8#1 (cover mediaIds). Collections: `media`. Routes: `GET /media/:mediaId`.

**Tests to write.** Unit: `canReadMedia` extended matrix (guest×public, org×own-opportunity private evidence, volunteer-owner×own private, stranger×private denied); purpose allowlist incl. the three new ones. E2E: `submission_evidence` default `private`; guest GET public media attached to a published opportunity → 200; org GET volunteer's private evidence on its own opportunity → 200; foreign org → 403.

**Acceptance criteria & verification** — New purposes on `POST /media/uploads`; private-evidence org read works (this was the missing branch); guests read public media. Verify: build/lint/test/e2e + `openspec validate backend-v2-media-access`.

**Commit message.** `feat(backend-v2-media-access): cover/document purposes, default-private evidence, org-read and guest public-media access`

---

### Session 3 — backend-v2-notification-prefs
**Phase:** P1 · **Section:** S1 · **Change:** `backend-v2-notification-prefs` · **Depends on:** v1 notifications module; S1 peers parallel-safe.

**Objective.** Per-user notification preferences (`notification_prefs` collection), the `GET/PATCH /notifications/preferences` routes, and preference-aware event handling ("to review/verified/application/session/record" toggle groups matching the settings screens), plus the admin digest-toggle settings keys (values read from `system_settings`).

**In scope.** `notification_prefs` (new) `{userId: unique, prefs: {applicationUpdates:bool, reviews:bool, verification:bool, system:bool, digest:bool, recordIssued:bool}}` defaults on; `GET/PATCH /notifications/preferences` (Auth); `NotificationsEventHandlers` respects prefs (skip writes for disabled types; digest toggles just surface a settings key); prefs default-on created lazily on first read.

**Out of scope.** Email/preference digests job (the digest *toggles* only set flags — no digest delivery build; that remains out-of-scope free-tier); `POST /admin/users/:userId/notice` (owned by `moderation-actions`); deleting preferences.

**Inventory references & coverage.** RP Part 7 notifications row (`prefs` + admin digest toggles → flag only); RP §2.9#5, §3.6#5. Collections: `notification_prefs` (new). Routes: `GET/PATCH /notifications/preferences`.

**Packages & env vars.** None new.

**Task checklist**

1. `notification_prefs` schema + unique `userId` index + defaults; service (get-or-create, patch whitelist).
2. Controller + DTOs (`prefs` nested object, false-true keys only, `forbidNonWhitelisted`).
3. Handler filter: event → target type → skip if pref off (handle when prefs row absent = defaults on).
4. Measure: `GET /notifications/unread-count` remains index-cheap.
5. OpenSpec: ADDED capability `notification-prefs`; MODIFIED `notifications`.

**Tests to write.** Unit: prefs gating (defaults on; toggled-off type yields no notification; row created lazily; unknown pref key rejected 400). E2E: PATCH turns `verification` off → verify event creates no notification while `applicationUpdates` still does; GET returns defaults.

**Acceptance criteria & verification** — Every event-driven notification honors prefs. Verify: build/lint/test/e2e + `openspec validate backend-v2-notification-prefs`.

**Commit message.** `feat(backend-v2-notification-prefs): preference collection and event-gated notifications`

---

### Session 4 — backend-v2-portfolio-meta
**Phase:** P1 · **Section:** S1 · **Change:** `backend-v2-portfolio-meta` · **Depends on:** v1 portfolio module; S1 peers parallel-safe.

**Objective.** Optional metadata on portfolio items (`typeLabel`, `tags[]`) exposed on the merged public profile's work-samples grid. Pure extension — routes unchanged.

**In scope.** `portfolio_items` add optional `typeLabel` (short text) + `tags[]` (bounded array); `POST/PATCH /portfolio/me` DTOs accept them (optional); public `GET /volunteers/:username/portfolio` payload includes them; existing reorder/visibility rules untouched.

**Out of scope.** Media changes (link-item handling stays); the deleted standalone portfolio screen (no UI); featured flag; counts/date charts (derived client-side from existing created/updated timestamps).

**Inventory references & coverage.** RP Part 7 portfolio row; RP §1.5/§5.6 portfolio references (merged profile grid). Collections: `portfolio_items`.

**Packages & env vars.** None new.

**Task checklist**

1. Schema + DTO updates (optional, validated lengths: typeLabel ≤ 40, tags ≤ 10 each ≤ 30).
2. Public projection includes the two fields.
3. OpenSpec: MODIFIED `portfolio`.

**Tests to write.** Unit: validation bounds; DTOs reject unknown keys. E2E: create+patch with metadata → present in `GET /volunteers/:username/portfolio`; without metadata → omitted/nulled gracefully; guests still see only `visibility=public`.

**Acceptance criteria & verification** — Merged public profile renders the richer work-samples grid. Verify: build/lint/test/e2e + `openspec validate backend-v2-portfolio-meta`.

**Commit message.** `feat(backend-v2-portfolio-meta): type label and tags on portfolio items`

---

### Session 5 — backend-v2-application-states
**Phase:** P1 · **Section:** S1 · **Change:** `backend-v2-application-states` · **Depends on:** v1 applications module (whitelist registered there); S1 peers parallel-safe. **Leaves the `ApplicationInboxJoiner` seam for S17.**

**Objective.** Wire the apply-body cover message, add the `under_review` application state with its org `start-review` transition, source accept/reject from it, and expose the org aggregate inbox (`GET /organizations/me/applications`) with a join seam for names.

**In scope.** `applications.message?: string` on apply body (`POST /opportunities/:id/positions/:pid/applications {message?}`, saved, immutable post-apply); state `under_review` added to the applications whitelist (`submitted…` 🡒 the v1 machine `pending | under_review`, then `accepted | rejected | withdrawn`; `POST /applications/:id/start-review` org-only, `pending→under_review`, 409 if not pending); accept/reject valid from `pending` **and** `under_review` (via `StatusTransitionService`); `GET /organizations/me/applications` aggregate inbox (`?opportunityId=&status=&q=&page=`) returning applications across the org's opportunities with plain projections; define `ApplicationInboxJoiner` seam (inert) that later fills volunteer/org/opp/position names (S17).

**Out of scope.** Name/entity embeds (S17); audit-timeline exposure (S18 activity or client); messaging; changing accept/reject transactions themselves.

**Inventory references & coverage.** RP Part 7 applications row; RP §1.5#1/#3/#4/#5, §2.1#6, §2.4#1/#2/#3/#6/#11. Collections: `applications`. Routes: apply body, `POST /applications/:id/start-review`, `GET /organizations/me/applications`. Transitions: `pending → under_review`, `under_review → accepted|rejected`.

**Packages & env vars.** None new.

**Task checklist**

1. Schema + apply DTO `message?`; store; read in own/org payloads.
2. Register `application` whitelist additions in the applications module (`under_review`).
3. `start-review` route/guard (org owns the opportunity's applications; duplicate → 409).
4. Accept/reject scan accept `under_review`; existing transaction paths unchanged.
5. Aggregate inbox service + controller + seam + DTOs (`status`, `opportunityId`, `q`, cursor).
6. OpenSpec: MODIFIED `applications`.

**Tests to write.** Unit: whitelist (pending→under_review allowed, accepted→under_review rejected), start-review idempotence. E2E: apply with message persists; start-review → under_review; accept from under_review; reject from under_review; aggregate inbox paginates across org opportunities and hides other orgs' data; non-owner 403/404.

**Acceptance criteria & verification** — "Under review" is a real state; org aggregate inbox exists. Verify: build/lint/test/e2e + `openspec validate backend-v2-application-states`.

**Commit message.** `feat(backend-v2-application-states): cover messages, under_review state, org aggregate inbox`

---

### Session 6 — backend-v2-org-ops
**Phase:** P1 · **Section:** S1 · **Change:** `backend-v2-org-ops` · **Depends on:** v1 auth + users modules; S1 peers parallel-safe.

**Objective.** Session/device metadata and the account-management routes behind the Settings screens: capture `device`/`userAgent` at login, track `users.lastActivityAt`, add `POST /auth/logout-others`, and enrich session payloads with device info + `isCurrent`.

**In scope.** `sessions` add `device` (structure: `{browser, os, device}` from UA parse — client hint, trimmed), `userAgent`; `isCurrent` derived server-side (JWT `sessionId` match) — not stored; `users.lastActivityAt` updated on access (guarded writes, cheap); `POST /auth/logout-others` (Auth; revokes every session but the current); `GET /users/me/sessions` payload gains the new metadata + `isCurrent`; delete-account support note: `DELETE /organizations/me` lives in `org-facts` (Session 11) — this session only guarantees the session-revocation helper it needs.

**Out of scope.** Geo/IP capture (location optional per plan — drop), 2FA, `DELETE /organizations/me` itself (Session 11), seed login device data.

**Inventory references & coverage.** RP Part 7 auth + users rows; RP §2.9#2/#3/#4, §3.2#7 (`lastActiveAt`). Collections: `sessions`, `users`. Routes: `POST /auth/logout-others`, `GET /users/me/sessions`.

**Packages & env vars.** None new (UA parse via a tiny self-contained parser or `ua-parser-js` — prefer self-contained regex to avoid deps; do not add framework).

**Task checklist**

1. Session schema fields; login/capture; refresh preserves metadata.
2. `isCurrent` resolution by comparing `req` JWT `sessionId`; expose in list payload.
3. `logout-others` (delete many, keep current by sessionId; audit later via admin-lists).
4. `lastActivityAt` touch on authenticated reads (route-scoped guard helper; no writes on every heartbeat — write at most every 15 min per user).
5. OpenSpec: MODIFIED `auth`(sessions) + `users`.

**Tests to write.** Unit: UA→device mapping; `isCurrent` correctness. E2E: login twice → sessions list shows two rows with metadata + one `isCurrent`; logout-others keeps current, others dead (old refresh rejected); lastActivityAt updates; foreign user cannot list others' sessions.

**Acceptance criteria & verification** — Settings screens get device/session data and "sign out other devices". Verify: build/lint/test/e2e + `openspec validate backend-v2-org-ops`.

**Commit message.** `feat(backend-v2-org-ops): session device metadata, logout-others, last activity tracking`

---

### Session 7 — backend-v2-pagination-totals
**Phase:** P1 · **Section:** S2 · **Change:** `backend-v2-pagination-totals` · **Depends on:** S1 archived. **Feeds `CursorPage.total/page/pages` every list this roadmap touches.**

**Objective.** The shared pagination contract the result-count banners and multi-select filters need: `CursorPage` gains computed `total`/`page`/`pages`, `sort` + multi-value (`?x=a,b`) filter params, and the new list params (`nearMe`, `minExperiences`, `hasAvailability`, `portfolio`, date ranges, `format`, facets) across feed/talents/applications/submissions/experiences/org lists.

**In scope.** `common/pagination` CursorPage interface → `total?:` becomes populated + required `page`, `pages`; a reusable count wrapper (`execPage(model, query, opts)`) used by the list endpoints below; opportunity feed (`sort`, multi-value filters, `nearMe=me` for volunteers resolving their location, `from/to` windows incl. week/weekend pill support via day-of-week), talents (`minExperiences`, `hasAvailability`, `portfolio`, `skillIds[]`, `wilayaIds[]`, `sort`, facet counts for skill/wilaya), `/experiences/me` (`categoryId`, `skillId`, `from/to`), submissions inbox (`multi-status submitted,under_review`, `q`, `format`, `sort`), org opportunities list (`q`, `sort`), public org search (`q`, `page`), applications lists (`from/to`), `submissions.title` optional field + DTO (per RP Part 7 submissions row). All additions additive.

**Out of scope.** Admin list totals/CSV (Session 8); name/label embeds (S17); `position.applicationCount` (S17); anything paginating beyond atomic count+page (no window pagination changes).

**Inventory references & coverage.** RP Part 7 core (CursorPage) + submissions rows; RP §1.2#3/#4/#5/#7, §1.4#1/#4/#5/#6, §1.5#6, §1.7#2, §2.2#1/#2/#3, §2.7#1/#6, §2.4#2/#4/#5, §2.6#2/#4/#5/#6, §4.1#1, §1.8#2 (`submissions.title`). Collections: read-only across; writes `submissions.title`.

**Packages & env vars.** None new.

**Task checklist**

1. CursorPage + count wrapper; audit all `CursorPage` call sites to populate totals (feed, talents, experiences, submissions inbox, applications, participations roster, notifications, admin lists stubs — admin populates in Session 8).
2. Add `sort` whitelist per endpoint (validated, `forbidNonWhitelisted`) + multi-value param parsing (`toArray` with comma split; count semantics = AND across selected values).
3. Feed: `nearMe`, time-window handling (week offset / weekend via day-of-week), `from/to`.
4. Talents: filters, facets via one aggregation; `minExperiences` needs the experiences count (indexed by `(volunteerId, publicVisibility, createdAt)`, already present — verify).
5. Experiences/submissions/applications/org-lists params.
6. OpenSpec: MODIFIED `common`/`opportunities`/`volunteers`/`applications`/`submissions`/`verifications`/`organizations` + capability writes.

**Tests to write.** Unit: total/page/pages math + division pages, sort whitelist rejection. E2E: count banners exact; multi-select filter semantics; `nearMe` uses caller wilaya; facets sum to filtered total; `submissions.title` persists. 

**Acceptance criteria & verification** — Every banner/filter/sort/session in Parts 1–2 of the plan that reads a list now has a backend param. Verify: build/lint/test/e2e + `openspec validate backend-v2-pagination-totals`.

**Commit message.** `feat(backend-v2-pagination-totals): totals, pages, sort and multi-value filters across lists`

---

### Session 8 — backend-v2-admin-analytics
**Phase:** P1 · **Section:** S2 · **Change:** `backend-v2-admin-analytics` · **Depends on:** S1 archived; v1 admin. Parallel-safe with Session 7 (admin-only vs everything-but-admin).

**Objective.** The Admin Dashboard's real numbers: overview with deltas, active-participants window, per-status counts, an attention-queue aggregation, time series, and per-org footprint aggregates — all derived from real data, none hardcoded.

**In scope.** `GET /admin/analytics/overview` (totals + deltas vs previous period, active participants over 30d, per-status counts for users/orgs/opportunities/applications/submissions, verification-ready queue, gate-freeze count, reliability `medianDecisionHours`); `GET /admin/analytics/series?days=` (per-day time series for the chart: signups, applications, verifications); `GET /admin/analytics/queue` (attention totals per category: pending verifications, open reports, `under_review` submissions, suspended, maintenance-mode flag); per-org footprint aggregates (opportunities, applications, participants, experiences, hours, reliability) reusable by `org-facts`/`org-dashboard` on the public side via a shared service seam.

**Out of scope.** CSV export (that's list-based, Session 8 is analytics; CSV lives in `admin-lists`); charts UI; the "System Status" card (uses existing `/health`, pure client).

**Inventory references & coverage.** RP Part 7 admin-analytics row; RP §3.1#1/#2/#4/#5/#8/#9; also `org-dashboard` stays clean for the *public* aggregates (shared service seam defined here, implemented later there).

**Tests to write.** Unit: delta/window math, series bucketing (UTC, `days` bounds 1–90), queue category totals from fixtures. E2E: with seeded activity, overview returns correct counts + deltas; series covers the range; queue reflects pending verifications + open reports; analytics routes 403 for non-admin.

**Acceptance criteria & verification** — Admin Dashboard numbers match the DB (no hardcoded figures). Verify: build/lint/test/e2e + `openspec validate backend-v2-admin-analytics`.

**Commit message.** `feat(backend-v2-admin-analytics): overview, series, attention queue and org footprints`

---

### Session 9 — backend-v2-public-exposure
**Phase:** P1 · **Section:** S3 · **Change:** `backend-v2-public-exposure` · **Depends on:** S1/S2 archived (registry-ids payloads, pagination lists). **Applies decision 5 (opt-out public profiles) and FCD #4 (derived contribution areas).**

**Objective.** Make the public volunteer profile and talent directory show real, stat-backed information by default: flip `publicProfile` defaults to opt-out, expose stats/headline/availability/`createdAt`/derived contribution areas, add public reviews, and approve `lastName` exposure.

**In scope.** `volunteer_profiles.publicProfile` defaults → `enabled:true, showBio:true, showSkills:true, showPortfolio:true, showExperiences:true, showStats:true` (opt-out); new fields `lastName` (merged into public `fullName`), optional `headline`, availability note, `preferredDomains[]`, `geographicBase`; `PATCH /volunteers/me` + `/public-settings` accept them; public reads expose `stats`, `createdAt`, headline/availability-note, and **derived** `areasOfContribution` (percentage breakdown by verified-experience category/skill, computed at read time — FCD #4; no stored field, symmetric with the private dashboard); new public `GET /volunteers/:username/reviews` (verified experiences' neutral reviews, status `visible` only).

**Out of scope.** Any org changes (public org exposure is `org-facts`); the free-form "Community Contributions & Fieldwork" list (**cut** per FCD #4); portfolio/stats beyond the gated blocks; messaging/contact (removed).

**Inventory references & coverage.** RP Part 7 volunteers row; RP §1.4#2/#8, §2.4#7/#8, §2.5#9, §4.1#3, PART 3 D3 (stats chips), FCD #4. Collections: `volunteer_profiles`, `reviews`(read).

**Packages & env vars.** None new.

**Task checklist**

1. Schema default flip + migration note for existing dev data (idempotent default backfill — does not override explicit off).
2. New optional profile fields + DTOs; last name into public fullName.
3. Public payload projection (`stats`, `createdAt`, headline, availability note, derived areas) honoring `showStats`/`show*` gates per v1 A5.
4. Derived `areasOfContribution` aggregation (category label + share of verified experiences; sorted desc; ≤ 8).
5. Public reviews route (`GET /volunteers/:username/reviews`, `status:visible`, cursor) + OpenSpec MODIFIED `volunteers`/`reviews`.

**Tests to write.** Unit: defaults flip; derivation math (shares sum to 100); opt-out volunteer excludes all. E2E: new volunteer is public by default (talents/profile show stats); disabling flips to 404/public-exclusion; public reviews list only visible; guests read without auth.

**Acceptance criteria & verification** — Decision 5 realized; public profile never leaks suppressed blocks. Verify: build/lint/test/e2e + `openspec validate backend-v2-public-exposure`.

**Commit message.** `feat(backend-v2-public-exposure): opt-out public profiles, public stats and derived contribution areas`

---

### Session 10 — backend-v2-admin-lists
**Phase:** P1 · **Section:** S3 · **Change:** `backend-v2-admin-lists` · **Depends on:** S2 `pagination-totals` (page/totals). Parallel-safe with Session 9.

**Objective.** Turn every admin list into a real management surface: `q`/filters/`sort`/`page`/`pageSize`, `total`/`pages`, CSV export (in-process), embedded labels/counts, status-with-reason, status-histories read, reporter/assigned/priority enrichments.

**In scope.** Admin lists → `?q=&<field filters>&sort=&page=&pageSize=&format=csv`: volunteers (location names + skills joined; suspended reason/notes persisted via `status_histories`), organizations (type/location filters; `GET /admin/organizations/:id/verification/latest`; `PATCH /admin/organizations/verifications/:rowId/assign` with `org_verifications.assignedAdminId`), opportunities (positions+capacity, app counts, location, assigned volunteer names via decision 5), reports (optional `reports.title`, `priority: low|normal|high`, `assignedAdminId`, reporter summary, target entity summary), audit-logs (`?actor=&entity=&date=`, display names, entity-extraction incl. `reports`); `GET /admin/status-histories?entityType=&entityId=` (reuse existing writer); `PATCH /admin/users/:id/status` body `{reason, notes}` recorded in `status_histories`; **`AdminExperienceDisplay` seam** ("Latest Verified Engagement") left inert → filled by Session 14.

**Out of scope.** Reports *actions* (Session 20 `moderation-actions`); analytics (Session 8); any user-to-org messaging; the notice route (Session 20).

**Inventory references & coverage.** RP Part 7 admin-lists row (+ `GET /admin/status-histories`); RP §3.2#2–#13, §3.3#1–#11, §3.4#1–#12, §3.5#1–#13. Collections: reads across; writes `reports`, `organization_verifications`, `status_histories`.

**Packages & env vars.** `npm i csv-stringify` (streaming to response; no disk).

**Task checklist**

1. Extend the shared admin list query DTO + service contract with the params; wire totals via Session 7's wrapper.
2. Volunteers list join (skills, location labels) + status reason/notes storage; CSV.
3. Organizations list (type/location filters) + latest-dossier + assign routes; CSV.
4. Opportunities list (positions/capacity, app counts, names) + CSV.
5. Reports enrichments + list filters + CSV; audit-logs labels + reports extraction + CSV.
6. `status-histories` read route; `AdminExperienceDisplay` seam.
7. OpenSpec: MODIFIED `admin` + `reports` + `organizations` (org_verifications) + `users` + `core status-histories` reuse note.

**Tests to write.** Unit: CSV escaping/streaming; status reason/notes recorded once; assign ownership. E2E: each admin list returns filtered totals and CSV (content-type + header row); suspend stores reason visible in histories; latest-dossier + assign work; non-admin 403 everywhere.

**Acceptance criteria & verification** — Every admin table in the design is fully queryable + exportable with audit trail. Verify: build/lint/test/e2e + `openspec validate backend-v2-admin-lists`.

**Commit message.** `feat(backend-v2-admin-lists): filters, totals, CSV export and label-rich admin rows`

---

### Session 11 — backend-v2-opportunity-fields
**Phase:** P2 · **Section:** S4 · **Change:** `backend-v2-opportunity-fields` · **Depends on:** S1 media-access (purposes). **Implements RP fields; honors FCD #1/#3 (no perks, no mission logistics).**

**Objective.** The real opportunity data model behind Create Opportunity + Opportunity Details: mode, cover, end date, duration, prerequisites, position deliverables and per-position optional start; org single-read + duplicate routes.

**In scope.** `opportunities` add `mode: onsite|remote|hybrid`, `coverMediaId` (purpose `opportunity_cover` via `MediaOwnership.assertFor`), `endDate`, `durationMinutes` (positive int), `prerequisites[]`; `positions[].deliverables[]` + optional `positions[].startAt`; create/patch DTOs (create/patch rules per v1: mode editable pre-publish only, cover anytime, prerequisites pre-publish, duration/endDate guarded by the v1 lifecycle); `GET /organizations/me/opportunities/:id` (org own single read incl. drafts, non-published); `POST /organizations/me/opportunities/:id/duplicate` (copy + full new positions, status draft, new registryId via Session 1). **No `perks[]`, no host-logistics/accommodation/language fields (FCD #1, #3).**

**Out of scope.** Card/feed embeds (org object, labels → Session 17); `position.applicationCount` + assigned names (S17); duration consumption (minting → Session 14).

**Inventory references & coverage.** RP Part 7 opportunities row (minus registryId — owned by Session 1 — and minus embeds → S17); RP §2.3#1/#2/#3/#4/#5, §2.2#6/#7, §1.3#2/#3, §2.8#6(neutral). Collections: `opportunities`.

**Packages & env vars.** None new.

**Task checklist**

1. Schema + indexes (mode participates in feed filters — existing filters cover; no new index strictly needed, verify); DTO extension.
2. `MediaOwnership.assertFor(coverMediaId, org, 'opportunity_cover')` on create/patch; cover change allowed until first acceptance.
3. Single-read + duplicate (transactional copy of positions, reset seats, registryId).
4. Projection updates in org own list + public detail (mode/duration/endDate/prerequisites/positions.deliverables/startAt/cover) so Sessions 7/17 can embed on top.
5. OpenSpec: MODIFIED `opportunities`.

**Tests to write.** Unit: mode/prerequisite edit windows; duration/endDate validation (endDate ≥ startDate, durationMinutes ≥ 1); duplicate resets seats + draft status. E2E: create with all fields → read back; duplicate → independent id/registryId/draft; cover foreign/absent mediaId → 403/404.

**Acceptance criteria & verification** — Create Opportunity fields are real backend fields; no perks/logistics fields exist. Verify: build/lint/test/e2e + `openspec validate backend-v2-opportunity-fields`.

**Commit message.** `feat(backend-v2-opportunity-fields): mode, cover, end date, duration, prerequisites, position deliverables, duplicate`

---

### Session 12 — backend-v2-activity-feed
**Phase:** P2 · **Section:** S4 · **Change:** `backend-v2-activity-feed` · **Depends on:** v1 baseline (status_histories + notifications + entity services). Parallel-safe with Sessions 11/13.

**Objective.** Per-account activity streams composing status_histories and notifications with entity summaries: `GET /organizations/me/activity` and `GET /volunteers/me/activity`. (The volunteer **dashboard "latest verified experience"** card is owned by Session 14 `experience-enrichment`, not here.)

**In scope.** New `activity` module (own directory; no shared files): service folds recent `status_histories` + `notifications` + latest application/submission/opportunity events into a unified `{type, title, ts, entity:{type,id,name,slug?,summary}}` list, newest-first, cursor-paginated (Session 7 wrapper); entity summaries composed from lightweight reads (opportunity title, org name, volunteer name, submission state); org feed includes publish/close/start verification/verification decisions; volunteer feed includes apply/accept/start/verify events + record issuance.

**Out of scope.** The dashboard card (Session 14); real-time/push; cross-entity aggregation beyond the two streams; entity labels on *other* read payloads (S17).

**Inventory references & coverage.** RP Part 7 core(activity) row (minus the dashboard item → Session 14); RP §2.1#10, §2.8#12. Collections: reads `status_histories`, `notifications`, `applications`, `submissions`, `opportunities`, `organizations`, `volunteer_profiles`.

**Tests to write.** Unit: ordering/merge logic, dedupe (transactional notifications must not double-appear with their history), entity summary building. E2E: org performs accept→start-review→verify → both feeds reflect steps; pagination/totals correct; a volunteer's feed excludes another org's activity.

**Acceptance criteria & verification** — Both feeds show correct, mergable event streams. Verify: build/lint/test/e2e + `openspec validate backend-v2-activity-feed`.

**Commit message.** `feat(backend-v2-activity-feed): org and volunteer activity streams from histories and notifications`

---

### Session 13 — backend-v2-settings-expansion
**Phase:** P2 · **Section:** S4 · **Change:** `backend-v2-settings-expansion` · **Depends on:** v1 core-settings + admin. Parallel-safe with Sessions 11/12.

**Objective.** Turn Admin Settings into a real surface: widened `system_settings` whitelist, full `GET /admin/settings` / `PUT /admin/settings/:key`, runtime maintenance gate + `POST /admin/ops/maintenance`, and a public neutral `GET /system/status`. Replaces the civic "sync/statutory" rows with neutral config keys.

**In scope.** New allowed settings keys: platform name/summary/contact, default language/timezone/date format, admin session duration, moderation flags (require-verified-email, suspend-on-report), registration + publishing kill-switches, maintenance mode; `PUT /admin/settings/:key` whitelist widened by key + type validation; `POST /admin/ops/maintenance {enabled}` flips the runtime gate (mirrors the `internal/jobs` single-flight pattern); `GET /system/status` (public) returns `{maintenance: bool, version, uptime?}` and `{status}` from `/health` semantics; enforcement notes: publishing kill-switch false → `PUBLISHING_DISABLED` on publish; registration kill-switch false → register routes 403; maintenance mode → guarded reads return 503 with neutral copy.

**Out of scope.** Notification digest delivery; "Audit Log Retention" (no retention config — out); anything civic ("DZ-NAT-REG sync" etc.) — dropped, not renamed.

**Inventory references & coverage.** RP Part 7 settings row; RP §3.6#1/#2/#3/#4. Collections: `system_settings`. Routes: `GET /admin/settings`, `PUT /admin/settings/:key`, `POST /admin/ops/maintenance`, `GET /system/status`.

**Tests to write.** Unit: whitelist/type validation (non-whitelisted key → 403/400), settings TTL cache invalidation on write. E2E: create each enabled/disabled key; maintenance on → public 503 + `system/status` true + admin unaffected; publishing disabled → publish 403 `PUBLISHING_DISABLED`; registration disabled → register 403.

**Acceptance criteria & verification** — Every setting in Admin Settings is a stored, validated, enforced key. Verify: build/lint/test/e2e + `openspec validate backend-v2-settings-expansion`.

**Commit message.** `feat(backend-v2-settings-expansion): settings whitelist, maintenance gate and system status`

---

### Session 14 — backend-v2-org-facts
**Phase:** P2 · **Section:** S5 · **Change:** `backend-v2-org-facts` · **Depends on:** S1 media-access (cover/document purposes), S1 registry-ids (registryId read-only), S3 admin-lists (assign moves org_verifications only in admin module — disjoint, no conflict). **Defines the public-aggregates seam for Session 16.**

**Objective.** The organization fact sheet behind Org Profile / Profile Completion / Public Org Profile: location, website, type, registrationNumber, foundedYear, contact, focusDisciplines, operatingScope, cover, annual report attachment, public-profile toggle, profile-completion endpoint and account deletion.

**In scope.** `organizations` add: `coverMediaId` (purpose `organization_cover`), `type`, `registrationNumber`, `location {wilayaId, municipalityId, address}`, `website` (validated http/https), `foundedYear`, `contact {email, phone}`, `focusDisciplines[]` (skill_category refs), `operatingScope`, `publicProfile {enabled}` (default on, neutral "platform profile" toggle — not a talent-directory concept), `annualReportMediaId?` (purpose `organization_document`, nullable, no workflow — FCD #2); `GET/PATCH /organizations/me` extended; `GET /organizations/me/profile-completion` (missing-fields checklist %); `DELETE /organizations/me` (soft-archive org + user, revoke sessions — reusing Session 6 helper; audit); public org payload extended incl. the new fields + `OrgPublicStatsProvider` seam (inert default) that Session 16 fills with aggregates; `GET /organizations/:slug/opportunities?status=published|completed|closed` enriched read. **No registryId column here (Session 1 owns it).**

**Out of scope.** Aggregates themselves (Session 16); reliability (exists); the public archive *page* embeds (Session 17 helps).

**Inventory references & coverage.** RP Part 7 organizations row (first part); RP §2.1#1/#2/#3/#6, §2.8#1–#13, §2.9#6, §4.4#1–#8; FCD #2. Collections: `organizations`.

**Packages & env vars.** None new.

**Task checklist**

1. Schema + DTO extension (whitelist + validation, `forbidNonWhitelisted`); website validator; location refs validated against seeded wilaya/municipality; annualReportMediaId optional.
2. Extended PATCH + profile-completion computation.
3. `DELETE /organizations/me` (transaction: org soft-deleted, user retired, sessions revoked, `org.verification.updated`? — no, keep internal; audit).
4. Public org payload + per-status opportunities read.
5. `OrgPublicStatsProvider` seam (interface + inert default returning zeros) consumed by the public payload.
6. OpenSpec: MODIFIED `organizations`.

**Tests to write.** Unit: linked-field validation; completion %; website/phone formats. E2E: org PATCHs full facts → `/me` + public `/:slug` reflect; non-editable-until email-verified? (facts PATCH allowed; only dossier gated — assert no regression); delete-org revokes sessions and hides public org; annual report attach requires `organization_document` purpose.

**Acceptance criteria & verification** — Org registration stays `{email,password,phone?}`; the fact sheet lives here and feeds public payloads. Verify: build/lint/test/e2e + `openspec validate backend-v2-org-facts`.

**Commit message.** `feat(backend-v2-org-facts): organization fact sheet, profile completion, public payload and account deletion`

---

### Session 15 — backend-v2-experience-enrichment
**Phase:** P2 · **Section:** S5 · **Change:** `backend-v2-experience-enrichment` · **Depends on:** Session 11 (durationMinutes at mint), Session 1 (registryId on experiences). Parallel-safe with Session 14.

**Objective.** Rich experience records everywhere they surface: real minted `duration`, org identity + `verifiedAt` + `verificationCode` + `registryId` on own/org/public payloads, neutral reviewer notes, org experiences list, admin volunteer-experience read (filling the Session 10 seam), and the volunteer dashboard's "latest verified experience".

**In scope.** Mint-time: stamp `volunteer_experiences.durationMinutes` from the opportunity's configured duration (real hours — the recipe behind all hours aggregates); `_meta` payload assembly `{organization:{id,slug,nameFr,nameAr}, verifiedAt, verificationCode, registryId, title, description, skills, durationMinutes, evidenceIds(public only for public reads)}`; **neutral reviewer notes**: surface the review's `rating`/`notes` as `review` on the experience (replacing "Compliance Evaluation" wording) — read-only joins; new `GET /organizations/me/experiences` (`?q=&opportunityId=&visibility=&sort=&page=` with totals via Session 7, plus `verificationCode` and `publicVisibility` per row — the "Copy verification link" + CSV-later data source); new `GET /admin/volunteers/:id/experiences` (fills `AdminExperienceDisplay`); volunteer `GET /volunteers/me/dashboard` implements `latestVerifiedExperience` (join to latest verified experience; FCD-neutral).

**Out of scope.** CSV export on the org experiences list (RP lists it as an org-side build; assign to Session 19 `pdf-attestation` companion? — **no**: CSV export pattern belongs to `admin-lists`; org-side CSV on the experiences list is added here as an optional small task using the same streaming helper); attestation PDF (Session 19); activity-feed streams (Session 12).

**Inventory references & coverage.** RP Part 7 verifications/experiences row (first half); RP §1.1#1, §1.7#4/#6, §2.5#7, §2.6#1/#9, §2.7#1–#9, §3.2#9, RP FCD #4 (derivation lives on the volunteer side, Session 9). Collections: reads `organizations`, `reviews`, `submissions`; writes none new (mint stamp reads opportunity duration).

**Packages & env vars.** None new.

**Task checklist**

1. Mint-path duration stamp (verify transaction reads `opportunities.durationMinutes`/position overlap; default 0 if unset for legacy rows).
2. Experience payload assembler (own/org/public variants; public never includes private evidence).
3. Org experiences list + filters/totals + CSV (streaming, `format=csv`).
4. Admin volunteer-experience route + wire `AdminExperienceDisplay`.
5. Dashboard `latestVerifiedExperience`.
6. OpenSpec: MODIFIED `verifications`/`volunteer_experiences` + `admin` + `volunteers`.

**Tests to write.** Unit: duration stamp math (opportunity-level vs position-level); payload variants hide private evidence. E2E: verify → experience carries duration/org/verifiedAt/code/registryId; org list filters + totals + CSV; admin read works; dashboard card populated; public profile shows enriched record.

**Acceptance criteria & verification** — Every experience surface is enriched and neutral ("Verified by <org> on <date>"). Verify: build/lint/test/e2e + `openspec validate backend-v2-experience-enrichment`.

**Commit message.** `feat(backend-v2-experience-enrichment): real durations, org identity, org/admin experience lists, dashboard card`

---

### Session 16 — backend-v2-org-dashboard
**Phase:** P2 · **Section:** S6 · **Change:** `backend-v2-org-dashboard` · **Depends on:** Session 15 (hours), Session 11 (duration), Session 5 (applications aggregate basis). **Fills the `OrgPublicStatsProvider` seam.**

**Objective.** Everything the Organization Dashboard and Public Org Profile numbers need: `GET /organizations/me/participants` (cross-opportunity roster with submission-state joins), org aggregates incl. volunteered hours, per-opportunity submission-response ratios, and the public org aggregates implementing Session 14's seam.

**In scope.** `GET /organizations/me/participants` (`?q=&opportunityId=&status=&page=` incl. `completed`; rows join volunteer name/avatar/base, position title, opportunity title/slug/status, submission state/files, hourly total); org dashboard aggregates (`GET /organizations/me/stats`: active/completed opportunities, applications pending/under_review, participants active/completed, hours `sum(durationMinutes)`, decisions in last 30d); public org stats (implements `OrgPublicStatsProvider`): volunteers registered, initiatives active/completed, verified hours, submission-response rate + per-domain breakdown, founded/active-since (from `foundedYear`); per-opportunity decidedRatio from submissions+verifications timestamps (FCD-neutral "Submission response rate"). 

**Out of scope.** Activity feed (Session 12); admin analytics (Session 8, distinct endpoints); opportunity-card counters on the org list (`position.applicationCount` → Session 17).

**Inventory references & coverage.** RP Part 7 participations + org-dashboard rows + org-facts row's aggregate references; RP §1.3#4(public org stats), §2.1#4/#6/#7/#9, §2.2#4, §2.4#12(→ Session 17), §2.5#1/#4/#5/#6, §2.7#4, §4.4#3/#7/#9, §4.5#11.

**Tests to write.** Unit: roster join/status vocab; hours sum; response-rate + per-domain math (present both decided-ratio and median-decision-hours, reusing reliability). E2E: seed 2 orgs → roster per org with correct status joins; stats + public payload aggregates match DB; foreign org cannot read roster; completed status included.

**Acceptance criteria & verification** — Org dashboard stat cards and public org stats ribbon are backed by real numbers. Verify: build/lint/test/e2e + `openspec validate backend-v2-org-dashboard`.

**Commit message.** `feat(backend-v2-org-dashboard): participant roster, org aggregates and public org stats`

---

### Session 17 — backend-v2-favorites
**Phase:** P2 · **Section:** S6 · **Change:** `backend-v2-favorites` · **Depends on:** S2 lists (feed shape), S9 public-exposure (talent fields). Parallel-safe with Sessions 16/19.

**Objective.** Save/bookmark support: `favorites` collection, toggle routes for opportunities and talents (by username), `GET /favorites`, counts, and `favorited` state + counts surfaced on feed/talent cards.

**In scope.** `favorites` (new) `{userId, targetType: opportunity|talent, targetId, createdAt}` + unique `(userId, targetType, targetId)`; `POST/DELETE /favorites/opportunities/:id`, `POST/DELETE /favorites/talents/:username` (resolve username→volunteerId), `GET /favorites` (both target types, cursor, totals), `GET /favorites/counts` (per-target counts for the current user); opportunity feed/detail + talent card embed `favorited` (via optional-auth token) and `favoriteCount` for opportunities. Idempotent toggles (POST twice → one row; DELETE absent → 204).

**Out of scope.** Folders/collections; favoriting orgs; any cross-user visibility of *who* favorited (counts only); the dead messaging buttons.

**Inventory references & coverage.** RP Part 7 favorites row; RP §1.1#2, §1.2#6, §1.3#7. Collections: `favorites` (new).

**Tests to write.** Unit: unique-index dup → 409→idempotent path; username resolution. E2E: toggle on/off; `GET /favorites` lists both types with totals; feed cards show `favorited` only for the authed caller and never for guests (guest sees counts only); foreign user favorites isolated.

**Acceptance criteria & verification** — Save button works everywhere it appears. Verify: build/lint/test/e2e + `openspec validate backend-v2-favorites`.

**Commit message.** `feat(backend-v2-favorites): bookmark module, toggles, counts and card state`

---

### Session 18 — backend-v2-pdf-attestation
**Phase:** P2 · **Section:** S6 · **Change:** `backend-v2-pdf-attestation` · **Depends on:** Session 15 (enriched experience identity), Session 11 (title/duration), Session 2 (public evidence URLs). Parallel-safe with Sessions 16/17.

**Objective.** The in-process, streamed PDF attestation: `GET /experiences/:experienceId/attestation` (Auth, owner or org), neutral "Certificate of Verified Experience" with the real fields and a machine-readable verification code — replacing "Civic Recognition" wording and the stale registry-document links.

**In scope.** PDF generation via `pdfkit` streaming directly to the response (`Content-Disposition`, no temp files — Render free has no persistent disk); content: volunteer full name + `VOL-<id>`, experience title, organization name/slug/`ORG-<id>`, position/deliverables summary, `durationMinutes`, verified date, `verificationCode` + a short neutral statement ("Verified by <org> on <date> — code: …") mirroring the inline indicator; bilingual-safe layout (unicode fonts for Arabic/French — embed a bundled font); authorization: volunteer owner, the verifying org, or admin; 404 when the experience is not verified; optional `?lang=ar|fr` (default fr). No PDF is ever persisted.

**Out of scope.** Transcripts/bundles; emailing PDFs; watermarking/tamper-proofing (out of free-tier scope); frontend download button (client links to this URL exposed by Session 15 payloads).

**Inventory references & coverage.** RP Part 7 verifications row (attestation); RP §1.3#2, §1.6#2, §1.7#1, §2.2#5(neutral opportunity-statistics — **out**: stats docs not in scope, only experience attestation), §2.7#10, RP PART 5 "Download Attestation stays, BB".

**Packages & env vars.** `npm i pdfkit` + `npm i -D @types/pdfkit`; (arabic font asset path documented; if bundling offline, provide the TTF in `src/assets` — flagged, do not fetch).

**Tests to write.** Unit: generator content assertions (pdfkit mock outputs fields); authz matrix. E2E: generate → 200 `application/pdf`, bytes non-empty, streamed without disk write (assert no `./storage` temp file), correct headers; owner/org/admin access; stranger 403; unverified/nonexistent 404.

**Acceptance criteria & verification** — Attestation downloads render the real registry-ID + codes + verified-by line, streamed in-process. Verify: build/lint/test/e2e + `openspec validate backend-v2-pdf-attestation`.

**Commit message.** `feat(backend-v2-pdf-attestation): streamed experience attestation PDF (pdfkit)`

---

### Session 19 — backend-v2-org-embed-labels
**Phase:** P3 · **Section:** S7 · **Change:** `backend-v2-org-embed-labels` · **Depends on:** S2 lists (total/page/sort), S5 `application-states` (message/under_review), S11 fields, S9 public fields. **Sole member of S7 (highest fan-out).**

**Objective.** The "everything embeds its labels" session: opportunity feed/detail carry `organization {id,slug,nameFr,nameAr,logoMediaId,verificationStatus}` + `categoryName`/location labels/skill names; application/participation/submission payloads join names; public opportunity detail exposes `position.applicationCount` and assigned volunteer names (decision 5); fills the `ApplicationInboxJoiner` seam.

**In scope.** Opportunity response transforms → `organization` embed + label fields on public feed, public detail, org own list; default-on location/category/skill labels (runtime caching via settings TTL; join to seeded reference data); `position.applicationCount` (count of non-terminal applications per position) + `assigned {volunteer {id, fullName, username, avatarMediaId}}` derived from `task_participants` (decision 5, only names — no contact); application payloads (`/applications/me`, org view, aggregate inbox): volunteer profile summary + org/opp/position names + decision actor (`Accepted by <admin/coordinator name>`); participations payloads: org/task/schedule/location names + position deliverables; submissions payloads: volunteer join; the two inbox routes (`/organizations/me/applications`, `/organizations/me/submissions`) now use filled joiners; keep all joins read-only and batch-populated (N+1 guard per v1 Session 19 convention).

**Out of scope.** Creating new lists; analytics; the org time-window/near-me filter logic (Session 7); messaging.

**Inventory references & coverage.** RP Part 7 org-embed-labels row (+ applications/submissions rows' embed parts); RP §1.1#3, §1.2#4, §1.3#4/#5, §1.5#2/#4, §1.6#3/#4, §2.1#5, §2.2#4, §2.4#8(→ Session 9), §2.6#7, §3.1#7, §3.2#5, §3.4#1, §4.1#2, §4.5#1/#6. Collections: reads only; writes none.

**Tests to write.** Unit: label batch-pipeline (no N+1 — assert query count via mock), application-count per position, assigned names only from `active|accepted|completed` participants. E2E: feed/detail payloads contain full org embed + labels; detail shows `applicationCount` + assigned names (verified org only); aggregate inbox returns joined names; popularity of joins does not slow guest reads (perf smoke ≤ existing).

**Acceptance criteria & verification** — Every card/detail in the design that shows an org name/badge/count is backend-embedded. Verify: build/lint/test/e2e + `openspec validate backend-v2-org-embed-labels`.

**Commit message.** `feat(backend-v2-org-embed-labels): org embeds, labels, application counts and joined inboxes`

---

### Session 20 — backend-v2-moderation-actions
**Phase:** P3 · **Section:** S8 · **Change:** `backend-v2-moderation-actions` · **Depends on:** Session 10 admin-lists (reports enrichments, assignedAdminId), v1 admin. **Sole member of S8.**

**Objective.** One admin action executes a report resolution **and** its platform consequence atomically: unpublish/force-close opportunities, suspend target account, send system notice. Plus the neutral "close/unpublish" opportunity admin routes and the user-notice broadcast route.

**In scope.** `PATCH /admin/reports/:id` body extended `{status, resolution, action?: {type: unpublish_opportunity | suspend_target | close_opportunity | notice, payload}}` — resolved + consequence in one `withTransaction` (report → terminal status; opportunity `published→closed` or `force-close` from `in_progress`; target user/org `suspend` with reason; notification broadcast via `CreatesNotification` to the target or to the volunteer(s) of an opportunity); neutral action vocabulary (no "sanction" wording — RP PART 5); `POST /admin/opportunities/:id/close|unpublish` (admin force-close/unpublish, audit); `POST /admin/users/:userId/notice {message}` (creates a neutral notification, respecting prefs) — the "Send System Notice" action owned here; every consequence writes `audit_logs` + `status_histories`; moderation settings flags (from Session 13) re-checked.

**Out of scope.** Any new report types/fields (Session 10); sanitizing already-hidden reviews (v1 admin); user-to-user notices.

**Inventory references & coverage.** RP Part 7 moderation-actions + notifications(notice) rows + admin opportunities row (close/unpublish); RP §3.2#10, §3.4#8, §3.5#8/#9/#10/#11.

**Tests to write.** Unit: action-type registry + payload validation; transaction rollback (report resolved but action fails → nothing persisted). E2E: report+unpublish atomic; report+notice delivered (prefs-respecting); force-close `in_progress` opportunity; suspend blocks target auth (regression); non-admin 403; audit entries for each.

**Acceptance criteria & verification** — A single admin decision resolves a report and applies its consequence atomically, audited. Verify: build/lint/test/e2e + `openspec validate backend-v2-moderation-actions`.

**Commit message.** `feat(backend-v2-moderation-actions): atomic report resolutions, admin close/unpublish, system notices`

---

### Session 21 — backend-v2-reconciliation-check
**Phase:** Final · **Section:** S9 · **Change:** none (verification-only; no OpenSpec change) · **Depends on:** all S1–S8 archived.

**Objective.** The Definition-of-Done gate for the whole reconciliation: prove every `BUILD-BACKEND` row in RP Part 7 is implemented, nothing from the REDESIGN/DELETE/FCD decisions regressed, and the API surface is neutral (no civic-narrative codes or copy).

**In scope.** A `test/e2e/reconciliation.e2e-spec.ts` that (1) asserts registry IDs present/format on all four entities and **absent** on legacy-styled fields (`DZ-`, `ALG-`, `TCA-`, `GHT-`, `VXP-` codes); (2) smoke-covers every new route from RP Part 7 (presence + authz): favorites, prefs, activity, org aggregates/inboxes/lists, admin analytics/histories/assign/notice/csv, attestation, maintenance/system-status, profile-completion, duplicate, logout-others, experience lists; (3) re-verified decisions: public-profiles opt-out default, `under_review` flow, media org-read + guest public read, guest apply → redirect contract (frontend), and that no `perks`/logistics fields were added (`schemaKeys` guard against `perks`…, `hostLogistics`, `accommodation`, `languageOfRecord`). Plus: `openspec validate --all --strict` clean, both pre-S1 active changes archived and their specs absorbed, and a written **Contract-change sign-off** (see §2) confirming the ☑ rows with the owner.

**Out of scope.** New features; the design-side work (styled by a separate BMD/redesign task — out of this document's scope); performance hardening (v1 Session 19 already exists).

**Tests to write.** The reconciliation spec above; a CSV/PDF smoke asserting both exports stream (no disk artifacts); a perf smoke on the heaviest embedded list.

**Acceptance criteria & verification** — (1) every RP Part 7 route+field exists; (2) all v1 + v2 tests green (`npm run build && npm run lint && npm test && npm run test:e2e`); (3) `openspec validate --all --strict`; (4) owner signed the §2 contract-change list. No OpenSpec change is created; commit the spec as-is.

**Commit message.** `test(backend-v2-reconciliation): final acceptance gate over the v2 slate`

---

## 5. Session runner (paste this per session)

Generic prompt; replace the `<…>` placeholders from the table below. Works for any session in §4.

```
Run Session <N> of docs/ROADMAP_V2.md: "<TOPIC LABEL>".

Change: backend-v2-<TOPIC>. Section: <S1..S9>. Workspace: repo root C:\Users\Failasouf\Desktop\projects\basmatck; backend code lives in /backend. Never push. Never touch other sessions' scopes, backend-inventory.md, or any ARCHIVED OpenSpec change.

PRECONDITIONS: `openspec list` shows `data-and-locale-fixes` and `submissions-verification-experiences` as ARCHIVED. If active, do NOT proceed — flag it.

PHASE 1 — AUTHOR THE OPENSPEC CHANGE (then stop for my review):
1. Read docs/ROADMAP_V2.md §4 "Session <N>" and the RP Part 7 row + cited RP § items. Run `openspec list`; confirm backend-v2-<TOPIC> is NOT already present, then:
     openspec new change backend-v2-<TOPIC> --description "<scope line>"
2. For each artifact in order (proposal, specs, design, tasks), run `openspec instructions <artifact> --change backend-v2-<TOPIC>` first, then write:
     openspec/changes/backend-v2-<TOPIC>/{proposal.md, specs/<capability>/spec.md, design.md, tasks.md}
   Use ADDED for new capabilities (counters, favorites, notification-prefs, activity), MODIFIED for existing ones. Differentiate within-Change parallel sessions: separate capability specs per entity, one change each.
3. Validate: `openspec validate backend-v2-<TOPIC>`; `openspec status --change backend-v2-<TOPIC>`.
4. STOP. Reply with capabilities, task count, deviations. Wait for my go.

PHASE 2 — IMPLEMENT (only after I say go):
5. Work tasks.md in /backend; check off each item. Stay inside the session scope. Honor the section's file-disjointness; if a target file is ALSO edited by a parallel session in the same Section, STOP and flag (it was de-conflicted at planning time, so this indicates drift).
6. Verify from /backend: npm run build; npm run lint; npm test; npm run test:e2e. Then from repo root: openspec validate backend-v2-<TOPIC> (final sessions: also openspec validate --all --strict).
7. Archive: openspec archive backend-v2-<TOPIC> -y   (skip for Session 21 — no change).
8. Commit locally: git add -A; git commit -m "<suggested commit message>". Never push, never amend, never branch unless asked.
9. Report: routes/fields/collections added, tests run, verification results, archive status, deviations.
```

Mapping of `<N>`/`<TOPIC>`: 1 → registry-ids, 2 → media-access, 3 → notification-prefs, 4 → portfolio-meta, 5 → application-states, 6 → org-ops, 7 → pagination-totals, 8 → admin-analytics, 9 → public-exposure, 10 → admin-lists, 11 → opportunity-fields, 12 → activity-feed, 13 → settings-expansion, 14 → org-facts, 15 → experience-enrichment, 16 → org-dashboard, 17 → favorites, 18 → pdf-attestation, 19 → org-embed-labels, 20 → moderation-actions, 21 → (none).

**Parallel note.** Sessions within one Section may run on separate branches/worktrees, but each archives + merges its own change sequentially; never run two OpenSpec workers against the same `openspec/changes/` tree simultaneously.

---

## 6. Definition of done (whole backend v2 slate)

1. **Every RP Part 7 row is implemented**: all listed new/exchanged routes exist with correct access, all column/collection additions landed, and the four new collections (`counters`, `favorites`, `notification_prefs`) behave per spec.
2. **Decisions honored**: public profiles are opt-out (decision 5); guests redirect, never fake-apply (design, has backend route surface); media ≤5 MB + 2-step + no audio/video-upload (v1 media + Session 2 allowance incl. new purposes); no perks/logistics/annua-report workflow fields beyond `annualReportMediaId` (FCD #1/#2/#3); contribution areas derived, not stored (FCD #4); messaging/portfolio-screen/ranking/verify-page removals left no orphan routes (RP PART 3).
3. **Neutral surface**: no civic-narrative identifiers or copy in any API payload (asserted by Session 21).
4. **Contract reviewed**: the §2 list (esp. the ☑ behavior/widening rows) is signed off by the owner before Session 21 runs.
5. **OpenSpec clean**: all 20 `backend-v2-*` changes archived, the two pre-existing active changes archived, `openspec validate --all --strict` passes, `openspec doctor` healthy.
6. **Tests green**: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` pass from `/backend` at every session boundary, including the Session 21 reconciliation suite.
7. **No free-tier violation introduced**: attestation + CSV stream in-process (no disk), no Redis/queues/paid services; Atlas 512MB budget respected (new collections are small and indexed; flagged indexes reviewed with `explain()` in v1 Session 19 discipline).
8. **Git history**: one local commit per session, never pushed, suggested messages used.
```