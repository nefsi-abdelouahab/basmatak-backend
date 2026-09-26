# Basmatak Tatatoua — Frontend Roadmap

> Session-by-session build plan for the **Next.js frontend**, implementing every screen in `design/`
> against the frozen v2 backend contract (`docs/API.md`, live Swagger `/api/v1/docs`,
> `docs/DESIGN_BACKEND_RECONCILIATION_V2.md` — "the delta doc", §B item codes cited as `V2 §B#n`).
> Tooling: OpenSpec **1.5.0**, verb-first commands. Every numbered session produces exactly one **new**
> `frontend-<topic>` OpenSpec change, is implemented in `/frontend`, is validated, archived, and committed
> locally (never pushed). No session touches `/backend` or any archived change.
>
> Version: 1 (2026-09-25)

---

## 1. Summary

**Goal.** Ship the entire frontend: all 33 designed screens + the 7 missing screens (designed fresh in
plain HTML/Tailwind to DESIGN.md tokens) + the Talent↔Volunteer merge, on the architecture below —
every screen token-driven, fully translated (en/ar, RTL-correct), data only via the centralized API
layer + TanStack Query, responsive at all 3 breakpoints.

**Stack (decided).** Next.js (App Router) + TypeScript (strict) + Tailwind CSS + Axios + TanStack Query
+ next-intl. Node ≥ 20 LTS, npm ≥ 10.

**Baseline (what this roadmap builds on).** The fully archived backend v2: 130 route handlers,
`CursorPage { items, nextCursor, limit, total, page, pages }`, `registryId` on 4 entities, org embeds,
favorites, activity feeds, aggregates, streamed CSV/PDF. Verify with `openspec list`
(zero active) + `openspec validate --all --strict` (35/35). Re-verify before Session F0 starts.

**Design source.** `design/` (33 folders: `code.html` + `DESIGN.md` + `screen.png`) + `design/system-design.md`
("Disciplined Civic Network": violet `#6D28D9` primary, green = verification only, amber = pending only,
IBM Plex Sans Arabic + Inter, English UI RTL-ready, desktop-first 1440px 3-column, no floating
cards/gradients/glassmorphism). The 7 missing screens and the merged profile are authored from these
tokens — no new visual language.

