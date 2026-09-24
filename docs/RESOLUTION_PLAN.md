# Resolution Plan — design ↔ backend reconciliation

Scope: analysis + spec only. No code, no `backend-inventory.md` edits, no design edits, no roadmap yet.
Inputs: `docs/DESIGN_BACKEND_RECONCILIATION.md` (34 screens, ≈287 conflicts) + its raw per-group files + `backend-inventory.md` + `docs/API.md`.
Every item from the reconciliation is classified into **exactly one** bucket below. Product decisions 1–13 + the Critical Rule (civic-narrative copy removed outright) are applied as written.

## Classification rules used

- **BUILD-BACKEND (BB)** — default for every conflict/gap not under "Remove". Specifies fields/endpoints/collections, owning module (from backend-inventory §1), and the new OpenSpec change it lands in. Archived changes are never reopened; all additions become new `backend-v2-<topic>` changes.
- **BUILD-MISSING-DESIGN (BMD)** — the 7 screens that don't exist yet but have live backend routes. New plain HTML/Tailwind screens using the existing DESIGN.md tokens (no new visual language).
- **REDESIGN-REQUIRED (RR)** — a screen/copy edit forced by a decision (Register Organization per decision 7, media limits per 8/9, consent/2-step per 3, guest-redirect per 10, status-vocabulary alignment, and the Civic Rule). Copy-only changes are marked `(copy)`.
- **MERGE (M) / DELETE (D)** — decision 2/3 removals and the merge; orphan references enumerated.
- **FLAVOR COPY — NEEDS OWNER DECISION (FCD)** — non-civic, non-structural filler copy (short list).

New OpenSpec change names used below (each is a fresh change; e.g. `backend-v2-registry-ids`):

`registry-ids`, `public-exposure`, `org-embed-labels`, `media-access`, `favorites`, `opportunity-fields`, `application-states`, `pagination-totals`, `admin-lists`, `admin-analytics`, `org-facts`, `org-ops`, `notification-prefs`, `experience-enrichment`, `pdf-attestation`, `org-dashboard`, `settings-expansion`, `portfolio-meta`, `moderation-actions`, `activity-feed`.

---

# PART 1 — Every conflict, classified

Format per group → screen → numbered items. Tag per item: **BB**, **RR**, **M**, **D**, **FCD**. Civic-theme copy is **RR(civic)** with the exact before/after in PART 5.

## 1. Volunteer (8 screens)

### 1.1 Volunteer Dashboard
1. “Latest verified experience” card (always `null`) → **BB** — implement `dashboard.latestVerifiedExperience` via join to latest `volunteer_experiences` (experience-enrichment; volunteers module).
2. Save/bookmark on feed cards → **BB** — favorites module (favorites).
3. Org name + verified badge on feed cards not embedded → **BB** — embed `organization {id,slug,nameFr,nameAr,logoMediaId,verificationStatus}` in every opportunity response (org-embed-labels).
4. Hours shown on cards (`duration` stub 0) → **BB** — real duration fields (opportunity-fields) surfaced on cards.
5. Stat cards totals (quick stats exist) → OK already; counts on “Popular skills” OK via `GET /skills`.

### 1.2 Opportunities
1. Mode filter/pill (On-site/Remote/Hybrid) no field → **BB** — `opportunities.mode` enum (opportunity-fields).
2. Card duration (“4h”) → **BB** — duration field + card display (opportunity-fields).
3. Sort control → **BB** — add `sort` param + totals (pagination-totals).
4. “Near me” needs authed caller → **BB** — allow `GET /opportunities?nearMe=me` (volunteer) resolving caller location (pagination-totals / org-embed-labels).
5. Result counts (“124 opportunities”) no `total` → **BB** — `CursorPage` gains `total/page/pages` (pagination-totals).
6. Save/bookmark → **BB** (favorites).
7. Filter multi-select / availability-week filters already supported? availability & time-pill filters (This week/weekend) → **BB** — extend feed `from/to` handling + multi-value filter params (pagination-totals).

### 1.3 Opportunity Details
1. Meta boxes (Date & Duration “3h”, time window, capacity, cutoff) → **BB** — startTime?→ duration/endDate + optional per-position schedule start (`positions.startAt?`) — **mark capacity `3 of 6 Filled` from `filledCount` (exists)**; “Application Cutoff” = `applicationDeadline` (exists); **duration/time-window → opportunity-fields**.
2. “Civic Recognition: Official Certificate” + “PDF/download” → **BB** — certificate = attestation PDF endpoint (pdf-attestation); the “Civic Recognition” wording → **RR(civic)** neutralize to “Certificate”.
3. “Hospitality: Meal & Transport” / “What you receive” / requirements-perks blocks → **FCD** — flavor; owner decides keep-as-data (would become `opportunities.perks[]`) or cut.
4. Org sidebar stats (“18 Initiatives · 42 Volunteers · 4.9★ since 2014”) → **BB** — org public aggregates + reliability on org payload (org-dashboard / org-embed-labels).
5. Verified badge not derivable (no org slug on payload) → **BB** — org embed incl. `verificationStatus` (org-embed-labels).
6. “Ref BT-2026-084” → **RR(civic)** — replace with `OPP-<id>` registry id (registry-ids).
7. Save → **BB** (favorites).

### 1.4 Discover Talents
1. Result-count banner → **BB** totals (pagination-totals).
2. Card verified-experience count / documented hours / availability / portfolio preview absent → **BB** — public stats + availability + portfolio item counts on `TalentCard` (public-exposure, totals via pagination-totals).
3. “Verified / 5+ experiences / 100%” filters → **BB** — new `?minExperiences=`, `?verificationStatus?` → specify `GET /talents` params `minExperiences`, `hasAvailability`, `portfolio` (pagination-totals). The “Civic Verification 100%” label → **RR(civic)**.
4. Multi-select skills/locations → **BB** — `skillIds[]`,`wilayaIds[]` (pagination-totals).
5. Skill facet counts → **BB** — facet-counts on `/talents` (pagination-totals).
6. Sort → **BB** `sort` (pagination-totals).
7. “Contact”/“Invite” buttons → **D** — messaging removal (decision 2); no endpoints built.
8. “Available for on-site & remote” line → **BB** — volunteer availability note/fields (public-exposure).

### 1.5 My Applications volunteer
1. Cover message can’t be supplied → **BB** — wire `applications.message` into apply body `{message?}` (application-states).
2. Card org/opp/position titles need joins → **BB** — embed names in `/applications/me` (org-embed-labels).
3. “Application ID #APL-…” → **RR** — render from ObjectId short form (no new backend id; decision 6 covers only the 4 entities). No civic theme.
4. “Accepted by Coordinator <name>” → **BB** — embed org name + decision actor (org-embed-labels).
5. Audit timeline “Submitted → Under Review → Accepted” → **BB** — expose `status_histories` for the application on detail (application-states / activity-feed).
6. Date filter → **BB** — `?from=&to=` (pagination-totals).
7. Contact/Message coordinator → **D** (messaging).

### 1.6 My Participations
1. Coordinator/messaging block (“Contact Field Coordinator”, “dispatched via internal messaging”) → **D** (messaging); replace “dispatched” copy with neutral status lines.
2. “Download Civic Attestation (PDF)” / briefing → **BB** (pdf-attestation); “Civic” wording → **RR(civic)**.
3. Card org/task names, schedule, location joins → **BB** (org-embed-labels).
4. Deliverables counts partially derivable → **BB** — join position deliverables names into participation payload (org-embed-labels).
5. “Record #GHT-CIVIC-4401” → **RR(civic)** — replace with `EXP-<id>` (registry-ids).

