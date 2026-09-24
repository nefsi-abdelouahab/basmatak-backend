# Design ↔ Backend Reconciliation

Audit of every screen in `design/` (34 folders) against the real backend (source of truth: `backend/src`, cross-referenced in `backend-inventory.md` / `docs/API.md`). No code changes; this is an analysis deliverable only.

## Method & basis

- Each screen was read from its `code.html` (single-file Stitch export). `DESIGN.md` is byte-identical across all 34 screens (MD5 `1BBE9DC0E5110BA7083794465CCF45AD`) and contains only the shared design system.
- `screen.png` could not be inspected — neither the analysis agents nor the main model support image input. `code.html` is treated as the authoritative rendering source; everything in the PNG is present in the markup.
- Backend facts were extracted by fully reading the source tree (237 TS files, ~47k lines) into `FULL-BACKEND-FACTS.md` before any screen analysis.
- Verification against product decisions:
  1. No `organization_members` — respected everywhere (no org-members UI).
  2. No standalone `/verify/:code` QR page — respected (no such page designed; one ambiguous "Verify on National Ledger" link flagged).
  3. Media = 2-step presigned upload (`POST /media/uploads` → upload → `POST /media/:mediaId/confirm`) — the volunteer submit-contribution gallery conflicts (single-step UX, no progress state); other screens show no upload interaction.
  4. No volunteer ranking — no leaderboard anywhere. The "verified experiences counts" shown are unsupported *counts*, not rankings.
  5. Sign-in has no role selection — respected (single "Sign in" action; Create Account is a registration-type selector, not sign-in).
  6. Org stays `pending` after registration — respected by design copy (Register Organization / Email Verification explicitly keep "Under Review").
  7. Standalone Portfolio screen dropped from MVP; Public Volunteer Profile serves portfolio — **violated**: a full "My Portfolio" screen still exists in design (see EXTRA/UNEXPECTED).

## Coverage summary

| Group | Screens | ~Conflict flags |
|---|---|---|
| Volunteer | 8 | 43 |
| Organization | 9 | 92 |
| Admin | 6 | 71 |
| Public | 5 | 52 |
| Auth & System | 6 | 29 |
| **Total** | **34** | **≈ 287** |

### MISSING DESIGN (screens the backend supports but no folder exists)

| Screen | Why it's needed |
|---|---|
| **Sign In / Login** | `POST /auth/login` `{email,password}` (no role); referenced by `data-path="login"` from Create Account / Forgot Password / Email Verification, but no design folder. |
| **Reset Password** | `POST /auth/reset-password` with new password after token; Forgot Password screen implies it ("link expires…"), no folder. |
| **Volunteer Registration** | `POST /auth/register/volunteer` `{email,password,phone?}`; referenced by `data-path="register-volunteer"`, no folder. |
| **Volunteer Profile (own)** | Volunteers have no self-profile screen (orgs have Organization Profile). `GET /volunteers/me`, `PATCH /volunteers/me`, `GET/PUT /availability`, skills CRUD are unrepresented in design. |
| **Volunteer Settings** | No account settings screen for volunteers (orgs have Organization Settings). `PATCH /users/me`, change password, sessions, notification toggles (which have no backend — see Organization Settings), account deletion. |
| **Org Verification Dossier upload** | Register Organization's "Continue to verification" targets `data-path="upload-dossier"` but no folder exists; flow is `POST /media/uploads` (purpose `verification_document`) → confirm → `POST /organizations/me/verification`. |
| **Session expired (401) / Rate limited (429) states** | Global Error screen covers 404/403/500/Maintenance/Network but omits the two most common API errors. |

### EXTRA / UNEXPECTED DESIGN

| Screen | Reason |
|---|---|
| **My Portfolio** | Product decision #7 drops the standalone Portfolio from MVP; script covers it via Public Volunteer Profile. If kept, its category chips, skill chips, Featured flag, dates/counts, experience-links and single-item GET have **no backend counterpart** (13 conflicts, see Auth & System group). |
| **Public Talent Profile vs Public Volunteer Profile** | Redundant — both are the guest `GET /volunteers/:username` page (same anatomy incl. portfolio). Merge/remove one (recommendation: keep Talent, fold in the stats strip if a public stats field is ever added). The "Public Talent Profile" folder was assigned to the Public group; both folders exist as separate screens. |

---

# Volunteer (8 screens)

