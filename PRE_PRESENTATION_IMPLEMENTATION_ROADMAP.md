# Basmatak Tatatoua: Pre-Presentation Implementation Roadmap

> **Audit date:** 2026-11-04. The audit covers the working tree on branch `ai-agent-session-2`, including uncommitted changes.
> **Scope:** the ten improvements requested, and nothing else. This document is analysis and planning only; no source file was changed to produce it.
> **Labels:** **Verified** = confirmed in source · **Partially Implemented** = some of it exists · **Missing** = no implementation found · **Proposed** = recommended change · **Unverified** = could not be confirmed from the repo.

---

## 1. Executive Summary

Most of the backend for these ten items already exists. The work is mostly on the frontend, plus a few small backend changes. The audit also found several **existing defects** that sit inside the requested scope. They should be fixed as part of the matching task, because a presentation demo would expose them.

| # | Improvement | Backend | Frontend | Size | Risk |
|---|---|---|---|---|---|
| 1 | Certificate verification page | **Verified**: `GET /api/v1/verify/:code` exists | **Missing**: the copied `/verify/<code>` links currently show 404 | M | Low (page) / Medium (QR in PDF; D3 resolved yes) |
| 2 | `maxOutputTokens` 400 → 1000 | **Verified**: the value is **clamped to 800 in 3 places**, so setting 1000 alone silently gives 800 | — | S | Low (but a deploy env var must be updated) |
| 3 | UI/UX organisation | — | **Partially Implemented**: good RTL, primitives exist but are used inconsistently | M | Low |
| 4 | Core end-to-end workflow testing | **Verified**: `backend/test/e2e/core-loop.e2e-spec.ts` covers the whole loop through the API | **Partially Implemented**: Playwright specs are all mocked, no real full-stack run; the 7/7 toast specs failed in the last recorded run | M | Medium |
| 5 | Favorites page | **Partially Implemented**: list/counts/lookup endpoints exist; **organizations cannot be favorited** (`FAVORITE_TARGET_TYPES = ['opportunity','talent']`) | **Missing**: no page, no list hook; counts schema bug | M–L | Medium (D1 resolved yes: three target types) |
| 6 | Arabic normalization (BM25) | **Partially Implemented**: there is a normalizer, but **it splits every word containing ؤ/ئ** (e.g. `الجزائر` → `الجزاي ر`) | — | M | Medium (scores and thresholds shift) |
| 7 | Mobile UX | — | **Partially Implemented**: bottom nav exists; the AI launcher overlaps it; no search for signed-in users on phones | S–M | Low |
| 8 | Opportunities display | **Verified**: rich filters supported | **Partially Implemented**: 5 duplicate card implementations; unclamped descriptions; a client-only `mode` filter breaks pagination | M | Low–Medium |
| 9 | Generative UI cards in AI chat | **Missing**: no structured data reaches the client; the spec forbids `sources` but now **allows a restricted `cards` event** (D5 resolved) | **Missing**: no card renderer | L | **High** (touches uncommitted orchestrator) |
| 10 | Volunteer CV export | **Partially Implemented**: all CV data is public and privacy-gated; there is PDF infrastructure; **the "hours" stat is stored in minutes** | **Missing** | L | Medium (D2 resolved: browser print avoids pdfkit Arabic limits) |

**Recommended plan:** one blocking checkpoint, then **four parallel sessions**:

- **S1 — AI Agent:** tasks 2, 6, 9.
- **S2 — Credentials:** tasks 1, 10.
- **S3 — Discovery & UX:** tasks 5, 8, 7, 3.
- **S4 — QA:** task 4, with a baseline immediately and the final regression at the end.

The split follows file ownership, so the only shared files are a few append-only ones (§9).

**Highest-risk items to begin on day 1:** task 9 (spec change plus streaming contract), task 10 (Arabic PDF rendering spike), and Checkpoint 0 (the large uncommitted AI work must land first).

**Decisions (resolved 2026-11-04):** these are no longer open. Each resolution and its scope impact is recorded in §12.

- **D1 — Organizations in favorites:** **Resolved: yes.** Organizations are in scope for the favorites backend and page, alongside opportunities and volunteers.
- **D2 — CV PDF export:** **Resolved: Option A, browser print-to-PDF.** It gives correct Arabic shaping, reuses the public-profile privacy gates exactly, and adds no backend dependency. The pdfkit download (Option B) is post-presentation work.
- **D3 — `qrcode` dependency:** **Resolved: add it.** Task 1 renders a QR code in the attestation PDF next to the absolute verify URL.
- **D4 — Volunteer hours unit:** **Resolved: keep minutes in storage and convert only at display.** No data migration or field rename.
- **D5 — AI grounding spec for `cards`:** **Resolved: yes.** `openspec/specs/ai-agent-grounding/spec.md` now allows a single `cards` SSE event restricted to allowlisted public entities already linked in the answer; `sources` remains forbidden.

---

## 2. Current Project State

### 2.1 Stack (Verified)
- **Backend:** NestJS 10 + Mongoose 8 (`backend/`), global prefix `api/v1` (`backend/src/main.ts`), pdfkit `^0.20.2`, `@google/genai` `^2.31.0` (plus a Groq provider). Jest unit tests (`*.spec.ts`, rootDir `src`) and e2e tests (`backend/test/jest-e2e.json`) on an in-memory MongoDB replica set (`test/utils/test-db.ts`).
- **Frontend:** Next.js 14 App Router, next-intl, react-query, axios + zod, Tailwind (`frontend/`). Locales: **`en` and `ar` only**; there is no `fr` (`frontend/src/i18n/routing.ts:4`). Organization and skill names are stored as `nameFr`/`nameAr`.
- **i18n loading** (Verified, important for parallel work): `frontend/src/i18n/request.ts` **auto-discovers** every `messages/<area>/{en,ar}.json`. A new feature can add its own namespace folder **without editing a shared file**. Each area has a `messages/<area>-parity.test.ts`.
- **Route coverage gate** (Verified): `frontend/src/gate/route-coverage.test.ts` fails if a new `page.tsx` is not listed in `frontend/e2e/gate-responsive.spec.ts`.

### 2.2 Repository state (Verified, critical for coordination)
- Current branch: `ai-agent-session-2` (other branches: `main`, `ai-agent-session-1`).
- **About 70 uncommitted changes**, nearly all in `backend/src/ai-agent/**`, plus `backend/.env.example`, `docs/AI_AGENT.md`, regression baselines in `backend/test/ai-baseline/`, and new untracked tools (`get-opportunity-details.tool.ts`, `get-organization-details.tool.ts`, `recent-entities.ts`).
- The openspec change `openspec/changes/model-first-ai-intent-and-tools/` is fully ticked in `tasks.md`, but was **moved back out of the archive** (the archive copy shows as deleted). `profile-edit-completion` (27/27) and `signed-in-org-phone-visibility` (20/20) are also complete but unarchived.
- Tasks 2 and 9 edit files that are **currently uncommitted**: `config/ai-agent.config.ts`, `orchestrator/answer-policy.ts`, `prompt/prompt-builder.ts`, `orchestrator/ai-agent.orchestrator.ts`, `ai-agent.controller.spec.ts`. → **Checkpoint 0** (§8).

### 2.3 Last recorded health (artifacts at repo root, dated 2026-10-30, **before** 7 later commits and the uncommitted work)
| Artifact | Result |
|---|---|
| `current-build-status.txt` / `current-build.txt` | Build exit 0, with warnings only (5× `<img>`, 2× exhaustive-deps) |
| `current-lint.txt` | 0 errors, 7 warnings |
| `current-tsc.txt` | **23 type errors, all in test files** (`src/lib/api/auth.test.ts` ×11, `src/messages/public-orgs-parity.test.ts` ×7, e2e specs) |
| `current-vitest.txt` | 86 files / 827 tests, all passing |
| `current-e2e-toast.txt` | **7/7 `toast.spec.ts` failed** (timeouts waiting for `save-opp-…` test id) |
| Backend tests | **No artifact.** Current pass rate is **Unverified** |

---

## 3. Feature-by-Feature Technical Audit

### Task 1: Public Certificate Verification Page

**Verified (backend):**
- **Data model:** the code is stored on `volunteer_experiences.verificationCode`: `backend/src/verifications/schemas/volunteer-experience.schema.ts:69`, unique index at `:82`.
  - Format: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`verification-code.util.ts`).
  - Created inside the verify transaction (`verifications.service.ts` ~L342–364).
  - Re-verifying a submission **replaces** the code (`$set` in an upsert), so the old code then returns 404. There is no "revoked" concept.
- **Public API:** `GET /api/v1/verify/:verificationCode`, `@Public()` (`backend/src/verifications/public-verification.controller.ts:21-22`).
  - Service: `ExperiencesService.getPublicProof()` (`experiences.service.ts` L365–425).
  - Returns `{ registryId, title, description, skills, duration, organization, verifiedAt, verificationCode, review (visible only), volunteer: { handle, firstName (if showBiography) }, evidence (public only) }`.
  - Invalid code → 404 `EXPERIENCE_NOT_FOUND`.
- **Gaps in the API:**
  - `skills` are **raw ObjectId strings**, not names.
  - There is no response DTO or Swagger schema.
  - There is no per-route `@Throttle`; only the global 100/60s applies (`app.module.ts:54-63`).
- **PDF:** `GET /api/v1/experiences/:experienceId/attestation?lang=en|ar` (`attestation/attestation.controller.ts:33`), rendered by `buildAttestationDocument()` (`attestation/attestation-document.ts:281`).
  - **There is no QR code.** The comment at L261–263 says no QR library is available.
  - The printed link is the **relative path** `/verify/${code}` (`verifyPath()`, L217–218), with no host.
  - The backend has no frontend-URL variable. `CORS_ORIGIN` exists (`backend/.env.example:23`, `render.yaml:28`) but is a CORS setting.