### 1.7 My Experiences
1. “Download attestation (PDF)”/“Export transcript (PDF)” → **BB** (pdf-attestation).
2. WAV/audio evidence → **RR** — drop audio rendering (decision 8/9: no audio); evidence cards show images (jpeg/png/webp)/PDF/link only.
3. Skill/category filter tabs → **BB** — `?categoryId=` + `?skillId=` on `/experiences/me` (pagination-totals).
4. “Verified by <org> on <date>” → **BB** — join verification + org identity into experience payloads (experience-enrichment).
5. Registry-style codes (“ALG-2026-NEF-881”, “VXP-8F32K”) → **RR(civic)** — replace with `EXP-<id>` (registry-ids); keep `verificationCode` as secondary neutral “Verification code”.
6. “Audited 100%” rail → **RR(civic)** — remove; show neutral stats (stats exist).

### 1.8 Submit Contribution Organization-Dashboard
1. “Up to 500 MB / video / audio / zip” → **RR** — align to decision 8: ≤5 MB JPEG/PNG/WebP + PDF; video via external link only (decision 9).
2. “Contribution title” free-text → **BB** — add optional `submissions.title` (settable on draft; submissions module).
3. External link host not allowlisted → **RR** — constrain link field to allowlisted hosts (youtube.com, youtu.be, drive.google.com) with helper text.
4. Privacy claim “private to you+org” → **BB** — media-access: default `visibility=private` for `submission_evidence` + restore the org-read branch so the owning org can read private evidence.
5. No consent checkbox yet submit 400 `CONSENT_REQUIRED` → **RR** — add required imagery-consent checkbox.
6. “Message coordinator” → **D** (messaging).
7. Single-step drag-drop gallery → **RR** — 2-step presigned flow with explicit uploading/confirming progress state (decision 3).
8. “Submit” flow vs `rejected→draft` resubmit → already mapped; no change.

## 2. Organization (9 screens)

### 2.1 Organization Dashboard
1. Cover/banner → **BB** — `organizations.coverMediaId` + media purpose `organization_cover` (org-facts / media-access).
2. Org location (“Timimoun Old Ksar…”) → **BB** — `organizations.location` (org-facts).
3. “Established 2018” → **BB** — `organizations.foundedYear` (org-facts). “Registry #DZ-ALG-7740” → **RR(civic)** → `ORG-<id>` (registry-ids).
4. Stat cards (12/38/21/7/48) → **BB** — org dashboard aggregate endpoint (org-dashboard).
5. “Contributions to review” volunteer name/avatar join → **BB** (org-embed-labels).
6. “Recent applications” joins + cross-opp → **BB** — `/organizations/me/applications` aggregate inbox (application-states).
7. “Active volunteer activities” participant counts + per-opp breakdown → **BB** (org-dashboard aggregates).
8. Opportunity-card cover image → **BB** — `opportunities.coverMediaId` (opportunity-fields).
9. “Documented hours minted 48” → **BB** — org hours aggregate (org-dashboard).
10. Activity feed → **BB** — `/organizations/me/activity` (activity-feed).

### 2.2 My Opportunities
1. Counter/pagination “1–4 of 12 / Previous/1/2/3” → **BB** totals+pages (pagination-totals).
2. Search by title/location/skill → **BB** — `?q=` on org opportunities list (pagination-totals).
3. Sort control → **BB** `sort` (pagination-totals).
4. Per-card apps/participants counts → **BB** — aggregate counts embedded in org list (org-dashboard / org-embed-labels).
5. “Report (PDF)” → **BB** (pdf-attestation for experiences; for opportunities a neutral opportunity-statistics/PDF export).
6. “Duplicate” → **BB** — `POST /organizations/me/opportunities/:id/duplicate` (opportunity-fields).
7. No org-side single read for non-published → **BB** — `GET /organizations/me/opportunities/:id` (opportunity-fields).
8. Unverified-publish state → **RR** — surface `verificationStatus`/publish-gate locked state on Draft card (Publish disabled + explanation), keep product decisions 6/11.

### 2.3 Create Opportunity
1. End date → **BB** `opportunities.endDate` (opportunity-fields).
2. Prerequisites textarea → **BB** `opportunities.prerequisites: string[]` (opportunity-fields).
3. On-site/remote checkbox → **BB** `mode` (opportunity-fields).
4. Per-position “Expected Contribution & Deliverables” → **BB** `positions[].deliverables: string[]` (opportunity-fields).
5. Cover photo + change/remove → **BB** — `coverMediaId` + purpose `opportunity_cover` (opportunity-fields).
6. Category hardcoded 7 strings → **RR** — wire select to `GET /skill-categories` (client loads real categories).
7. Publish always enabled (verified gate) → **RR** — gate state + publish-gate messaging (decision 6/11).
8. Location select wiring → already maps to wilaya/municipality; no change.

### 2.4 Applications
1. “Under review” tab/label ≠ enum → **BB** — add application state `under_review` + `POST /applications/:id/start-review`; accept/reject accept from it (application-states).
2. Search by name/opportunity/position → **BB** `?q=` (application-states / pagination-totals).
3. Cross-opp “All opportunities” filter → **BB** — `/organizations/me/applications` aggregate inbox (application-states).
4. Sort → **BB** (pagination-totals).
5. “4 total submissions” → **BB** totals (pagination-totals).
6. “Why I want to participate” → **BB** — covered by message wiring (application-states).
7. Applicant skills → **BB** — resolved by decision 5 (public profile default-on, `showSkills`); org reads `GET /volunteers/:username`. Note: opt-out volunteers won't expose them — acceptable.
8. Applicant verified experiences block → **BB** — same public-profiles resolution (`showExperiences` default on) (public-exposure).
9. “Ask clarification question” → **D** (messaging).
10. Reject needs reason (button lacks dialog) → **RR** — add required reason field to reject dialog.
11. “Application ID TCA-APP-2026-092” → **RR(civic)** — replace with `APL-<short ObjectId>` or plain ObjectId.

### 2.5 Participants Organization-Dashboard
1. Cross-opp roster → **BB** — `/organizations/me/participants` aggregate (participations module; org-dashboard).
2. Search by name/role/opportunity → **BB** `?q=&opportunityId=` (pagination-totals).
3. Sort → **BB** (pagination-totals).
4. “21 active across 7” aggregate → **BB** totals (org-dashboard).
5. Status labels “Reviewing/In Fieldwork/Completed” + completed omitted → **BB** — participants endpoint gains `?status=` (incl. completed) + submission-state join; **RR** — realign label vocabulary to submission statuses read from the join.
6. Per-row submission state → **BB** — join `submissions` state/files into participants payload.
7. “Verified experience minted” state → **BB** — via `/organizations/me/experiences` (experience-enrichment).
8. “Send participant message” → **D** (messaging).
9. Skills & civil-accreditation background → **BB** — public profile read (decision 5) (public-exposure).

### 2.6 Contributions
1. “Verified (8)” tab → **BB** — org experiences list endpoint (experience-enrichment); label the tab “Verified” backed by that endpoint.
2. “To review (7)” conflates submitted+under_review → **BB** — multi-value `?status=submitted,under_review` + counts (pagination-totals).
3. “Changes requested” label → **RR** — map to `rejected`; render resubmit loop.
4. Search by volunteer/initiative/deliverable → **BB** `?q=` (pagination-totals).
5. “All formats” media filter → **BB** `?format=` (pagination-totals).
6. Sort → **BB** (pagination-totals).
7. Volunteer name+location join in detail → **BB** (org-embed-labels + public profile).
8. “Flag for civic council review” → **D** — remove (civic-narrative action; reports already exist for platform reports).
9. “Compliance Evaluation” column → **BB** — map to neutral reviewer `review`/`notes` fields on verification (experience-enrichment); the “Compliance” wording → **RR(civic)**.
10. Approve+mint shown sequential (backend atomic) → **RR** — single “Approve & issue verification” action; text explains minting happens on approval.
11. Privacy footnote → **BB** — default-private evidence + org read (media-access).

