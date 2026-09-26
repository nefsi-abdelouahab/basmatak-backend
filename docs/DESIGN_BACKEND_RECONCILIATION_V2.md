# Design ↔ Backend Reconciliation V2 (delta pass)

Scope: analysis only — no code, no backend edits, no design edits, no OpenSpec changes.
This is a **delta pass** over `docs/DESIGN_BACKEND_RECONCILIATION.md` (the "old reconciliation")
and `docs/RESOLUTION_PLAN.md` (the "plan"), re-verified against the **current v2 backend contract**.

Authoritative sources for "current": `docs/API.md`, `docs/ROADMAP_V2.md` + `docs/ROADMAP_V2_REPORT.md`
(final verification: 64 suites/627 unit, 42 suites/487 e2e, `openspec validate --all --strict` 35/35,
`openspec list` = zero active changes), and the implemented controllers under `backend/src`
(which are the exact source of the live Swagger at `/api/v1/docs`). The old reconciliation and
`RESOLUTION_PLAN.md` are treated as **historical record of product decisions only** — their field
and route names are stale wherever v2 renamed/restructured them.

Method: each of the **33** screen folders in `design/` (each: `code.html`, `DESIGN.md`, `screen.png`)
was re-checked field/action-by-field/action against the controller inventory in `backend/src`
(full route list extracted from every `*.controller.ts`). `screen.png` files were not visually
inspected; `code.html` remains the rendering source of truth.

Headline fact: the old reconciliation counted **34** folders; `design/` now contains **33**.
The missing folder is the standalone **My Portfolio** screen — the plan's DELETE decision (D1) has
already been applied to the design set. No other folder was added or removed.

Global convention reminders (apply to every verdict below): base path `/api/v1`; pagination is
cursor-based **`CursorPage { items, nextCursor, limit, total, page, pages }`** (v2: `total` populated,
`page`/`pages` added); errors are `{ statusCode, code, message, details? }` with UPPER_SNAKE codes;
IDs are Mongo ObjectIds; `registryId` (`VOL-`/`ORG-`/`OPP-`/`EXP-` + 6 digits) is **display-only**,
never a route key.

---

## A. RESOLUTION_PLAN Part 7 — planned name → CURRENT implemented name

Every BUILD-BACKEND row the plan promised was verified present. Names match the plan except where
noted in the right column (these are the renames a frontend session must use).