**Verified (frontend):**
- **No page exists.** `/en/verify/X` falls into `app/[locale]/[...rest]/page.tsx`, which calls `notFound()`.
- Links already point to the missing route:
  - `volunteer/experiences/ExperienceCard.tsx:246`
  - `lib/api/orgRecords.ts:86-89` (its comment says "no page built")
  - `hooks/useExperiences.ts:97-106`
- `frontend/src/middleware.ts` is next-intl only, so a locale-less `/verify/CODE` is redirected to `/en/verify/CODE`.
- `(public)/layout.tsx` wraps pages in `RequireGuest`, which redirects signed-in users, so it is **not** suitable. `(shared)/layout.tsx` has the same chrome and **no guard**, so it is the right group.

**Partially Implemented:** `lang=ar` PDFs draw Arabic with Helvetica, which cannot render Arabic glyphs (TODO at `attestation-document.ts` L275–279). The frontend `downloadAttestation` (`lib/api/tasks.ts:284-306`) never sends `lang`.

### Task 2: AI Agent Output Limit

**Verified:** the value is defined and clamped in these places:

| Location | Current |
|---|---|
| `backend/src/ai-agent/config/ai-agent.config.ts:84` (`defaultAiAgentLimits`) | `maxOutputTokens: 400` |
| `ai-agent.config.ts:207-213`: `readInteger(read,'AI_AGENT_MAX_OUTPUT_TOKENS',400,1,800)` | default 400, **max 800** |
| `orchestrator/answer-policy.ts:165`: `clamp(limits.maxOutputTokens, 400, 1, 800)` | **max 800** |
| `answer-policy.ts:173`: conservative mode `Math.min(300, …)` | 300 (leave as is) |
| `prompt/prompt-builder.ts:70`: `HARD_MAX_OUTPUT_TOKENS = 800` | **800** |
| `backend/.env.example:112` | `400` |
| `render.yaml:101`: `AI_AGENT_MAX_OUTPUT_TOKENS`, `sync: false` | **The value lives in the Render dashboard** (Unverified) |

- **Tests asserting the current values:**
  - `ai-agent.controller.spec.ts:277` (default 400)
  - `ai-agent.controller.spec.ts:340,356` (env `9999` → 800)
  - `backend/test/ai-agent-orchestration.e2e-spec.ts:306` (`toBe(400)`)
- **Docs:** `docs/AI_AGENT.md:255,316`, `docs/DEPLOY.md:106`, `docs/AI_AGENT_QUOTA_LOAD.md:38`, `docs/AI_AGENT_PROPOSAL.md:152,395,491`.

**Provider considerations:**
- **Gemini** sends `max_output_tokens` (`llm/gemini.provider.ts:303`). **Groq** sends `max_completion_tokens` (`llm/groq.provider.ts:457`).
- Truncation is already handled end to end:
  - `finishReason 'length'` → `done { truncated: true }` (`ai-agent.controller.ts:336-340`).
  - The frontend shows "Shortened" plus Continue (`useAiChat.ts:196-198`, `MessageBubble.tsx:161-175`).
- `buildParams` sets no `thinking_level`. `mapUsage` (`gemini.provider.ts:467-485`) ignores `total_thought_tokens`.
- **Unverified:** whether gemini-3.8-flash counts thinking tokens against `max_output_tokens`. If it does, this would explain shortened answers at 400.

**Quota impact (Verified):**
- The controller reserves `estimatedInput + maxOutputTokens` against `dailyTokenBudget` (150,000) (`budget/quota.service.ts:221-228`). Each reservation grows by 600 tokens.
- A turn can make up to 3 provider calls (`ai-agent.orchestrator.ts:119`), but only one × max output is reserved.
- The prompt-budget spec does **not** subtract output from the input budget (`prompt-builder.ts:275,312`), so raising output does not shrink the prompt.

### Task 3: UI/UX Review

**Verified strengths:**
- `dir` is set at `app/[locale]/layout.tsx:54`.
- **Zero physical-direction utilities** in `.tsx`; all direction-aware classes are logical.
- Every table has an overflow wrapper (`components/ui/Table.tsx:18`).
- Hardcoded strings are almost absent.

**Verified inconsistencies (focused, no redesign):**
1. **Five separate opportunity card implementations** (see Task 8).
2. **Duplicated guards:**
   - `RequireOrg` is defined in three places: `org/applications/components.tsx:27`, `org/profile/components.tsx:12`, `org/settings/components.tsx:12`.
   - There are more page-local guards.
   - No role layout applies a guard. The backend `@Roles` remains the real enforcement.
3. **Duplicated `StatusPill`:** `org/applications/components.tsx:60` and `volunteer/applications/components.tsx:49`, while `components/ui/Pill.tsx` exists.
4. **Button usage:** 125 raw `<button>` vs 220 `<Button>`. There are 22 hand-styled primary links and no `ButtonLink` primitive. Examples: `PublicOpportunitiesPage.tsx:701,720,794`, `PublicLandingPage.tsx:772,821`.
5. **Card surfaces:** `ui/Card` uses `rounded-lg p-4` (`ui/Card.tsx:11`), but 67 hand-written `rounded-xl border border-border bg-surface` surfaces exist, plus one-off radii.
6. **RTL arrow nudge** goes the wrong direction in Arabic: `group-hover:translate-x-0.5` without an RTL counter-translate at `AdminDashboardPage.tsx:954` and `OrgOpportunitiesPage.tsx:650,666`. The correct pattern exists in `ui/ArrowIcon.tsx:15`.
7. **Hardcoded English `aria-label="Breadcrumb"`** at `AdminAuditLogsPage.tsx:388`, `AdminOpportunitiesPage.tsx:994`, `AdminReportsPage.tsx:1070`, `AdminVolunteersPage.tsx:812`, `OrgSettingsPage.tsx:51`.
8. **Design reference mismatch:** `design/system-design.md` specifies purple `#5300b7`, while the implemented tokens are near-black and gold (`src/theme/tokens.css:28-36`). **Do not "fix" this before the presentation.** The implemented tokens are the de facto system.

### Task 4: Core End-to-End Workflow Testing
See §10 for the full test plan. Key facts:

- **Verified:** `backend/test/e2e/core-loop.e2e-spec.ts` (13 `it` blocks, ~1000 lines) covers, through the real Nest app and in-memory MongoDB:
  - register → email verify → org dossier → admin approve (`:403`)
  - publish (`:447`) → apply/accept/start job (`:467`) → submit (`:512`) → verify (`:540`)
  - rollback (`:657`) → `GET /verify/:code` (`:781`) → public profile (`:795`) → negative gates (`:821-969`)
- **Verified:** there are 30 Playwright specs (`frontend/e2e/`). **27 of the 30 mock the API with `page.route`**, so frontend↔backend contract drift is not caught.
- **Missing:**
  - any browser test against the real backend
  - any `/verify` frontend test
  - mobile runs of the submit and review screens
  - e2e for close/cancel/complete and participant removal

### Task 5: Favorites Page

**Verified (backend, `backend/src/favorites/`):**
- `FAVORITE_TARGET_TYPES = ['opportunity','talent']` (`schemas/favorite.schema.ts:6`). **Organizations are not supported.**
- **Routes (volunteer-only):**

  | Method | Path | Line |
  |---|---|---|
  | POST, DELETE | `favorites/opportunities/:id` | `favorites.controller.ts:150,172` |
  | POST, DELETE | `favorites/talents/:username` | `:188,209` |
  | GET | `favorites?targetType&cursor&limit` | `:220` (CursorPage, max 50) |
  | GET | `favorites/counts` → `{opportunity, talent}` | `:230` |
  | GET | `favorites/lookup` (public + optional JWT) | `:237` |

- The list summary is thin: `withSummaries` (`favorites.service.ts:538-591`) returns `{title, slug}` for opportunities and `{username, fullName}` for talents.
- The list is **not status-filtered**, so saved closed or in-progress opportunities link to a detail endpoint that only serves `published` (`opportunities.service.ts:685,693`). Those links show 404.
- Deleted targets return `summary: null`.
- **Privacy note:** the talent summary includes `fullName`, which the public profile deliberately never displays (`frontend/src/lib/api/publicTalent.ts:29-30`). The favorites page must render `username` (or the public `firstName`), not `fullName`.

**Verified (frontend):**
- `lib/api/favorites.ts`:
  - **Bug:** `FavoritesCountsSchema` (L37–42) expects `opportunities`/`talents`, but the backend returns `opportunity`/`talent` (`favorites.service.ts:203`). The schema is `.passthrough()`, so it reads as undefined without an error.
  - `listOwnFavorites` (L76) returns `unknown`, with no `targetType` param.
- `hooks/useFavorites.ts`:
  - There is no list hook.
  - Toggles are not optimistic, despite the header comment.
  - `invalidateFeedLists` (L63–68) **does not invalidate** `public-orgs-opp`, `opportunity`, `public-opportunities-feed` or `volunteer-home-recommended`. So the Save label on `(shared)/opportunities/[idOrSlug]/PublicOpportunityDetailsPage.tsx:333` stays stale.
- The shared detail page's Save button is **not role-gated**: org and admin sessions get a 403 toast (`:341,399-401`).
- **Missing:** a route, and a nav entry (`components/shell/Sidebar.tsx` `MY_SPACE` L43–54; `components/shell/BottomNav.tsx` `MORE_TABS` L48–53).
- Existing keys to reuse:
  - `volunteerHome.shared.save/saved/unsave`
  - the unused `volunteerHome.opportunities.statsSaved` (`messages/volunteer-home/en.json:81`)
  - toasts `favoriteAdded`/`favoriteRemoved` (`messages/toast/en.json:36-37`)

### Task 6: Arabic Text Normalization (BM25)