### 2.7 Verified Experiences Organization-Dashboard
1. No org experiences endpoint → **BB** — `GET /organizations/me/experiences` with filters (`?q=&opportunityId=&visibility=&sort=&page=`) + totals (experience-enrichment / pagination-totals).
2. “Export Registry Index (CSV)” → **BB** — CSV export on that endpoint (admin-lists pattern; org side).
3. “Public Civic Ledger” → **RR(civic)** — remove; replaced by public links on volunteer profiles.
4. Hours aggregates (“142 documented hours”) → **BB** — org hours aggregate (org-dashboard) powered by real duration (opportunity-fields → experience-enrichment).
5. “SHA-256 Ledger Verified” → **RR(civic)** — replace with neutral verification code + verified date.
6. Search/filter/sort → **BB** (as item 1).
7. Per-record Public/Private visibility display → **BB** — expose `publicVisibility` in org experiences payload.
8. “National Civic Registry ID DZ-CIVIC-2024-88402” → **RR(civic)** → neutral identity: volunteer name + `VOL-<id>`.
9. “Copy Verification Registry URL” (dead link) → **BB** — org endpoint returns `verificationCode`; link → `GET /verify/:code` (inline). `(copy)` label neutral “Copy verification link”.
10. “Download Civic Verification Attestation (PDF)” → **BB** (pdf-attestation).
11. Audio player/artifact download → **BB** — evidence URLs for public media + link-type audio-video; audio itself → **RR** drop audio playback (decision 8/9).

### 2.8 Organization Profile
1. Cover + change → **BB** (org-facts/media-access).
2. Location → **BB** org location (org-facts).
3. Website → **BB** `organizations.website` (org-facts).
4. “Accredited since 2018” → **BB** `foundedYear` (org-facts); wording **(copy)** neutral “Founded/Active since”.
5. Org type → **BB** `organizations.type` (org-facts).
6. Statute records (“Statute DZ-14/08”, “Law 12-06 Accredited”) → **RR(civic)** — replace statute/legal fields with neutral `registrationNumber` (org-facts) + `ORG-<id>`; remove “Accredited” badges.
7. “Focus Disciplines”/“Operating Range” → **BB** `focusDisciplines[]`, `operatingScope` (org-facts).
8. “Civic Registry ID DZ-CIVIC-ORG-2018-0442” → **RR(civic)** → `ORG-<id>` (registry-ids).
9. “Annual Report: 2025 Audited Civic Report” → **FCD** — org-marketing artifact; owner decides (cut, or add optional org document attachment).
10. Contact info (email/phone/address) → **BB** — org contact fields + expose on public org (org-facts).
11. Verified experiences section → **BB** (experience-enrichment).
12. “Recent Volunteer Activity” → **BB** activity feed (activity-feed).
13. PATCH scope limitation → **BB** — expanded `PATCH /organizations/me` DTO (org-facts).

### 2.9 Organization Settings
1. “Official Portal URL” → **BB** website (org-facts).
2. Sessions device/browser/OS/location → **BB** — capture `device`, `userAgent`, `ip` (geo optional) on session create (org-ops).
3. “This device” marker → **BB** — session rows gain `isCurrent` (derivable) (org-ops).
4. “Sign out of all other sessions” → **BB** — `POST /auth/logout-others` (org-ops).
5. Notification prefs (6 toggles) → **BB** — `GET/PATCH /notifications/preferences` (notification-prefs).
6. Privacy/visibility toggles → **BB** — org public-profile toggle (default on); “Indexed in Discover Talents” → **RR** — relabel/remove (orgs are not in the talent directory; keep a platform-public toggle).
7. “Delete organization account” → **BB** — `DELETE /organizations/me` (soft-archive org + user; revokes sessions) (org-ops).
8. Account status “Active” → exists; no change.

## 3. Admin (6 screens)

### 3.1 Admin Dashboard
1. “Active Participants 3,894/30d” → **BB** analytics (admin-analytics).
2. “+412 from last cycle” deltas → **BB** (admin-analytics).
3. “Open Reports 4” count → **BB** totals (pagination-totals).
4. Composite “Requires Attention” queue → **BB** — aggregation endpoint with per-category totals (admin-analytics); remove “Opportunity Compliance Check” concept → **RR(civic)** (replace with neutral “Needs review”).
5. Time-series chart → **BB** `GET /admin/analytics/series?days=` (admin-analytics).
6. “Peak 742 on Sep 24” static → **RR** — remove hardcoded data point.
7. Audit trail names/descriptions → **BB** — enrich audit-logs payload with actor/target display names (org-embed-labels / admin-lists).
8. “Platform Health & Compliance”, “DZ-NAT-REG sync”, “18.4 hrs turnaround” → **RR(civic)** — replace with neutral “System Status” (`{status,version}` from `/health`); turnaround from reliability `medianDecisionHours` (BB where derivable → admin-analytics).
9. “Discussion: Review Orgs (12)” vs “Pending Verifications 28” mismatch → **RR** — use single source (stats/overview + queue endpoint).

### 3.2 Manage Volunteers
1. “Pending” status (518 metric) → **RR(civic)** — volunteer “verification pending” state was part of the civic-registry theme → removed; filters keep real statuses (active/suspended/deleted); metric dropped.
2. No search `q` → **BB** `?q=` (admin-lists).
3. Wilaya/municipality/skill/time filters → **BB** (admin-lists).
4. Skills column dropped server-side → **BB** — join volunteer_skills into admin rows (admin-lists).
5. Location names (ids only) → **BB** embed labels (org-embed-labels / admin-lists).
6. “DZ-VOL-2024-9120” refs → **RR(civic)** → `VOL-<id>` (registry-ids).
7. “Active Today 09:42” no last-active → **BB** `users.lastActiveAt` + admin display (org-ops / admin-lists).
8. “National ID verified under Law 12-06”, check_circle badge → **RR(civic)** — remove (only `emailVerifiedAt` remains as “Email verified”).
9. “Latest Verified Engagement” → **BB** — `GET /admin/volunteers/:id/experiences` (admin-lists/experience-enrichment).
10. “Send System Notice” → **BB** — `POST /admin/users/:userId/notice` creates a neutral notification (admin-lists / moderation-actions).
11. Suspend reason/notes not storable → **BB** — extend `PATCH /admin/users/:id/status` body with `{reason, notes}` stored in `status_histories` (admin-lists).
12. `status_histories` unreadable → **BB** — `GET /admin/status-histories?entityType=&entityId=` (admin-lists).
13. CSV/pagesize-100/totals → **BB** — CSV + totals + page for `/admin/volunteers` (admin-lists).

### 3.3 Manage Organizations
1. Org type filter/field → **BB** (org-facts + admin-lists).
2. Org location → **BB** (org-facts + admin-lists).
3. Registry/statute refs → **RR(civic)** — neutral `registrationNumber` (org-facts) + `ORG-<id>` (registry-ids).
4. Email/phone/.dz domain verification → **BB** — org contact fields + website; the “Institutional .dz Domain Verification” badge → **RR(civic)** remove.
5. Status vocabulary (“Incomplete”/“Suspended”/“Legal Review”) → **RR** — realign to `status` (active|suspended|deleted) + `verificationStatus` (pending|verified|rejected) labels; “Legal Review” → “Pending”.