| # | Plan item (Part 7 wording) | CURRENT implemented route/shape | Differs from plan? |
|---|---|---|---|
| 1 | Registry IDs `VOL-/ORG-/OPP-/EXP-` on 4 entities | `registryId` on volunteer_profile, organization, opportunity, experience payloads; `counters` collection | No |
| 2 | `CursorPage` gains `total/page/pages`; `sort` + multi-value filters; `nearMe`, `minExperiences`, date ranges, `format`, facets; `submissions.title` | Same, implemented across feed/talents/experiences/submissions/applications/org lists | No |
| 3 | `GET /admin/status-histories?entityType=&entityId=` | `GET /admin/status-histories` (same) | No |
| 4 | Sessions: `device`, `userAgent`, `isCurrent`; `POST /auth/logout-others`; `users.lastActivityAt` | `POST /auth/logout-others`; `GET /users/me/sessions` rows carry device metadata + derived `isCurrent` | No (note: no geo/IP capture — dropped per plan) |
| 5 | Public opt-out defaults; `lastName`→`fullName`; `headline`, availability note, `preferredDomains`, `geographicBase`; `stats`, `createdAt` public; derived `areasOfContribution`; `GET /volunteers/:username/reviews` | All present; `PATCH /volunteers/me` + `PATCH /volunteers/me/public-settings` accept new fields | No |
| 6 | Portfolio `typeLabel`, `tags[]` | Same; on `POST/PATCH /portfolio/me` DTOs + public `GET /volunteers/:username/portfolio` projection | No |
| 7 | `GET /organizations?q=&page=` public search | `GET /organizations` + `OrganizationListQueryDto` (q/page supported) | No |
| 8 | Media purposes `opportunity_cover`, `organization_cover`, `organization_document`; `submission_evidence` defaults `private`; org-read branch; guest public-media read | Same; `GET /media/:mediaId` matrix updated (incl. F1 fix `media-org-read`, committed `7ef7a39`) | No |
| 9 | Favorites: `POST/DELETE /favorites/opportunities/:id`, `POST/DELETE /favorites/talents/:username`, `GET /favorites`, `GET /favorites/counts`; `favorited`/counts on cards | Same, **plus** `GET /favorites/lookup` (extra beyond plan — use for card state) | Additive extra |
| 10 | Apply body `{message?}`; `under_review` + `POST /applications/:id/start-review`; `GET /organizations/me/applications` aggregate | Actual: `POST /opportunities/:opportunityId/positions/:positionId/applications` accepts `message`; `POST /applications/:applicationId/start-review`; `GET /organizations/me/applications` | Path-param naming only (`:applicationId`, not `:id`) |
| 11 | `GET /organizations/me/participants` (`?q=&opportunityId=&status=&page=`, incl. completed) + submission-state join | Actual: `GET /organizations/me/participants` (via `OrgDashboardController` `@Get('participants')` on `organizations/me`) | Controller path identical; plan prose shorthand matched |
| 12 | New `GET /organizations/me/experiences` (`?q=&opportunityId=&visibility=&sort=&page=`) + CSV; `GET /admin/volunteers/:id/experiences`; dashboard `latestVerifiedExperience`; real `durationMinutes`; org identity + `verifiedAt` + `verificationCode` | Actual: `GET /organizations/me/experiences`; `GET /admin/volunteers/:volunteerId/experiences`; `GET /volunteers/me/dashboard.latestVerifiedExperience` | Param name `:volunteerId` (not `:id`) |
| 13 | `GET /notifications/preferences` + `PATCH`; `POST /admin/users/:userId/notice` | Same | No |
| 14 | Admin lists: `?q=&filters&sort=&page=&pageSize=&format=csv`, `total/pages`, label/count embeds, status `{reason,notes}`, reports `title`/`priority`/assign/target summary, audit display names | Same across `/admin/users`, `/admin/volunteers`, `/admin/organizations`, `/admin/opportunities`, `/admin/reports`, `/admin/audit-logs`; `PATCH /admin/organizations/verifications/:rowId/assign`; `GET /admin/organizations/:organizationId/verification/latest`; `PATCH /admin/reports/:reportId/assign` | No |
| 15 | `GET /admin/analytics/overview|series|queue` (+ per-org footprints) | Actual: `GET /admin/analytics/overview`, `GET /admin/analytics/series`, `GET /admin/analytics/queue` | No |
| 16 | `PATCH /admin/reports/:id` with `{status, resolution, action:{type…}}`; admin close/unpublish; `POST /admin/users/:userId/notice` | Actual: `PATCH /admin/reports/:reportId` (+ `PATCH /admin/reports/:reportId/assign`); opportunity force-close via **`PATCH /admin/opportunities/:opportunityId/status`** (not a `POST …/close` route — the plan's "`POST /admin/opportunities/:id/close` (or status `closed`)" resolved to the status-PATCH form); moderation `action` types `unpublish_opportunity | close_opportunity | suspend_target | notice` | **DIFFERS — use status-PATCH + report-action, no admin close POST** |
| 17 | Settings whitelist; `POST /admin/ops/maintenance`; `GET /system/status` (public) | Actual: `PUT /admin/settings/:key`; `POST /admin/ops/maintenance`; `GET /system/status` | No |
| 18 | `opportunities`: `mode`, `coverMediaId`, `endDate`, `durationMinutes`, `prerequisites[]`, `positions[].deliverables[]`, `positions[].startAt`; `GET /organizations/me/opportunities/:id`; `POST /organizations/me/opportunities/:id/duplicate` | Same. **No `perks[]`, no host-logistics/accommodation/language** (FCD CUT honored) | No |
| 19 | Org facts: `coverMediaId`, `type`, `registrationNumber`, `location{}`, `website`, `foundedYear`, `contact{}`, `focusDisciplines[]`, `operatingScope`, `publicProfile.enabled`, `annualReportMediaId?`; `GET /organizations/me/profile-completion`; `DELETE /organizations/me`; public payload extended; public opps `?status=published\|completed\|closed` | Same | No |
| 20 | Activity: `GET /organizations/me/activity`, `GET /volunteers/me/activity` | Same | No |
| 21 | Attestation: `GET /experiences/:experienceId/attestation` (streamed PDF, `Content-Disposition: attachment`, never persisted) | Same | No |
| 22 | Org embeds on opportunity responses (`organization {id,slug,nameFr,nameAr,logoMediaId,verificationStatus}` + `categoryName`/location/skill labels); `position.applicationCount` + assigned volunteer names; joined application/participation/submission payloads; decision actor | Same | No |

Net: **1 naming diff** (admin close = status-PATCH, §A#16), **1 additive extra** (`favorites/lookup`, §A#9),
**1 dropped capture** (geo/IP on sessions — device metadata only, §A#4). Everything else matches the plan verbatim.

---

## B. Screen-by-screen delta (33 folders)

Verdict scale: **aligned** (build as designed + v2 fields) · **minor field-name update** (same screen,
swap stale names/codes for current ones) · **needs new screen** (does not exist, design fresh) ·
**needs owner decision** (open product call blocking the frontend session).

### Volunteer (8)

1. **Volunteer Dashboard** — OLD: blocked (null latest-experience, no save, no org embed, stub hours).
   V2 DELTA: `GET /volunteers/me/dashboard` now returns real `latestVerifiedExperience`;
   favorites toggles + `isFavorited` exist; opportunity payloads embed `organization` + labels;
   `durationMinutes` is real. CURRENT STATUS: **minor field-name update** (bind cards to
   `registryId`/`organization` embed/`isFavorited`; drop nothing).
2. **Opportunities** — OLD: blocked (no mode/duration/sort/near-me/totals/save).
   V2 DELTA: `mode`, `durationMinutes`, `sort`, multi-value filters, `nearMe=me`, `total/page/pages`,
   favorites all present on `GET /opportunities`. CURRENT STATUS: **minor field-name update**.
3. **Opportunity Details** — OLD: blocked (meta boxes, recognition/PDF, sidebar stats, ref code, save).
   V2 DELTA: `endDate`/`durationMinutes`/`mode`/`prerequisites`/`coverMediaId`/`position.applicationCount`
   + assigned names + org embed present; attestation is `GET /experiences/:experienceId/attestation`
   (streamed, link directly); "Ref BT-2026-084" → `OPP-<registryId>`; "Civic Recognition" → neutral
   "Certificate". Perks/logistics blocks were CUT (FCD) — remove, do not build fields.
   CURRENT STATUS: **minor field-name update** (+ cut the perks/logistics blocks).
4. **Discover Talents** — OLD: blocked (counts, card stats, filters, facets, sort, contact/invite).
   V2 DELTA: `GET /talents` supports `minExperiences`, `hasAvailability`, `portfolio`, `skillIds[]`,
   `wilayaIds[]`, `sort`, facet counts, totals; `TalentCard` carries public stats/availability/portfolio
   counts + `isFavorited`. Contact/Invite stay DELETED (no messaging). CURRENT STATUS: **minor field-name update**.
5. **My Applications volunteer** — OLD: blocked (message, joins, timeline, date filter, contact).
   V2 DELTA: apply accepts `{message?}`; `GET /applications/me` embeds org/opp/position names +
   decision actor; `under_review` is a real state (`POST /applications/:applicationId/start-review`);
   `?from=&to=` supported; audit timeline via `GET /admin/status-histories` pattern is admin-side —
   volunteer timeline renders from application `status` + activity feed (`GET /volunteers/me/activity`).
   "Application ID #APL-…" renders client-side from ObjectId (no backend id — unchanged).
   Contact coordinator stays DELETED. CURRENT STATUS: **minor field-name update** (add Under-review tab).
6. **My Participations** — OLD: blocked (messaging, attestation PDF, joins).
   V2 DELTA: attestation streams from `GET /experiences/:experienceId/attestation`; participation
   payloads join org/task/schedule/location + position deliverables. Messaging stays DELETED.
   CURRENT STATUS: **minor field-name update**.
7. **My Experiences** — OLD: blocked (PDF export, audio, filters, verified-by join, registry codes).
   V2 DELTA: attestation PDF present; audio stays dropped (images/PDF/link only);
   `GET /experiences/me` supports `?categoryId=&skillId=&from=&to=`; payloads carry org identity +
   `verifiedAt` + `verificationCode` + `EXP-<registryId>`; "Audited 100%" removed.
   CURRENT STATUS: **minor field-name update**.
8. **Submit Contribution Organization-Dashboard** (volunteer flow) — OLD: redesign-required (500 MB
   claims, free-text title, host allowlist, privacy claim, missing consent, single-step gallery).
   V2 DELTA: `submissions.title` now exists (optional, settable on draft); evidence stays
   ≤5 MB jpeg/png/webp/pdf + video-as-link (youtube.com, youtu.be, drive.google.com);
   `submission_evidence` defaults `private` + owning-org read restored (F1 fix);
   `consentConfirmed` required for imagery (consent checkbox stays mandatory);
   2-step presigned flow (`POST /media/uploads` → `{mediaId, uploadUrl}` → `POST /media/:mediaId/confirm`)
   with progress state. CURRENT STATUS: **aligned** (redesign already specified in plan Part 4;
   backend now backs every element — build to the v2 shape, not the old copy).

### Organization (9)

9. **Organization Dashboard** — OLD: blocked (cover, location, foundedYear, aggregates, joins, activity).
   V2 DELTA: `coverMediaId` (+ purpose `organization_cover`), `location{}`, `foundedYear`,
   `GET /organizations/me/stats`, `GET /organizations/me/participants`, `GET /organizations/me/activity`,
   joined submissions/applications inboxes all present; hours = `sum(durationMinutes)`.
   CURRENT STATUS: **minor field-name update**.
10. **My Opportunities** — OLD: blocked (totals, search, sort, counts, PDF, duplicate, non-published read).
    V2 DELTA: `total/pages`, `?q=`, `sort`, embedded app/participant counts, `GET /organizations/me/opportunities/:id`
    (owner read incl. drafts), `POST /organizations/me/opportunities/:id/duplicate` all present.
    "Report (PDF)" for opportunities was dropped (only experience attestation ships — do not build an
    opportunity-PDF button). Publish gating surfaces `verificationStatus` + `GET /organizations/me/publish-gate`.
    CURRENT STATUS: **minor field-name update** (drop the Report-PDF button).
11. **Create Opportunity** — OLD: blocked (endDate, prerequisites, mode, deliverables, cover, category IDs, publish gate).
    V2 DELTA: all fields present (`mode`, `endDate`, `durationMinutes`, `prerequisites[]`,
    `positions[].deliverables[]`/`startAt`, `coverMediaId` purpose `opportunity_cover`); category select
    wires to `GET /skill-categories` (ObjectIds); publish gated on verified + publish-gate.
    CURRENT STATUS: **minor field-name update**.
12. **Applications** (org review) — OLD: blocked (under-review state, search, aggregate inbox, message,
    applicant skills/experiences, reject reason, ref code).
    V2 DELTA: `under_review` + `POST /applications/:applicationId/start-review` real;
    `GET /organizations/me/applications` aggregate (`?opportunityId=&status=&q=&page=`) with name joins;
    `message` persisted; applicant skills/experiences via public profile (opt-out default-on);
    reject requires `reason` (dialog mandatory). "Ask clarification" stays DELETED.
    CURRENT STATUS: **minor field-name update**.
13. **Participants Organization-Dashboard** — OLD: blocked (aggregate roster, search/sort, completed omitted,
    invented labels, submission join, minted state, messaging, skills).
    V2 DELTA: `GET /organizations/me/participants` incl. `completed` + submission-state/files join;
    `?q=&opportunityId=&status=&page=`; minted state via `GET /organizations/me/experiences`;
    skills via public profile. Labels realign to real participant/submission statuses.
    CURRENT STATUS: **minor field-name update**.
14. **Contributions** (org verification inbox) — OLD: blocked (Verified tab, To-review conflation, labels,
    search, format filter, sort, joins, council flag, compliance column, atomic approve, privacy).
    V2 DELTA: `GET /organizations/me/experiences` backs the "Verified" tab; submissions inbox supports
    multi-status `submitted,under_review`, `?q=`, `?format=`, `?sort=`, totals, volunteer join;
    approve = single "Approve & issue verification" (`POST /submissions/:submissionId/verify`,
    atomic incl. mint); reject = `POST /submissions/:submissionId/reject` (`reason`);
    "Changes requested" maps to `rejected`; council flag stays DELETED; reviewer notes surface as neutral
    `review` (not "Compliance"). CURRENT STATUS: **minor field-name update**.
15. **Verified Experiences Organization-Dashboard** — OLD: entirely missing data source (no endpoint).
    V2 DELTA: `GET /organizations/me/experiences` + `format=csv` exists; rows carry `verificationCode`,
    `publicVisibility`, `EXP-<registryId>`; hours from real durations; "Copy verification link" →
    `GET /verify/:verificationCode` (inline indicator, no standalone page); attestation PDF streams;
    "SHA-256 / Public Civic Ledger / DZ-CIVIC-…" removed. CURRENT STATUS: **minor field-name update**
    (biggest status swing in this group: unbuildable → fully backed).
16. **Organization Profile** — OLD: blocked (cover, location, website, foundedYear, type, statute, focus,
    registry ID, annual report, contact, experiences, activity, PATCH scope).
    V2 DELTA: all fact fields present (`type`, `registrationNumber`, `location{}`, `website`,
    `foundedYear`, `contact{}`, `focusDisciplines[]`, `operatingScope`, `coverMediaId`,
    `annualReportMediaId?` optional — FCD KEPT, nullable, no workflow); statute/"Law 12-06 Accredited"
    → neutral `registrationNumber` + `ORG-<registryId>`; experiences via org list; activity via
    `GET /organizations/me/activity`; expanded `PATCH /organizations/me`.
    CURRENT STATUS: **minor field-name update**.
17. **Organization Settings** — OLD: blocked (portal URL, session device rows, this-device, logout-others,
    notification prefs, privacy toggles, org delete).
    V2 DELTA: `website` covers portal URL; session rows carry `device`/`userAgent` + derived `isCurrent`;
    `POST /auth/logout-others` exists; `GET/PATCH /notifications/preferences` exists;
    org visibility = neutral `publicProfile.enabled` toggle (orgs are not in the talent directory —
    relabel, per plan); `DELETE /organizations/me` (soft-archive org + user, revokes sessions) exists.
    CURRENT STATUS: **minor field-name update**.

### Admin (6)

18. **Admin Dashboard** — OLD: blocked (participants window, deltas, report counts, attention queue,
    time series, audit names, health/compliance, metric mismatch).
    V2 DELTA: `GET /admin/analytics/overview` (deltas, 30d active, per-status, `medianDecisionHours`),
    `GET /admin/analytics/series?days=`, `GET /admin/analytics/queue`, enriched audit-logs all present;
    System Status reads `GET /health` (+ `GET /system/status` for maintenance flag). No hardcoded figures.
    CURRENT STATUS: **minor field-name update**.
19. **Manage Volunteers** — OLD: blocked ("Pending" status, search, filters, skills join, location names,
    ref codes, last-active, national-ID badge, latest engagement, system notice, suspend reason, histories,
    CSV/pagesize/totals).
    V2 DELTA: `GET /admin/volunteers` has `?q=`, field filters, `sort`, `page`/`pageSize`, `total/pages`,
    `format=csv`, joined skills + location labels; `users.lastActivityAt` shown; "Pending" removed (real
    `active|suspended|deleted`); national-ID badge removed ("Email verified" only); latest engagement via
    `GET /admin/volunteers/:volunteerId/experiences`; `POST /admin/users/:userId/notice` exists;
    `PATCH /admin/users/:userId/status` accepts `{reason, notes}` → `status_histories`;
    `GET /admin/status-histories` exists. CURRENT STATUS: **minor field-name update**.
20. **Manage Organizations** — OLD: blocked (type, location, registry refs, contact/.dz, status vocab,
    request-info, officer, footprint, latest dossier, deltas, CSV, seal).
    V2 DELTA: type/location filters + contact/website fields present; `assignedAdminId` +
    `PATCH /admin/organizations/verifications/:rowId/assign`; `GET /admin/organizations/:organizationId/verification/latest`;
    per-org footprints via analytics; status vocab = `status` + `verificationStatus`;
    "Request Info" stays DELETED; "Grant Law 12-06 Seal" → neutral "Approve verification"
    (`POST /admin/organizations/:organizationId/verification/approve|reject`).
    CURRENT STATUS: **minor field-name update**.
21. **Manage Opportunities** — OLD: blocked (category names, capacity, app counts, assignee names, ledger,
    registry file, location, close action, org inquiry, flagged metric, totals, filters, CSV, status pills).
    V2 DELTA: positions+capacity in projection, aggregate app counts, assigned names (decision 5),
    location, `PATCH /admin/opportunities/:opportunityId/status` for force-close (see §A#16),
    flagged metric derived from open reports, full filters + CSV. "Org Inquiry" stays DELETED.
    CURRENT STATUS: **minor field-name update**.
22. **Reports & Moderation** — OLD: blocked (title, ref code, type vocab/filter, reporter join/badge,
    priority, entity details, history, secretariat, officer, composite resolve, sanctions, compliance copy,
    filters, CSV).
    V2 DELTA: `reports.title?`, `priority low|normal|high`, `assignedAdminId` +
    `PATCH /admin/reports/:reportId/assign`, reporter summary + target summary joins, history via audit +
    status-histories, atomic `PATCH /admin/reports/:reportId` with `action` (neutral vocabulary),
    full filters + CSV. "Contact Secretariat" stays DELETED.
    CURRENT STATUS: **minor field-name update**.
23. **Admin Settings** — OLD: totally conflicting (1 writable key).
    V2 DELTA: widened `system_settings` whitelist (platform name/summary, language/timezone/date format,
    session duration, moderation flags, registration/publishing kill-switches, maintenance mode);
    `POST /admin/ops/maintenance`; public `GET /system/status`; publishing-disabled → `PUBLISHING_DISABLED`,
    registration-disabled → 403, maintenance → guarded 503. Civic rows ("DZ-NAT-REG sync", "Statutory
    Mandate") dropped, not renamed. CURRENT STATUS: **minor field-name update**.

### Public (5)

24. **Public Landing Page** — OLD: blocked (org search, org/label joins, talent stats, guest apply, sample record card).
    V2 DELTA: `GET /organizations` public search present; opportunity rows embed org + labels; talent
    cards carry public stats; guest Apply → frontend redirect to Login (decision 10, backend 401 only);
    sample card rebuilt neutral (title, org, date, `EXP-<id>`, "Verified").
    CURRENT STATUS: **minor field-name update**.
25. **Public Talent Profile** + 26. **Public Volunteer Profile** → **MERGE** (plan M1, still to execute on
    the design side — both folders still exist). Base = Talent layout + Volunteer folder's richer media
    grid + stats strip (now publicly backed). Shared surface: `GET /volunteers/:username`
    (no `@` in route), `/experiences`, `/portfolio`, `/reviews`. See §E for the 5-point checklist.
    CURRENT STATUS: **merge pending (design-side)** — backend fully backs the merged screen.
27. **Public Organization Profile** — OLD: blocked (location, website, stats ribbon, foundedYear, mandates,
    card labels/refs/dates, completed archive, sidebar registry/authority/audit/contact, verification rate).
    V2 DELTA: fact fields + public aggregates (`OrgPublicStatsProvider` filled by org-dashboard) present;
    `GET /organizations/:slug/opportunities?status=published|completed|closed` (+ voluntary counts);
    cards use category embed + `OPP-<registryId>` + real `endDate`/`durationMinutes`; sidebar keeps neutral
    contact (`contact{}`, `website`, coordinates) — authority/audit lines dropped; "Deliverable Verification
    Rate" → neutral "Submission response rate" (+ per-domain breakdown).
    CURRENT STATUS: **minor field-name update**.
28. **Public Opportunity Details** — OLD: blocked (org identity, registry code, Law pill, hours/dates,
    gallery, assigned/counts, statutory cards, related links, guest apply, commitment hours, publisher card,
    dispatch strip).
    V2 DELTA: org embed resolves identity + profile link (slug now in payload); `position.applicationCount`
    + assigned names public; `endDate`/`durationMinutes`/`coverMediaId` gallery real; statutory/insurance/
    dispatch blocks removed; logistics trio CUT (FCD — no fields); related via embedded slug (published-only
    unless the public archive covers it); guest Apply → Login redirect.
    CURRENT STATUS: **minor field-name update**.

### Auth & System (5)

29. **Create Account** — OLD: no conflicts (registration-type selector, not sign-in). V2 DELTA: none.
    CURRENT STATUS: **aligned**.
30. **Register Organization** — OLD: redesign-required (decision 7 minimalism + civic rule).
    V2 DELTA: registration stays `{email, password, phone?}` (`POST /auth/register/organization`,
    auto-login); all facts move to profile-completion (`GET /organizations/me/profile-completion` +
    expanded `PATCH /organizations/me`); dossier gated on verified email (`EMAIL_NOT_VERIFIED` 403);
    valid phone sample (`+213555123456`); neutral "Pending review" + `ORG-<registryId>`.
    CURRENT STATUS: **aligned** (redesign already specified; backend matches it exactly).
31. **Forgot Password** — OLD: TTL copy (30 min → 1 h) + 429 handling.
    V2 DELTA: `POST /auth/forgot-password` always-204 (anti-enumeration kept); reset TTL 1 h;
    throttle 3/hr → 429 `RATE_LIMITED` binds to the new 429 state. CURRENT STATUS: **minor field-name update** (copy only).
32. **Email Verification** — OLD: success-state overclaim + resend-session trap.
    V2 DELTA: `POST /auth/verify-email` `{token}`; resend `POST /auth/resend-verification` (Bearer);
    email change via `PATCH /users/me` re-verifies; success = neutral "Email verified" + org stays
    `verificationStatus: pending`. CURRENT STATUS: **minor field-name update** (copy + sign-in CTA).
33. **Global Error & System States** — OLD: covers 404/403/500/Maintenance/Network; missing 401/429;
    403 collapses 4 codes; no `{code}` mapping; civic 500 copy.
    V2 DELTA: backend now defines the exact codes to bind — 401 session-expired, 429 `RATE_LIMITED`,
    403 variants (`FORBIDDEN` / `ACCOUNT_SUSPENDED` / `ACCOUNT_INACCESSIBLE` / `EMAIL_NOT_VERIFIED`),
    503 maintenance (maintenance mode → guarded reads 503; `GET /system/status` flag).
    The states themselves still do not exist in design. CURRENT STATUS: **needs new screen**
    (extend existing screen with 401/429 + 403 variants + code mapping + neutral 500 copy).

Status-change tally vs the old reconciliation: **31 of 33** existing screens changed status
(everything blocked on BUILD-BACKEND is now backed — verdicts move to aligned/minor-update;
"My Portfolio" left the set via DELETE; the Talent↔Volunteer merge is still pending design-side).
Unchanged: Create Account (was already clean) and Global Error (still needs the new states).

---

## C. The 7 previously-missing screens — still needed, with CURRENT routes

All 7 are confirmed still missing from `design/` and still needed. Data/actions below use CURRENT route names.

1. **Sign In / Login** (new screen). `POST /auth/login` `{email, password}` (no role) →
   `{accessToken, refreshToken, user}`; then `GET /auth/me` for role-based redirect
   (volunteer/organization/admin). States: `INVALID_CREDENTIALS`, unverified-email (CTAs to Email
   Verification + resend), `ACCOUNT_SUSPENDED`; "Sign in to continue" entry from guest apply/save
   redirects (decision 10). Links: Create Account, Forgot Password.
2. **Reset Password** (new screen). Token from email link; `POST /auth/reset-password`
   `{token, newPassword}` (min 8, max 72; revokes sessions); states: invalid/expired/used token
   (TTL 1 h); success → Sign In.
3. **Volunteer Registration** (new screen). `POST /auth/register/volunteer` `{email, password, phone?}`
   (phone `/^\+?[0-9]{8,15}$/`, no spaces); auto-login + email-verification notice; next-step CTA →
   Volunteer Profile completion (`GET/PATCH /volunteers/me`, skills, availability).
4. **Volunteer Profile (own)** (new screen). `GET/PATCH /volunteers/me` (names incl. `lastName`,
   `headline`, bio, birthDate, location, avatar via 2-step media purpose `avatar`);
   `GET/POST/PATCH/DELETE /volunteers/me/skills`; `GET/PUT /volunteers/me/availability`;
   `GET/PATCH /volunteers/me/public-settings` (opt-out toggles incl. `showStats`, all default on);
   `GET /volunteers/me/dashboard` stats; "View public profile" link (`/volunteers/<username>`, no `@`).
5. **Volunteer Settings** (new screen). `PATCH /users/me` (email/phone → re-verify);
   `POST /auth/change-password`; `GET /users/me/sessions` (device metadata + `isCurrent`) +
   `DELETE /users/me/sessions/:id` + `POST /auth/logout-others`; `GET/PATCH /notifications/preferences`;
   `DELETE /users/me` (soft delete, confirm).
6. **Org Verification Dossier upload** (new screen). Guard: `EMAIL_NOT_VERIFIED` 403 → Email Verification
   first. `POST /media/uploads` (purpose `verification_document`, ≤5 MB jpeg/png/webp/pdf) →
   `POST /media/:mediaId/confirm` per document → `POST /organizations/me/verification`
   `{documents: string[]}`; status via `GET /organizations/me/verification`
   (`pending → verified | rejected → pending` resubmit). Neutral copy, no reference codes
   (shows `ORG-<registryId>` after creation).
7. **Session-expired (401) + Rate-limited (429) states** (extend Global Error screen).
   401: re-authenticate CTA → Sign In. 429: neutral retry-later + optional countdown; throttle buckets:
   login 5/min, forgot/resend 3/hr, uploads 20/min. Plus 403 code-variant sub-states and 503-maintenance
   bound to `GET /system/status`.

---

## D. NEW conflicts introduced by v2 changes (did not exist at reconciliation time)

These are additive-capability consequences, not regressions — but a frontend session building from the
old reconciliation alone would miss them:

1. **Opt-out publics invert privacy UX.** Designs assuming private-by-default (gated stats, "Public Profile
   Sync" claims, hidden counts) are now backwards: new profiles are public; settings screens must expose
   opt-out toggles (`showStats` et al.). Affects merged public profile, Volunteer Profile/Settings, Talent cards.
2. **Real `registryId` replaces ALL fabricated codes.** `DZ-…`, `TCA-…`, `APL-…`, `GHT-…`, `VXP-…`,
   `ALG-…`, `BT-2026-084`, `#DZ-2024-ADR-0442` → `VOL-/ORG-/OPP-/EXP-<6 digits>` (+ client-side ObjectId
   short form only for application refs, which intentionally have no registry id).
3. **Streamed downloads, not file URLs.** `GET /experiences/:experienceId/attestation` (PDF),
   org-experiences `format=csv`, and every admin `format=csv` return `Content-Disposition: attachment`
   streams — frontend links directly (authed axios blob download), never stores/expects a file URL.
4. **`under_review` is a real application state.** All application queues/tabs/timelines gain it
   (`pending → under_review → accepted|rejected|withdrawn`); the old "Under review has no status" conflict is gone.
5. **`submissions.title` exists.** The Submit Contribution title field the old design invented is now an
   optional draft-settable backend field — keep the input, wire it.
6. **Save buttons are now functional.** Every bookmark affordance wires to favorites toggles +
   `isFavorited`/`GET /favorites/lookup` — the old "Save → no endpoint" conflict is gone; guest Save →
   Login redirect (decision 10 applies to Save too).
7. **Mode/endDate/duration/prerequisites/deliverables/cover are real opportunity fields.**
   Create + Details screens render them; no placeholders. Perks/logistics inputs must NOT be built (FCD CUT).
8. **Org profile-completion + org delete are real flows.** `GET /organizations/me/profile-completion`
   checklist and `DELETE /organizations/me` need UI (Register Organization's second step lives here).
9. **Session rows carry device metadata + `isCurrent`; `logout-others` exists.** Settings screens render
   browser/OS/device rows and "Sign out other devices" (current session survives).
10. **Maintenance is a real runtime state.** Maintenance mode → guarded reads 503; `GET /system/status`
    drives the Maintenance screen variant (not cosmetic).
11. **Kill-switches are real.** Publishing-disabled → `PUBLISHING_DISABLED` on publish;
    registration-disabled → register 403. Org/Auth screens surface these codes, not generic errors.
12. **Public reviews are a new section.** `GET /volunteers/:username/reviews` did not exist at
    reconciliation time — the merged profile gains a neutral recommendations section.
13. **`areasOfContribution` is derived, not stored.** The FCD-open "% bars" question is resolved:
    computed at read time from verified-experience category/skill breakdown — render as-is, no editor.
14. **Annual report is an optional attachment.** FCD-resolved: `annualReportMediaId?`
    (purpose `organization_document`, no workflow) — Org Profile may show an optional document link; no upload flow.
15. **Public opportunity positions show counts + names.** `position.applicationCount` + assigned volunteer
    names are public — the Details positions section renders real data (was org-authed only).
16. **Guest media reads work (public only).** Public thumbnails/avatars/PDFs render for guests when
    `visibility=public`; private evidence stays 401/404-walled. No auth-gated placeholder needed for public media.
17. **`GET /favorites/lookup` is an extra.** Beyond the plan — the intended card-state source; use it
    instead of deriving `favorited` client-side.

No v2 change reintroduced messaging, ranking, standalone portfolio, or a `/verify/:code` page —
all four removals hold on the backend (no routes exist).

---

## E. Merged Public Talent + Volunteer Profile — 5-point confirmation

Merge direction (unchanged from plan M1): one screen, Talent layout as base + Volunteer folder's richer
media grid; old Volunteer Profile folder removed design-side; links point to `/volunteers/<username>`
(raw username, no `@`).

1. **registryId display** — backed: volunteer `VOL-<registryId>` renders from `GET /volunteers/:username`.
2. **Opt-out-public defaults** — backed: `enabled/showBio/showSkills/showPortfolio/showExperiences/showStats`
   default on; stats strip (`stats.*`), `headline`, `createdAt` render unless the volunteer opts out
   (gated blocks hide, never leak).
3. **Derived "areas of contribution"** — backed: read-time derivation from verified-experience
   category/skill shares (≤8, sorted desc); no stored field, no editor; free-form "Community
   Contributions" list stays CUT.
4. **Public reviews** — backed: `GET /volunteers/:username/reviews` (visible-only, cursor-paginated);
   neutral "Recommended by organizations" section; no tier/endorsement-count copy.
5. **Activity feed section if applicable** — decision: the public profile does **not** get an activity
   stream. Activity feeds are private per-account (`GET /volunteers/me/activity`,
   `GET /organizations/me/activity`); the public profile shows experiences + portfolio + reviews only.
   (This resolves the "if applicable" — not applicable by design.)

---

## F. Flavor-copy decisions (FCD) — resolved, no longer open

Owner-confirmed in `docs/ROADMAP_V2.md` §1 and implemented accordingly; frontend sessions apply them as
cut/keep without re-asking: (1) opportunity perks / "what you receive" — CUT, no fields exist;
(2) org annual report — KEPT as optional `annualReportMediaId`, no workflow; (3) mission logistics
trio — CUT, no fields exist; (4) areas of contribution — DERIVED (§E#3), free-form list CUT.

---

## G. Top residual risks for the frontend build

1. **Stale names are the #1 hazard.** Any session copying field/route names from the old reconciliation
   instead of §A above will mismatch (pagination shape, embeds, `registryId`, favorites, activity,
   aggregates, attestation path, admin close form).
2. **Streamed downloads need an authed-download pattern** (axios `responseType: blob` + `Content-Disposition`)
   shared by attestation, org CSV, and all admin CSVs — one helper in the API layer, not per screen.
3. **Guest-redirect discipline (decision 10)** covers Apply AND Save/favorite AND any authed action on
   public screens — backend only ever returns 401.
4. **Consent checkbox + 2-step upload progress** are acceptance-critical on Submit Contribution and every
   upload surface (avatar, logo, cover, dossier, portfolio): `POST /media/uploads` → PUT bytes →
   `POST /media/:mediaId/confirm`, with the imagery-consent gate before submit.
5. **Arabic/phone/format traps:** phone regex `/^\+?[0-9]{8,15}$/` (no spaces); password min 8 max 72;
   email-verify and reset tokens TTL 1 h; cursor pagination (`limit` default 20, max 50) with
   `page/pages` for numbered UI.