**Verified pipeline:**
- **Corpus:** `backend/ai-agent/`, 69 topics × `ar.md`/`en.md` plus `data/glossary.csv` and `data/topics.json`. 879 chunks: 431 ar, 448 en, 0 fr.
- **Chunker:** `knowledge/chunker.ts:18-20` (900/120/1100).
- **Index:** built once at startup (`knowledge.service.ts:46-48,134-137`).
- **Normalizer:** `KnowledgeNormalizer` with synonyms (`ai-agent.module.ts:160-169`). `normalizeText` (`knowledge/normalizer.ts:327-341`) applies, in order:
  1. lowercase
  2. strip diacritics
  3. strip tatweel
  4. أإآٱ→ا
  5. ى→ي
  6. ة→ه
  7. NFD and strip U+0300–036F
  8. non-letter → space
- **Same normalizer for documents and queries:** `bm25.ts:120-161` and `:375-412`; `retriever.ts:196-205` passes the normalized query.
- **BM25 settings:** k1 1.2, b 0.75, field weights body 1 / title 3 / heading 2 / tag 2 (`bm25.ts:20-33`).
- **Retriever:** top 4 (max 6), relative cut at 0.2 × top score (`retriever.ts:22-35,235-238`).
- **Router:** absolute `routerMinScore` 1.5 (`config/ai-agent.config.ts:14-16`; `router/intent-router.ts:1220-1227`).

**Verified defects:**
1. **Hamza on a carrier is split** (reproduced from source): NFD turns ؤ/ئ into و/ي + U+0654, and U+0654 then becomes a space.
   - `مسؤول الجزائر` → `مسو ول الجزاي ر`.
   - This affects 491 occurrences / 110 distinct words in the corpus, e.g. الجزائر, رؤية, مسؤول, الأسئلة, هيئة, مؤسسة.
   - The authors already work around it locally: `foldArabicHamza` in `ai-agent/opportunity-place.ts:106-121`.
   - It also breaks organization matching: `normalizeOrganizationName("مؤسسة نور")` → `"مو سسه نور"` (`organization-query.ts`).
2. **No clitic or article handling in BM25:** `فرص` and `الفرص` are different terms, and `بالفرص`/`والفرص` are unique terms. Light prefix stripping exists only in the organization, opportunity and place helpers (`organization-query.ts:14`, `search-opportunities.tool.ts`).
3. **Arabic-Indic digits** `٠-٩` are not mapped to ASCII.
4. **The benchmark is saturated:** `npm run ai:eval` passes 53/53 at top-4, so it cannot show improvement. It needs harder Arabic queries.
5. **The regression harness differs from production:** it builds `new KnowledgeNormalizer()` **without synonyms** (`regression/harness.ts:374-377`, uncommitted).

### Task 7: Mobile UX
**Verified:**
- The shell is `Navbar` + `Sidebar` (`hidden … lg:flex`) + `BottomNav` (`lg:hidden`, 4 tabs plus a "More" popover per role, safe-area aware).
- The public navbar has a hamburger menu below `lg`.
- The AI panel is a full-screen modal below 480px (`AiAgentPanel.tsx:53-87`).

**Verified issues, by impact:**
1. **The AI launcher covers the bottom nav.**
   - The launcher is `fixed z-[60]` at `bottom: 24px` (`AiAgentLauncher.tsx:290-293,321`; `aiAgentUi.ts:23`).
   - The bottom nav is `fixed bottom-0 z-40` (`BottomNav.tsx:171`), about 54px plus the safe area.
   - So below `lg` the launcher sits over the end tab: "More" in LTR, the first tab in RTL. (Verified in code; not checked visually.)
2. **No search for signed-in users on phones:** all three authenticated search forms are `hidden … md:flex` (`components/shell/Navbar.tsx:44,79,110`), with no mobile alternative.
3. **The admin stats strip forces horizontal scroll:** `min-w-[760px]` (`AdminDashboardPage.tsx:364`).
4. **Breakpoint mismatch:** the AI panel's mobile cutoff is 479px, but the shell's is 1024px, so tablets get a floating 400×640 panel next to the bottom nav.
5. Status label hidden on mobile at `VolunteerTasksPage.tsx:430` (minor).

### Task 8: Opportunities Display
**Verified surfaces and duplication:**
- **Five card implementations:**
  1. `volunteer/opportunities/OpportunityCard.tsx`, used by the volunteer feed, the dashboard and the **org editor preview** (`OpportunityEditor.tsx:1572`)
  2. `OpportunityArticle` in `(public)/opportunities/PublicOpportunitiesPage.tsx:231-417`
  3. `OppRow` in `(public)/PublicLandingPage.tsx:104`
  4. a local `OpportunityCard` in `(shared)/orgs/[slug]/PublicOrgProfilePage.tsx:158`
  5. `OppCard` in `org/opportunities/OrgOpportunitiesPage.tsx:395`
- **Four zod schemas** for the same payload: `lib/api/feed.ts:84`, `publicOpportunities.ts:87`, `publicOrgs.ts:192`, `opportunity.ts`.

**Verified backend capability:**
- `GET /opportunities` (`opportunities.controller.ts:52`, `listPublic` in `opportunities.service.ts:509-677`) supports:
  - `q`
  - multi-select `categoryId`/`skillId`/`wilayaId`/`municipalityId`
  - `from`/`to`
  - `hasOpenPositions`
  - `nearMe`
  - `sort` ∈ newest/oldest/deadline_asc/startDate_asc
- **Not supported:** a `mode` filter (the field exists on the schema), and excluding expired deadlines.

**Verified display defects:**

| Defect | Location |
|---|---|
| Description not line-clamped (backend allows 2000 chars) | `OpportunityCard.tsx:321-323`, `PublicOpportunitiesPage.tsx:318-320` |
| Public page `mode` filter is client-side (`filterByMode` L496), but count, range and pagination use the server `total`, so pages can come back empty | `PublicOpportunitiesPage.tsx:496,509-510,547` |
| Volunteer card: no mode, no end date, no full/closing-soon badge (keys `statusFull`/`statusSeats` exist), org logo ignored, uncapped positions list | `OpportunityCard.tsx:266-268,283-288,361-409` |
| Location rendered twice | `PublicOpportunitiesPage.tsx:292-298,340-345` |
| Shared detail page: raw untranslated `mode`, **no start date**, Save button not role-gated, stale saved state | `PublicOpportunityDetailsPage.tsx:410-415,425-431` |
| Org profile cards read `card.startAt`, but opportunities carry `startDate` (`startAt` exists only on positions, `backend/src/opportunities/schemas`), so the start date likely never shows | `PublicOrgProfilePage.tsx:164`, `lib/api/publicOrgs.ts:183,200` (**likely, visual check needed**) |
| Inconsistent detail targets: the feed goes to `/volunteer/opportunities/...`, the dashboard rail to `/opportunities/...` | `VolunteerDashboardPage.tsx:453` |

**Reference to copy:** `volunteer/opportunities/[idOrSlug]/OpportunityDetailsPage.tsx:288-309` already shows dates, deadline, translated mode and hours correctly.

### Task 9: Generative UI Cards for the AI Agent

**Verified tools** (registered in `ai-agent.module.ts:174-245`, uncommitted):

| Tool | Output `data` | Card candidate |
|---|---|---|
| `search_opportunities` | `{items: PublicOpportunityCard[] \| {slug,title}[] (compact) \| PublicOpportunityFocusCard[] (slugs), resolvedPlace?}` | Opportunity list |
| `get_opportunity_details` (untracked) | `{item: PublicOpportunityCard \| null}` | Opportunity card |
| `search_organizations` | `{items: PublicOrganizationCard[]}` | Organization list |
| `get_organization_details` (untracked) | `{item: PublicOrganizationCard \| null}` | Organization card |
| `platform_stats` | `{publishedOpportunities, verifiedOrganizations, activeSkills, wilayas, municipalities}` | Stats tile row |
| `search_reference_data` | `{skills: PublicSkill[], locations: PublicLocation[]}` | Optional chips |
| `search_knowledge` | knowledge chunks | **No card**: knowledge chunks are not public entities, and cards never carry source or citation data |

- **Mapper types:** `tools/mappers/public-opportunity.mapper.ts:15-61`, `public-organization.mapper.ts:4-21`. Full opportunity cards carry **location codes only**; only `PublicOpportunityFocusCard` carries `locationNames`.
- **Payload trimming:** results are trimmed by `tool-executor.ts` `fitPayload` (130–170) to about 1200 chars per tool and 3000 in total. Cards built from this data get the same trimmed rows.
- **SSE contract:**
  - `AiAgentSseEventMap` (`ai-agent.types.ts:109-116`) and `SSE_EVENT_NAMES` (`ai-agent.constants.ts:44-51`) define `meta|status|sources|token|done|error`. `cards` is not in the map yet.
  - **`sources` is never emitted.** It remains **forbidden** by `openspec/specs/ai-agent-grounding/spec.md` and enforced by tests: `ai-agent.orchestrator.spec.ts:565,1292,1369,2043`, `backend/test/ai-agent-orchestration.e2e-spec.ts`, `regression/scoring.ts:373-374,452-453`.
  - **`cards` is allowed by the updated grounding spec** (D5 resolved), but is not emitted yet. The implementation must add it to the SSE map and constants and build cards only from links that survive sanitization.
  - Today, grounding happens only as allowlisted Markdown links: `orchestrator/answer-links.ts` `buildAnswerLinks()` and `sanitizeAnswer()` (`ai-agent.orchestrator.ts:1283-1294`).
- **Hook points for emitting cards:**
  - `citableResults` collected at `ai-agent.orchestrator.ts:956/1040` (model-first) and `1651/1726` (router-first)
  - deterministic paths `runOpportunityBrowse` (1990), `runFocusedOpportunityDetail` (2107), `runOrganizationLookup` (2206), `runOpportunityFallback` (2359)