**Sections (F-series).** Order is strict across sections; sessions inside one section are pairwise
**file-disjoint** (distinct route dirs + distinct `lib/api/*` + distinct `hooks/*` files — verified by
path, not by module name) and may be authored/implemented interleaved back-to-back under the
single-OpenSpec-writer discipline (never two `openspec new change` calls simultaneously), provided no
two touch the same file. Shared primitives (`components/ui/*`, theme, i18n setup, api client) ship once
in F0; later sessions only **consume** them (new shared pieces, if unavoidable, are declared in the
session's out-of-scope check and added by exactly one session).

## 2. Mandatory architecture (applies to EVERY session, verified at every gate)

1. **THEME** — single centralized theme: CSS variables + Tailwind theme config derived from DESIGN.md
   tokens (`primary #6D28D9`, hover `#5B21B6`, surfaces, borders `#E2E8F0`/`#F1F5F9`, status green
   `#16A34A` / amber `#F59E0B` / error `#DC2626`, radii, type scale). No hardcoded color/font/spacing
   value in any component — everything reads from the central theme. Violations fail review.
2. **I18N** — next-intl with `messages/en.json` + `messages/ar.json`. No hardcoded UI strings in JSX.
   RTL works at `locale=ar` (logical CSS properties, mirrored layout, Arabic font swap). Every session
   ships both catalogs for its strings.
3. **API ACCESS** — one centralized layer: axios instance (JWT attach, 401 refresh-and-retry, unified
   error shape mapping `{ statusCode, code, message, details? }` → error states incl. 401/403/404/429/503),
   one typed function per backend endpoint, consumed only via TanStack Query hooks. No ad-hoc
   fetch/axios in components or pages. Streamed downloads (CSV/PDF) go through one shared
   authed blob-download helper (`Content-Disposition: attachment`), not per-screen code.
4. **RESPONSIVE** — every screen works at Desktop ≥1280px (3-column) / Tablet 1024–1279px (2-column) /
   Mobile ≤768px (single-column + bottom nav). Acceptance criterion for every session, with Playwright
   viewport checks.

**Cross-cutting contracts (bind once in F0, reuse everywhere).**
Guest authed-action → redirect to Login (decision 10; backend only 401) — applies to Apply, Save/favorite,
and every authed action on public screens. Uploads: 2-step presigned flow
(`POST /media/uploads` → `{mediaId, uploadUrl}` → PUT bytes → `POST /media/:mediaId/confirm`),
images/PDF only ≤5 MB, video = external link (YouTube/Drive allowlist), imagery-consent checkbox before
submit. `registryId` display-only, never a route key. Phone `/^\+?[0-9]{8,15}$/`; password 8–72 chars;
tokens TTL 1 h. No messaging/ranking/standalone-portfolio/`/verify` page UI anywhere.

## 3. Sections — order, membership, parallel-safety rationale

| Section | Sessions (change names) | Depends on | Parallel-safe rationale |
|---|---|---|---|
| **FA** | F0 `frontend-foundation` | v2 backend archived | Alone — strict gate, everything else depends on it |
| **FB** | F1 `frontend-auth-screens`, F2 `frontend-volunteer-account`, F3 `frontend-org-onboarding` | FA | Disjoint route dirs (`(auth)/*` vs `volunteer/profile|settings` vs `org/complete-profile|dossier`) + disjoint api/hook files (`auth.ts` vs `volunteers.ts` vs `organizations.ts`) |
| **FC** | F4 `frontend-volunteer-home`, F5 `frontend-opportunity-details`, F6 `frontend-volunteer-tasks`, F7 `frontend-submit-contribution`, F8 `frontend-volunteer-credentials` | FB | Disjoint route dirs + disjoint hook files (`useFeed.ts`, `useOpportunity.ts`, `useTasks.ts`, `useSubmissions.ts`, `useExperiences.ts`) |
| **FD** | F9 `frontend-org-workspace`, F10 `frontend-org-opportunities`, F11 `frontend-org-review`, F12 `frontend-org-records`, F13 `frontend-org-account` | FB (not FC) | Disjoint route dirs (`org/*`) + disjoint hook files (`useOrgStats.ts`, `useOrgOpps.ts`, `useOrgInbox.ts`, `useOrgRecords.ts`, `useOrgAccount.ts`); FC↔FD parallel-runnable (no shared files; shared ui/* frozen since F0) |
| **FE** | F14 `frontend-admin-overview`, F15 `frontend-admin-manage`, F16 `frontend-admin-moderation` | FB (uses org/volunteer read shapes only at runtime) | Disjoint route dirs (`admin/*`) + disjoint hook files (`useAdminAnalytics.ts`, `useAdminLists.ts`, `useAdminModeration.ts`) |
| **FF** | F17 `frontend-public-talent`, F18 `frontend-public-orgs` | FC + FD (reuses their hook patterns; files distinct) | Disjoint route dirs (`(public)/volunteers|talents` vs `(public)/orgs|opps|landing`) + disjoint hook files (`usePublicTalent.ts` vs `usePublicOrgs.ts`) |
| **FG** | F19 reconciliation gate (no change) | all FA–FF archived | Alone — verification only |

Dependency justification: FA → everything (theme/i18n/api/shell). FB → all screen sections (auth hooks,
guards, session states). FC and FD depend only on FB and are mutually parallel (disjoint trees by route
group; the backend lesson — "disjoint" modules sharing a controller file — is applied here as: no two
sessions in one section may edit the same `lib/api/*`, `hooks/*`, `messages/*.json` section, or shared
component file; catalogs merge by key-prefix ownership declared per session). FE needs only FB
(admin hooks are self-contained; admin screens never import volunteer/org route components). FF last
among builders (merged profile + landing consume the most backend surface; building them after the
authed screens lets them reuse proven card/pattern components read-only). FG gates all.

**No deploy step.** Deployment stays deferred (local `build`/`dev`/`test` only). Placeholder final session
`frontend-deploy` is listed with no tasks (out of scope here).

---

## 4. Sessions

Conventions: "verify" always includes `openspec validate <change>` + `openspec status --change <change>`
from the repo root, and from `/frontend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`.
Each session = one new change `frontend-<topic>`. Commit messages use `feat(<topic>): …`.
All endpoint paths are prefixed `/api/v1` (omitted below for brevity). "Tests" = vitest unit/component
+ Playwright e2e (viewport matrix 1440/1100/390) unless the session says otherwise.

---

### Session F0 — frontend-foundation
**Phase:** foundation · **Section:** FA · **Change:** `frontend-foundation` · **Depends on:** v2 backend archived (precondition check only)

**Objective.** Scaffold the app plus the 4 mandatory systems, the base shell, auth storage/refresh, and
system screens — the ground every later session builds on. Must be implemented AND archived before any
FB session starts.

**In scope.** Next.js App Router + TS strict scaffold (`/frontend`); Tailwind theme config + CSS variables
from DESIGN.md tokens; next-intl setup (`en.json`/`ar.json` skeleton, locale routing, RTL); axios instance
(JWT attach, 401 refresh-and-retry against `POST /auth/refresh`, unified error shape, 429/503 surfacing);
TanStack Query provider + query-key factory conventions; typed api-module skeleton + blob-download helper;
auth token storage + session-expired handling; base layout shell (navbar/sidebar per DESIGN.md, bottom nav
mobile); error boundary + 404/403/500/Maintenance/Network-Error screens (wired to `{code}` mapping incl.
`FORBIDDEN`/`ACCOUNT_SUSPENDED`/`ACCOUNT_INACCESSIBLE`/`EMAIL_NOT_VERIFIED`, 503 via `GET /system/status`);
`components/ui/*` primitives (button/input/select/checkbox/pill/card/table/pagination/empty/loader);
`openspec/config.yaml` context update (frontend stack + the 4 mandates + "one hook file per session" rule).
**Out of scope.** Any screen route beyond the shell + system screens; any domain hook; the 401/429 states
(designed in FB/F1 against the states scaffolded here — structure only, no auth copy yet).

**Backend endpoints consumed:** `POST /auth/refresh`, `GET /auth/me`, `GET /health`, `GET /system/status`
(plus refresh-failure logout via `POST /auth/logout`).

**Packages.** `next react react-dom typescript tailwindcss axios @tanstack/react-query next-intl zod`
(dev: `vitest @testing-library/react @playwright/test eslint prettier`).

**Task checklist**
1. Scaffold `/frontend` (App Router, `src/` layout: `app/[locale]/*`, `lib/api/*`, `hooks/*`, `components/ui/*`, `messages/*`, `theme/*`); TS strict, eslint, prettier.
2. Theme: tokens → CSS vars + `tailwind.config` extension; verify zero hardcoded values via grep gate.
3. i18n: next-intl routing, both catalogs loading, RTL smoke (logical properties lint note in docs).
4. API client: axios instance + interceptors + unified error type + blob-download helper (unit-tested).
5. Query provider + key factory + hook-file conventions doc (`hooks/CONVENTIONS.md`, short).
6. Shell: navbar/sidebar/bottom-nav + error boundary + 6 system screens bound to error codes.
7. `openspec/config.yaml` context update for frontend.
8. Baseline tests green; commit.

**Tests.** Unit: interceptor (401→refresh→retry once, refresh-fail→logout), error-mapper (all codes),
key factory. Component: shell renders at 3 viewports. E2E: 404/500/maintenance routes; locale switch en↔ar mirrors layout.

**Acceptance & verification.** Shell + system screens at 3 breakpoints; both locales; no hardcoded
theme/string/fetch outside their layers (`grep -rn "#[0-9a-fA-F]\{3,6\}" src/components src/app` empty
outside `theme/`; no `fetch(` / raw `axios.` outside `lib/api`). Verify:
`cd frontend; npm run build; npm run lint; npm test; npm run test:e2e` +
`openspec validate frontend-foundation`.

**Commit.** `feat(foundation): Next.js scaffold, theme, i18n, API client, shell, system screens`

---

### Session F1 — frontend-auth-screens
**Phase:** auth · **Section:** FB · **Change:** `frontend-auth-screens` · **Depends on:** F0

**Objective.** All auth routes: Sign In (new design), Create Account selector (existing), Volunteer
Registration (new), Org minimal registration (redesigned per V2 §B#30), Forgot/Reset Password (new reset),
Email Verification (copy-fixed), plus the 401-session-expired + 429-rate-limited states (new).

**In scope.** Routes `(auth)/login`, `(auth)/create-account`, `(auth)/register-volunteer`,
`(auth)/register-organization`, `(auth)/forgot-password`, `(auth)/reset-password`,
`(auth)/verify-email`; `lib/api/auth.ts` + `hooks/useAuth.ts` (login/register/refresh/me/logout/
logout-others/change-password/forgot/reset/verify/resend); guest "Sign in to continue" entry state;
`EMAIL_NOT_VERIFIED` gating CTA; 401/429 screens wired to global handler.
**Out of scope.** Volunteer/org profile content (F2/F3); dossier upload (F3); password rules beyond 8–72.

**Endpoints.** `POST /auth/register/volunteer`, `POST /auth/register/organization`, `POST /auth/login`,
`POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `POST /auth/verify-email`,
`POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password`,
`POST /auth/change-password`, `GET /auth/me`.

**Tasks.** 1. `lib/api/auth.ts` (12 functions, typed) + `useAuth.ts`. 2. Seven routes to tokens (no
hardcoded strings; both locales). 3. Registration = `{email,password,phone?}` only; org shows pending
copy + `ORG-<registryId>` post-creation. 4. TTL copy "within one hour"; 429/401 states bound to codes.
5. Role-based post-login redirect (via `GET /auth/me`).

**Tests.** Unit: phone/password validation, redirect-target logic. E2E: register→verify-notice→login→me;
forgot→reset; expired-token state; 429 state on throttled resend (mocked 429); ar locale RTL.

**Acceptance.** All states (invalid creds, unverified, suspended, expired token) render correctly at 3
breakpoints, en+ar; no role selector on Sign In; no admin registration route.
Verify: build/lint/test/e2e + `openspec validate frontend-auth-screens`.

**Commit.** `feat(auth-screens): sign-in, registration, password recovery, email verification, 401/429 states`

---

### Session F2 — frontend-volunteer-account
**Phase:** auth · **Section:** FB · **Change:** `frontend-volunteer-account` · **Depends on:** F0 (parallel-safe with F1/F3)

**Objective.** Volunteer self Profile + Settings (both new designs): identity, skills, availability,
opt-out public toggles, sessions/notification controls, delete account.

**In scope.** Routes `volunteer/profile`, `volunteer/settings`; `lib/api/volunteers.ts` (own profile,
public-settings, skills CRUD, availability, dashboard read for completion %) + `hooks/useVolunteerAccount.ts`;
`lib/api/users.ts` + `lib/api/notifications.ts` (prefs) + `hooks/useAccountSettings.ts` (email/phone,
change-password, sessions list/revoke, logout-others, notification toggles, delete); avatar upload via
shared 2-step upload helper (purpose `avatar`).
**Out of scope.** Public rendering of the profile (F17); dashboard screen (F4).

**Endpoints.** `GET/PATCH /volunteers/me`, `PATCH /volunteers/me/public-settings`,
`GET/POST/PATCH/DELETE /volunteers/me/skills[/:skillId]`, `GET/PUT /volunteers/me/availability`,
`GET /volunteers/me/dashboard`, `GET/PATCH /users/me`, `DELETE /users/me`,
`GET/DELETE /users/me/sessions[/:sessionId]`, `POST /auth/logout-others`,
`GET/PATCH /notifications/preferences`, `GET /skills`, `GET /skill-categories`,
`POST /media/uploads`, `POST /media/:mediaId/confirm`.

**Tests.** Unit: completion-% display, toggle gating, `isCurrent` badge logic. E2E: edit profile + skills +
availability + toggles persist; logout-others keeps current; delete-account confirm; 3 viewports; en+ar.

**Acceptance.** Opt-out toggles (incl. `showStats`) default on and gate correctly; "View public profile"
links `/volunteers/<username>`; session rows show device + "This device".
Verify: build/lint/test/e2e + `openspec validate frontend-volunteer-account`.

**Commit.** `feat(volunteer-account): self profile, skills, availability, settings, sessions`

---

### Session F3 — frontend-org-onboarding
**Phase:** auth · **Section:** FB · **Change:** `frontend-org-onboarding` · **Depends on:** F0 (parallel-safe with F1/F2)

**Objective.** Org profile-completion flow + verification dossier upload (new design) + `EMAIL_NOT_VERIFIED`
gating — the post-registration half of decision 7.

**In scope.** Routes `org/complete-profile`, `org/verification-dossier`; `lib/api/organizations.ts`
(me read/patch, profile-completion, verification submit/status, delete-own) + `hooks/useOrgOnboarding.ts`;
dossier 2-step multi-document upload (purpose `verification_document`) with progress; resubmit after
rejected (`pending → verified | rejected → pending`); neutral copy + `ORG-<registryId>`.
**Out of scope.** Org profile/settings full screens (F13); admin triage (F15).

**Endpoints.** `GET/PATCH /organizations/me`, `GET /organizations/me/profile-completion`,
`POST /organizations/me/verification`, `GET /organizations/me/verification`,
`GET /locations/wilayas`, `GET /locations/wilayas/:wilayaId/municipalities`,
`POST /media/uploads`, `POST /media/:mediaId/confirm`.

**Tests.** Unit: completion-checklist math, gate logic. E2E: complete-profile PATCH → checklist 100%;
dossier upload→confirm→submit→pending; rejected→resubmit; unverified-email CTA; 3 viewports; en+ar.

**Acceptance.** Registration stays minimal (F1); facts live here; no statute/legal fields; phone/website
validation correct.
Verify: build/lint/test/e2e + `openspec validate frontend-org-onboarding`.

**Commit.** `feat(org-onboarding): profile completion and verification dossier upload`

---

### Session F4 — frontend-volunteer-home
**Phase:** volunteer · **Section:** FC · **Change:** `frontend-volunteer-home` · **Depends on:** FB

**Objective.** Volunteer Dashboard + Opportunities feed + Discover Talents (V2 §B#1/#2/#4): stats cards,
latest-verified-experience, filterable feeds with counts, org embeds, favorites.

**In scope.** Routes `volunteer/dashboard`, `volunteer/opportunities`, `volunteer/talents`;
`lib/api/feed.ts` (feed, recommended, talents + facets) + `hooks/useFeed.ts`; `lib/api/favorites.ts` +
`hooks/useFavorites.ts` (toggles, counts, `lookup`); result-count banners from `total`; `sort`,
multi-value filters, `nearMe`, week/weekend windows; guest Save → Login redirect.
**Out of scope.** Details/apply (F5); tasks (F6).

**Endpoints.** `GET /opportunities`, `GET /opportunities/recommended`, `GET /talents`,
`GET /volunteers/me/dashboard`, `GET /skill-categories`, `GET /skills`,
`GET /locations/wilayas`, `GET /locations/wilayas/:wilayaId/municipalities`,
`POST/DELETE /favorites/opportunities/:id`, `POST/DELETE /favorites/talents/:username`,
`GET /favorites`, `GET /favorites/counts`, `GET /favorites/lookup`.

**Tests.** Unit: filter-param builder, banner counts from `page/pages/total`. E2E: search/filter/sort/
pagination incl. empty state; favorite toggle persists; guest favorite → login; 3 viewports; en+ar.

**Acceptance.** Cards show org name + verified badge + `OPP-<registryId>` from embeds (no N+1); hours from
`durationMinutes`; loading/empty/error states; 401/403/404/429 handled.
Verify: build/lint/test/e2e + `openspec validate frontend-volunteer-home`.

**Commit.** `feat(volunteer-home): dashboard, opportunities feed, discover talents, favorites`

---

### Session F5 — frontend-opportunity-details
**Phase:** volunteer · **Section:** FC · **Change:** `frontend-opportunity-details` · **Depends on:** FB (parallel-safe with F4/F6/F7/F8)

**Objective.** Opportunity Details + apply/withdraw/report/related (V2 §B#3): real meta (mode, dates,
duration, prerequisites, deliverables, cover), positions with counts + assignees, org sidebar, certificate
note, guest-apply redirect.

**In scope.** Route `volunteer/opportunities/[idOrSlug]`; `hooks/useOpportunity.ts`
(`lib/api/opportunity.ts`: detail, apply `{message?}`, withdraw, report, related-by-category);
perks/logistics blocks REMOVED (FCD CUT); "Ref" → `OPP-<registryId>`; "Civic Recognition" → neutral
"Certificate" (links attestation only where an experience exists — F8).
**Out of scope.** Attestation rendering (F8); org-side editing (F10).

**Endpoints.** `GET /opportunities/:idOrSlug`, `GET /opportunities` (related),
`POST /opportunities/:opportunityId/positions/:positionId/applications`,
`POST /applications/:applicationId/withdraw`, `POST /reports`, `GET /media/:mediaId` (public cover).

**Tests.** Unit: deadline/seat gating of Apply button. E2E: apply with message → success; guest apply →
login; withdraw; report; related list; 3 viewports; en+ar.

**Acceptance.** Meta boxes from real fields only; positions show `applicationCount` + assigned names;
org sidebar from embed + reliability; no invented stats.
Verify: build/lint/test/e2e + `openspec validate frontend-opportunity-details`.

**Commit.** `feat(opportunity-details): detail, positions, apply flow, related`

---

### Session F6 — frontend-volunteer-tasks
**Phase:** volunteer · **Section:** FC · **Change:** `frontend-volunteer-tasks` · **Depends on:** FB (parallel-safe with F4/F5/F7/F8)

**Objective.** My Applications + My Participations ("My Tasks") + activity strip (V2 §B#5/#6): real
`under_review` tab, joins, date filter, attestation/briefing downloads, withdraw flows.

**In scope.** Routes `volunteer/applications`, `volunteer/tasks`; `hooks/useTasks.ts`
(`lib/api/tasks.ts`: applications me/detail/withdraw, participations me/detail/withdraw,
`GET /volunteers/me/activity`); "Application ID" = client-side ObjectId short form; no messaging UI.
**Out of scope.** Submission editing/uploading (F7); experience visibility (F8).

**Endpoints.** `GET /applications/me`, `GET /applications/:applicationId`,
`POST /applications/:applicationId/withdraw`, `GET /participations/me`,
`GET /participations/:participationId`, `POST /participations/:participationId/withdraw`,
`GET /volunteers/me/activity`, `GET /experiences/:experienceId/attestation` (download link).

**Tests.** Unit: status-tab mapping (incl. `under_review`), date-filter params. E2E: filter tabs;
withdraw accepted (seat freed — assert via re-read); attestation downloads (blob, no navigation);
empty/error states; 3 viewports; en+ar.

**Acceptance.** Timeline neutral (Submitted → Under review → Accepted); no coordinator-contact buttons.
Verify: build/lint/test/e2e + `openspec validate frontend-volunteer-tasks`.

**Commit.** `feat(volunteer-tasks): applications, participations, activity, attestation downloads`

---

### Session F7 — frontend-submit-contribution
**Phase:** volunteer · **Section:** FC · **Change:** `frontend-submit-contribution` · **Depends on:** FB (parallel-safe with F4/F5/F6/F8)

**Objective.** Submit Contribution: draft/submit lifecycle with the v2-correct 2-step upload + consent
(V2 §B#8): ≤5 MB images/PDF, video-as-link allowlist, `title` field, progress states, resubmit loop.

**In scope.** Route `volunteer/tasks/[participationId]/submit`; `hooks/useSubmissions.ts`
(`lib/api/submissions.ts`: create, patch, submit, me/detail, media uploads/confirms/links/removals);
required imagery-consent checkbox (`consentConfirmed`); rejected→draft→resubmit; no messaging UI.
**Out of scope.** Org review side (F11).

**Endpoints.** `POST /participations/:participationId/submissions`, `PATCH /submissions/:submissionId`,
`POST /submissions/:submissionId/submit`, `GET /submissions/me`, `GET /submissions/:submissionId`,
`POST /media/uploads`, `POST /media/:mediaId/confirm`, `POST /media/links`, `DELETE /media/:mediaId`.

**Tests.** Unit: consent-gate (submit blocked without consent when imagery present), allowlist validation,
size guard. E2E: draft→upload w/ progress→consent→submit→submitted; rejected→edit→resubmit; link-add
(youtube/drive ok, other host rejected); 3 viewports; en+ar.

**Acceptance.** Single-step gallery claims gone; "Up to 500 MB / video / audio / zip" copy gone;
`CONSENT_REQUIRED` never surprises (checkbox precedes submit).
Verify: build/lint/test/e2e + `openspec validate frontend-submit-contribution`.

**Commit.** `feat(submit-contribution): 2-step evidence upload, consent gate, draft lifecycle`

---

### Session F8 — frontend-volunteer-credentials
**Phase:** volunteer · **Section:** FC · **Change:** `frontend-volunteer-credentials` · **Depends on:** FB (parallel-safe with F4–F7)

**Objective.** My Experiences + portfolio management + public reviews read (V2 §B#7): enriched records
("Verified by <org> on <date>" + code + `EXP-<registryId>`), visibility toggles, attestation downloads,
portfolio CRUD with `typeLabel`/`tags`.

**In scope.** Routes `volunteer/experiences`, `volunteer/portfolio`; `hooks/useExperiences.ts`
(`lib/api/experiences.ts`: me/detail/visibility/attestation, org identity joins) + `hooks/usePortfolio.ts`
(`lib/api/portfolio.ts`: me CRUD + reorder); audio evidence dropped; category/skill filters via query.
**Out of scope.** Public profile rendering (F17).

**Endpoints.** `GET /experiences/me`, `GET /experiences/:experienceId`,
`PATCH /experiences/:experienceId/visibility`, `GET /experiences/:experienceId/attestation`,
`GET /portfolio/me`, `POST /portfolio/me`, `PATCH /portfolio/:itemId`, `DELETE /portfolio/:itemId`,
`PUT /portfolio/me/order`, `GET /volunteers/me/reviews`, `POST /media/uploads`,
`POST /media/:mediaId/confirm`.

**Tests.** Unit: visibility-toggle gating, filter params. E2E: toggle visibility; download attestation;
portfolio CRUD + reorder + metadata; share/verify-link copies inline code; 3 viewports; en+ar.

**Acceptance.** No audio player; no "Audited 100%"; durations real; evidence = images/PDF/link only.
Verify: build/lint/test/e2e + `openspec validate frontend-volunteer-credentials`.

**Commit.** `feat(volunteer-credentials): experiences, visibility, portfolio, attestation`

---

### Session F9 — frontend-org-workspace
**Phase:** organization · **Section:** FD · **Change:** `frontend-org-workspace` · **Depends on:** FB (parallel-runnable with FC)

**Objective.** Organization Dashboard (V2 §B#9): stat cards from `GET /organizations/me/stats`,
cover/location/founded facts, submissions-to-review + recent-applications joins, activity feed,
publish-gate surfacing.

**In scope.** Route `org/dashboard`; `hooks/useOrgStats.ts` (`lib/api/orgStats.ts`: me, stats,
participants summary, submissions inbox summary, applications aggregate summary, activity,
publish-gate); hours from durations; `ORG-<registryId>` display.
**Out of scope.** Opportunity CRUD (F10); review queues detail (F11).

**Endpoints.** `GET /organizations/me`, `GET /organizations/me/stats`, `GET /organizations/me/participants`,
`GET /organizations/me/submissions`, `GET /organizations/me/applications`,
`GET /organizations/me/activity`, `GET /organizations/me/publish-gate`, `GET /notifications`.

**Tests.** Unit: stat-card mapping, gate-locked messaging. E2E: dashboard numbers match API fixtures;
pending-org sees publish-locked explanation; activity renders; 3 viewports; en+ar.

**Acceptance.** No invented totals (all from `total`/aggregates); no cover-image placeholder (real
`coverMediaId` or neutral empty state).
Verify: build/lint/test/e2e + `openspec validate frontend-org-workspace`.

**Commit.** `feat(org-workspace): dashboard stats, review queues, activity, publish gate`

---

### Session F10 — frontend-org-opportunities
**Phase:** organization · **Section:** FD · **Change:** `frontend-org-opportunities` · **Depends on:** FB (parallel-safe with F9/F11/F12/F13)

**Objective.** My Opportunities + Create/Edit Opportunity + duplicate (V2 §B#10/#11): `q`/`sort`/`page`,
per-card counts, owner single-read (incl. drafts), duplicate, category-from-API, verified-gate.

**In scope.** Routes `org/opportunities`, `org/opportunities/new`, `org/opportunities/[id]` (edit);
`hooks/useOrgOpps.ts` (`lib/api/orgOpps.ts`: list, single-read, create, patch, delete-draft,
publish/close/cancel/complete, positions CRUD, duplicate, cover upload); NO opportunity-PDF button.
**Out of scope.** Applications on the opportunity (F11).

**Endpoints.** `GET /organizations/me/opportunities`, `GET /organizations/me/opportunities/:id`,
`POST /organizations/me/opportunities`, `PATCH /opportunities/:opportunityId`,
`DELETE /opportunities/:opportunityId`, `POST /opportunities/:opportunityId/publish|close|cancel|complete`,
`POST/PUT/PATCH/DELETE` positions (`POST /opportunities/:opportunityId/positions`,
`PATCH/DELETE /opportunities/:opportunityId/positions/:positionId`),
`POST /organizations/me/opportunities/:id/duplicate`, `GET /skill-categories`,
`GET /locations/wilayas`, `GET /locations/wilayas/:wilayaId/municipalities`,
`POST /media/uploads`, `POST /media/:mediaId/confirm`.

**Tests.** Unit: lifecycle-action availability matrix (draft vs published vs verified-gate). E2E:
create (all v2 fields) → draft → publish (verified) / locked (pending); edit windows; duplicate →
independent draft; delete-draft; pagination/search/sort; 3 viewports; en+ar.

**Acceptance.** End-date/duration/mode/prerequisites/deliverables/cover all wired; no perks/logistics inputs.
Verify: build/lint/test/e2e + `openspec validate frontend-org-opportunities`.

**Commit.** `feat(org-opportunities): list, create/edit, lifecycle, positions, duplicate`

---

### Session F11 — frontend-org-review
**Phase:** organization · **Section:** FD · **Change:** `frontend-org-review` · **Depends on:** FB (parallel-safe with F9/F10/F12/F13)

**Objective.** Applications inbox + Participants roster + Contributions verification inbox (V2 §B#12/#13/#14):
real `under_review`, aggregate inboxes, submission joins, single approve-and-mint, reject-with-reason.

**In scope.** Routes `org/applications`, `org/participants`, `org/contributions`;
`hooks/useOrgInbox.ts` (`lib/api/orgInbox.ts`: aggregate applications, participants roster, submissions
inbox + start-review/accept/reject, submission verify/reject, applicant public-profile reads);
reject dialog with required reason; labels aligned to real enums; no messaging UI.
**Out of scope.** Verified-experiences archive + CSV (F12).

**Endpoints.** `GET /organizations/me/applications`, `GET /opportunities/:opportunityId/applications`,
`POST /applications/:applicationId/start-review|accept|reject`,
`POST /applications/:applicationId/reject` (`{reason}`), `GET /organizations/me/participants`,
`GET /opportunities/:opportunityId/participants`,
`POST /participations/:participationId/remove` (`{reason}`),
`GET /organizations/me/submissions`, `GET /submissions/:submissionId`,
`POST /submissions/:submissionId/start-review|verify|reject`, `GET /verifications/:verificationId`,
`GET /volunteers/:username` (applicant public read), `GET /media/:mediaId` (private evidence — owning org).

**Tests.** Unit: tab→status mapping (submitted/under_review/approved/rejected), multi-status query builder.
E2E: pending→start-review→accept / →reject-with-reason; cross-opp inbox filters; roster incl. completed;
evidence renders for owning org (F1-fix path); 3 viewports; en+ar.

**Acceptance.** "Verified (8)"-style invented tabs gone; "Changes requested" maps to rejected + resubmit;
approve copy states minting happens on approval.
Verify: build/lint/test/e2e + `openspec validate frontend-org-review`.

**Commit.** `feat(org-review): applications, participants, contributions verification inboxes`

---

### Session F12 — frontend-org-records
**Phase:** organization · **Section:** FD · **Change:** `frontend-org-records` · **Depends on:** FB (parallel-safe with F9/F10/F11/F13)

**Objective.** Verified Experiences archive + CSV export + org reviews given (V2 §B#15): filters, neutral
verification codes, copy-link, attestation downloads.

**In scope.** Route `org/experiences`; `hooks/useOrgRecords.ts` (`lib/api/orgRecords.ts`: org experiences
list + `format=csv` via blob helper, org reviews); search/filter/sort; `publicVisibility` display;
"Copy verification link" → `/verify/:code` deep link (inline, no page); no ledger/SHA copy.
**Out of scope.** Attestation generation (backend-owned); admin experience read (F15).

**Endpoints.** `GET /organizations/me/experiences` (+ `?format=csv`), `GET /organizations/me/reviews`,
`GET /verify/:verificationCode` (link target only), `GET /experiences/:experienceId/attestation`.

**Tests.** Unit: filter builders, CSV-request headers. E2E: filters + totals; CSV downloads as attachment;
copy-link clipboard; attestation per row; 3 viewports; en+ar.

**Acceptance.** Hours from real durations; "National Civic Registry ID" → volunteer name + `VOL-<id>`;
no audio playback (link-type only).
Verify: build/lint/test/e2e + `openspec validate frontend-org-records`.

**Commit.** `feat(org-records): verified experiences archive, CSV, verification links`

---

### Session F13 — frontend-org-account
**Phase:** organization · **Section:** FD · **Change:** `frontend-org-account` · **Depends on:** FB (parallel-safe with F9–F12)

**Objective.** Organization Profile (factsheet) + Organization Settings (V2 §B#16/#17): expanded PATCH,
cover/logo uploads, sessions with device rows, notification prefs, neutral visibility toggle, delete-org.

**In scope.** Routes `org/profile`, `org/settings`; `hooks/useOrgAccount.ts` (`lib/api/orgAccount.ts`:
me read/patch, profile-completion reuse, delete-own, users/me email-phone, change-password, sessions,
notification prefs); optional `annualReportMediaId` link (purpose `organization_document`, no workflow);
"Indexed in Discover Talents" relabeled/removed (orgs aren't in the directory).
**Out of scope.** Dossier upload (F3); admin org management (F15).

**Endpoints.** `GET/PATCH /organizations/me`, `GET /organizations/me/profile-completion`,
`DELETE /organizations/me`, `PATCH /users/me`, `POST /auth/change-password`,
`GET/DELETE /users/me/sessions[/:sessionId]`, `POST /auth/logout-others`,
`GET/PATCH /notifications/preferences`, `POST /media/uploads`, `POST /media/:mediaId/confirm`.

**Tests.** Unit: completion-% display, delete-confirm gating. E2E: edit all fact fields → public profile
reflects (spot-check via F18 route); sessions + logout-others; prefs persist; delete-org revokes session;
3 viewports; en+ar.

**Acceptance.** No statute/"Law 12-06 Accredited"/authority/audit UI; contact fields neutral.
Verify: build/lint/test/e2e + `openspec validate frontend-org-account`.

**Commit.** `feat(org-account): organization profile factsheet and settings`

---

### Session F14 — frontend-admin-overview
**Phase:** admin · **Section:** FE · **Change:** `frontend-admin-overview` · **Depends on:** FB

**Objective.** Admin Dashboard: real overview/deltas, series chart, attention queue, audit display names,
neutral System Status (V2 §B#18).

**In scope.** Route `admin/dashboard`; `hooks/useAdminAnalytics.ts` (`lib/api/adminAnalytics.ts`:
`GET /admin/stats/overview`, `GET /admin/analytics/overview|series|queue`, `GET /admin/audit-logs`);
single-source pending counts; no hardcoded figures/peaks; "Needs review" neutral queue.
**Out of scope.** Manage screens (F15); moderation actions (F16).

**Endpoints.** `GET /admin/stats/overview`, `GET /admin/analytics/overview`, `GET /admin/analytics/series`,
`GET /admin/analytics/queue`, `GET /admin/audit-logs`, `GET /health`, `GET /system/status`.

**Tests.** Unit: delta/series/queue render mapping. E2E: numbers match fixtures; queue links route to
manage screens; non-admin 403; 3 viewports; en+ar.

**Acceptance.** "DZ-NAT-REG sync / compliance %" copy gone; turnaround from `medianDecisionHours`.
Verify: build/lint/test/e2e + `openspec validate frontend-admin-overview`.

**Commit.** `feat(admin-overview): dashboard analytics, queue, audit trail, system status`

---

### Session F15 — frontend-admin-manage
**Phase:** admin · **Section:** FE · **Change:** `frontend-admin-manage` · **Depends on:** FB (parallel-safe with F14/F16)

**Objective.** Manage Volunteers / Organizations / Opportunities + verification triage + status histories
(V2 §B#19/#20/#21 partial): `q`/filters/`sort`/`page`/`pageSize`, totals, CSV, labels/counts,
status-with-reason, assign, latest-dossier, approve/reject, force-close via status-PATCH.

**In scope.** Routes `admin/volunteers`, `admin/organizations`, `admin/opportunities`,
`admin/verifications`; `hooks/useAdminLists.ts` (`lib/api/adminLists.ts` covering all admin list/read/
status/assign/approve/reject routes + `format=csv`); real status vocabularies only; suspend stores
`{reason, notes}`; latest-engagement via admin volunteer-experiences read.
**Out of scope.** Reports/moderation composite actions (F16); settings (F16).

**Endpoints.** `GET /admin/volunteers`, `GET /admin/volunteers/:volunteerId/experiences`,
`GET/PATCH /admin/users/:userId[/status]`, `POST /admin/users/:userId/notice`,
`GET /admin/organizations`, `GET /admin/organizations/verifications`,
`GET /admin/organizations/:organizationId/verification/latest`,
`PATCH /admin/organizations/verifications/:rowId/assign`,
`PATCH /admin/organizations/:organizationId/status`,
`POST /admin/organizations/:organizationId/verification/approve|reject`,
`GET /admin/opportunities`, `PATCH /admin/opportunities/:opportunityId/status`,
`GET /admin/status-histories`, `GET /media/:mediaId` (dossier read).

**Tests.** Unit: query-builder (filters/sort/page/CSV), status-vocab guards. E2E: search/filter/sort/
paginate each table; CSV downloads; suspend-with-reason → histories; assign officer; approve/reject org;
force-close opp (status-PATCH); non-admin 403; 3 viewports; en+ar.

**Acceptance.** No "Pending/Incomplete/Legal Review/Flagged" invented states; no page-size-100; no global
topbar search (no endpoint).
Verify: build/lint/test/e2e + `openspec validate frontend-admin-manage`.

**Commit.** `feat(admin-manage): volunteers, organizations, opportunities, verification triage`

---

### Session F16 — frontend-admin-moderation
**Phase:** admin · **Section:** FE · **Change:** `frontend-admin-moderation` · **Depends on:** FB (parallel-safe with F14/F15)

**Objective.** Reports & Moderation + Admin Settings (V2 §B#22/#23): report enrichment, atomic
resolve-with-action, system notices, real settings keys, maintenance toggle.

**In scope.** Routes `admin/reports`, `admin/settings`; `hooks/useAdminModeration.ts`
(`lib/api/adminModeration.ts`: reports list/assign/resolve-with-action, notice, review-hide,
settings get/put, maintenance toggle); neutral action vocabulary; no sanction vocabulary.
**Out of scope.** Analytics (F14); manage tables (F15).

**Endpoints.** `GET /admin/reports`, `PATCH /admin/reports/:reportId[/assign]`,
`POST /admin/users/:userId/notice`, `PATCH /admin/reviews/:reviewId/hide`,
`GET /admin/settings`, `PUT /admin/settings/:key`, `POST /admin/ops/maintenance`,
`GET /system/status`.

**Tests.** Unit: action-payload builder + validation. E2E: report→resolve+unpublish/close/suspend/notice
atomic (assert consequence via re-read); settings persist + enforce (maintenance → public 503 spot-check);
3 viewports; en+ar.

**Acceptance.** "Statutory Sanction / 100% compliance / Contact Secretariat" gone; every setting is a
stored validated key.
Verify: build/lint/test/e2e + `openspec validate frontend-admin-moderation`.

**Commit.** `feat(admin-moderation): reports resolution actions and admin settings`

---

### Session F17 — frontend-public-talent
**Phase:** public · **Section:** FF · **Change:** `frontend-public-talent` · **Depends on:** FC + FD (patterns reuse; files distinct)

**Objective.** The MERGED Public Talent+Volunteer Profile + public talent discovery entry (V2 §B#25/§B#26 +
§E): one screen, opt-out-gated blocks, derived areas, reviews, portfolio grid, guest redirects.

**In scope.** Routes `(public)/volunteers/[username]`, `(public)/talents` (if directory page ships —
shares `usePublicTalent`); `hooks/usePublicTalent.ts` (`lib/api/publicTalent.ts`: public profile,
experiences, portfolio, reviews, talents list); merge executes plan M1 (Talent base + richer media grid +
stats strip); "Verify on National Ledger" removed → inline "✓ Verified by [org] on [date]".
**Out of scope.** Landing/org/opportunity public screens (F18).

**Endpoints.** `GET /volunteers/:username`, `GET /volunteers/:username/experiences`,
`GET /volunteers/:username/portfolio`, `GET /volunteers/:username/reviews`, `GET /talents`,
`GET /media/:mediaId` (public media as guest).

**Tests.** Unit: show-flag gating (opt-out hides blocks, never leaks). E2E: public profile renders
stats/areas/reviews/portfolio; disabled profile → 404 state; guest favorite/apply → login; username with
special chars; 3 viewports; en+ar.

**Acceptance.** No surname/tier/registry-member/endorsement-count copy; no `@` in route; availability =
weekday slots + optional note only.
Verify: build/lint/test/e2e + `openspec validate frontend-public-talent`.

**Commit.** `feat(public-talent): merged public volunteer profile and talent discovery`

---

### Session F18 — frontend-public-orgs
**Phase:** public · **Section:** FF · **Change:** `frontend-public-orgs` · **Depends on:** FC + FD (parallel-safe with F17)

**Objective.** Landing Page + Public Organization Profile + Public Opportunity Details (V2 §B#24/#27/#28):
embeds, aggregates ribbon, public archive, counts+names on positions, neutral sample card.

**In scope.** Routes `(public)/` (landing), `(public)/orgs/[slug]`, `(public)/opportunities/[idOrSlug]`;
`hooks/usePublicOrgs.ts` (`lib/api/publicOrgs.ts`: org search, org profile, org opps per-status,
reliability, opportunity detail + related, talents/opps for landing); guest Apply/Save → Login.
**Out of scope.** Merged talent profile (F17).

**Endpoints.** `GET /organizations`, `GET /organizations/:slug`, `GET /organizations/:slug/opportunities`,
`GET /organizations/:slug/reliability`, `GET /opportunities`, `GET /opportunities/:idOrSlug`,
`GET /talents`, `GET /skill-categories`, `GET /locations/wilayas`.

**Tests.** Unit: archive-status filter, related-link builder (slug from embed). E2E: landing feeds render;
org profile ribbon + archive tabs; opp details positions + publisher card; guest apply → login; no-embed
fallbacks; 3 viewports; en+ar.

**Acceptance.** No registry/authority/audit/supervisory copy; "Accredited Hours" → neutral duration;
mission-logistics blocks absent; sample record card neutral.
Verify: build/lint/test/e2e + `openspec validate frontend-public-orgs`.

**Commit.** `feat(public-orgs): landing, public org profile, public opportunity details`

---

### Session F19 — frontend-reconciliation-check
**Phase:** final · **Section:** FG · **Change:** none (verification-only; no OpenSpec change) · **Depends on:** all FA–FF archived

**Objective.** Definition-of-Done gate: prove every screen honors the delta doc + the 4 mandates, with a
written sign-off list. No code changes except test files.

**In scope.** A Playwright + vitest gate suite: (1) theme audit (no hardcoded values outside `theme/`);
(2) i18n audit (no hardcoded JSX strings — snapshot key-coverage en+ar; RTL mirror checks);
(3) API-layer audit (no ad-hoc fetch/axios outside `lib/api`; one function per endpoint; blob-download
single path); (4) responsive matrix (every route at 1440/1100/390); (5) state matrix
(loading/empty/error + 401/403-variants/404/429/503 on representative screens); (6) contract spot-checks
(registryId display-only, consent gate, 2-step progress, guest-redirects, streamed downloads, no
messaging/ranking/portfolio-page/verify-page affordances, no perks/logistics inputs).
Plus `openspec validate --all --strict` clean and a **contract-change sign-off** confirming the §2
backend behavior rows the UI depends on (opt-out publics, guest-redirect, upload constraints, streamed
exports, kill-switches, maintenance).

**Out of scope.** New features; fixes (any failure spawns a fix task under its owning session's change
only if still active — otherwise a new `frontend-fix-*` change; never reopen archived).

**Tests.** The gate suite above; CSV/PDF download smoke (no navigation, correct headers); heaviest
embedded list perf smoke.

**Acceptance.** (1) all gate tests green; (2) `npm run build && lint && test && test:e2e` green;
(3) `openspec validate --all --strict` clean; (4) owner signs the contract list. Commit the suite as-is.

**Commit.** `test(frontend-reconciliation): final acceptance gate over the frontend slate`

---

### (Placeholder, out of scope) Session F20 — frontend-deploy — NO TASKS

Deployment stays deferred exactly as agreed for the backend (local build/dev/test only). When opened,
this session will define hosting, env wiring, and smoke checks. No tasks are specified here.

---

## 5. Session runner (paste this per session)

Generic prompt; replace the `<…>` placeholders. Works for any session in §4.

```
Run Session <N> of docs/FRONTEND_ROADMAP.md: "<TOPIC LABEL>".

Change: frontend-<TOPIC>. Section: <FA..FG>. Workspace: repo root C:\Users\Failasouf\Desktop\projects\basmatck; frontend code lives in /frontend. Never push. Never touch /backend, backend-inventory.md, docs/API.md, or any ARCHIVED OpenSpec change (backend or frontend).

PRECONDITIONS: `openspec list` shows zero active changes; the Depends-on sessions are ARCHIVED. If not, do NOT proceed — flag it.

PHASE 1 — AUTHOR THE OPENSPEC CHANGE (then stop for my review):
1. Read docs/FRONTEND_ROADMAP.md §4 "Session <N>" and the cited delta-doc items (docs/DESIGN_BACKEND_RECONCILIATION_V2.md). Run `openspec list`; confirm frontend-<TOPIC> is NOT already present, then:
     openspec new change frontend-<TOPIC> --description "<scope line>"
2. For each artifact in order (proposal, specs, design, tasks), run `openspec instructions <artifact> --change frontend-<TOPIC>` first, then write:
     openspec/changes/frontend-<TOPIC>/{proposal.md, specs/<capability>/spec.md, design.md, tasks.md}
   Use ADDED for new route/hook/api-module capabilities. Cite exact backend endpoints (path + method) from the session; cite the 4 mandates per task where they bind.
3. Validate: `openspec validate frontend-<TOPIC>`; `openspec status --change frontend-<TOPIC>`.
4. STOP. Reply with capabilities, task count, deviations. Wait for my go.

PHASE 2 — IMPLEMENT (only after I say go):
5. Work tasks.md in /frontend; check off each item. Stay inside the session scope. Honor the section's file-disjointness: only touch the session's route dir + its lib/api/* + its hooks/* + its message-key prefix (message catalogs are auto-discovered -- never edit src/i18n/request.ts); shared primitives are consumed, not edited. If another session's file needs a change, STOP and flag.
6. Verify from /frontend: npm run build; npm run lint; npm test; npm run test:e2e (viewport matrix 1440/1100/390; locales en+ar). Then from repo root: openspec validate frontend-<TOPIC> (final: also openspec validate --all --strict).
7. Archive: openspec archive frontend-<TOPIC> -y   (skip for Session F19 — no change).
8. Commit locally: git add -A; git commit -m "<suggested commit message>". Never push, never amend, never branch unless asked.
9. Report: routes/hooks/api-functions added, tests run, verification results, archive status, deviations.
```

Mapping of `<N>`/`<TOPIC>`: F0 → foundation, F1 → auth-screens, F2 → volunteer-account, F3 → org-onboarding,
F4 → volunteer-home, F5 → opportunity-details, F6 → volunteer-tasks, F7 → submit-contribution,
F8 → volunteer-credentials, F9 → org-workspace, F10 → org-opportunities, F11 → org-review,
F12 → org-records, F13 → org-account, F14 → admin-overview, F15 → admin-manage,
F16 → admin-moderation, F17 → public-talent, F18 → public-orgs, F19 → (none).

**Parallel note.** Sessions within one section may be authored/implemented interleaved back-to-back, but
each archives + commits its own change sequentially; never run two OpenSpec workers against the same
`openspec/changes/` tree simultaneously.

---

## 6. Definition of done (whole frontend slate)

1. **Every screen in §B of the delta doc is implemented** to its CURRENT STATUS verdict; the 7 missing
   screens are designed fresh to DESIGN.md tokens; the Talent↔Volunteer merge (M1) is executed; the
   standalone portfolio stays absent; no messaging/ranking/verify-page UI exists.
2. **The 4 mandates hold on every screen**: token-driven theme (grep-clean), full en+ar catalogs with
   working RTL, centralized API-layer + hooks only, 3-breakpoint responsive.
3. **Backend contract honored**: exact endpoint paths/methods per session (§A naming diffs applied —
   esp. admin close via status-PATCH); `registryId` display-only; consent + 2-step uploads; guest
   redirects; streamed downloads via the shared helper; kill-switch and maintenance codes surfaced.
4. **Neutral surface**: no civic-narrative codes/copy in any UI; FCD cuts applied (no perks/logistics
   inputs; annual report optional-link only; areas derived, no editor).
5. **OpenSpec clean**: all 19 `frontend-*` changes archived, `openspec validate --all --strict` passes,
   `openspec doctor` healthy, config context updated (F0).
6. **Tests green**: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` pass from `/frontend`
   at every session boundary, including the F19 gate suite.
7. **Git history**: one local commit per session, never pushed, suggested messages used.
```

(End of file)