6. “Request Info” → **D** (messaging; no endpoint).
7. “Assigned Officer” → **BB** — `assignedAdminId` on `organization_verifications` + `PATCH /admin/organizations/verifications/:rowId/assign` (admin-lists).
8. “Platform Activity Footprint” → **BB** — per-org aggregate counts (admin-analytics).
9. No “latest dossier by org id” → **BB** — `GET /admin/organizations/:id/verification/latest` (admin-lists).
10. Suspended count + deltas → **BB** (admin-analytics).
11. CSV/totals/pages → **BB** (admin-lists).
12. “Grant Law 12-06 Seal” button → **RR(civic)** — relabel “Approve verification”.

### 3.4 Manage Opportunities
1. Category/domain names → **BB** embed (org-embed-labels).
2. Capacity “2/3 filled” positions not in projection → **BB** — include positions+counts in admin projection (admin-lists).
3. Apps counts → **BB** — aggregate into admin rows (admin-lists / org-dashboard).
4. Assigned volunteer names → **BB** — decision 5 public names (admin-lists).
5. Verification ledger per opportunity → **BB** — join experiences→opportunity (experience-enrichment / admin-lists).
6. “#OPP-ADR-2026-091” → **RR(civic)** → `OPP-<id>` (registry-ids).
7. Location missing from projection → **BB** (admin-lists).
8. “Close Applications” admin action → **BB** — `POST /admin/opportunities/:id/close` (or status `closed`) (admin-lists / moderation-actions).
9. “Org Inquiry” → **D** (messaging).
10. “Flagged/In Review 3” metric → **BB** — derive from open reports on the opportunity (admin-analytics).
11. Pending-Apps / Positions-filled / Completed-Runs totals → **BB** (admin-analytics).
12. Filters/search → **BB**; CSV/totals/pages → **BB** (admin-lists).
13. Status pill mix (“Published & Active”) → **RR** — use real status value; add `cancelled` to filter vocab.

### 3.5 Reports & Moderation
1. Report “Title” → **BB** — add optional `reports.title` (maxText) (admin-lists).
2. “#REP-2026-048” → **RR** — render from ObjectId short form.
3. Type vocabulary + no type filter → **BB** — align filter to `targetType` values (opportunity|user|organization|review|submission); “Volunteer”≈user, “Contribution”≈submission, drop “Other” (RR label map).
4. Reporter join + “Verified Volunteer” badge → **BB** reporter summary join; badge → **RR(civic)** remove (no tier).
5. “Priority: High” → **BB** — `reports.priority` (low|normal|high) + filter (admin-lists).
6. Reported-entity details → **BB** — embed target summary in admin reports payload (admin-lists / org-embed-labels).
7. Moderation history → **BB** — include reports in audit-log entity extraction + expose `status_histories` read (admin-lists).
8. “Contact Secretariat” → **D** (messaging).
9. “Assigned Officer” → **BB** `assignedAdminId` + assign PATCH (admin-lists).
10. Unpublish + resolve composite → **BB** — moderation-actions handler: one admin action performs report resolution + op `unpublish_opportunity`/`suspend_target` (moderation-actions).
11. Sanction select → **RR(civic)** — neutralize to plain actions (“Remove from public listing”, “Suspend target account”, “Request changes”); underlying actions = moderation-actions build.
12. “100% Statutory Compliance” → **RR(civic)** remove.
13. Search/time/entity filters → **BB**; totals/pages/CSV → **BB** (admin-lists).

### 3.6 Admin Settings
1. Only one writable setting → **BB (big)** — generic settings expansion: new `system_settings` keys (platform name/summary, default language/timezone/date format, admin session duration, moderation booleans, ops registration/publishing kill-switches, maintenance mode) + widened `PUT /admin/settings/:key` whitelist + `POST /admin/ops/maintenance` toggling a runtime gate (settings-expansion). Civic-weighted items (“Civic Hours Ledger Sync DZ-NAT-REG”, “Statutory Mandate” wording) → **RR(civic)**; the “Require verification before publishing” behavior already exists and stays enforced (optionally exposed as the config flag).
2. “Save All Changes” → becomes valid once whitelist widens (item 1).
3. Badge “v2.4 / All operational / DZ-NAT-REG sync” → **RR(civic)** — neutral “System Status · operational” from `/health`.
4. “Audit Log Retention Compliant · 5 Years” → **RR** — remove (no retention configuration); show neutral text or drop.
5. Notification-digest toggles → **BB** (notification-prefs).

## 4. Public (5 screens)