- **Frontend:**
  - `lib/api/aiAgent.ts` `streamChat` (505–715) **skips unknown events** (`KNOWN_EVENT_NAMES` 384–391, L594), so a new event cannot break old clients.
  - `hooks/useAiChat.ts`: `AiChatMessage` plus a reducer. sessionStorage persistence (`basmatak.aiAgent.history`, `STORAGE_VERSION=1`, schema at 312–322).
  - `components/ai-agent/MessageBubble.tsx` parses only `[text](href)`, with no Markdown library. Entity links already render as card-like links (`data-link-card`).
  - `SourceChips.tsx` exists but is **orphaned**.
- **Reuse:** the volunteer `OpportunityCard` is **not suitable** inside chat. It needs a different schema (`lib/api/feed.ts`) and pulls in session, favorites and `volunteerHome` dependencies. Build small chat-scoped cards using `components/ui/Card.tsx` and `Pill.tsx`.

### Task 10: Volunteer CV Export

**Verified data source:** `GET /volunteers/:username` (`backend/src/volunteers/public-volunteers.controller.ts:39`, `VolunteersService.getPublicProfile()` `volunteers.service.ts:627-728`).
- Returns 404 when `publicProfile.enabled` is false.
- **Field gates** (flags defined in `volunteer-profile.schema.ts:12-20,96-106`):

  | Gate | Fields |
  |---|---|
  | `showBiography` | `firstName`, `bio`, `headline`, `availabilityNote`, `preferredDomains`, `geographicBase` |
  | `showSkills` | `skills` (with `nameFr`/`nameAr`, `level`, `isPrimary`) |
  | `showExperiences` | `experiences` + `areasOfContribution` (only experiences with `publicVisibility:'public'`) |
  | `showStats` | `stats` (`completedTasks`, `verifiedExperiences`, `volunteerHours`) |
  | `showAvatar`, `showLocation`, `showAvailability`, `showPortfolio` | avatar, location, availability, portfolio |

- **`fullName` is always returned** (L689–694), but the frontend must never display it (`lib/api/publicTalent.ts:29-30,218-219`). **The CV must use `firstName` (under `showBiography`) or the username, never `fullName`.**
- Every `volunteer_experiences` row is verified by construction (rows are created only by the verify transaction), so "verified experiences" = public experience rows. Organizations per experience: `{id, slug, nameFr, nameAr}`. Skills on experiences are ObjectIds; the frontend maps them via `humanExperienceSkillLabels`.
- **Hours unit bug (Verified):** `stats.volunteerHours` is incremented by `opportunity.durationMinutes` (`verifications.service.ts:56-57,405`), but it is displayed raw as hours in:
  - `PublicTalentProfilePage.tsx:179,816`
  - `(public)/talents/PublicTalentCard.tsx:104`
  - `admin/volunteers/AdminVolunteersPage.tsx:288-289`
  - the admin platform total `stats.service.ts:101-114`

  Per-experience views convert correctly (`hoursFromMinutes`, `publicTalent.ts:505`).
- **No badges or achievements exist for volunteers** (reliability is organization-only, `backend/src/trust/reliability.service.ts`). The CV has no "achievements" section beyond verified experiences, hours and completed tasks.
- **PDF infrastructure:** `attestation-document.ts` has A4 layout constants, `ensureSpace`, `rule`, `measure` and logo caching. The streaming pattern is at `attestation.controller.ts:191-203`. The frontend uses `downloadBlob` (`lib/api/download.ts`).
- **Blocker for Arabic:** no TTF fonts are bundled, and there is no bidi or shaping library. The code itself notes "pdfkit performs no Arabic glyph shaping".
- **Missing:** any CV endpoint or UI (`cv|resume|curriculum`: no match).

---

## 4. Existing Functionality vs Missing Functionality

| Task | Existing (reuse) | Missing (build) |
|---|---|---|
| 1 | `GET /verify/:code`; unique codes; links already target `/verify/<code>`; `(shared)` layout | Frontend pages (form + result); absolute URL + QR in PDF; skill names; route throttle |
| 2 | Config, env var, truncation + Continue UI | Raise 3 clamps and the default; update tests, docs and the Render env |
| 3 | `components/ui/*` primitives, logical RTL, parity tests | Consolidate duplicated guards/pills (within touched pages only), RTL nudge fix, i18n aria-labels |
| 4 | API-level core-loop e2e; 30 mocked Playwright specs; 827 vitest tests | Fresh baseline run; a real full-stack smoke; `/verify` + favorites + CV + cards tests; fix the toast spec |
| 5 | List/counts/lookup endpoints; toggle mutations; toast keys | Page, list hook + zod schema, nav entry, counts fix, invalidation fix, status-aware list; organization favorites (D1 resolved yes) |
| 6 | Shared normalizer for index and query; synonyms; ai:eval harness | Hamza fold before NFD, digit mapping, non-destructive article/clitic variants, harder eval set |
| 7 | BottomNav, PublicNavbar menu, AI mobile modal | Launcher offset above the bottom nav, mobile search entry, admin strip fix |
| 8 | Backend filters/sort; good detail page to copy | Line clamps, badges, server-side or removed `mode` filter, start date + translated mode, `startAt` fix |
| 9 | Tool mappers, `citableResults`, allowlisted links, additive-safe SSE client | New `cards` event + spec delta; backend card builder; frontend card components + persistence |
| 10 | Public profile endpoint with privacy gates; PDF helpers; `downloadBlob` | CV print page (Option A), Arabic rendering via the browser, hours display fix |

---

## 5. Implementation Tasks and Detailed Steps

Sizes are relative (S ≈ a few files, M ≈ one feature slice end to end, L ≈ backend + frontend + spec). They come from the number of files and contracts touched, not from clock time; calibrate them after Checkpoint 0.

### Task 1: Certificate Verification Page (Session S2), size M
1. **(Proposed, frontend)** Add `frontend/src/lib/api/verify.ts`:
   - zod schema mirroring `getPublicProof()`, with `.passthrough()` and every field optional except `verificationCode`
   - a `fetchPublicProof(client, code)` function
   - a test
2. Add `frontend/src/hooks/useVerify.ts` (`queryKeys.detail('verify', code)`, `retry:false`, per `hooks/CONVENTIONS.md`).
3. Add `app/[locale]/(shared)/verify/page.tsx`: a code entry form. Normalize the input with uppercase and trim, and accept a pasted full URL.
4. Add `app/[locale]/(shared)/verify/[code]/page.tsx`. It shows:
   - a verified badge, title, organization (with a link to `/orgs/<slug>`), the volunteer handle (link to `/volunteers/<handle>`), the verification date, and the duration formatted from **minutes**
   - the visible review and public evidence
   - a clear "not found / no longer valid" state for 404s
5. Add `frontend/src/messages/verify/{en,ar}.json` and `messages/verify-parity.test.ts`. The loader auto-discovers them.
6. Add both routes to `frontend/e2e/gate-responsive.spec.ts`; this is required by `gate/route-coverage.test.ts`.
7. **(Backend, small)**:
   - Add a stricter `@Throttle` on `public-verification.controller.ts`.
   - Optionally add a skill-name join in `getPublicProof()`. Alternatively, resolve the names on the frontend from the public skills endpoint, which avoids any backend change.
8. **(Backend, PDF)**: build an absolute verify URL from a new `FRONTEND_URL` config (do not reuse `CORS_ORIGIN`, which may list several origins).
   - `attestation.service.ts` → `buildAttestationDocument`: replace `verifyPath()` with the absolute URL.
   - **QR (D3 resolved: yes):** add `qrcode`. Render a PNG buffer and use `doc.image()` in the code box (`attestation-document.ts` L862–910), next to the absolute verify URL.
9. Optional: make `ExperienceCard.tsx:246` and `orgRecords.ts:86-89` copy an absolute, locale-prefixed URL.
10. Tests:
    - backend: a unit test for the URL/QR presence in the document spec
    - frontend: vitest for the schema and hook; Playwright with a mocked route for the found and 404 states

### Task 2: maxOutputTokens 400 → 1000 (Session S1), size S
1. `config/ai-agent.config.ts:84`: set the default to 1000. At `:207-213`, change `readInteger(...,1000,1,<newMax>)`.
2. Pick a new hard max, e.g. **1200**, to leave headroom. Apply it in `answer-policy.ts:165` (`clamp(…, 1000, 1, 1200)`) and `prompt-builder.ts:70`. **All three must match.**
3. Keep conservative mode at 300 (`answer-policy.ts:173`), unless you choose otherwise.
4. Update the tests:
   - `ai-agent.controller.spec.ts:277,340,356`
   - `backend/test/ai-agent-orchestration.e2e-spec.ts:306`
5. Update `.env.example:112` and the docs: `AI_AGENT.md:255,316`, `DEPLOY.md:106`, `AI_AGENT_QUOTA_LOAD.md:38`. Leave the proposal doc as a historical record, or add a note.
6. **Deploy:** set `AI_AGENT_MAX_OUTPUT_TOKENS=1000` in the Render dashboard (`render.yaml:101`, `sync:false`). Otherwise an explicit 400 there overrides the new default.
7. Optional, Proposed (do not extend scope unless answers are still cut short):
   - set Gemini `thinking_level:'low'` in `gemini.provider.ts` `buildParams`
   - map `total_thought_tokens` in `mapUsage`
8. Re-check the daily budget: reservations grow by 600 per turn.
9. Run `npx jest src/ai-agent`, `npm run test:e2e -- ai-agent` and `npm run ai:check`.

### Task 3: UI/UX Organisation (Session S3), size M (scope-limited)
Scope rule: fix inconsistencies **only on pages already touched by tasks 5, 7 and 8**, plus the global quick fixes below. No redesign, and no token changes.
1. RTL arrow nudge: apply the `ui/ArrowIcon.tsx:15` pattern at `AdminDashboardPage.tsx:954` and `OrgOpportunitiesPage.tsx:650,666`.
2. Translate the 5 hardcoded `aria-label="Breadcrumb"` instances (add a `common` key).
3. Add a `ButtonLink` variant (or `Button asChild`-style) to `components/ui/Button.tsx` and use it on the hand-styled CTAs of the public opportunities and landing pages (Task 8 already touches them).
4. Replace the two `StatusPill` copies with `ui/Pill`, if the visual result is identical.
5. **Do not** consolidate the `RequireOrg` guards before the presentation. They work, and the change touches many org pages owned by no session. Record it as post-presentation work.
6. Run a page-by-page visual pass in **ar and en**, light and dark (`ThemeToggle` exists), and record the findings in the session PR.