Cross-cutting: `OpportunityModel` exposes only `organizationId` (no org slug/name/verificationStatus) → org name/logo/verified badge on every card is a data gap (N+1 to `GET /organizations/:slug`, and slug isn't returned). Category = `categoryId`, skills = ObjectIds (names via `GET /skill-categories`, `GET /skills`). **No duration/hours field anywhere** (`volunteer_experiences.duration` always `0`). **No save/bookmark, no messaging, no PDF/export endpoint.**

## Volunteer Dashboard
**Data:** `GET /volunteers/me` (firstName, bio, location, avatar); `GET /volunteers/me/dashboard` (`stats.{completedTasks,verifiedExperiences,volunteerHours}`, `completionPercent`); availability via `GET /volunteers/me/availability`; feed via `GET /opportunities` / `GET /opportunities/recommended`; `GET /skills`.
**Actions:** tabs Recommended/Recently added/Local; apply `POST /opportunities/:id/positions/:pid/applications`.
**Conflicts:** "Latest verified experience" card has no source (`dashboard.latestVerifiedExperience` always `null`); Save bookmark → no endpoint; org name+verified badge on feed cards not embedded; hours on cards have no field.

## Opportunities
**Data:** `GET /opportunities` (q/categoryId/skillId/wilayaId/municipalityId/from/to/hasOpenPositions); labels via reference endpoints.
**Actions:** search q; chip filters; open card; apply; "Save".
**Conflicts:** On-site/Remote/Hybrid mode & "Remote" pill — no `isRemote`/mode field (only `location`); duration ("4 hours") no field; sort dropdown (backend fixed `_id` desc); "Near me" needs authed caller location; result counts ("124 opportunities") have no `total` in CursorPage; Save → no endpoint.

## Opportunity Details
**Data:** `GET /opportunities/:idOrSlug` (title, description, status, startDate, applicationDeadline, location, positions). "Posted Xh ago" derivable from `createdAt`.
**Actions:** apply, withdraw (`POST /applications/:id/withdraw`), report (`POST /reports`), similar (`GET /opportunities?categoryId=`), maps (client-side).
**Conflicts:** meta boxes (Date & Duration "3h", time window, Capacity "3 of 6", Civic Recognition certificate, Hospitality/perks, "Ref BT-2026-084") have no fields; org sidebar stats ("18 Initiatives · 42 Volunteers · 4.9★ since 2014") not in org schema; verified badge derivable only via org profile whose slug isn't exposed; Save / attestation download → no endpoint.

## Discover Talents
**Data:** `GET /talents` (q/skillId/categoryId/wilayaId) → `TalentCard {username,firstName,bio,location,skills,avatar}` (all null-gated by publicProfile flags).
**Actions:** search q; single-value skillId/categoryId/wilayaId filters; view profile/portfolio.
**Conflicts:** result-count banner (no `total`); per-card verified-experience count, documented hours, availability, portfolio preview absent from `TalentCard`; "Verified / 5+ experiences / 100% verification" filters (no params); availability & "Remote" filters (no fields); multi-select skills+locations (API is single-value); skill facet counts (no facet endpoint); sort by experiences/recency (fixed `_id` desc); Contact/Invite → no endpoint.

## My Applications volunteer
**Data:** `GET /applications/me?status=` (pending/accepted/rejected/withdrawn); detail `GET /applications/:applicationId`. Status pills match backend enum exactly.
**Actions:** status filter, withdraw (`POST /applications/:id/withdraw`), reapply, view opportunity, view task (`GET /participations/me`).
**Conflicts:** cover message cannot be supplied (apply route has no body; `applications.message` never written); card org/opp/position titles need joins not provided (may 404 once unpublished); "Application ID #APL-…", "Accepted by Coordinator", audit timeline → no fields; date filter unsupported (`status` only); Contact coordinator → no endpoint.

## My Participations
**Data:** `GET /participations/me?status=` (accepted/active/completed/withdrawn/removed). Tab mapping to these statuses is exact.
**Actions:** submit contribution (`POST /participations/:id/submissions`), details, view opportunity, withdraw.
**Conflicts:** coordinator/messaging ("Contact Field Coordinator", "dispatched via internal messaging") → no module; "Download Civic Attestation (PDF)"/"Download briefing" → no export endpoint; card org/task names, schedule, location need joins not provided; deliverables counts partially derivable from position join.

## My Experiences
**Data:** `GET /experiences/me` (`VolunteerExperienceModel`: title, description, skills ObjectIds, duration=0, evidenceIds, verificationCode); `GET /verifications/:verificationId`; `GET /verify/:code`; `PATCH /experiences/:id/visibility`.
**Actions:** filter tabs (client-side only), sort (works via `_id` desc), toggle visibility (exists), share/verify link.
**Conflicts:** "Download attestation (PDF)" / "Export transcript (PDF)" → no endpoint; **WAV/audio evidence cards — media allowlist is jpeg/png/webp/pdf, max 5 MB, no audio**; category filter tabs (no server filter; client-side only sees current page); "Verified by <org> on <date>" needs verification join + org name; registry-style codes ("ALG-2026-NEF-881") — only 8-char base32 `verificationCode` exists; "Audited 100%" not a field.

## Submit Contribution Organization-Dashboard (volunteer flow)
**Data:** participation context `GET /participations/:id`; current submission `GET /submissions/me|/:id`; lifecycle = submission status chain (draft/submitted/under_review/approved/rejected).
**Actions:** save draft (`PATCH /submissions/:id`), submit (`POST /submissions/:id/submit`), upload evidence (2-step media), link (`POST /media/links`), remove file (`DELETE /media/:id`).
**Conflicts:** "Up to 500 MB / images, videos, documents, audio" incl. ZIP example — **backend is 5 MB + jpeg/png/webp/pdf only**; "Contribution title" free-text (deliverable titles are immutable position snapshots); external link to `archive.algeria-heritage.dz` — host allowlist is youtube.com/youtu.be/drive.google.com only; privacy claim "files private to you+org": default visibility is `public`, and the org-read branch of `MediaAccessService` is an inert seam that always denies (private → org can't read; public → anyone authed can); **no consent checkbox yet `submit` returns 400 `CONSENT_REQUIRED` for imagery**; "Message coordinator" → no endpoint; single-step drag-drop gallery contradicts decision #3.

---

# Organization (9 screens)

## Organization Dashboard
**Data:** `GET /organizations/me` (nameAr/nameFr, description, logoMediaId, verificationStatus); `GET /organizations/me/opportunities?status=`; `GET /organizations/me/submissions?status=submitted`; `GET /notifications` for activity feed.
**Conflicts:** no cover/banner field (logo only); no org `location` ("Timimoun Old Ksar…"); "Established 2018", "Registry #DZ-ALG-7740", statute numbers → no fields; stat cards (12/38/21/7/48) — cursor lists have **no totals**, no aggregate endpoints; submissions list doesn't join volunteer name/avatar; applications show org/opp/position titles not in payload and endpoint is per-opportunity; per-opp position breakdowns (1 accepted/1 pending) need N extra calls; opportunity cards show cover image (opps have no image field, no cover purpose); "Documented hours minted 48" — no org-side hours aggregate.

## My Opportunities
**Data:** `GET /organizations/me/opportunities?status=`; statuses exist in enum.
**Actions:** create, publish (`POST /opportunities/:id/publish`, requires verified org), close/cancel/complete, delete draft (`DELETE /opportunities/:id`), positions CRUD.
**Conflicts:** counters + pagination "1–4 of 12 / Previous/1/2/3" (cursor, no totals, no page numbers); search by title/location/skill (endpoint has only `status`/cursor/limit); sort control (fixed `_id` desc); "18 applications received"/"3 active participants" per card (extra calls); "Report (PDF)" and "Duplicate" → no endpoints; **no org-side single-opportunity read** — public `GET /opportunities/:idOrSlug` requires `status=published`, so draft/completed/closed records can't be fetched by the owner; "Publish" assumes verification passed (403 `ORG_NOT_VERIFIED`, no unverified state surfaced).

## Create Opportunity
**Data:** `POST /organizations/me/opportunities`; category via `GET /skill-categories` (ObjectId); location via `GET /locations/wilayas`; positions `{title,description,requiredCount,requiredSkills}`; media 2-step (purpose? — none for cover).
**Conflicts:** "End date" field — no `endDate` (only `startDate` + `applicationDeadline`); prerequisites textarea — no field; "On-site fieldwork" checkbox — no remote/onsite flag; per-position "Expected Contribution & Deliverables" — not in `CreatePositionDto`; **opportunity cover photo + change/remove — no cover/media field and no cover purpose in MEDIA_PURPOSES**; category select hardcodes 7 strings — backend needs ObjectIds from /skill-categories; publish always enabled — org must be verified (403 `ORG_NOT_VERIFIED`), no pending state.

## Applications (ORG review of applicants)
**Data:** `GET /opportunities/:id/applications` (?positionId, ?status, cursor, limit); accept `POST /applications/:id/accept`; reject `POST /applications/:id/reject` (reason required); quota from positions filledCount/requiredCount.
**Conflicts:** **"Under review" tab/label has no backend status** — enum is pending/accepted/rejected/withdrawn; New + Under review both collapse to `pending`; search by name/opportunity/position — no keyword param; "All opportunities" filter — endpoint is per-opportunity; sort — fixed `_id` desc; "4 total submissions" — no totals; "Why I want to participate" — `applications.message` never written (apply has no body); applicant skills — no org route returns another volunteer's skills; verified experiences — not readable by org; "Ask clarification question" — no messaging; **reject requires a `reason` (IsNotEmpty) but UI renders a direct button (400 without dialog)**; "Application ID TCA-APP-2026-092" — only ObjectId exists.

## Participants Organization-Dashboard
**Data:** `GET /opportunities/:id/participants` (status IN accepted|active only); submissions detail `GET /submissions/:id` + review `POST …/start-review|/verify|/reject`.
**Conflicts:** "All opportunities (7)" cross-opp roster — endpoint is per-opportunity; search/sort unsupported; "21 active across 7 published" — no aggregate; **roster shows only accepted|active — a "Completed" participant is filtered OUT and never appears**; status labels "Reviewing/In Fieldwork/Accepted & Fieldwork Delivered" are not task_participant enums; per-row submission state not joined into participants payload; "Verified experience minted" — no org experience read; "Send participant message" — no messaging; skills/civil-accreditation background — not available to org.

## Contributions (ORG verification inbox)
**Data:** `GET /organizations/me/submissions` (?status submitted|under_review|approved|rejected, ?opportunityId); detail `GET /submissions/:id` (evidence); approve = `POST …/verify` (approves + mints experience atomically); reject = `POST …/reject` (reason).
**Conflicts:** **"Verified (8)" tab — no `verified` submission status; verify sets `approved`; verified/experience state lives in `verifications`/`volunteer_experiences` with no org list endpoint**; "To review (7)" conflates submitted+under_review (`?status` is single-valued); "Changes requested" is UI label for `rejected`+resubmit loop; search by volunteer/initiative/deliverable — no q; "All formats" media filter — none; sort — none; volunteer name+location not enriched in detail; "Flag for civic council review" — no endpoint (only `POST /reports` for platform reports); "Compliance Evaluation" column — no field; approve+mint shown as sequential but backend does it in one atomic call (no approve-without-minting); privacy footnote — media defaults public; org-read of private evidence always denies → `url: null`.

## Verified Experiences Organization-Dashboard
**Data:** (list-level) none. `GET /experiences/me` is volunteer-only; `GET /experiences/:id` owner-only (orgs get 404); public profile endpoint needs volunteer's publicProfile flags; org cannot obtain its experiences' `verificationCode`s.
**Conflicts:** **no endpoint lists an org's minted experiences — whole screen's data source missing**; "Export Registry Index (CSV)" — no export endpoint; "Public Civic Ledger" — no route; "142 documented hours"/"36 Verified Fieldwork Hours" — no aggregate and `duration` always 0; **"SHA-256 Ledger Verified" — backend stores an 8-char uppercase base32 verificationCode, no SHA-256 anywhere**; search/filter/sort-by-hours — no query; "Public/Private" — `publicVisibility` is volunteer-controlled and never exposed to org; "National Civic Registry ID DZ-CIVIC-2024-88402" — no field; "Copy Verification Registry URL" — dead link (org can't discover codes); "Download Civic Verification Attestation (PDF)" — no PDF generation; audio player/artifact download — no route returns evidence URLs to an org caller.

## Organization Profile
**Data:** `GET /organizations/me` + `PATCH /organizations/me` (nameAr/nameFr/description/logoMediaId); opportunities section; public profile `GET /organizations/:slug` (verified+active only).
**Conflicts:** cover photo — logo only; location — no field; website — no field; "Accredited since 2018" — no date field; org type ("Cultural Heritage…") — no type field; statute records (DZ-14/08), "Law 12-06 Accredited" — no fields; "Focus Disciplines"/"Operating Range" — none; Civic Registry ID — none; "Annual Report 2025" — none; contact info (email/phone/address) — email/phone live on the user, address nowhere; "Verified volunteer experiences" section — no org experience list; "Recent Volunteer Activity" — no org activity feed; edit profile can only set nameAr/nameFr/description/logoMediaId.

## Organization Settings
**Data:** `PATCH /users/me` (email, phone); `POST /auth/change-password`; `GET /users/me/sessions` ({id,createdAt,expiresAt,lastUsedAt}); `DELETE /users/me/sessions/:id`; `POST /auth/logout-all`; `DELETE /users/me`.
**Conflicts:** "Official Portal URL" — no url field; **sessions rows show browser/device/OS/city — API stores only timestamps, no device metadata**; "This device" marker not derivable precisely; **"Sign out of all other sessions" — no such endpoint; logout-all revokes the current session too**; notification prefs (6 toggles) — backend has creation+read-status only, **no preference/persist API**; privacy/visibility toggles — no org privacy settings exist (verified+active org is always public; "Indexed in Discover Talents" is a volunteer concept); "Delete organization account" — no org-delete route (DELETEs soft-deletes the user account, org row untouched; the "archive unminted drafts" promise has no backend handling).

---

# Admin (6 screens)

Cross-cutting: every admin list is cursor-paginated `{items,nextCursor,limit}` (default 20, max 50, **no totals**) → all "Showing X–Y of N", page-jump, and "Show 100" controls conflict. **No CSV/export endpoint exists on any admin route.** Topbar global search has no endpoint. Human-readable names (wilaya/municipality, org types, skill names, reporter) require client-side joins admin responses don't provide. Stats beyond `GET /admin/stats/overview` don't exist (no per-status breakdowns, no deltas, no time series).

## Admin Dashboard
**Data:** `GET /admin/stats/overview` (counts.volunteers/organizations/verifiedOrganizations/opportunities/pendingVerifications); verifications `GET /admin/organizations/verifications?status=pending`; reports `GET /admin/reports?status=open`; audit `GET /admin/audit-logs`; `GET /health` ({status,version}).
**Conflicts:** "Active Participants 3,894/30d", "+412 deltas", "Open Reports 4" (no total), "Requires Attention" composite queue (no single endpoint; "Reported Volunteer Account"/"Compliance Check" concepts don't exist), Platform Activity time series + peak (no analytics), audit trail shows names/descriptions but `AuditLogModel` stores method/path/ids (joins needed), "Platform Health & Compliance" metrics (only {status,version}), "Review Orgs (12)" vs "Pending Verifications 28" internal inconsistency.

## Manage Volunteers
**Data:** `GET /admin/volunteers` (`AdminVolunteerRow {profile, user}`); suspend `PATCH /admin/users/:userId/status {status:'suspended'}`; audit (HTTP-level).
**Conflicts:** **"Pending" status doesn't exist for users** (enum active|suspended|deleted) — filter + 518 metric unsupported; no `q` search on admin volunteers; wilaya/municipality/skill/time filters unsupported; skills not joined; location codes only (names need reference joins); ref codes DZ-VOL-… don't exist; "Active Today 09:42" — no last-active field; "National ID verified under Law 12-06", check_circle — no national-ID concept (only emailVerifiedAt); "Latest Verified Engagement" — no admin experience list; **"Send System Notice" — no admin→user notification-send endpoint**; suspend modal reason/notes — `UserStatusDto` is `{status}` only; status_histories written but no admin read route; CSV/page-size-100/totals — no export, cap 50, no totals.

## Manage Organizations
**Data:** `GET /admin/organizations` (OrganizationModel: nameAr/nameFr/description/logoMediaId/verificationStatus/status/reliability); triage `GET /admin/organizations/verifications?status=pending` ({verificationRow, organization}); dossier resolution via `GET /media/:id`; approve/reject `POST …/verification/approve|reject`.
**Conflicts:** org "Type" — no field; org "Location" — no field; registry/statute refs — none; email/telephone/dz-domain — org model has no contact (email/phone on owning user, not joined); status vocabulary mismatch ("Incomplete"/"Legal Review"); "Request Info" — no endpoint; "Assigned Officer" — no assignment field; "Platform Activity Footprint" counts — no per-org aggregation endpoint; reconciled decisions disappear from pending triage (no "latest dossier by org id"); suspended count + deltas not in stats; CSV/totals/Show-100 — cursor semantics; "Law 12-06 Seal" — approve only sets verificationStatus, no seal artifact.

## Manage Opportunities
**Data:** `GET /admin/opportunities` (projection: `_id,organizationId,slug,title,description,categoryId,status,startDate,applicationDeadline,createdAt,updatedAt`); suspend `PATCH /admin/opportunities/:id/status`;
**Conflicts:** category names = categoryId only (join to /skill-categories); "2/3 filled" capacity — **positions not in the admin projection** and no admin positions read route; Apps counts — no join, admin can't call org-only applications/participants endpoints (RolesGuard); assigned volunteer names unreachable; Verification Ledger/attestation — no admin aggregation; "Registry File #OPP-…" — no such id; **opportunity location not in admin projection**; "Close Applications" — no admin action (approximate via status closed); "Org Inquiry" — no messaging; "Flagged/In Review" metric — no flag state; Pending-Apps/Positions-filled/Completed-Runs totals — no aggregation; filters/search unsupported on admin list; pagination/CSV — cursor semantics.

## Reports & Moderation
**Data:** `GET /admin/reports` (?status, cursor, limit); `PATCH /admin/reports/:id` {status resolved|dismissed, resolution}; report schema {reporterId, targetType ∈ opportunity|user|organization|review|submission, targetId, reason ≤2000, description? ≤4000}.
**Conflicts:** report "Title" — no title field; #REP-YYYY-NNN — only Mongo _id; type vocabulary mismatch (Volunteer≈user, Contribution≈submission, Other doesn't exist) and no type filter; "by name @handle" — reporterId not joined; "Priority: High" — no field; Reported Entity Details — only targetId/targetType (manual cross-lookups); Moderation History — no history field/read route (audit extraction skips `reports`); "Contact Secretariat" — no messaging; "Assigned Officer" — none; unpublish checkbox + resolve — no composite action (separate status PATCH needed); sanction select — no sanction codes on report DTO; "100% Statutory Compliance" — hardcoded; search/entity/time filters — unsupported; pagination/CSV — cursor semantics.

## Admin Settings
**Data:** `GET /admin/settings`; `PUT /admin/settings/:key` (whitelist **only** `publishGate.maxPendingOpportunities`, numeric); `GET /health`.
**Conflict (total):** **only one writable setting exists.** Every other control (platform name/summary, language, timezone, date format, all 5 notification toggles, 4 moderation policy toggles, runtime status, ledger sync, registration/publishing kill-switches, session duration, re-auth, IP allowlisting, audit retention, pause-registrations, maintenance mode) has NO key and NO endpoint — would 400 `UNKNOWN_SETTING_KEY` / `INVALID_SETTING_VALUE`. "v2.4"/"DZ-NAT-REG sync"/"All operational" are cosmetic (health returns only status+version).

---

# Public (5 screens)

## Public Landing Page
**Data:** feed `GET /opportunities`; talents `GET /talents`; reference endpoints.
**Conflicts:** header search "opportunities, **organizations**…" — no org search endpoint (`GET /organizations` has no q, verified+active only, no pagination); opportunity rows: org name + Arabic name not in `OpportunityModel`, category/location/skills are IDs (joins needed); talent cards: `TalentCard` has **no verifiedExperiences count** and stats are private; "Apply now" on guest page — apply requires logged-in volunteer; the "Verified Volunteer Experience Record" illustration mixes real concept with not-returned data (org, code, validated date, hours — duration always 0).

## Public Talent Profile
**Data:** `GET /volunteers/:username` (publicProfile-gated). Backs both Talent and Volunteer Profile screens — see redundancy note.
**Conflicts:** avatar fetch 404 for guests; "Identity Verified" badge / "Verified Contributor" / "Level 2 Verified" — no tier concept; **surname not public** (only firstName); headline — no field; **stats never public** ("34 hours / 6 engagements"); location = ids only; "Civic Registry member since 2024" — createdAt not public; "Institutional Endorsement" — reviews are private; experiences: no org name, no dates, duration=0, skills are ObjectIds, evidence files 404 for guests; portfolio items lack type/tags; "Community Contributions" list — no fields; availability only weekday slots (no free-text); sidebar credential counts/CSO endorsement count — private/nonexistent.

## Public Volunteer Profile
**Data:** same `GET /volunteers/:username` + `/experiences` + `/portfolio`.
**Conflicts:** breadcrumb mock `/volunteers/@ahmedbenali` — backend param is raw username (no `@`); avatar check badge — no state; "DZ-VOL-2024-88402" — no registry-id field; **stats strip (24 tasks/18 experiences/96 hours/4 partners) — all private** (`stats.*` only in `GET /volunteers/me`); experiences lack org/date/hours/attestation ref; portfolio items lack type/equipment/"Verified PDF"/size metadata (media size not in PublicMediaShape), file media unreadable by guests; "Areas of Civic Contribution" % bars + acceptance rate — no public computation; "Verify on National Ledger" link — ambiguous, no such platform route (only `GET /verify/:verificationCode`, and decision #2 has no QR page).
**Decision #7 check:** portfolio section exists on this and on Talent Profile via `GET /volunteers/:username/portfolio` → decision satisfied; the two screens are simply redundant.

## Public Organization Profile
**Data:** `GET /organizations/:slug` (nameAr/nameFr/description/logoMediaId/verificationStatus/status/reliability), `/organizations/:slug/opportunities` (published only), `/organizations/:slug/reliability` ({responseRate?,decidedRatio?,medianDecisionHours?,anomaly?}).
**Conflicts:** location "Timimoun, Wilaya of Adrar" — org has no location field; "Official Website" — no website field; stats ribbon (active/completed initiatives, registered volunteers, verified hours, "2018 Accredited") — no public aggregations; "Founded in 2018" — no founded-year field; "Primary Civic Mandates" chips — no field; active-opportunity cards: no type label, no human-readable ref (MongoId/slug only), **no end date → "25–28 Sep (4 Field Days)" impossible**; "Completed Civic Initiatives (Archive)" — no public completed list (org opp route is published-only); sidebar "National Civic Registry ID / Supervisory Authority / Audit Record / address / phone / office hours / map coordinates" — **nothing exists** (contact not public by design); "Deliverable Verification Rate 100%" — a deliverable-verification % doesn't exist (reliability responseRate/decidedRatio are different and may 404).

## Public Opportunity Details
**Data:** `GET /opportunities/:idOrSlug`; related via org slug.
**Conflicts:** **org identity not in payload** — opportunity returns only `organizationId`; no public org-by-id route; "Registry Code DZ-OPP-…", "Gazetted Field Opportunity" — no fields; "Law 12-06 Validated" implied only; "Accredited Hours 18 / Mission dates 25–28 Sep" — no end date, no duration; "Field Documentation Environment" imagery — no cover/field-image fields; positions: "Assigned: Ahmed Benali" + application counts are **org-authed data, never public**; "Role ID TCA-POS-01" — no ref; statutory/insurance/logistics cards — unstructured copy; related initiatives need org slug **that isn't in the payload** (also can't build the org profile link); "Archive Concluded" item isn't published so can't come from the public route; apply on guest — requires auth; coordinates OK (location.coordinates); "Registration No/Wilaya Register/Civic History" on the publishing-entity card — no fields; "National Civic Registry Dispatch" — link to nonexistent flow.

---

# Auth & System (6 screens)

## Create Account
Account-**type** selector for registration (not sign-in). Selector → `POST /auth/register/volunteer` / `/register/organization`; Sign In link → `POST /auth/login`. **No conflicts.** Does not violate decision #5 (it's registration, not login).
**Note:** the register endpoints auto-login and return `{accessToken, refreshToken, user}` — no names, no role, no terms flag (see next screen).

## Register Organization
**Data/actions:** form (email, phone, password+confirm, org name, type, reg number, wilaya/municipality, address, mission, terms) → register; pending-view (reference, entity, classification, jurisdiction, "Under Review", no fake verified status) → dashboard / continue-to-verification.
**Matching:** `POST /auth/register/organization` ({email,password,phone?}); dossier = 2-step media (purpose `verification_document`) → `POST /organizations/me/verification`; edits later via `PATCH /users/me` + `PATCH /organizations/me`.
**Conflicts:**
- `org_name` not accepted at registration (only email/password/phone); org is created with `{userId,slug,verificationStatus:'pending',status:'active'}` and no name; name later via two separate fields (nameAr/nameFr); success screen shows a combined "Latin / Arabic" value never stored.
- `org_type`, `org_reg_number`, `org_wilaya`/`org_municipality`, `org_address`, `org_description` (at register time) — **no org fields for any** (description only via PATCH, max 2000 vs design 500).
- Terms checkbox — no `termsAccepted`/consent flag in any DTO.
- Sample phone `+213 49 90 12 34` — regex is `/^\+?[0-9]{8,15}$/` → spaces = 400 VALIDATION_ERROR.
- "Step 1 of 2" implies a register-time second step the API doesn't model (verification is a separate flow).
- "Continue to verification" can 403 `EMAIL_NOT_VERIFIED` (register auto-triggers email verification; UI never surfaces it).
- "Reference #DZ-2024-ADR-0442" fabricated — no endpoint returns a dossier reference.
- Decision #6 respected (org stays pending; copy explicitly says so).

## Forgot Password
**Matching:** `POST /auth/forgot-password` `{email}` — always 204 (silent no-op) → anti-enumeration copy matches; "Resend" = re-call same endpoint; sign-in link = login.
**Conflicts:** "Encrypted link expires in 30 minutes" — backend `password_reset` TTL is **1 hour** (mail says "1 heure"); 54s client cooldown ≠ server throttle (3/hr `SLOW_LIMIT`; 4th attempt = 429 `RATE_LIMITED`, UI has no handling). Email-link only, no OTP — consistent.

## Email Verification
**Matching:** register auto-sends verify email; token page → `POST /auth/verify-email` {token}; resend `POST /auth/resend-verification` (Bearer-auth); update email = `PATCH /users/me {email}` (re-verifies); 24h expiry matches `email_verify` TTL.
**Conflicts:** **success state claims "Validated Civic Association (Law 12-06)/Active" that email verification never produces** — verify-email only sets `users.emailVerifiedAt`; org stays `verificationStatus:'pending'` (decision #6). **Resend requires a valid session but the page is reachable as a public token page** — expired session ⇒ 401 with no UX. No `verify/:code` QR page (decision #2 OK).

## Global Error & System States
States: 404 / 403 / 500 / Maintenance / Network. No calls.
**Conflicts:** "central engineering dispatch received telemetry" — no error-reporting endpoint (`POST /reports` is content reporting only); "National Registry ledger safe & operational" — `/health` returns only {status,version}, 500 body is generic; **missing 401/session-expired and 429 `RATE_LIMITED` states — the two most common API errors**; 403 collapses three distinct codes (FORBIDDEN / ACCOUNT_SUSPENDED / ACCOUNT_INACCESSIBLE / EMAIL_NOT_VERIFIED) into one "restricted access" page (suspended users get misleading copy); design never maps backend error body `{statusCode, code, message, details?}` to states.

## My Portfolio (standalone — EXTRA, decision #7 violation)
**Data:** `GET /portfolio/me` (items {title, description, mediaIds, visibility, order}); POST/PATCH/DELETE + `PUT /portfolio/me/order`; media 2-step (purpose `portfolio_item`); notifications `GET /notifications/unread-count`; search via opportunities/talents/skills.
**Conflicts:** category filter chips & item type labels (Photography/Archival & GIS/Audio/Field Research/Cartography…) — no category/tag field on portfolio_items; per-item skill chips — skills exist only on profiles/experiences, not portfolio; "Featured Project" — no flag (order only); "Completed Sep 2026 · 24 photos · 4 syncs" — no date/count metadata (mediaIds.length ≈, rest fabricated); "Related volunteer experience … verified record" — **no field/endpoint links a portfolio item to a volunteer_experience**; "View project case study/detail" — **no single-item GET**; "Sort by: Featured" — no sort param (fixed `order` asc); sidebar "Identity Confirmed · National Civic Registry" — no identity concept (only emailVerifiedAt); "Public Profile Sync" claim ignores publicProfile.enabled + showPortfolio gates (both default false, no toggle offered); media[].url null for files → must call GET /media per item; note: "4 public · 1 private" (5) vs chips totaling 7 vs 5 rendered items — internal design inconsistency.

---

## Top systemic gaps across all screens

1. **Org identity missing from opportunity payloads** (nameAr/nameFr/slug/logo/verificationStatus) + no public org-by-id route → every listing/detail card (volunteer feed, public landing, OP details) needs N+1 or can't render. Recommend embedding on opportunity responses.
2. **Volunteer stats are never public** — hours/verified-experiences/partner counts on 3+ public screens; `stats.*` only in `GET /volunteers/me`.
3. **Guest media unreadable** — `GET /media/:mediaId` 404s for guests; evidence thumbnails, portfolio images/PDFs, avatars can't render publicly (only `type='link'` URLs work).
4. **Experience cards lack org name, dates, real duration** — `duration` is stubbed to `0`; verificationCode/verified-by/date absent from public cards.
5. **No duration/end-date anywhere** — opportunities have only `startDate`+`applicationDeadline`; "25–28 Sep", "4 Field Days", "18 hours" everywhere are impossible.
6. **Org 'factsheet' fields absent** — cover photo, location, website, founded date, registry/statute ids, org type, contact info: no schema fields (public org profile + org profile + register form all assume them).
7. **Cursor pagination vs UI** — no `total`, no page numbers/jump/Show-100 (every admin list + several screens).
8. **No CSV/PDF/export, no messaging, no save/bookmark, no duplicate/close-apps admin actions** — recurring buttons with no endpoints.
9. **Status vocabulary invented in UI** — volunteer "under_review"/application "under review"/submission "verified"/org "incomplete"/participant "reviewing & in fieldwork" — backend enums are fixed and often single-valued filters.
10. **Job title "Verified/Level 2/registry IDs"** (DZ-VOL/DZ-OPP/DZ-CIVIC/DZ-EXP) — human-readable civic registry vocabulary does not exist; only Mongo _id, slug, and 8-char verificationCode.
11. **Media upload mismatch** — design claims up to 500 MB images/videos/audio/zip; backend is jpeg/png/webp/pdf max 5 MB; plus submit contribution must surface the required imagery consent checkbox and a 2-step progress state.
12. **Org pending → every publish/verification friction** — status is enforced in code (403 ORG_NOT_VERIFIED / EMAIL_NOT_VERIFIED) but most org+register designs assume the org is verified immediately.

*Analysis produced from `code.html` only (images not decodable by available models). Raw per-group detail: `%TEMP%\opencode\design-analysis\{volunteer,organization,admin,public,auth-system}.md`; backend factsheet: `%TEMP%\opencode\backend-facts\FULL-BACKEND-FACTS.md`.*