### 4.1 Public Landing Page
1. Org search (“opportunities, organizations…”) → **BB** — `GET /organizations?q=&page=` public search (pagination-totals / org-embed-labels).
2. Opportunity rows: org name/Arabic missing → **BB** (org-embed-labels). Category/location/skill ids → **BB** embed labels (org-embed-labels).
3. Talent cards “verified experiences count” private → **BB** public stats (public-exposure).
4. “Apply now” on guest page → **RR** — decision 10: guests see “Sign in to apply” → redirect to Login; never silent.
5. Sample “Verified Volunteer Experience Record” card (code, “civic hours”, “Audit Trail: Logbook #441”) → **RR(civic)** — rebuild as neutral static example using real fields (title, org, date, `EXP-<id>`); “civic hours”/“audit trail” removed.
6. “across 58 wilayas” → kept (seeded reference data; informative, not narrative).

### 4.2 + 4.3 Public Talent Profile / Public Volunteer Profile → **MERGE**
Decision 3. Base = Public Talent Profile; fold in niche features and portfolio/work-samples from Public Volunteer Profile. See PART 3.

### 4.4 Public Organization Profile
1. Org location → **BB** (org-facts + public payload).
2. “Official Website” → **BB** website (org-facts).
3. Stats ribbon (active/completed initiatives, registered volunteers, verified hours, “2018 Accredited”) → **BB** — public org aggregates (org-dashboard); “Accredited” → **RR(civic)** → “Active since“/”Founded”.
4. “Founded in 2018” structured → **BB** foundedYear (org-facts).
5. “Primary Civic Mandates & Focus Domains” chips → **BB** focusDisciplines[] (org-facts); “Civic Mandates” label → **RR(civic)**.
6. Opportunity cards type label + “Ref TCA-2026-F02” → **BB** category embed + `OPP-<id>` (**RR(civic)** for “Ref” code); end-date/duration → **BB** (opportunity-fields).
7. “Completed Civic Initiatives (Archive)” → **BB** — public completed/closed list `GET /organizations/:slug/opportunities?status=...` (+ voluntary counts) (org-dashboard / org-embed-labels).
8. Sidebar “National Civic Registry ID / Supervisory Authority / Audit Record / address / phone / map” → **RR(civic)** for ids/authority/audit (→ `ORG-<id>`, drop authority/audit, keep neutral contact + **BB** for address/phone/website/coordinates) (org-facts).
9. “Deliverable Verification Rate” + per-domain % → **BB** — per-opportunity decidedRatio/domain breakdown derived from reliability + submissions (org-dashboard); “Deliverable Verification” → **(copy)** “Submission response rate”.

### 4.5 Public Opportunity Details
1. Org identity missing → **BB** org embed (org-embed-labels).
2. “National Registry Code DZ-OPP-…”, “Gazetted Field Opportunity” → **RR(civic)** → `OPP-<id>` + neutral tag (registry-ids).
3. “Law 12-06 Validated” pill → **RR(civic)** → neutral “Verified organization” (implied by publish rule).
4. “Accredited Hours 18 / Mission dates 25–28 Sep” → **BB** duration/endDate (opportunity-fields); “Accredited” wording neutralized.
5. “Field Documentation Environment” imagery → **BB** opportunity gallery/media (opportunity-fields).
6. Positions “Assigned: Ahmed Benali” + application counts → **BB** — public: `position.applicationCount` + assigned volunteer names (decision 5) (org-embed-labels / public-exposure).
7. Statutory/insurance/logistics cards → **RR(civic)** — “Statutory Adherence / Civic Insurance Art. 14” removed → neutral “About this mission”; logistics/capacity to **FCD** (see item 14).
8. Related initiatives → **BB** — org slug embedded in payload makes `GET /organizations/:slug/opportunities` reachable; “Archive Concluded” item must be `published` to appear (or public archive per 4.4#7).
9. Apply on guest simulates success → **RR** — decision 10 redirect to Login.
10. Commitment hours → **BB** (opportunity-fields).
11. Publishing-entity card (“Registration No DZ-CIVIC-2018-0442”, “Wilaya Register”, “Civic History 1,420 hours”) → **RR(civic)** + **BB** — reg no → `ORG-<id>` + neutral registrationNumber; hours → org aggregate (org-dashboard).
12. “National Civic Registry Dispatch” strip → **RR(civic)** remove.

## 5. Auth & System (6 screens)

### 5.1 Create Account
No conflicts. Stays as-is (registration-type selector).

### 5.2 Register Organization → **REDESIGN-REQUIRED** (decision 7 + civic rule)
1. Form fields (name, type, reg number, wilaya/municipality, address, description) → **RR** — remove from this screen; registration keeps `{email, password, phone?}` only; after submit → auto-login → route to Org Profile Completion screen (one of the new screens, PART 2) which PATCHes org-facts.
2. Terms checkbox → **RR** — moved to profile-completion (neutral “I accept the Terms & Privacy Policy”; no backend consent flag from decision 7 minimalism — optional plain checkbox, client-side).
3. Sample phone `+213 49 90 12 34` → **RR** — use format-valid sample `+213555123456`.
4. “Step 1 of 2” → **RR** — remove; single registration step.
5. “Continue to verification” / 403 `EMAIL_NOT_VERIFIED` → **RR** — after login gate the dossier action behind Email Verification (link to the existing Email Verification screen).
6. “Reference #DZ-2024-ADR-0442” → **RR(civic)** → `ORG-<id>` after creation (registry-ids).
7. Pending/under-review view → **RR** — keep pending state copy (decision 6/11) but strip “Pending Documentation Review” → neutral “Pending review” (civic-neutral).
8. “Law 12-06 statutory footer” → **RR(civic)** remove.

### 5.3 Forgot Password
1. “Link expires in 30 minutes” → **RR** — align copy to backend 1h TTL.
2. 54s cooldown vs 3/hr throttle (429) → **BMD** — the new Rate-limited (429) state covers it; client keeps cooldown as UX nicety.
3. “Works for volunteers, orgs, system administrators” + anti-enumeration copy → kept (accurate).

### 5.4 Email Verification
1. Success state “Validated Civic Association (Law 12-06) / Active” → **RR(civic)** — replace with neutral “Email verified”; show org `verificationStatus: pending` (decision 6/11).
2. Resend requires session but page is public-token → **RR** — add “Sign in” CTA before resend (and use the new 401/session-expired state).
3. “Contact civic verification registry” link → **RR(civic)** — remove/neutralize.
4. `data-path="verify-email"` targets → fine.

### 5.5 Global Error & System States
1. 500 “central engineering dispatch has received telemetry” → **RR(civic)** — neutral error copy.
2. “National Registry ledger safe & operational” → **RR(civic)** — remove.
3. Missing 401/session-expired + 429 → **BMD** — add both states to this screen (PART 2, item 7).
4. 403 collapses 3 codes → **BMD** — add code-specific variants (FORBIDDEN / ACCOUNT_SUSPENDED / ACCOUNT_INACCESSIBLE / EMAIL_NOT_VERIFIED).
5. No mapping of `{code}` → state → **RR** — bind states to `code`s.

### 5.6 My Portfolio → **DELETE**
Standalone portfolio screen is removed (decision 2). See PART 3 for orphan-check. Its conflicts (category chips, skill chips, Featured flag, dates/counts, experience links, single-item GET) vanish with the screen; public portfolio read stays (merged profile uses it).

---

# PART 2 — BUILD-MISSING-DESIGN: 7 new screens

All new screens: plain HTML/Tailwind reusing DESIGN.md tokens (colors, type scale, spacing, buttons, inputs). No new visual language. Each lists the data/actions its routes require.

1. **Sign In / Login**
   - Data: `email`, `password`; states: invalid creds (`INVALID_CREDENTIALS`), unverified email (→ CTAs to Email Verification + Resend), suspended (`ACCOUNT_SUSPENDED`), success → role-based redirect (volunteer/organization/admin dashboard via `GET /auth/me`).
   - Actions: submit `POST /auth/login` `{email,password}` (no role); links: Create Account (type selector), Forgot Password, and per decision 10 a pre-filled “Sign in to continue” state when arriving from an apply/save/guest action. Session-expired/429 states link here.

2. **Reset Password**
   - Data: token (from email link), `newPassword` + confirm (min 8 max 72); states: invalid/expired/used token (`INVALID_VERIFICATION_TOKEN`, TTL 1h), success → sign in.
   - Actions: `POST /auth/reset-password` `{token, newPassword}` (revokes sessions).

3. **Volunteer Registration**
   - Data: `email`, `password` + confirm, `phone` (optional, `/^\+?[0-9]{8,15}$/`); after submit: auto-login + email-verification notice.
   - Actions: `POST /auth/register/volunteer` → tokens + `user`; link to Sign In; next-step CTA → Volunteer Profile completion.

4. **Volunteer Profile (self)**
   - Data: `GET /volunteers/me` (names, bio, birthDate, location, avatar); `GET/POST/PATCH/DELETE /volunteers/me/skills`; `GET/PUT /volunteers/me/availability`; `GET/PATCH /volunteers/me/public-settings` (now default-on toggles incl. `showStats`); dashboard stats.
   - Actions: edit fields (`PATCH /volunteers/me` incl. new lastName exposure, public), avatar upload (2-step media, purpose `avatar`, ≤5 MB image), skill picker from `GET /skills`, availability editor, visibility toggle panel, “View public profile”.

5. **Volunteer Settings**
   - Data: `PATCH /users/me` (email/phone → re-verify flow), `POST /auth/change-password`, `GET /users/me/sessions` (now with device metadata + `isCurrent`), `GET/PATCH /notifications/preferences` (new), `DELETE /users/me` (soft delete).
   - Actions: update email/phone, change password, per-session revoke (`DELETE /users/me/sessions/:id`), “sign out other sessions” (`POST /auth/logout-others`, new), notification toggles, delete account with confirm; note email-change invalidates verification (surface Email Verification).

6. **Org Verification Dossier upload**
   - Data: `GET /organizations/me/verification` (latest status/counters (tokens)), upload targets 2-step media purpose `verification_document` (≤5 MB JPEG/PNG/WebP/PDF), doc list; guard note: `EMAIL_NOT_VERIFIED` gate.
   - Actions: `POST /media/uploads` → storage → `POST /media/:mediaId/confirm` per document → `POST /organizations/me/verification` `{documents: string[]}`; states: collecting / submitted / (after admin) verified|rejected; neutral copy, no reference codes.

7. **Session-expired (401) + Rate-limited (429) states** (extensions to Global Error & System States)
   - 401/session-expired: re-authenticate CTA → Sign In; shown on any guarded call 401.
   - 429: “Too many attempts — try again in a moment” + optional countdown; bound to the real throttle buckets (login 5/min, forgot/resend 3/hr, uploads 20/min).
   - Add 403 code-variant sub-states (FORBIDDEN / ACCOUNT_SUSPENDED / ACCOUNT_INACCESSIBLE / EMAIL_NOT_VERIFIED).

---

# PART 3 — MERGE / DELETE, with orphan check

### M1. Public Talent Profile + Public Volunteer Profile → MERGE (decision 3)
- Result: **one** Public Volunteer Profile screen. Base = Public Talent Profile layout; add from Volunteer Profile: the portfolio/work-samples grid (present in both already — dedupe to the Volunteer Profile's richer media grid incl. link-item handling) and the stats strip (only if/when the public-stats build ships — it does, public-exposure).
- Same backend surface: `GET /volunteers/:username` (+ `/experiences`, `/portfolio`), `GET /organizations/:slug`, `GET /talents`, `GET /media/:id`.
- Orphan updates: the Volunteer Profile folder is removed; any `data-path`/links elsewhere targeting “public volunteer profile” or “@username” route → point to merged path `/volunteers/<username>` (no `@`); references: My Portfolio sidebar (screen deleted anyway), Volunteer Profile “View public profile” actions, save/share links.

### D1. Standalone Portfolio screen → DELETE
- Remove `Basmatak Tatatoua - My Portfolio` from the design set. Public portfolio stays via the merged profile (`GET /volunteers/:username/portfolio`). Volunteer-side CRUD endpoints (`/portfolio/me`) remain in the backend but have no UI — no new build.
- Orphan check: “View public profile” (My Portfolio) dies with the screen; no other screen links to `/portfolio/me`; `portfolio_item` media purpose unchanged.

### D2. Messaging removal (decision 2)
- Remove every Contact/Message/Org Inquiry element: Discover Talents “Contact/Invite”; My Applications “Contact coordinator”; My Participations “Contact Field Coordinator” + “internal messaging”; Submit Contribution “Message coordinator”; Applications “Ask clarification question”; Participants “Send participant message”; Manage Organizations “Request Info”; Manage Opportunities “Org Inquiry”; Reports & Moderation “Contact Secretariat”; Org Dashboard/others have none.
- Orphan check: no remaining screen references a messaging entry point; notifications remain (events/polling) but are **not** user-to-user. No messaging endpoints anywhere in scope.

### D3. Ranking/leaderboard removal
- Nothing to remove structurally (audit found no ranking UI). The “verified experiences count” chips on cards/counts remain as **stats**, now publicly-backed (public-exposure). No leaderboard survives.

### D4. Standalone `/verify/:code` page removal
- No page is designed; none is added. `GET /verify/:verificationCode` endpoint **stays** as a verifiable deep-link target used by the inline indicator (decision 4) and copy-verification-link actions.
- Orphan check: “Verify on National Ledger” link (Public Volunteer Profile) → **RR(civic)** removed with the merge; My Experiences “Share / verify link” → replaced by inline “✓ Verified by <org> on <date>” + a “View verification” link to a record summary (can still deep-link the code); no QR anywhere.

---

# PART 4 — REDESIGN-REQUIRED summary (screens edited to match decisions)

| Screen | Exact changes |
|---|---|
| Register Organization | decision 7: strip to `{email,password,phone}`; profile-facts move to new Org Profile Completion flow (BMD-adjacent; builds org-facts); terms checkbox relocated; valid phone sample; remove “Step 1 of 2”; surface email-verification gate before dossier; neutral pending copy; civic footer removed. |
| Submit Contribution Organization-Dashboard | decision 3/8/9/6: 2-step upload with progress state; ≤5 MB image/PDF + video-as-link; consent checkbox; link-host allowlist hint; audio/zip claims removed; “Message coordinator” removed. |
| Email Verification | success state shows neutral “Email verified” + org remains “Pending review” (decision 6); sign-in CTA before resend. |
| Forgot Password | TTL copy 30 min → “within one hour”; wire in 429 handling. |
| Global Error & System States | add 401/429 + 403 code variants (BMD item 7 also covers); neutral 500 copy. |
| Applications / Applications queue | reject requires reason dialog; “Under review” flows from the new application state. |
| Create Opportunity | category select → live `GET /skill-categories`; publish disabled until org verified/publish-gate passes. |
| My Opportunities | unverified-org publish state surfaced. |
| Participants | label vocabulary realigned to participant/s submission states. |
| Contributions | “Changes requested”→mapped to rejected; single approve-and-mint action text. |
| Admin screens (vocabulary) | status filters/columns use real enums; remove invented states (Manage Orgs/Volunteers/Opportunities filters). |
| Public Landing / Opportunity Details | guest apply → Login redirect (decision 10). |
| Public Talent↔Volunteer Profile & Landing sample card | neutral copy per civic rule; merged profile per M1. |

# PART 5 — CIVIC NARRATIVE REMOVED

Applied across every screen below (non-exhaustive but complete for every strong marker found in the code.html files; marker counts from the design files in parentheses). Rule: replace with neutral plain copy. **Decision 6 registry IDs are a separate real feature — they are the replacement identifiers.**

| Screen | Before → After |
|---|---|
| Public Landing Page | “Verified Volunteer Experience Record #DZ-EXP-2026-084 · 12 accredited civic hours · Audit Trail: Logbook #441 · Validated 12/03/2026 · verified by organization · Law 12-06” (Law 12-06 ×5, Registry ×3, Statutory ×3, Accredited ×6) → reusable example card: title, org, date, `EXP-<id>`, “Verified”; remove ledger/audit-trial copy. |
| Public Opportunity Details | “National Registry Code DZ-OPP-2026-0814 · Gazetted Field Opportunity” → `OPP-<id>` + “Open/Published”; “Law 12-06 Validated” → “Verified organization”; “Statutory Adherence / Civic Insurance Art. 14” (Law ×8, Registry ×8, Ledger ×3, Gazett ×1, Dispatch ×1, Statutory ×2) → neutral mission copy; “National Civic Registry Dispatch” removed; “Wilaya Register: Adrar” → location label only. |
| Public Organization Profile | “Verified Civil Society Organization · Accredited under Algerian Law 12-06”, “National Civic Registry ID DZ-CIVIC-ORG-2018-0442”, “Supervisory Authority”, “Audit Record Verified 14 Jan 2019” (Law ×5, Registry ×10, Supervis ×1, Statutory ×2, Accredited ×4) → neutral “Verified organization”, `ORG-<id>`, “Founded/Active since”; drop authority/audit lines. |
| Public Talent Profile | “Verified Contributor”, “Civic Registry member since 2024”, “Institutional Endorsement”, “Level 2 Verified”, “CV endorsements 4 CSOs” (Registry ×4) → neutral: name/skills/stats (now public), “Recommended by organizations” (public reviews), remove tier/registry vocabulary. |
| Public Volunteer Profile | “Verified Civic Volunteer · DZ-VOL-2024-88402”, “National Registry Verification: 100% deliverable acceptance / zero non-compliance”, “Verify on National Ledger” (Law ×4, Registry ×5, Ledger ×1, Accredited ×2) → neutral profile (merged with Talent); “Verify on National Ledger” removed; stats strip labeled “Stats”. |
| Register Organization | “Law 12-06 statutory footer”, “Pending Documentation Review”, “Reference #DZ-2024-ADR-0442”, “Complete the verification process…” (Law ×5, Statutory ×2) → neutral “Terms & Privacy”, “Pending review”, `ORG-<id>`; keep pending-state fact (decision 6/11). |
| Email Verification | “Validated Civic Association (Law 12-06) / Active” (Law ×3, Registry ×2) → “Email verified” + org status `pending`. |
| Forgot Password | “Law 12-06 platform security protocols” (Law ×2, Registry ×1) → neutral “secure link expires in one hour”. |
| Create Account | Law 12-06 statutory footer (Law ×2, Statutory ×1) → neutral footer. |
| Global Error & System States | “National Registry ledger safe & operational”, “central engineering dispatch has received telemetry”, “Statutory Trust Guarantee” (Law ×2, Registry ×1, Ledger ×1, Dispatch ×1, Telemetry ×1, Statutory ×1) → neutral error copy. |
| Organization Dashboard | “Registry #DZ-ALG-7740”, “Established 2018” (Law ×1, Registry ×3) → `ORG-<id>`, “Founded 2018”; civic note text reviewed/neutralized. |
| Organization Profile | “Statute DZ-14/08”, “Civic Registry ID DZ-CIVIC-ORG-2018-0442”, “Law 12-06 Accredited”, “Accredited since 2018”, “Annual Report… Filed March 2026” (Law ×3, Registry ×2, Statutory ×1, Accredited ×5) → neutral: registrationNumber, `ORG-<id>`, founded date, org-facts fields; annual report → FCD. |
| Organization Settings | “Law 12-06” references, “Ledger minting” notification item, “Accredited” copy (Law ×2, Registry ×2, Ledger ×3, Accredited ×2) → neutral labels (“Verification activity & record issuance”). |
| Verified Experiences Organization-Dashboard | “SHA-256 Ledger Verified”, “National Civic Registry ID DZ-CIVIC-2024-88402”, “Public Civic Ledger”, “Sovereign Civic Rights”, “Statute DZ-14/08” breadcrumb (Law ×2, Registry ×5, Ledger ×2, Accredited ×3) → neutral: verification code + verified date, `EXP-<id>`/`VOL-<id>`, “Public records”, remove sovereignty/ledger/statute copy (“Download Attestation (PDF)” stays, BB). |
| Participants Organization-Dashboard | “Civil Accreditation Background”, “Verified Experience Minting”, “Statute” references (Law ×1, Registry ×3, Accredited ×1) → neutral “Skills & background”, “Verified experience issued”; timeline wording neutralized. |
| Contributions | “Approved · Ready for verification”, “Civic council review” flag, “Sovereign civic experience record” (Law ×2, Accredited ×1) → neutral review steps; council flag removed; compliance wording neutralized. |
| Applications / My Applications / My Participations | “Ask clarification”, “GHT-CIVIC-4401”, “Law 12-06 compliant” stamps (few hits) → neutral; codes → real ids. |
| Manage Volunteers | “Pending Verification 518”, “National ID verified under Law 12-06”, “Law 12-06 compliant”, check_circle badge, “DZ-VOL-2024” (Law ×2, Registry ×4, Ledger ×2, Accredited ×2) → real statuses only, “Email verified”, `VOL-<id>`; pending metric removed. |
| Manage Organizations | “Law 12-06 Verified 154 (82.8%)”, “Pending Legal Review”, “Grant Law 12-06 Seal”, “Institutional .dz Domain Verification”, “DZ-CIVIC-ORG-2018-0442” (Law ×6, Registry ×2, Accredited ×1, Seal ×1) → neutral: “Verified / Pending”, standard verify action, website field; `ORG-<id>`. |
| Manage Opportunities | “Law 12-06 / insurance” compliance line, “Flagged/In Review”, “DZ-NAT-REG”, “Registry File #OPP-ADR-2026-091” (Law ×2, Registry ×4, Ledger ×1, Statutory ×2) → neutral; `OPP-<id>`; flagged metric from open reports. |
| Reports & Moderation | “Statutory Sanction”, “100% Statutory Compliance”, “Law 12-06” (Law ×3, Registry ×1, Statutory ×5) → neutral moderation actions + “Resolution compliance”→ nothing; remove sanctioned vocabulary. |
| Admin Dashboard | “Platform Health & Compliance”, “Database Registry Sync Operational (DZ-NAT-REG)”, “Law 12-06 quota 100%”, “Verification Turnaround” (Law ×3, Registry ×4, Statutory ×1) → “System Status” from `/health`; turnaround from reliability metric. |
| Admin Settings | “Civic Hours Ledger Sync DZ-NAT-REG v2.4”, “National Jurisdiction” box, “Statutory Mandate”, “Audit Log Retention Compliant” (Law ×5, Registry ×3, Ledger ×4, Dispatch ×2, Statutory ×8, Seal ×1) → neutral settings; remove national/statutory framing except the enforcement fact. |
| Opportunity Details (volunteer) | “Ref: BT-2026-084”, “Civic Recognition: Official Certificate” (Supervis ×1 elsewhere; code refs) → `OPP-<id>`; “Certificate” neutral. |
| Create Opportunity / My Opportunities / Org Dashboard | “Charter” wording (Create Opportunity ×3, My Opportunities ×1) reviewed → neutral checklist copy. |
| Discover Talents | “Civic Verification 100%”, “Civic Qualifications”, “Verified Community Pathways” (Registry ×2) → neutral availability/stats filters. |

Note: “Law 12-06” as an enforcement **fact** is preserved only where it is real product behavior (org must be verified to publish; email verification required) — always phrased neutrally, never as a “seal/validation/compliance badge”.

# PART 6 — FLAVOR COPY — NEEDS OWNER DECISION (non-civic filler, short)

1. **Opportunity Details (volunteer) — “What you receive” / perks**: “Hospitality: Meal & Transport”, “Official Certificate”, “Requirements” blocks. Not civic-themed, has no structural data. Options: (a) cut, or (b) add `opportunities.perks[]`/benefits fields (small build).
2. **Organization Profile — “Annual Report (2025 Audited Civic Report, filed March 2026)”** + similar org marketing artifacts. Options: cut, or add optional org-attached document.
3. **Public Opportunity Details — Mission logistics block**: “Host Logistics”, “Accommodation”, “Language of Record”. Options: cut, or add three optional opportunity text fields.
4. **(merged) Public Volunteer Profile — free-form “Community Contributions & Fieldwork” list** (Talent Profile sidebar) and **“Areas of Civil Contribution” % bars**. Options: cut, or derive areas from real experience categories (small derive) and cut the free-form list.

Everything else that looked like filler was either civic-narrative (removed per rule) or structurally backed (built).

# PART 7 — New backend scope summary (module / route / collection format, mirrors backend-inventory §1/§2)

New collections: `counters`, `favorites`, `notification_prefs`. All additions land in **new** `backend-v2-*` OpenSpec changes (archived changes untouched).

| Module (owner) | Collection change | New / changed routes (access) | OpenSpec change |
|---|---|---|---|
| core (common) | `counters` (new): `{_id: type, seq}` | RegistryIdService: atomic `findOneAndUpdate { $inc }` per type at creation; registry ids: `VOL-`, `ORG-`, `OPP-`, `EXP-` + 6 zero-padded digits; immutable; returned in API payloads | registry-ids |
| core (common) | CursorPage: add `total`, `page`, `pages` | All list endpoints pagination; add `sort` and multi-value filter params (`?x= a,b`) where UI shows multi-select; `GET /opportunities?nearMe=`, `?minExperiences=` on `/talents`, date ranges on `/experiences/me` etc. | pagination-totals |
| core (common) | `status_histories` read | `GET /admin/status-histories?entityType=&entityId=` (Admin) — reuse existing writer | admin-lists |
| auth | `sessions`: add `device`, `userAgent`, `isCurrent` marker | `POST /auth/logout-others` (Auth); capture device metadata at login; frontend `POST /auth/login` unchanged | org-ops |
| users | `users`: add `lastActivityAt` | updated on access; shown in admin/volunteers + own profile | org-ops |
| volunteers | `volunteer_profiles`: `publicProfile` defaults flipped to true (enabled, showBio, showSkills, showPortfolio, showExperiences, showStats); add `lastName` to public model (fullName); expose `stats`, `createdAt`; add optional `headline`/free-text availability note + `preferredDomains`, `geographicBase` | `GET /volunteers/:username` + `/experiences` + `/portfolio` return new/exposed fields; `GET /volunteers/:username/reviews` (Public, new) for neutral recommendations; `PATCH /volunteers/me` + `/public-settings` accept the new fields | public-exposure |
| volunteers (portfolio) | `portfolio_items`: optional `typeLabel`, `tags[]` | unchanged routes; public payload includes them | portfolio-meta |
| organizations | `organizations`: add `registryId`, `coverMediaId`, `type`, `registrationNumber`, `location{wilayaId,municipalityId,address}`, `website`, `foundedYear`, `contact{email,phone}`, `focusDisciplines[]`, `operatingScope`, `publicProfile {enabled}`; delete-org support | `GET/PATCH /organizations/me` extended (Org); `GET /organizations/me/profile-completion` (Org, new); `DELETE /organizations/me` (Org, new); `GET /organizations/:slug` public payload extended incl. aggregates; `GET /organizations/:slug/opportunities?status=published\|completed` (Public, extended); `GET /organizations/:slug/reliability` unchanged | org-facts, org-dashboard |
| organizations | — | `GET /organizations/me/opportunities/:id` (Org, new); `POST /organizations/me/opportunities/:id/duplicate` (Org, new) | opportunity-fields |
| organizations | `organization_verifications`: add `assignedAdminId` | `PATCH /admin/organizations/verifications/:rowId/assign` (Admin); `GET /admin/organizations/:id/verification/latest` (Admin) | admin-lists |
| opportunities | `opportunities`: add `registryId`, `mode` (onsite\|remote\|hybrid), `coverMediaId`, `endDate`, `durationMinutes`, `prerequisites[]`, `perks[]` (pending FCD decision); `positions[].deliverables[]`, optional `startAt` | create/patch DTOs extended; public feed/detail embed `organization` object + `categoryName`, location labels, skill names; public detail adds `position.applicationCount` + assigned volunteer names; `POST /admin/opportunities/:id/close\|unpublish` (Admin) | opportunity-fields, org-embed-labels, moderation-actions |
| media | `media`: add purposes `opportunity_cover`, `organization_cover`; `submission_evidence` defaults `visibility=private`; fix org-read branch (owning org reads private evidence); guests may read `visibility=public` media attached to public content | `GET /media/:mediaId` access matrix updated (Public for public media; Org for own-opportunity private evidence); upload/confirm/links unchanged | media-access |
| favorites (new module) | `favorites` (new): `{userId, targetType, targetId, createdAt}`, unique `(userId,targetType,targetId)` | `POST/DELETE /favorites/opportunities/:id`, `POST/DELETE /favorites/talents/:username`, `GET /favorites` (Vol), `GET /favorites/counts` (Vol); cards expose `favorited`/counts | favorites |
| applications | `applications`: wire `message` (apply body `{message?}`); add `under_review` state | `POST /opportunities/:id/positions/:pid/applications` accepts `message`; `POST /applications/:id/start-review` (Org, new); accept/reject accept `under_review`; embed volunteer profile + org/opp/position names in `/applications/me` and `GET /opportunities/:id/applications`; new `GET /organizations/me/applications` (Org aggregate inbox) | application-states, org-embed-labels |
| participations | — | new `GET /organizations/me/participants` (Org aggregate; `?q=&opportunityId=&status=&page=` incl. completed); participants payload joins submission state/files | org-dashboard |
| submissions | `submissions`: add optional `title` | `POST/PATCH` DTOs accept `title`; `/organizations/me/submissions` gains multi-status filter, `?q=`, `?format=`, `?sort=`, totals, volunteer join | pagination-totals, org-embed-labels |
| verifications / experiences | `volunteer_experiences`: add `registryId`; real `duration` (from opportunity/position hours at mint); public/own/org payloads add org identity + `verifiedAt` + `verificationCode` | new `GET /organizations/me/experiences` (Org; `?q=&opportunityId=&visibility=&sort=&page=`); `GET /admin/volunteers/:id/experiences` (Admin); `GET /versions…/attestation` → `GET /experiences/:experienceId/attestation` (PDF; Auth/owner) | experience-enrichment, pdf-attestation, registry-ids |
| notifications | `notification_prefs` (new) `{userId, prefs{...}}` | `GET/PATCH /notifications/preferences` (Auth); admin digest toggles; `POST /admin/users/:userId/notice` (Admin broadcast, new) | notification-prefs, moderation-actions |
| admin | — | all admin lists: `?q=`, field filters, `&page=&pageSize=`, response `total/pages`, and `format=csv` export (volunteers, organizations, opportunities, reports, audit-logs); admin rows embed labels/counts; `/admin/users/:id/status` body `{reason,notes}`; reports list/add `title`, `priority`, assign, target summary; audit-logs entity extraction includes `reports` + display names | admin-lists |
| admin | — | `GET /admin/analytics/overview` (deltas, active-participants, per-status), `GET /admin/analytics/series?days=` (time series), `GET /admin/analytics/queue` (attention-queue totals); per-org footprint aggregates | admin-analytics |
| admin | — | `PATCH /admin/reports/:id` accepts `{status, resolution, action:{type, ...}}` executing moderation action (unpublish/suspend/close) atomically | moderation-actions |
| settings | `system_settings` extended key whitelist (platform name/summary, default language/timezone/date format, admin session duration, moderation flags, registration/publishing kill-switches, maintenance mode); runtime maintenance gate check; `GET /system/status` (public maintenance flag) | `GET/PUT /admin/settings(/ :key)` widened; maintenance toggle builds on `internal/jobs` pattern | settings-expansion |
| core (activity) | — | new `GET /organizations/me/activity` and `GET /volunteers/me/activity` (Auth; joins status_histories/notifications with entity summaries); volunteer `dashboard.latestVerifiedExperience` implemented | activity-feed, experience-enrichment |

---

## Bucket totals (this plan)

- **BUILD-BACKEND (BB):** ≈215 conflict resolutions (incl. the grouped admin-lists/analytics/settings packs and systemic items counted once per occurrence in Part 1).
- **BUILD-MISSING-DESIGN (BMD):** 7 screens (Sign In, Reset Password, Volunteer Registration, Volunteer Profile self, Volunteer Settings, Org Verification Dossier, 401/429+error-code states) — plus the 403 code variants folded into the 7th.
- **REDESIGN-REQUIRED (RR):** ≈60 items (copy + decision-forced UI edits, incl. the Register Organization screen and all civic-narrative copy edits therein, media/consent/upload fixes, status-vocabulary and guest-redirect fixes).
- **MERGE:** 1 (Public Talent + Public Volunteer Profile) with 3 orphan-link updates.
- **DELETE:** 4 actions (Messaging across 10 screens, standalone Portfolio, ranking — structurally nothing, standalone `/verify/:code` page) with orphan checks.
- **FLAVOR COPY — NEEDS OWNER DECISION (FCD):** 4 items (perks; annual report; mission logistics; free-form contributions list).

(Counts are classifications of the ≈287 reconciliation items; systemic items were assigned per their occurrence in Part 1 so the total reconciles with the source document. BMD, MERGE, DELETE and FCD are separate line items on top.)