### Task 4: Core E2E Workflow Testing (Session S4), size M. See §10

### Task 5: Favorites Page (Session S3), size M–L (organizations included)
1. **Fix** `lib/api/favorites.ts`:
   - `FavoritesCountsSchema` → `{opportunity, talent}`; fix the test mock (`favorites.test.ts:71`)
   - add a typed `FavoriteItemSchema` and a `CursorPage` schema
   - add a `targetType` param to `listOwnFavorites`
2. `hooks/useFavorites.ts`:
   - add `useMyFavoritesQuery({targetType, cursor})`
   - add the list key **and** `public-orgs-opp`, `opportunity`, `public-opportunities-feed` and `volunteer-home-recommended` to `invalidateFeedLists`
3. **(Backend, small, Proposed)** in `favorites.service.ts` `withSummaries`:
   - add `status` (plus optionally `applicationDeadline` and the organization name) to the opportunity summary, so the page can label "closed" and avoid dead links
   - keep `fullName` out of the UI
4. Add `app/[locale]/volunteer/favorites/{page.tsx,VolunteerFavoritesPage.tsx}`:
   - tabs for **Opportunities**, **Volunteers** (talents), and **Organizations** (D1)
   - cursor pagination using `components/ui/Pagination`
   - unsave in place
   - empty states that link to `/volunteer/opportunities`, `/volunteer/talents`, and `/orgs`
   - closed or removed targets shown as disabled rows
5. Nav: add a `favorites` entry to `Sidebar.tsx` `MY_SPACE` and `BottomNav.tsx` `MORE_TABS`, plus `common` `nav.favorites` (en and ar). Check `Shell.test.tsx`.
6. Add a `messages/volunteer-favorites/{en,ar}.json` namespace and parity test, or reuse `volunteerHome.shared.*`.
7. Role-gate the Save button on `PublicOpportunityDetailsPage.tsx` so it is hidden for org and admin sessions (the talent page pattern is at `PublicTalentProfilePage.tsx:369`).
8. **Organizations (D1 resolved: yes):**
   - backend: add `'organization'` to `FAVORITE_TARGET_TYPES`, add POST/DELETE `favorites/organizations/:slug`, and a summary and lookup branch
   - frontend: a save button on `PublicOrgProfilePage.tsx`, plus the third favorites tab
   - add a spec delta under `openspec/specs/favorites` for the new target type
   - This is committed scope, not optional. It adds meaningful backend work, so keep the opportunity and volunteer tabs working while the organization path is added.
9. Add the new route to `e2e/gate-responsive.spec.ts`. Tests: vitest for the schema and hook; Playwright for listing, unsaving and empty states.

### Task 6: Arabic Normalization (Session S1), size M
1. **First, establish a benchmark.** Add hard Arabic queries to `src/scripts/ai-eval.ts`: hamza words (الجزائر, مسؤول, الأسئلة, هيئة), clitics (بالفرص, والتسجيل, للمتطوعين), the article/no-article pair (فرص/الفرص), and Arabic-Indic digits. Record the before results.
2. In `knowledge/normalizer.ts` `normalizeText`, **before** `normalize('NFD')`:
   - fold `ؤ→و`, `ئ→ي` (matching `foldArabicHamza` in `opportunity-place.ts:106-121`)
   - also strip U+0654/U+0655 if they are present
   - map `٠-٩` and `۰-۹` → `0-9`
   - keep ة→ه and ى→ي as they are
   - do **not** remove standalone ء, and do not merge ه/ة any further
3. **Non-destructive clitic handling:** in `tokenize`/BM25 query expansion, add a stripped variant for the prefixes `وال|بال|كال|فال|لل|ال|و` when the remainder is at least 3 letters. Add it as a secondary term with the existing synonym weight 0.5 (`bm25.ts:33`), on **both** index and query sides, or on the query side against an index that also stores stripped variants. The original token stays primary, so exact matches still score highest. Do not use a full stemmer.
4. Keep the function idempotent. `normalizer.spec.ts:38` asserts this, and the retriever relies on it.
5. Update and add tests: `normalizer.spec.ts` (hamza, digits, idempotency, French accents unchanged), `bm25.spec.ts`, `retriever.spec.ts`, `knowledge.service.spec.ts`.
6. Re-run `npm run ai:eval` and the scripted `npm run ai:regression`. The regression **rewrites** `backend/test/ai-baseline/*`, so only S1 runs it. Re-check that `routerMinScore` 1.5 still routes correctly, because scores shift.
7. Do **not** refactor `foldArabicHamza` or `organization-query.ts`. They benefit automatically, and changing them is out of scope.

### Task 7: Mobile UX (S3, with the AI launcher fix in S1), size S–M
1. **(S1, owns `components/ai-agent/`)** Below `lg`, offset the launcher's default `bottom` by the bottom-nav height plus the safe area. Change `AI_AGENT_LAUNCHER_BOTTOM_MARGIN` usage in `AiAgentLauncher.tsx:290-293`, and clamp the dragged position the same way. Add a test.
2. **(S3)** Mobile search for signed-in users: add a search icon button in `Navbar.tsx` below `md`, opening the existing form in a full-width row or sheet. Reuse the `onSubmit` handlers at L44/79/110.
3. **(S3)** `AdminDashboardPage.tsx:364`: remove `min-w-[760px]` so the existing `grid-cols-2` applies.
4. **(S3)** Run Playwright at 375 and 768 on the volunteer flow (opportunities, detail, apply dialog, tasks, submit) and the org review flow. `gate-responsive.spec.ts` already provides the viewport harness.
5. Not now: aligning the AI panel's 479px breakpoint with `lg` changes the widget's behaviour on tablets. Record it only.

### Task 8: Opportunities Display (Session S3), size M
1. Add `line-clamp-3` to the description and `line-clamp-2` to the title in `OpportunityCard.tsx:321-323` and `PublicOpportunitiesPage.tsx:318-320`. Cap the positions list to 2 plus "+N more" (L361–409). The **org editor preview uses this card**, so check `OpportunityEditor.tsx:1572` afterwards.
2. Add badges from existing data: full / seats left (existing `statusFull`/`statusSeats` keys), closing soon (from `applicationDeadline`), and a translated `mode`.
3. Public page `mode` filter: either **remove** it, or add server support: `mode` in `OpportunityFeedQueryDto` (`backend/src/opportunities/dto/opportunity.dto.ts:374-463`) plus `listPublic`, with a spec. **Recommended:** server support, because it is small and additive. Otherwise remove the client filter to stop the empty-page bug.
4. Remove the duplicate location in `OpportunityArticle` (`:340-345`).
5. Shared detail page:
   - add the start date (`:425-431`)
   - translate `mode` using the `opportunityDetails` mode labels
   - point the 404 back link at `/opportunities`
6. Org profile cards: switch the field to `startDate` in `lib/api/publicOrgs.ts:183,200` and `PublicOrgProfilePage.tsx:164`. Confirm the backend payload field first.
7. Optional: expose `hasOpenPositions` on the public page, since the backend already supports it.
8. **Do not** merge the five cards or four schemas before the presentation. That is a refactor; record it as follow-up.

### Task 9: Generative UI Cards (Session S1), size L
1. **Spec (D5 resolved: yes; main spec already updated):** `openspec/specs/ai-agent-grounding/spec.md` now permits a single `cards` event restricted to allowlisted public entities already linked in the answer. Keep "no `sources` event / no source chips" **unchanged**. If the implementation needs a formal change record, add an openspec change that references the updated spec; do not reintroduce a sources contract. This keeps the grounding rule: cards never show something the text did not ground.
2. **Contract (agree before any frontend work, §10.1):**
   ```ts
   // event: cards, emitted once, after sanitize and before `done`
   type AiAgentCardsEvent = { cards: AiAgentCard[] };   // max 6
   type AiAgentCard =
     | { kind: 'opportunity'; slug: string; title: string; organizationName?: {ar?:string;fr?:string};
         wilayaName?: {ar?:string;fr?:string}; startDate?: string|null; applicationDeadline?: string|null;
         openPositions?: number; mode?: string; status?: string; href: string }
     | { kind: 'organization'; slug: string; nameAr?: string; nameFr?: string; type?: string;
         wilayaName?: {ar?:string;fr?:string}; foundedYear?: number|null; href: string }
     | { kind: 'stats'; publishedOpportunities: number; verifiedOrganizations: number;
         activeSkills: number; wilayas: number; municipalities: number };
   ```
3. Backend:
   - add `cards` to `AiAgentSseEventMap` (`ai-agent.types.ts`) and `SSE_EVENT_NAMES` (`ai-agent.constants.ts`)
   - add a new `orchestrator/answer-cards.ts`, modelled on `answer-links.ts`, that builds cards from `citableResults` and **filters to the hrefs that survived `sanitizeAnswer`**
   - emit it in the model-first, router-first and deterministic paths (§3, hook points)
   - forbidden-key guard: reuse `FORBIDDEN_TOOL_RESULT_KEYS` (`tool.types.ts:169-203`)
   - location names: resolve from the location codes using the existing locations data, or omit them. Do not widen tool payloads.
4. Backend tests:
   - an orchestrator spec for card emission and filtering
   - a controller spec for the event order `meta, status*, token*, cards, done`
   - `backend/test/ai-agent-orchestration.e2e-spec.ts`
   - check that `regression/scoring.ts` does not penalise unknown events (it only checks `sources`)
5. Frontend:
   - `lib/api/aiAgent.ts`: a schema plus `cards` in `KNOWN_EVENT_NAMES` and `AiAgentLiveEvent`
   - `hooks/useAiChat.ts`: an optional `cards` on `AiChatMessage`, a `CARDS` action, and `cards` in `PersistedAiChatMessageSchema` (optional field, so `STORAGE_VERSION` can stay 1)
   - new `components/ai-agent/cards/{OpportunityChatCard,OrganizationChatCard,StatsChatCard}.tsx` built on `ui/Card` and `ui/Pill`, compact, RTL-safe and keyboard-focusable
   - render them below the bubble in `MessageBubble.tsx`
   - keep the inline `data-link-card` links, but de-duplicate by href when a card exists
6. Add messages to `messages/ai-agent/{en,ar}.json`, with a parity test.
7. Frontend tests: `aiAgent.test.ts` (stream with `cards`), `useAiChat.test.tsx` (reducer + persistence), the card components, `AiAgentWidget.test.tsx`, and the `e2e/ai-agent.spec.ts` mock.
8. Update `docs/AI_AGENT.md` and `docs/API_ROUTES.md`.

### Task 10: Volunteer CV Export (Session S2), size L
1. **Fix hours first (D4):** treat the stored value as **minutes** and convert at display. Reuse `hoursFromMinutes` (`publicTalent.ts:505`) in `PublicTalentProfilePage.tsx:179,816` and `PublicTalentCard.tsx:104`. Flag `AdminVolunteersPage.tsx:288` and the admin total `stats.service.ts:101-114` to the admin owner (S2 may take both, since no other session touches them). Renaming the field or migrating data is **not** recommended before the presentation.
2. **Renderer (D2 resolved: Option A, browser print-to-PDF):** build a print-optimised page `app/[locale]/(shared)/volunteers/[username]/cv/page.tsx`. It uses the **same** `usePublicTalent*` hooks and `resolvePublicProfileSections()` gates (`publicTalent.ts:365`) and has an `@media print` stylesheet. The "Download CV" button opens it and calls `window.print()`.
   - Why: perfect Arabic shaping in the browser, zero backend changes, no new dependency, and the privacy logic is reused exactly.
   - Trade-off: the user picks "Save as PDF" in the print dialog. That is acceptable for the presentation.
   - **Option B (pdfkit download) is explicitly post-presentation.** It is not part of this roadmap's delivery: it needs a bundled Arabic TTF and a shaping/RTL spike. Do not spend pre-presentation time on it.
3. Content, each section shown only if its gate is open:
   - header: `firstName` or the username, headline, and the public avatar if `showAvatar`
   - About: `bio`
   - Skills (with levels and primary flags)
   - Verified experiences: title, organization, date, duration in hours, verification code
   - Total verified hours: the sum of the experience durations, or the converted stat
   - Organizations: a de-duplicated list from the experiences
   - completed tasks
   - a footer with the profile URL and a "verify each experience at /verify/<code>" note, which links to Task 1
4. Add the button on `PublicTalentProfilePage.tsx` near the profile header. Hide it when the profile has no public experiences and no skills.
5. Add messages to `messages/public-talent/{en,ar}.json` (parity test exists), and add the CV route to `gate-responsive.spec.ts`.
6. Tests:
   - privacy: a profile with `showExperiences:false` and a private experience produces a CV with neither
   - `fullName` never appears
   - hours conversion
   - Option B is post-presentation; when it is built, add a backend e2e that checks `content-type: application/pdf` and absence of private fields

---

## 6. Dependencies Matrix

| Task | Depends on | Blocks | Key shared surfaces |
|---|---|---|---|
| 1 Verify page | — (backend endpoint exists) | 10 (CV footer links to `/verify`): soft | `attestation-document.ts` (with 10), `gate-responsive.spec.ts`, `backend/package.json` |
| 2 Max tokens | **Checkpoint 0** (uncommitted files) | — | `ai-agent.config.ts`, `answer-policy.ts`, `prompt-builder.ts` (with 9 indirectly) |
| 3 UI/UX | Ideally after 5/7/8 on the same pages | — | `components/ui/Button.tsx`, `messages/common` |
| 4 E2E | Baseline: none. Final: all tasks merged | Release | Test files only |
| 5 Favorites | D1 resolved (organizations in scope) | — | `Sidebar.tsx`, `BottomNav.tsx`, `messages/common`, `useFavorites.ts`, `PublicOpportunityDetailsPage.tsx` (with 8), `PublicOrgProfilePage.tsx` |
| 6 Arabic norm | **Checkpoint 0** (the harness and tools are uncommitted) | 9 (shared regression baselines) | `knowledge/normalizer.ts`, `backend/test/ai-baseline/*`, `ai-eval.ts` |
| 7 Mobile | — | — | `Navbar.tsx`, `AiAgentLauncher.tsx` (S1) |
| 8 Opps display | — | — | `OpportunityCard.tsx` (also the org editor preview), `PublicOpportunityDetailsPage.tsx` (with 5) |
| 9 AI cards | **Checkpoint 0**, D5 resolved (spec updated), contract (§10.1) | — | `ai-agent.orchestrator.ts`, `ai-agent.types.ts`, `MessageBubble.tsx`, `useAiChat.ts`, `messages/ai-agent` |
| 10 CV | D2 resolved (Option A), D4 resolved (display conversion); soft on 1 | — | `PublicTalentProfilePage.tsx`, `volunteers.service.ts` (hours only), `attestation-document.ts` (with 1) |

---

## 7. Parallel Execution Feasibility Analysis

1. **Can start simultaneously** (right after Checkpoint 0):
   - S2: tasks 1 and 10
   - S3: tasks 5, 8 and 7
   - S4: the baseline part of 4
   - S1: task 2

   These sets share almost no files: different backend modules (`verifications`/`volunteers` vs `favorites`/`opportunities` vs `ai-agent`) and different frontend directories.
2. **Can start after another task:**
   - Task 9's frontend part starts once the `cards` contract is merged into S1's branch, since it is the same session.
   - Task 3 starts after tasks 5, 7 and 8 inside S3, because it touches the same pages.
   - Task 4's final regression starts after all merges.
3. **Must remain sequential:**
   - **Checkpoint 0 → S1.** Tasks 2, 6 and 9 edit files that are uncommitted right now. Starting a parallel branch before they are committed guarantees conflicts, or loses work.
   - **Within S1: 2 → 6 → 9.** All three regenerate or depend on `backend/test/ai-baseline/*`, and 9 edits the orchestrator that 2 and 6 influence. Task 2 is tiny; task 6 is isolated in `knowledge/`; task 9 is the large one. Running 6 and 9 as two separate sessions is technically possible (their source files barely overlap), but both rerun `ai:regression`, which rewrites the same baseline files. **That is not recommended** unless one of them never commits baselines.
4. **Share files and need coordination:**
   - `frontend/e2e/gate-responsive.spec.ts`: S2 (verify routes, CV route) and S3 (favorites route). These are one-line appends; resolve at merge.
   - `frontend/src/messages/common/{en,ar}.json`: S3 owns it (`nav.favorites`, breadcrumb label). S2 needs no common keys if it uses its own namespaces.
   - `PublicOpportunityDetailsPage.tsx`: tasks 5 and 8 both edit it, so both stay in S3.
   - `attestation-document.ts`: tasks 1 and 10 both edit it, so both stay in S2.
   - `components/ai-agent/*`: task 9 and the launcher fix from task 7, so both go to S1.
   - `backend/package.json` / `package-lock.json`: only S2 adds a dependency (`qrcode`, D3 resolved yes). Option A needs no font asset or PDF package. Everyone else must not add dependencies.

**Conclusion:** four sessions are safe and give real parallelism. More than four would split the AI work or the S3 frontend work across shared files, for little gain.

---

## 8. Proposed Session Distribution

### Checkpoint 0 (blocking, done once, by you or S1 before anything else)
1. Finish and commit the in-flight `model-first-ai-intent-and-tools` work on `ai-agent-session-2`. Decide whether the openspec change goes back to the archive (it was moved out of `archive/`).
2. Archive the completed `profile-edit-completion` and `signed-in-org-phone-visibility` changes, if they are really done.
3. Merge into `main`. Then run backend `npm test` and frontend `npm run test` and `npx tsc --noEmit` once, to get a baseline (S4 can do this).
4. Every session branches from this `main`: `pre-pres/s1-ai`, `pre-pres/s2-credentials`, `pre-pres/s3-discovery-ux`, `pre-pres/s4-qa`.

### S1 — AI Agent (tasks 2 → 6 → 9, plus the launcher offset from 7)
- **Objective:** longer answers, correct Arabic retrieval, structured cards.
- **Owns:**
  - backend `backend/src/ai-agent/**`, `backend/ai-agent/**`, `backend/src/scripts/ai-*.ts`, `backend/test/ai-*`, `backend/test/ai-baseline/*`
  - `docs/AI_AGENT.md`, `docs/API_ROUTES.md` (AI section), `.env.example` (AI keys only)
  - frontend `components/ai-agent/**`, `lib/api/aiAgent.ts`, `lib/api/sse.ts`, `hooks/useAiChat.ts`, `messages/ai-agent/*`, `e2e/ai-agent.spec.ts`
  - openspec changes for `ai-agent-grounding`
- **Dependencies:** Checkpoint 0; D5 resolved (grounding spec updated).
- **Conflict risks:** `.env.example` (S2 may add `FRONTEND_URL`): append in different sections.
- **Deliverables:** three commits (2, 6, 9); updated baselines; the ai-eval before/after table; the updated grounding spec or a change record that references it.
- **Independent tests:** `npx jest src/ai-agent`, `npm run test:e2e -- ai-agent`, `npm run ai:check`, `npm run ai:eval`, scripted `npm run ai:regression`, frontend `vitest src/components/ai-agent src/hooks/useAiChat src/lib/api/aiAgent`, `playwright e2e/ai-agent.spec.ts`.

### S2 — Credentials & Public Profile (tasks 1, 10, plus the hours display fix)
- **Objective:** a working public proof page and a privacy-safe CV.
- **Owns:**
  - backend `backend/src/verifications/**`, `backend/src/volunteers/**` (CV only), `backend/package.json` (`qrcode`), `backend/src/admin/stats.service.ts` (hours only)
  - frontend `app/[locale]/(shared)/verify/**`, `app/[locale]/(shared)/volunteers/[username]/**`, `(public)/talents/PublicTalentCard.tsx`, `admin/volunteers/AdminVolunteersPage.tsx` (hours only), `lib/api/verify.ts`, `lib/api/publicTalent.ts`, `hooks/usePublicTalent.ts`, `hooks/useVerify.ts`, `messages/verify/*`, `messages/public-talent/*`, `volunteer/experiences/ExperienceCard.tsx`, `lib/api/orgRecords.ts` (link only)
  - optionally `components/shell/PublicFooter.tsx` for a "Verify a certificate" link
- **Dependencies:** D2 resolved (Option A), D3 resolved (add `qrcode`), D4 resolved (display conversion). Task 1 should finish first, because the CV footer references `/verify`.
- **Conflict risks:** `gate-responsive.spec.ts` (append); `.env.example` (`FRONTEND_URL`).
- **Deliverables:** verify form and result pages; PDF with an absolute URL and QR; the CV print page (Option A); the hours fix; tests.
- **Independent tests:** `npx jest src/verifications src/volunteers`, `npm run test:e2e -- attestation verifications core-loop`, vitest for the new API and hooks, Playwright `public-talent.spec.ts`, `volunteer-credentials.spec.ts` and a new `verify.spec.ts`.

### S3 — Discovery & UX (tasks 5, 8, 7 [except the launcher], then 3)
- **Objective:** a favorites page, cleaner opportunity presentation, mobile fixes, consistency.
- **Owns:**
  - backend `backend/src/favorites/**`, `backend/src/opportunities/dto` + `listPublic` (only for the `mode` filter)
  - frontend `components/shell/**` (except `PublicFooter.tsx` if S2 takes it), `components/ui/**`, `app/[locale]/volunteer/favorites/**`, `volunteer/opportunities/**`, `(public)/opportunities/**`, `(public)/PublicLandingPage.tsx`, `(shared)/opportunities/**`, `(shared)/orgs/**`, `admin/dashboard/AdminDashboardPage.tsx`, `org/opportunities/OrgOpportunitiesPage.tsx` (RTL nudge), `lib/api/{favorites,feed,publicOpportunities,publicOrgs}.ts`, `hooks/{useFavorites,useFeed,usePublicOpportunities,usePublicOrgs}.ts`, `messages/{common,volunteer-home,public-orgs,opportunityDetails,volunteer-favorites}/*`
- **Dependencies:** D1 resolved (organizations in scope).
- **Conflict risks:**
  - `gate-responsive.spec.ts` (append)
  - `OpportunityCard.tsx` changes show up in the org editor preview (no other session owns it)
  - `components/ui/Button.tsx` (`ButtonLink`): announce it, since S1 and S2 may want to use it after merge
- **Deliverables:** the favorites page plus nav; card and detail improvements; mobile search; the launcher-free nav (in coordination with S1); a UI review note.
- **Independent tests:** `npx jest src/favorites src/opportunities`, vitest (favorites, feed, Shell, parity), Playwright `volunteer-home`, `opportunity-details`, `public-orgs`, `shell`, `toast`, `gate-responsive` at 375/768/1280.

### S4 — QA (task 4)
- **Objective:** a trustworthy baseline now, and a release-gate regression at the end.
- **Owns:** new test files only: `frontend/e2e/full-stack/**` (new), `frontend/playwright.fullstack.config.ts` (new), `backend/test/e2e/*.e2e-spec.ts` additions, and test-only fixes for the 23 tsc errors in test files.
- **Must not edit** feature source files. Defects found go to the owning session.
- **Deliverables:** a baseline report; the toast-spec root cause; the full-stack smoke suite; the final regression report.

---

## 9. Shared Files and Conflict Risks

| File | Sessions | Risk | Rule |
|---|---|---|---|
| `backend/src/ai-agent/**` (uncommitted today) | S1 | **High** before Checkpoint 0 | Nobody branches until it is committed |
| `backend/test/ai-baseline/*` | S1 (tasks 6, 9) | Medium | Only S1 runs `ai:regression`; regenerate once per task, last |
| `frontend/e2e/gate-responsive.spec.ts` | S2, S3 | Low | One-line route appends; the second merger resolves |
| `frontend/src/messages/common/{en,ar}.json` | S3 (owner) | Low | S2 and S1 use their own namespaces |
| `frontend/src/components/ui/*` | S3 (owner) | Low | Others consume and do not edit; S3 announces new primitives |
| `components/ai-agent/*`, `useAiChat.ts`, `lib/api/aiAgent.ts` | S1 (owner) | Medium | S3 asks S1 for the launcher offset |
| `components/shell/*` | S3 (owner); S2 may edit `PublicFooter.tsx` only | Low | Agreed split |
| `attestation-document.ts` | S2 | — | Single owner (tasks 1 and 10) |
| `PublicTalentProfilePage.tsx` | S2 | — | Single owner (CV button and hours) |
| `PublicOpportunityDetailsPage.tsx` | S3 | — | Single owner (tasks 5 and 8) |
| `volunteer/opportunities/OpportunityCard.tsx` | S3 | Medium (also the org editor preview) | Check `OpportunityEditor.tsx:1572` |
| `backend/package.json`, lockfiles | S2 | Medium | Only S2 adds dependencies; others rebase on it |
| `backend/.env.example`, `render.yaml` | S1 (AI keys), S2 (`FRONTEND_URL`) | Low | Edit different sections |
| `frontend/src/lib/query/keys.ts` | — | — | Factory only; hooks add domains locally, so it needs no edits |
| `openspec/changes/*` | each session its own change dir | None | One change per session |

---

## 10. Integration and Testing Strategy

### 10.1 Contracts to agree before coding
1. **`cards` SSE event** (S1 internal, but freeze it before the frontend work): D5 resolved, and the grounding spec now allows it. The type is in §5, task 9. Emitted at most once, after sanitize and before `done`. Max 6 cards. Every card `href` must also appear among the answer's allowlisted links; `sources` stays forbidden.
2. **Verify URL format** (S2 ↔ everyone who prints or copies it): `${FRONTEND_URL}/${locale}/verify/${CODE}`; the locale-less `/verify/CODE` must also keep working (middleware redirect, verified).
3. **Hours unit** (S2 ↔ S3, whose favorites and talent cards may show hours): the stored `stats.volunteerHours` is minutes, and every display converts it with `hoursFromMinutes`.
4. **Favorites summary shape** (S3 internal): if extended, `{title, slug, status, applicationDeadline?, organization?}`, additive only.

### 10.2 Integration checkpoints
| CP | When | What |
|---|---|---|
| CP0 | Before branching | Commit and merge the model-first AI work; baseline tests (S4) |
| CP1 | S1 task 2, and S2 task 1 backend, done | Merge to `main` (both small). The others rebase |
| CP2 | S3 favorites + S2 verify page done | Merge; S4 runs the Playwright gate suite (`gate-*`, route coverage) |
| CP3 | S1 task 6 done (new baselines) | Merge; the `ai:eval` before/after table goes into the PR |
| CP4 | S1 task 9, S2 task 10, S3 tasks 8/7/3 done | Merge in the order S2 → S3 → S1 (S1 is the largest diff and resolves last) |
| CP5 | All merged | S4 final regression (§10.4) |

### 10.3 Core workflow test plan (task 4)

| # | Journey | Existing coverage | Gap / to add | Expected result |
|---|---|---|---|---|
| J1 | Org registers → verifies email → submits dossier | API: `core-loop.e2e-spec.ts`; UI (mocked): `auth.spec.ts`, `org-onboarding.spec.ts` | Full-stack UI smoke | Org reaches the `pending` verification state; dashboard shows the dossier submitted |
| J2 | Admin approves / rejects org | API `:403`; UI mocked `admin-manage.spec.ts` | Full-stack; rejected → resubmit (**Unverified** in UI) | `pending→verified`; the publish gate opens |
| J3 | Org creates and publishes an opportunity with positions | API `:447`; UI mocked `org-opportunities.spec.ts` | Full-stack; close/cancel/complete e2e (**Missing**) | `draft→published`; visible on `/opportunities` and in the AI tool results |
| J4 | Volunteer discovers, saves and applies | API `:467`; UI mocked `opportunity-details.spec.ts`, `volunteer-home.spec.ts`; toast spec **failing** | Favorites page; mobile 375 run; fix the toast spec | Application `pending`; the favorite appears on the favorites page; Save state stays in sync on every surface |
| J5 | Org reviews and accepts | API; UI mocked `org-review.spec.ts` | Full-stack | `pending→under_review→accepted`; a participation is created; the start job moves it `accepted→active` |
| J6 | Volunteer submits a contribution with evidence | API `:512`; UI mocked `submit-contribution.spec.ts` | Mobile 375 run; full-stack upload | Submission `draft→submitted` |
| J7 | Org verifies the contribution | API `:540`; rollback `:657` | Full-stack | Submission approved; an experience is created with a code; `stats` incremented (**hours in minutes**) |
| J8 | Volunteer downloads the attestation | API: attestation e2e (12 tests); UI mocked `volunteer-credentials.spec.ts` | Assert the absolute URL (+ QR) in the PDF | PDF streamed; contains the code and the absolute verify URL |
| J9 | Public verifies a code (form and QR deep link) | API `:781`; **UI Missing** | New `verify.spec.ts` (mocked) + full-stack | Valid code → proof card; invalid or replaced → not-found state; no private fields |
| J10 | Public views the profile and downloads the CV | API `:795`; UI mocked `public-talent.spec.ts` | CV privacy tests | CV shows only gated public data; never `fullName`; hours correct |
| J11 | AI assistant answers with cards (ar and en) | Backend orchestration e2e; UI mocked `ai-agent.spec.ts` | `cards` event tests; Arabic hamza queries | Answer with links plus matching cards; no `sources` event; Arabic queries like "فرص في الجزائر" retrieve the right chunks |

**Full-stack smoke (new, S4):**
- Config: `frontend/playwright.fullstack.config.ts`, running against a real backend (`npm run start:dev` with `seed:demo`) and `next start`.
- Scope: J1 → J9 happy path, one run each in `en` and `ar`, plus J4/J6 at 375px.
- Keep it short, about 10 tests. Its job is to catch contract drift that the mocked specs cannot see.
- **Unverified:** whether `seed:demo` produces a state suitable for this (to check in the S4 baseline).

### 10.4 Final regression (CP5, S4)
- Backend: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run ai:check`, `npm run ai:eval`, `npm run build`.
- Frontend: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` (all 30+ specs), the full-stack smoke.
- Manual: the demo script in both locales, light and dark, at 375/768/1280, with the deployed env (`AI_AGENT_MAX_OUTPUT_TOKENS`, `FRONTEND_URL`).
- `openspec validate --strict` for all new changes.

### 10.5 Merge conflict prevention
- Short-lived branches; rebase on `main` at every checkpoint.
- Single-owner rule (§9); no drive-by edits outside the owned paths.
- No formatting-only changes (do not run `npm run format` across the repo).
- No refactors before the presentation (card unification, guard consolidation and schema merging are recorded as follow-ups).

---

## 11. Risk Assessment

| Risk | Task | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Uncommitted AI work lost or conflicting | 2, 6, 9 | High if ignored | High | Checkpoint 0 first |
| Cards seen as violating grounding | 9 | Low | Medium | D5 resolved: the spec now allows `cards` for linked entities; keep `sources` forbidden and filter cards to sanitized links |
| Orchestrator complexity (3 paths + deterministic fallbacks) | 9 | Medium | High | Emit from one helper called after `sanitizeAnswer`; cover each path in tests; cards are additive, so the text answer still works if they are missing |
| pdfkit cannot shape Arabic | 1 (ar attestation PDF) | Medium | Medium | The CV uses Option A (browser print); keep the existing Arabic attestation limitation or handle it inside Task 1 |
| Hours shown 60× too large on stage | 10 (and the existing profile) | Certain today | Medium (credibility) | Display conversion in S2 early |
| Normalization shifts BM25 scores and router thresholds | 6 | Medium | Medium | Benchmark first; non-destructive variants at 0.5 weight; re-run ai:eval and regression; recheck `routerMinScore` |
| Render env keeps 400 | 2 | Medium | Low | Deploy checklist item |
| Higher output reservation exhausts the daily budget during the demo | 2 | Low–Medium | Medium | Check `dailyTokenBudget=150000` against the expected demo turns |
| Organization favorites expand task 5 | 5 | Medium | Medium | D1 resolved: yes; include the backend work and third tab in S3 |
| Toast e2e failures hide real regressions | 4 | Medium | Medium | S4 root-causes them first |
| `OpportunityCard` change breaks the org editor preview | 8 | Low | Medium | Visual check of `OpportunityEditor.tsx:1572` |
| Brute-force enumeration of verification codes on a public page | 1 | Low (32^8 space) | Low | Per-route `@Throttle` |
| New `qrcode` dependency | 1 | Low | Low | D3 resolved: yes; it is small and well-known |

---

## 12. Prioritized Execution Order

### Decisions (resolved 2026-11-04)
| ID | Question | Resolution | Scope consequence |
|---|---|---|---|
| D1 | Favorite organizations too? | **Yes.** Organizations are required alongside opportunities and volunteers. | Task 5 adds `organization` to `FAVORITE_TARGET_TYPES`, the organization toggle/lookup/summary branches, a save button on the public organization profile, a third favorites tab, and a favorites spec delta. Size becomes M–L. |
| D2 | CV renderer | **Option A: browser print-to-PDF.** | Build the print page and use `window.print()`. Option B (pdfkit download) is post-presentation; no Arabic font asset or shaping spike is in scope. |
| D3 | Add `qrcode` to the backend | **Yes.** | Task 1 renders a QR PNG in the attestation PDF next to the absolute verify URL. Only S2 adds the dependency. |
| D4 | Hours unit | **Keep minutes in storage; convert only at display.** | No migration or rename. Use `hoursFromMinutes` on every display surface, including admin. |
| D5 | Spec amendment for a `cards` event | **Yes, with `sources` still forbidden.** | `openspec/specs/ai-agent-grounding/spec.md` now allows at most one `cards` event, limited to allowlisted public entities already linked in the answer. No source chips or knowledge chunks. |

### Must-have (presentation-critical)
1. **Checkpoint 0** (blocking).
2. **Task 2**: tiny, removes cut-off answers in the AI demo.
3. **Task 1**: closes a visible broken link (copied proof links currently 404) and is central to the credibility story.
4. **Hours fix** (part of task 10): the number is currently wrong on public profiles.
5. **Task 5**: a complete user-facing feature; includes organization favorites (D1).
6. **Task 7 (launcher overlap + mobile search)**: small and highly visible on phones.
7. **Task 6 (hamza fold + digits only)**: a high-value bug fix in a single function.
8. **Task 4**: baseline now, final regression before the presentation.

### Should-have
9. **Task 8**: clamps, badges, the start date, the `mode` filter fix.
10. **Task 10 (Option A, D2)**: the CV print page.
11. **Task 9**: AI cards (start early in S1 because it is high-risk, but it is the first candidate to cut if time runs out; the chat works without it).

### Nice-to-have, if time remains
12. Task 6 clitic/article variants (after the hamza fix proves stable).
13. Task 10 Option B (pdfkit download, English) — post-presentation.
14. Task 3 consistency items beyond the pages already touched.

**If time is short, cut in this order:** 14 → 13 → 12 → task 9 frontend polish (keep the backend event behind the existing UI) → task 3. **Do not cut** Checkpoint 0, tasks 1, 2, 5, the hours fix, or the final regression.

### Timeline by session (parallel lanes)
```
CP0 ──┬─ S1: T2 ─▶ T6 (hamza+digits) ─▶ T9 backend ─▶ T9 frontend ─▶ T6 clitics*
      ├─ S2: T1 page ─▶ T1 QR (D3) ─▶ hours fix (D4) ─▶ T10 Option A (D2)
      ├─ S3: T5 (incl. org favorites, D1) ─▶ T7 ─▶ T8 ─▶ T3
      └─ S4: baseline + toast root cause ─▶ full-stack smoke ─▶ (CP5) final regression
* = nice-to-have (post-presentation candidate)
```

---

## 13. Final Pre-Presentation Checklist

**Repository and process**
- [ ] Model-first AI work committed and merged; openspec changes archived as appropriate
- [ ] Each session merged through its checkpoint; no edits outside owned paths
- [ ] `openspec validate --strict` passes for every new change

**Features**
- [ ] `/en/verify/<CODE>` and `/ar/verify/<CODE>` show the proof; the code-entry form works; an invalid code shows a clean not-found state; locale-less `/verify/<CODE>` redirects
- [ ] The attestation PDF prints an absolute verify URL and a QR code, and scanning or opening it reaches the page
- [ ] AI answers are no longer cut at about 400 tokens; the Render env `AI_AGENT_MAX_OUTPUT_TOKENS=1000` is set and all three clamps allow it
- [ ] The Arabic queries "الجزائر", "مسؤول", "الأسئلة الشائعة" retrieve the correct knowledge (ai-eval before/after recorded)
- [ ] AI chat shows opportunity, organization and stats cards that match the answer's links; no `sources` event
- [ ] Favorites page lists saved opportunities, volunteers and organizations, unsave works, closed targets are labelled, counts are correct, the Save state is synced across pages
- [ ] Opportunity cards are clamped, badges show, the public `mode` filter no longer produces empty pages, the detail page shows the start date and translated mode
- [ ] The AI launcher does not cover the bottom nav at 375 and 768 in **both** LTR and RTL; signed-in users can search on phones
- [ ] Volunteer hours display correctly on the profile, the talent cards and the admin pages
- [ ] The CV print page shows only public, gated data; no `fullName`; no private or unverified experiences; it prints cleanly in Arabic and English

**Quality gates**
- [ ] Backend: lint, `npm test`, `npm run test:e2e` (incl. `core-loop`), `ai:check`, `ai:eval`, build all pass
- [ ] Frontend: `tsc --noEmit` (incl. the 23 test-file errors fixed), lint, vitest, build, full Playwright suite (toast spec fixed), full-stack smoke all pass
- [ ] i18n parity tests pass for every new and changed namespace (`en` and `ar`)
- [ ] `gate/route-coverage.test.ts` passes (all new routes listed in `gate-responsive.spec.ts`)

**Demo readiness**
- [ ] Demo data seeded (`seed:demo`) with at least one verified experience (a known code), one published opportunity per demo wilaya, and one complete public volunteer profile
- [ ] Demo script rehearsed in Arabic and English, desktop and phone, light and dark
- [ ] AI daily token budget checked against the planned number of demo turns; a fallback plan if the provider is unavailable (the deterministic browse fallback exists)

---

### Appendix: Items that could not be verified
- The live Render value of `AI_AGENT_MAX_OUTPUT_TOKENS`.
- Whether Gemini thinking tokens count against `max_output_tokens`.
- The current pass rate of the backend unit and e2e tests (no artifact), and whether lint, tsc and vitest are still clean after the commits and uncommitted changes since 2026-10-30.
- The root cause of the 7 `toast.spec.ts` failures.
- Whether pdfkit/fontkit can shape Arabic acceptably with a bundled font.
- Whether `seed:demo` gives a state that supports the full-stack smoke.
- The visual confirmation of the launcher/bottom-nav overlap and of the org-profile `startAt` field mismatch (both found in code).
- Whether a rejected organization can resubmit its dossier through the UI end to end.
