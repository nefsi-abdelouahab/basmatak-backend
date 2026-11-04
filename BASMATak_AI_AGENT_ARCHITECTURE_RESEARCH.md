# Basmatak Tatatoua — AI Agent Architecture Research

**How "Basma" can become a secure, role-aware agent, based on what the code does today**

| | |
|---|---|
| Date | 4 November 2026 |
| Nature | Audit and architecture research. No source file was changed. This report is the only file created. |
| Repository | `basmatck/`: outer repo on branch `ai-agent-session-2` (HEAD `3e6add8`), with nested repos `backend/.git` (`main` @ `639f3ca`) and `frontend/.git` |
| Code state audited | The **working tree**. It includes the uncommitted Phase 1 "model-first" work: 26 modified files under `backend/src/ai-agent/`, the new `get-opportunity-details` / `get-organization-details` tools, `recent-entities.ts`, and `openspec/changes/model-first-ai-intent-and-tools/` |

### How to read this report

- **EXISTING** means verified in source, with a file reference. **PROPOSED** means a recommendation that does not exist yet.
- Capability status icons: ✅ implemented · 🟡 partially implemented · 💤 exists but unused · ❌ missing · 📄 documented or proposed only.
- Paths are relative to the repository root. `file.ts:NN` line numbers refer to the working tree on 4 November 2026. Backend source paths under `backend/src/` are sometimes shortened to their module path (for example `ai-agent/tools/tool.types.ts`).

### Method and limits

- **What I read directly.** Backend authentication, guards, users, and the whole of `backend/src/ai-agent/` (controller, orchestrator, router, prompt builder, tools, knowledge, providers, quota, SSE). I also read the AI documents in `docs/`, the open OpenSpec change, and the repository's own baseline measurements.
- **What was audited in parallel.** The frontend and the business-domain modules were each covered by a separate read-only pass. I re-checked their highest-impact claims in source; Appendix B lists them.
- **What I could not inspect:**
  - **Runtime behaviour.** No server, test or eval was run.
  - **Production data.** There was no database access. The data-volume and data-quality judgements in §15 are inferred from schemas only.
  - **`backend/.env`.** It holds secrets and was deliberately not opened.
  - **Live provider quotas and prices.** These come from the repository's own measurements and were not re-verified.
  - **Other areas.** The `design/` mockups, the media module beyond its ownership seam, and the non-AI documents other than `docs/DEPLOY.md`.

---

## 1. Executive Summary

**Today, Basma is an anonymous, public-data, read-only assistant.** This is built into four independent layers, so role-awareness cannot be added as a switch. All four have to change together:

| Layer | Why it is anonymous today | Evidence |
|---|---|---|
| Transport | `POST /api/v1/ai-agent/chat` is `@Public()`. The widget's `fetch` sends no `Authorization` header. | `backend/src/ai-agent/ai-agent.controller.ts:101-102`; `frontend/src/lib/api/aiAgent.ts:535-547` |
| Tools | A tool handler has the signature `(input: unknown) => …`. It cannot know who is asking. | `ai-agent/tools/tool.types.ts:56` |
| Policy | `isPrivateDataRequest()` refuses first-person questions about accounts or applications before any routing happens. | `ai-agent/orchestrator/answer-policy.ts:235-270`, called at `ai-agent.orchestrator.ts:689` |
| Knowledge | The corpus tells users that Basma "does not sign in" and that role tailoring is "a future direction". | `backend/ai-agent/09-ai-agent/capabilities/en.md`, `future-roadmap/en.md` |

**Main findings**

1. **The authorization logic the agent needs already exists. The agent must not re-implement it.**
   - Domain services take an `AccountToken` and enforce ownership internally. Eight services resolve the caller's organization with `requireOwnOrganization(account)` → `OrganizationsService.findByUserId(account.sub)`.
   - Status changes are whitelisted by `StatusTransitionService.assert`.
   - The critical writes (accepting an application, verifying a submission) run in transactions.
   - **Recommendation:** agent tools should be thin adapters that call these service methods with an `AccountToken` the server resolved itself.
2. **Calling a service directly skips the route-level protections.** Role, suspension, email-verification and maintenance checks run as global guards on HTTP routes (`backend/src/app.module.ts:100-105`), not inside services. The code already notes that `@Public` routes skip the status guards (`organizations.service.ts:222-227`). A role-aware chat endpoint must therefore:
   - re-establish identity, a live session, account status, email verification and role before any tool runs;
   - have every tool re-check its own role requirement.
3. **Recommended architecture: one shared agent, with role profiles held as data and authority held by the backend.**
   - One orchestrator, one provider and one safety pipeline serve every role.
   - The backend builds an `AgentPrincipal` (who is asking) for each request.
   - A capability policy filters which tools are declared to the model, and checks again when a tool runs.
   - Writes use two phases, propose then confirm, and the model can never perform the confirmation.
   - Separate agents per role and sub-agent orchestration are both rejected for now. Each multiplies provider calls, and the global budget is 80 requests per day (§5.2).
4. **Model-first is the right direction for reads, but cost and quota are the real constraint.** The repository's own Phase 1 measurement (`backend/test/ai-baseline/phase-1-comparison.md`):

   | Dialogue set | Model-first | Router-first |
   |---|---|---|
   | Baseline (scripted) | 40/40 | 37/40 |
   | Generalization (scripted) | 30/30 | 15/30 |

   - Model-first used 2.36–2.95× the input tokens.
   - Live runs were blocked by the provider's limit of 7,000 input tokens per minute.
   - Role tools add declarations to every turn, so declarations must be scoped by role and grouped.
5. **An agent would amplify several existing platform defects.** Each should be fixed before the tool that touches it ships (§16.4):
   - Anonymous opportunity details show participants' names regardless of their privacy flags.
   - Favorites return the titles of draft opportunities.
   - A suspended organization's opportunities stay listed and keep accepting applications.
   - `volunteerHours` is incremented by minutes.
   - Removing a participant does not free the seat.
   - The audit log records no business `POST`.
6. **Phases 1–3 need no new infrastructure.**
   - A MongoDB TTL collection, the same pattern as `sessions.expiresAt`, is enough to hold pending actions.
   - In-process BM25 search is still adequate for the curated corpus of 139 Markdown files.
   - Nothing yet justifies a vector database, a queue, Redis or an agent framework.

**Decisions at a glance**

| Question | Recommendation | Section |
|---|---|---|
| One agent or one per role? | One shared agent, with role profiles held as data | §5.2 |
| Who authorizes an action? | The backend only: principal resolver, then capability policy, then the existing service ownership checks | §5, §9 |
| A new chat endpoint per role? | No. Keep `POST /ai-agent/chat` and make it optionally authenticated. Add only `POST /ai-agent/actions/:id/confirm` and `/cancel`. | §8 |
| How are writes performed? | Two phases. A tool **proposes**; the server stores a pending action; the user clicks a confirmation card that the server rendered; the confirm endpoint re-authorizes and executes. | §10.3 |
| Router-first or model-first? | Hybrid. The model chooses tools, but only within a role-scoped set that the router has pre-filtered. Writes and degraded modes stay deterministic. | §12 |
| Upgrade the RAG? | Keep BM25. Add `audience` metadata and filter by role. Measure recall before considering embeddings. | §11 |
| Memory? | Keep the history held by the client. No long-term memory. The server keeps state only for pending actions. | §13 |
| Generative UI? | A typed `ui` SSE event built by the server from tool results, never from model text | §14 |
| ML? | Improve the existing heuristic recommender now. Consider supervised models only after the label-quality defects are fixed and enough outcomes have accumulated. | §15 |

---

## 2. Platform Architecture and Business Logic Overview

### 2.1 Stack and deployment (EXISTING)

| Layer | Technology | Evidence |
|---|---|---|
| Backend | NestJS 10, Mongoose 8, passport-jwt, class-validator, `@nestjs/throttler`, `@nestjs/event-emitter`, pdfkit, `@google/genai` | `backend/package.json` |
| Database | MongoDB (Atlas M0 in production) | `backend/.env.example`, `docs/DEPLOY.md:1` |
| Hosting | Render free plan with a single instance. It sleeps after about 15 minutes idle; a cold start takes about a minute. | `render.yaml`, `docs/DEPLOY.md:10` |
| API prefix | `/api/v1` | `backend/src/main.ts:78` |
| Frontend | Next.js 14 (App Router), React 18, TanStack Query v5, axios, zod, next-intl (`en`, `ar`; no French UI) | `frontend/src/i18n/routing.ts`, `frontend/src/lib/query/provider.tsx` |
| Frontend tokens | `localStorage` key `basmatak.auth.tokens` holding `{accessToken, refreshToken}` | `frontend/src/lib/auth/storage.ts` |

**What this means for the agent.** Some state lives only in process memory: quota windows, the Groq interaction-replay map and the BM25 index. All of it is lost on every sleep or deploy. Anything that must survive a restart, such as a pending action waiting for confirmation, belongs in MongoDB.

### 2.2 Backend modules (EXISTING)

| Module | Responsibility relevant to the agent |
|---|---|
| `auth/` | Registration (`register/volunteer`, `register/organization`), login, rotated refresh sessions, `me`, `JwtAuthGuard`, `OptionalJwtAuthGuard`, `EmailVerifiedGuard` |
| `users/` | The `users` collection: `role`, `status`, `emailVerifiedAt` |
| `common/` | `RolesGuard`, `SuspendedGuard`, the `@Public` / `@Roles` / `@CurrentAccount` decorators, `BusinessException`, validation pipe, seams (`publish-gate`, `media-ownership`, `org-public-stats`, …) |
| `core/` | `AuditInterceptor` (global), `StatusTransitionService` with its registry, settings, maintenance, internal jobs |
| `opportunities/` | Opportunity CRUD and lifecycle, embedded positions, the public feed, `getRecommended` |
| `applications/` | Apply, review, accept, reject, withdraw |
| `participations/` | `task_participants`, plus the organization dashboard (`OrgDashboardService`) |
| `submissions/` | Contribution evidence: draft → submitted → reviewed |
| `verifications/` | Verify or reject submissions, volunteer experiences, PDF attestation, public proof via `/verify/:code` |
| `organizations/`, `volunteers/` | Profiles, public cards, talents, profile completion |
| `favorites/`, `portfolio/`, `reviews/`, `reports/`, `notifications/`, `activity/`, `trust/` | Saved items, portfolio, ratings, abuse reports, notifications, activity feeds, reliability and the publish gate |
| `admin/` | Analytics, stats, moderation, verification of organizations, users, settings, audit-log reads |
| `ai-agent/` | Basma (§3) |

### 2.3 Request pipeline and guards (EXISTING)

Six global guards run in declaration order (`app.module.ts:100-105`):

```mermaid
flowchart LR
  R[HTTP request] --> J[JwtAuthGuard<br/>Bearer JWT unless @Public]
  J --> S[SuspendedGuard<br/>re-reads users.status from DB]
  S --> E[EmailVerifiedGuard<br/>env flag + setting]
  E --> RG[RolesGuard<br/>req.user.role vs @Roles]
  RG --> M[MaintenanceGuard<br/>503 unless admin/allowlist]
  M --> T[ThrottlerGuard<br/>100 req / 60 s default]
  T --> RL[Route-level guards<br/>e.g. OptionalJwtAuthGuard]
  RL --> C[Controller → Service]
```

How these guards behave matters directly for the agent design:

1. **The JWT carries `{ sub, role, sessionId }`, and `JwtStrategy.validate()` returns it as-is** (`auth/jwt.strategy.ts`). The signature and expiry are checked. The session row is not.
2. **`RolesGuard` trusts the `role` claim from the token** (`common/guards/roles.guard.ts:31-32`). It does not re-read the role. No route changes `users.role`; the role is set once at registration, and the admin is created by the seed script. A stale claim is therefore not a practical risk today.
3. **`SuspendedGuard` re-reads `users.status` on every request** (`common/guards/suspended.guard.ts`), but only when `req.user` is already set.
4. **On `@Public` routes, `JwtAuthGuard` does not run**, so `req.user` is empty while the global guards execute. `OptionalJwtAuthGuard` is route-level, so it runs **after** the global guards. A token it attaches has therefore never been checked for suspension, email verification or session liveness. `OrganizationsService.isEligibleViewer()` (`organizations.service.ts:222-250`) exists for exactly this reason. It checks `user.status === 'active'` and that a session row exists that is unrotated and unexpired. **This is the pattern the agent must reuse.**
5. **Logout deletes the session row** (`auth.service.ts:240-241`), but an access token stays valid until it expires (`JWT_ACCESS_TTL` defaults to `15m`, `auth/auth.module.ts:44`). Only checks of the `isEligibleViewer` kind detect a logged-out session.
6. **Validation** uses `AppValidationPipe` with `whitelist` and `forbidNonWhitelisted`, so unknown fields are rejected at the pipe.

### 2.4 Domain model (EXISTING)

```mermaid
erDiagram
  USERS ||--o| ORGANIZATIONS : "owns (unique userId)"
  USERS ||--o| VOLUNTEER_PROFILES : "has (unique userId)"
  ORGANIZATIONS ||--o{ OPPORTUNITIES : publishes
  OPPORTUNITIES ||--|{ POSITIONS : "embeds"
  USERS ||--o{ APPLICATIONS : "volunteerId"
  POSITIONS ||--o{ APPLICATIONS : "positionId"
  APPLICATIONS ||--o| TASK_PARTICIPANTS : "on accept"
  TASK_PARTICIPANTS ||--o| SUBMISSIONS : "one per participation"
  SUBMISSIONS ||--o| VERIFICATIONS : decision
  SUBMISSIONS ||--o| VOLUNTEER_EXPERIENCES : "on verify"
  SUBMISSIONS ||--o| REVIEWS : "rating 1-5"
  ORGANIZATIONS ||--o{ ORGANIZATION_VERIFICATIONS : dossier
  USERS ||--o{ FAVORITES : saves
  USERS ||--o{ PORTFOLIO_ITEMS : owns
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ REPORTS : files
```

**Ownership facts the agent relies on**

- **Every `volunteerId` is a `users._id`, not a profile id.** For example, `ApplicationsService.apply` sets `volunteerId: account.sub`.
- **An organization is 1:1 with its user account.** `OrganizationSchema.index({ userId: 1 }, { unique: true })` is at `organizations/schemas/organization.schema.ts:137`. There are no organization members or sub-roles. "Organization membership" therefore just means `organizations.userId === account.sub`.
- **Positions are embedded in the opportunity** (`positions[]`, with `requiredCount`, `filledCount`, `requiredSkills[]` and `deliverables[]`).
- **There is no `deletedAt` on domain documents.** Deletion is expressed as `status: 'deleted'` on `users` and `organizations`.

### 2.5 Status machines (EXISTING)

Each module registers its legal transitions in `onModuleInit`. `StatusTransitionService.assert` enforces them and writes `status_histories` rows, which record the actor, `from`, `to`, the reason and notes.

| Entity | Legal transitions | Who triggers them |
|---|---|---|
| `opportunity` | `draft→published`<br>`published→in_progress`<br>`in_progress→completed`<br>`published\|in_progress→closed`<br>`published\|in_progress→cancelled` | **Organization:** publish, close, cancel, complete<br>**System:** start ticker<br>**Admin:** `setStatus`, moderation actions |
| `application` | `pending→accepted\|rejected\|withdrawn\|under_review`<br>`under_review→accepted\|rejected\|withdrawn`<br>`accepted→withdrawn` | **Organization:** start-review, accept, reject<br>**Volunteer:** withdraw |
| `task_participant` | `accepted→active`<br>`accepted\|active→completed\|withdrawn\|removed` | **Created** when an application is accepted<br>**Organization:** verify (→ completed), remove<br>**Volunteer:** withdraw |
| `submission` | `draft→submitted→under_review→approved\|rejected`<br>`rejected→draft` | **Volunteer:** submit, edit after rejection<br>**Organization:** start-review, verify, reject |
| `organization` | `pending→verified\|rejected`<br>`rejected→pending`<br>`active↔suspended` | **Admin:** approve, reject, set status<br>**Organization:** resubmit the dossier |
| `user` | `active↔suspended` | **Admin** |
| `report` | `open→in_review\|resolved\|dismissed`<br>`in_review→resolved\|dismissed` | **Admin** |

### 2.6 Workflows as they exist (EXISTING)

1. **An organization registers and is verified.**
   - Registration creates the organization with `verificationStatus: 'pending'` and `status: 'active'`.
   - The organization uploads documents and calls `POST /organizations/me/verification`.
   - An admin approves or rejects it: `AdminOrganizationsService.approve` / `reject`, which emits `OrgVerificationUpdated`.
2. **An opportunity is created and published.**
   - `createOpportunity` creates a draft. This needs no verification.
   - `publishOpportunity` requires `verificationStatus === 'verified' && status === 'active'` (`opportunities.service.ts:450-451`), and then the publish gate:
     - `PUBLISHING_DISABLED` is returned when the `ops.publishingEnabled` setting is off.
     - The gate locks once the number of opportunities with pending contributions reaches `publishGate.maxPendingOpportunities`, which defaults to 3.
   - There is no review queue before publication. Moderation happens afterwards, through an admin `setStatus` or a report action.
3. **A volunteer applies and becomes a participant.**
   - `apply` requires an opportunity that is `published`, with its deadline not passed and a free seat.
   - The organization can `startReview`, then `acceptApplication` (a transaction) or `rejectApplication` (a reason is mandatory).
   - Accepting increments `filledCount` and creates the `task_participants` row.
4. **The volunteer submits evidence and gets a verified experience.**
   - The volunteer creates a draft submission, adds evidence and consent, then submits.
   - The organization calls `verify`. That single transaction approves the submission, completes the participation, creates the `volunteer_experiences` row with an 8-character `verificationCode`, optionally writes a review, and updates the volunteer's stats.
   - A PDF attestation is served at `/experiences/:id/attestation`. Public proof is served at `/verify/:code`.
   - **The organization never enters or approves hours.** The experience's `duration` comes from `opportunity.durationMinutes`.
5. **Favorites.** Volunteers only. A favorite targets either an opportunity or a talent.
6. **Admin.** Analytics (`overview`, `series`, `queue`), the organization-verification queue, reports with moderation actions (`unpublish_opportunity`, `close_opportunity`, `suspend_target`, `notice`), user and organization status, settings, maintenance, and audit logs.

### 2.7 Frontend (EXISTING)

- **Route areas.** Every route sits under `/{en|ar}/…`:
  - `(public)`: landing, opportunities, talents. Guest-only.
  - `(shared)`: opportunity details, organization and volunteer profiles.
  - `(auth)`: sign-in and account pages.
  - `volunteer/*`, `org/*` and `admin/*`: the role areas.
- **Gating is a client-side UX feature only.**
  - `middleware.ts` handles locales only.
  - `RequireVolunteer` and `RequireOrg` check only that the user is signed in, not their role (`frontend/src/app/[locale]/volunteer/components.tsx:28`).
  - The admin guards do check `role !== 'admin'`.
  - The real boundary is enforced by the backend.
- **Session.** `GET /auth/me`, through `useSessionQuery`, is the role source. The single axios client (`frontend/src/lib/api/client.ts`) attaches the Bearer token and refreshes it once on a 401.
- **The AI widget is mounted once, for every audience,** in `frontend/src/app/[locale]/layout.tsx:63-65`. It is not role-aware: every user gets the same three static suggestions, and the chat request is anonymous (§3.8).

### 2.8 Public data surface and reusable projections (EXISTING)

| Endpoint | Projection | What it filters | Caveat for agent reuse |
|---|---|---|---|
| `GET /opportunities`, `/opportunities/:idOrSlug` | `OpportunityEmbedProvider.embedCards` / `embedFull` | `status: 'published'` only | `embedFull` includes the assigned participants' `fullName`, `username` and `avatarMediaId` without checking their privacy flags (`opportunity-embed.provider.ts:344-356`). **Do not reuse it in an agent tool.** |
| `GET /organizations/:slug/opportunities` | `listOrgOpportunities` + `embedFull` | `published`, `completed` or `closed` | Same participant caveat |
| `GET /organizations` and `/organizations/:slug` | `toPublicCard` / `getPublicBySlug` | `verified`, `active` and `publicProfile.enabled` | The phone number is shown only to viewers who pass `isEligibleViewer` |
| `GET /talents`, `/volunteers/:username` | `listPublicTalents` / `getPublicProfile` | The `show*` flags are respected | The sub-routes `/experiences` and `/portfolio` ignore `showExperiences` and `showPortfolio` |
| `GET /verify/:code` | `ExperiencesService.getPublicProof` | The code acts as a bearer credential | Protected only by the global throttle |

The existing AI tools do **not** reuse these projections. They query the models directly with their own `.select()` allowlists (§3.6). That avoids the participant leak, but it duplicates the rules for what counts as public.

---

## 3. Existing AI Agent Technical Audit

### 3.1 Module inventory (EXISTING, `backend/src/ai-agent/`)

| Area | Files | Responsibility |
|---|---|---|
| Transport | `ai-agent.controller.ts`, `dto/chat.dto.ts`, `sse/sse-writer.ts` | `GET /ai-agent/status` and `POST /ai-agent/chat` (both `@Public`). The SSE lifecycle and its 15 s heartbeat. Validation: message ≤ 2,000 characters, history ≤ 6 messages and ≤ 4,000 characters, `locale ∈ {en, ar}`. |
| Usage | `usage/usage.controller.ts`, `usage-meter.service.ts` | `GET /ai-agent/usage`, `@Roles('admin')` (`usage.controller.ts:21`). Aggregate counters. A structured log line that carries no content. |
| Quota | `budget/quota.service.ts`, `token-estimator.ts` | In-memory windows per IP and global, a concurrency limit and a daily token budget. `ipWindows` is a `Map` (`quota.service.ts:96`). |
| Config | `config/ai-agent.config.ts`, `ai-agent.constants.ts` | Typed env parsing with hard clamps. The kill switch (`AI_AGENT_ENABLED` must be the literal `true`). `AI_AGENT_MODEL_FIRST`. |
| Orchestration | `orchestrator/ai-agent.orchestrator.ts` (3,330 lines) | The policy guards, router-first and model-first paths, provider/tool loops, deterministic fallbacks, and the post-answer guards |
| Answer guards | `orchestrator/answer-policy.ts`, `answer-sanitizer.ts`, `answer-links.ts`, `promise-guard.ts`, `citations.ts` | Private-data refusal, answer caps per mode, contact redaction, link allowlist, leak detection, the unbacked-promise guard |
| Routing | `router/intent-router.ts` (1,448 lines) | Deterministic intent and tool selection, follow-up resolution, language detection |
| Conversation state | `conversation-focus.ts`, `recent-entities.ts`, `opportunity-query.ts`, `opportunity-place.ts`, `organization-query.ts` | Parses entities and pending "did you mean" prompts out of the history the client sends. Extracts places and names. |
| Prompt | `prompt/prompt-builder.ts`, `system-prompt.ts`, `prompt.types.ts` | Tagged, escaped prompt sections, the input-token budget, and versioned system prompts |
| Providers | `llm/provider.interface.ts`, `gemini.provider.ts`, `groq.provider.ts`, `mock.provider.ts`, `fake.provider.ts`, `provider.factory.ts`, `provider-errors.ts` | A provider-neutral streaming contract and its adapters |
| Tools | `tools/*.tool.ts`, `tool-registry.ts`, `tool-executor.ts`, `tool-input.ts`, `tool.types.ts`, `mappers/*` | Seven read-only public tools; the strict registry; the bounded executor; the privacy guard |
| Knowledge | `knowledge/loader.ts`, `parser.ts`, `chunker.ts`, `normalizer.ts`, `bm25.ts`, `retriever.ts`, `knowledge.service.ts` | An in-memory BM25 index over `backend/ai-agent/` |
| Regression | `regression/*`, `src/scripts/ai-regression.ts`, `backend/test/ai-baseline/*` | Scripted and live dialogue evaluation, plus the stored baselines |

### 3.2 Execution flow today (EXISTING)

```mermaid
sequenceDiagram
  autonumber
  participant W as Widget (anonymous fetch)
  participant C as AiAgentController
  participant Q as QuotaService (IP key)
  participant O as AiAgentOrchestrator
  participant R as IntentRouter
  participant K as KnowledgeService (BM25)
  participant P as LlmProvider
  participant X as ToolExecutor
  W->>C: POST /api/v1/ai-agent/chat {message, locale, history}
  C->>C: global pipe validation, kill switch
  C->>Q: reserve(ip, est. tokens)
  alt hard denial
    C-->>W: 429 JSON + Retry-After (before SSE)
  end
  C-->>W: SSE meta {conversationId, locale, mode}
  C->>O: run({message, locale, history, mode, stream, signal})
  O->>O: isPrivateDataRequest? → fixed refusal
  O->>R: route(message, locale, history, focus)
  alt model-first flag ON
    O->>K: retrieve knowledge
    loop ≤3 provider calls, ≤2 tool rounds
      O->>P: streamTurn(system, input, all 7 tools)
      P-->>O: text | tool_calls (buffered)
      O->>X: executeMany(validated calls)
    end
  else router-first (default)
    O->>O: deterministic shortcuts (org lookup, browse, focus)
    O->>K: retrieve knowledge
    O->>P: streamTurn(system, input, router-selected tools)
  end
  O->>O: language guard, leak guard, promise guard, sanitizeAnswer
  O-->>W: SSE status… then token deltas (split from buffered answer)
  C->>Q: commit / release
  C-->>W: SSE done {finishReason, usage}
```

**Notable implementation facts**

- **The answer is buffered, not streamed from the model.** `consumeProviderTurn` collects every text delta (`ai-agent.orchestrator.ts:2819-2886`). Sanitization then runs on the complete text, and `emitAnswer` splits the result into `token` events (`:3130-3162`). The time to the first visible token therefore equals the full generation time. This trade-off is deliberate: it is what lets the leak and link guards run on the whole answer.
- **`conversationId` is generated fresh for every request** (`randomUUID()`, `ai-agent.controller.ts:112`). The client stores it but never sends it back. It is a request id, not a conversation id.
- **There is a hard upper bound on each turn:**
  - `AI_AGENT_MAX_PROVIDER_CALLS = 3`
  - at most 2 tool rounds
  - at most 3 tool calls per round
  - a 45 s total deadline
  - at most 100,000 buffered characters of provider text

  These constants are at `ai-agent.orchestrator.ts:119-126`.

### 3.3 Router-first vs model-first (EXISTING)

| Aspect | Router-first (default; `AI_AGENT_MODEL_FIRST=false`) | Model-first (flag on; Phase 1, uncommitted) |
|---|---|---|
| Who selects tools | `IntentRouter.selectToolIntents` / `resolveTools` choose by keyword topic signals and the BM25 top score | The model, choosing from **all** registered tools on **every** turn (`modelFirstTools`, `:504-509`) |
| What the router is used for | Decides the action: direct reply, deterministic lookup, or provider call | A logged-only "shadow" signal (`ai_agent_router_shadow`). It still triggers one corrective retry when it flags live data the model did not fetch (`:1101-1114`). |
| Calls that skip the provider | Greetings, thanks, capability questions, clarifications, exact organization lookups, generic browse, focused follow-ups | Only exact greetings and thanks (`isModelFirstDirectShortCircuit`, `:442-447`) |
| Tool rounds | `caps.maxToolRounds`, from `AI_AGENT_MAX_TOOL_ROUNDS` (default **1**) | **Fixed at 2** in normal mode (`:944-947`). **The env cap is ignored.** |
| Prompt | `AI_AGENT_SYSTEM_PROMPT`, version `9` | `AI_AGENT_MODEL_FIRST_SYSTEM_PROMPT`, version `2`, plus a non-trimmable `<recent_entities>` block |
| Scripted quality | 37/40 baseline, 15/30 generalization | 40/40, 30/30 |
| Cost | — | 2.36× / 2.95× input tokens; 1.68× / 2.67× provider calls |
| Live evidence | Not usable. A Groq ITPM limit of 7,000 blocked the runs; only 8 turns across all sets were served by the provider. | Same |

Source: `backend/test/ai-baseline/phase-1-comparison.md`. That file recommends keeping the flag off until there is paced live evidence and a quota review.

### 3.4 LLM provider abstraction (EXISTING)

- **The contract.** `LlmProvider.streamTurn(request, signal): AsyncIterable<LlmStreamEvent>` (`llm/provider.interface.ts:25-31`).
  - Event types: `interaction`, `text`, `tool_call`, `usage` and `finish`.
  - The request carries `systemInstruction`, `input`, `tools?`, `previousInteractionId?`, `maxOutputTokens`, `timeoutMs` and `locale`.
- **Adapters.**
  - **Gemini** uses `interactions.create`, chaining turns with `previous_interaction_id` (`gemini.provider.ts:93, 300-301`). The default model id is `gemini-3.8-flash` (`ai-agent.constants.ts`).
  - **Groq** uses the OpenAI-compatible `/chat/completions` with `tool_choice: 'auto'`. It keeps an in-memory replay map for interactions (`groq.provider.ts:169, 468`).
  - **mock** and **fake** are for tests.
  - `selectLlmProvider` picks one at boot.
- **Fallback.** `AI_AGENT_FALLBACK_ENABLED` is parsed, but no second adapter is wired up (`.env.example` says so). 📄
- **Assessment.** The abstraction is sound, and no agent framework is needed. Turn state is server-side and lasts one request only. The interaction id never reaches the client, so it cannot be used across users.

### 3.5 Prompt construction (EXISTING)

- **`PromptBuilder.build()` renders tagged sections:**
  - `<system_rules>`, `<response_style>`, `<link_rules>`, `<tools>`
  - `<knowledge>`, `<tool_results>`, `<recent_entities>`, `<conversation_focus>`, `<history>`
  - `<examples>`, `<style_examples>`, `<user_message>`

  All untrusted text is escaped so it cannot open or close a tag (`prompt-builder.ts:129-145`).
- **Budget.** Reserved sections are never trimmed. History, knowledge, tool results and examples are trimmed to fit `maxInputTokens` (default 10,000). If the reserved sections alone do not fit, the result is `PROMPT_BUDGET_EXCEEDED`, logged as `ai_agent_prompt_budget_exceeded`. Since Phase 0, tool declarations are counted in the budget but no longer pasted into the prompt.
- **System prompts.** They are static and versioned, with no interpolation. Both tell the model to treat every tagged section as untrusted data, never to claim it has acted, and never to reveal contact data or registry ids (`system-prompt.ts`).
- **What is missing for roles.** There is no principal section: nothing tells the model who the user is or what they are allowed to do. Everything is written for anonymous visitors. For example: "Never claim to … know private details about a person".

### 3.6 Tools (EXISTING)

All seven tools are registered in `ai-agent.module.ts:189-218`:

| Tool | Intent | Input (strict schema) | Data | Visibility filter |
|---|---|---|---|---|
| `search_opportunities` | `opportunity_search` | `query`, `slugs[]`, wilaya/municipality, `mode`, skill, category, `sort`, `limit`, `compact` | `opportunities`, plus skills, categories and locations for labels | Text search: `status: 'published'`. Slug lookup: `status: {$ne:'draft'}` (`search-opportunities.tool.ts:529-531`). |
| `get_opportunity_details` | `opportunity_details` | `slug` or `title` | `opportunities` | `status: {$ne:'draft'}` (`get-opportunity-details.tool.ts:131`) |
| `search_organizations` | `organization_search` | `query`, `limit` | `organizations` | `verificationStatus: 'verified', status: 'active'` |
| `get_organization_details` | `organization_details` | `slug` or `name` | `organizations` | Same |
| `search_reference_data` | `reference_lookup` | `kind`, `query` | `skills`, `locations` | `active: true` |
| `platform_stats` | `platform_stats` | none | Counts | `published` opportunities; verified and active organizations |
| `search_knowledge` | `knowledge_lookup` | `query` | The BM25 corpus | none |

**Defence layers on every tool call**

1. **The registry** accepts only frozen definitions that have `readOnly: true`, a snake_case name, a description of at most 400 characters, declared intents, and `additionalProperties: false` (`tool-registry.ts`, `register()`).
2. **The orchestrator** drops undeclared tool names, rejects calls beyond the per-round limit, and checks arguments with `validateToolArguments` (`ai-agent.orchestrator.ts:545-640, 2673-2746`).
3. **Each tool's own parser** re-validates its input with `assertAllowedKeys`, `readOptionalText`, `readOptionalCode` and the ObjectId pattern (`tool-input.ts`).
4. **The executor** enforces:
   - a 5 s timeout;
   - at most 1,200 characters per result and 3,000 characters shared across a batch;
   - shrinking by rows first and strings second;
   - a JSON-serializability check;
   - a **forbidden-key guard** that runs before and after shrinking (`tool-executor.ts:257-327`), using the keys in `FORBIDDEN_TOOL_RESULT_KEYS` (`tool.types.ts:169-203`). Examples: `_id`, `userId`, `email`, `phone`, `organizationId`, `applications`, `submissions`, `talents`, …

**Structural limitations for role-based use**

- 🟡 **There is no caller context.** `ToolHandler = (input: unknown) => …` (`tool.types.ts:56`) has no principal and no request id.
- 🟡 **Tools bypass the domain services.**
  - They inject Mongoose models directly; `ai-agent.module.ts:84-90` registers five collections.
  - So "what is public" is defined twice. The public detail route uses `published` only (`opportunities.service.ts:685,693`), while the AI tools use `$ne:'draft'`. That matches the organization archive, which lists `published`, `completed` and `closed`, but it also returns `in_progress` and `cancelled` opportunities that no public route serves.
  - Neither path checks the owning organization's `status`.
- 🟡 **One forbidden-key list serves every caller.** It is right for anonymous answers, but it would block legitimate own-data fields such as `applications` or `submissions` for authenticated tools. The guard needs to be a set per audience.

### 3.7 RAG: knowledge corpus and BM25 (EXISTING)

- **Corpus.** `backend/ai-agent/` holds 139 Markdown files (en/ar pairs) in 9 folders, from `01-about` to `09-ai-agent`, plus `data/glossary.csv`, `data/topics.json` and `_config/synonyms.json` (14 synonym groups). The whole directory is about 657 KB.
- **Pipeline.** `KnowledgeLoader` → `KnowledgeParser` → `KnowledgeChunker` → `KnowledgeNormalizer` → `BM25Index` → `KnowledgeRetriever`. It is built in memory at boot.
- **Normalization** (`normalizer.ts:327-342`):
  - lower-casing;
  - removal of Arabic diacritics and tatweel;
  - unification of alef variants to `ا`, ya variants to `ي`, and ta marbuta `ة` to `ه`;
  - stripping of Latin combining marks;
  - removal of en/ar/fr stopwords;
  - synonym expansion (weight 0.5).

  There is **no Arabic stemming or prefix stripping** in the knowledge path. Prefix lists such as `وال`, `بال` and `ال` exist only inside `search-opportunities.tool.ts`, for name matching.
- **Scoring.** BM25 with `k1 = 1.2` and `b = 0.75`. Field weights: title 3, heading 2, tag 2, body 1. A matching locale multiplies the score by 1.15, and there is a priority multiplier (`bm25.ts:20-33`).
- **Retrieval limits.** 4 chunks by default (hard maximum 6), at most 2 per source, a relative score threshold of 0.2, at most 6,000 characters (about 1,500 estimated tokens), and a 10-minute cache of 100 entries (`retriever.ts:22-35`). The router's minimum score is 1.5 (`ai-agent.config.ts:14`).
- **Metadata.** Each document has `locale`, `tags` and `priority` only (`knowledge.types.ts:39-53`). ❌ There is **no audience or role field**, although `08-faq/` is already split into `volunteer-faq`, `organization-faq` and `visitor-faq`.

### 3.8 SSE streaming (EXISTING)

- **Events.** `meta` → `status` (`searching | thinking | answering | tool`) → `token`\* → `done` | `error` (`ai-agent.types.ts:108-116`). Each frame is written as `event: <name>\ndata: <json>\n\n`. A heartbeat comment is sent every 15 s.
- **Errors before the stream starts** are JSON: 503 `AI_AGENT_DISABLED`, and 429 with `Retry-After` for rate limits and the busy state. After the stream starts, errors arrive as `error` events.
- 💤 **`sources` is still in the contract but is no longer emitted.**
  - It appears in `SSE_EVENT_NAMES`, `AiAgentSseEventMap` and `citations.ts`.
  - It was added in commit `fe53052` and removed in `de5f464`. Phase 0 made this removal deliberate ("link-only grounding").
  - The frontend still parses `sources` and stores it, but `SourceChips.tsx` is imported only by its own test.
  - The resolution functions in `citations.ts` (`resolveCitations`, `buildDataCitationMap`, …) are not called on the live path. The orchestrator imports only the `CitableToolResult` type.
- **The frontend client** (`frontend/src/lib/api/aiAgent.ts`):
  - Uses raw `fetch` with an incremental parser (`frontend/src/lib/api/sse.ts`) and validates every frame with zod.
  - Sends no `Authorization` header and does not go through the axios refresh path.
  - Escapes its `fetch` from the API-layer audit test by naming the function `fetchImpl`.

### 3.9 Conversation context and memory (EXISTING)

- **The server is stateless.** There is no chat collection and nothing is persisted (`docs/AI_AGENT_PROPOSAL.md:39`, `docs/AI_AGENT.md`).
- **The client** keeps up to 30 completed messages in `sessionStorage` (`basmatak.aiAgent.history`). With each turn it re-sends the newest 6 messages, at most 4,000 characters. The transcript is cleared on logout or when the session expires (`frontend/src/hooks/useAiChat.ts`).
- **Conversation state is derived from the assistant turns the client sends:**
  - `deriveConversationFocus` (`conversation-focus.ts:164`) and `deriveRecentEntities` (`recent-entities.ts:373`) parse Markdown links and the "هل تقصد [X](link)؟" / "Did you mean [X](link)?" confirmations into `PendingConfirmation` (`recent-entities.ts:26-30`).
  - **This input is controlled by the client and can be forged.** Today the impact is low: a forged slug only adds a link to a public page, which 404s if it does not exist.
  - **This mechanism must never be reused to confirm writes,** and history must never be used as a source of facts about the user (§13, §16).

### 3.10 Error handling and degraded modes (EXISTING)

- **Modes:**

  | Mode | Behaviour (`answer-policy.ts:158-220`, `resolveAnswerCaps`) |
  |---|---|
  | `normal` | Full behaviour |
  | `conservative` | 3 chunks, 2 history messages, 300 output tokens, 1 tool call |
  | `knowledge_only` | No tools |
  | `retrieval_only` | Extractive snippets, no provider |
  | `exhausted` | Fixed text |

- **Provider failures.** The provider is retried once on server errors, provided no text or tool calls arrived. Quota errors call `markProviderQuotaExhausted` and fall back to the deterministic browse or organization lookup. Other failures produce localized `error` events.
- **Post-answer guards:**
  - `containsSystemInstructionLeak`: two verbatim six-word windows taken from either system prompt;
  - `containsUnbackedPromise`;
  - an empty-answer check;
  - the Arabic language check (`answerMatchesQuestionLanguage`, one stricter retry);
  - `sanitizeAnswer` (`answer-sanitizer.ts:467-503`).
- **What `sanitizeAnswer` does:** removes citation markers, redacts non-official emails and phones, rewrites links through an allowlist (at most 3), strips "sources" sections and foreign scripts, removes bare external URLs, and strips formatting.

### 3.11 Token and quota limits (EXISTING defaults; `ai-agent.config.ts:81-108`)

| Cap | Default | Hard maximum |
|---|---:|---:|
| `maxInputTokens` | 10,000 | 100,000 |
| `maxOutputTokens` | 400 | 800 |
| History messages / characters | 6 / 4,000 | 8 / 6,000 |
| Knowledge chunks / characters | 4 / 6,000 | 6 / 8,000 |
| `maxToolRounds` (env; ignored by model-first) | 1 | 2 |
| Tool rows / result characters | 5 / 1,200 | 8 / 3,000 |
| Requests per IP: per minute / per day | 4 / 15 | — |
| Global requests: per minute / per day | 8 / 80 | — |
| Concurrent requests | 2 | 100 |
| Daily token budget | 150,000 | 10,000,000 |

All of these windows live in memory. They reset on restart and are kept separately by each instance. This is an accepted risk, recorded as S12-A5 at `docs/AI_AGENT_SECURITY_CHECKLIST.md:141`.

### 3.12 Existing privacy and security controls

Kill switch · validation at the global pipe · IP and global quotas behind a trusted-proxy setting · private-data refusal · escaped prompt sections · static system prompt · strict tool schemas · argument validation in three layers · a read-only registry · the forbidden-key result guard · executor timeouts and size caps · leak, promise and language guards · contact redaction · the link allowlist · log lines without content (`usage-meter.service.ts`, `ai_agent_request`) · an admin-only usage endpoint · an e2e security suite (`backend/test/ai-agent-security.e2e-spec.ts`: injection, extraction, unknown tools, HTML, oversize input, logging, kill switch, proxy spoofing).

### 3.13 Capability status matrix

| Capability | Status | Location / note |
|---|---|---|
| Public chat over SSE | ✅ | `ai-agent.controller.ts` |
| Provider abstraction (Gemini, Groq) | ✅ | `llm/` |
| Automatic fallback to a second provider | 📄 | The flag is parsed, nothing is wired |
| Deterministic intent router | ✅ | `router/intent-router.ts` |
| Model-first tool selection | 🟡 | Implemented behind a flag that is off by default; there is no live evidence |
| Seven read-only public tools | ✅ | `tools/` |
| BM25 RAG with Arabic normalization | ✅ | `knowledge/` |
| Arabic stemming | ❌ | — |
| Citations / `sources` event | 💤 | `citations.ts`, the type contract and frontend parsing exist; nothing is emitted or rendered |
| Follow-up resolution (ordinals, pronouns, yes/no) | ✅ (model-first) / 🟡 (router-first) | `recent-entities.ts`, `conversation-focus.ts` |
| Server-side conversation memory | ❌ (deliberately) | `docs/AI_AGENT_PROPOSAL.md:39` |
| Authenticated chat / user identity | ❌ | Chat is `@Public`; the client sends no token |
| Tools that know the caller's role | ❌ | The `ToolHandler` has no context |
| Write tools / actions | ❌ (deliberately) | The registry rejects anything not marked read-only |
| Confirmation workflow | ❌ | `PendingConfirmation` is entity disambiguation, not action confirmation |
| Structured / generative UI | ❌ | Only Markdown links rendered as link cards (`frontend/src/components/ai-agent/MessageBubble.tsx`) |
| Per-user quota | ❌ | Per IP and global only |
| Audit of agent actions | ❌ | Only the aggregate usage meter |
| Admin usage report | ✅ | `GET /ai-agent/usage` |
| Regression harness (scripted and live) | ✅ | `regression/`, `test/ai-baseline/` |

### 3.14 Documentation vs code discrepancies

| Where | What the documentation or comment says | What the code does |
|---|---|---|
| `ai-agent.module.ts` doc comment (Session 7) | "Neither is wired into the controller: there is still no provider SDK, orchestration…" | Stale. The orchestrator and providers are wired. |
| `.env.example` / `AI_AGENT_MAX_TOOL_ROUNDS` | Caps tool rounds (default 1) | Ignored in model-first normal mode, which is fixed at 2 (`ai-agent.orchestrator.ts:944-947`) |
| Types and constants | `sources` is a valid SSE event | Never emitted. Phase 0 made link-only grounding the contract. |
| `meta.conversationId` | Its name suggests a conversation | It is generated per request and never round-tripped |
| `auth/guards/email-verified.guard.ts` doc | "No such routes exist yet" | The guard is global and applies to every non-public route |
| Knowledge `09-ai-agent/capabilities` | "I do not sign in to accounts" | True today. It **must change in the same release** that adds role-awareness, or Basma will contradict itself. |
| `frontend/src/gate/api-layer-audit.test.ts` | Forbids `fetch(` outside the API client | Evaded by the identifier `fetchImpl` in `aiAgent.ts` |

---

## 4. Current Roles and Permission System

### 4.1 What exists (EXISTING)

- **Roles.** `UserRole = 'volunteer' | 'organization' | 'admin'` (`common/interfaces/account-token.interface.ts`) is stored in `users.role` (enum at `users/schemas/user.schema.ts:45-49`).
  - The volunteer and organization roles are fixed at registration.
  - The admin is created by `scripts/seed-admin.ts`.
  - No endpoint changes the role.
- **Account status.** `active | suspended | deleted`, re-read on each request by `SuspendedGuard` on non-public routes.
- **Token claims.** `AccountToken { sub, role, sessionId }`, injected with `@CurrentAccount()`.
- **Route-level RBAC.** `@Roles(...)` appears 35× for `volunteer`, 31× for `organization` and 16× for `admin` (the admin controllers use it at class level), and once for all three roles (attestation download).
- **Ownership is enforced inside services** (summarised by the workflow audit, spot-checked):
  - **Organization side.** `requireOwnOrganization(account)` exists in `ApplicationsService`, `ParticipationsService`, `OrgDashboardService`, `SubmissionsService`, `VerificationsService`, `ReviewsService`, `ExperiencesService` (`requireOwnOrganizationId`), and `OpportunitiesService` (as `resolveOwnOrganization`). Each one is followed by a scoped `findOne({ _id, organizationId })`.
  - **Volunteer side.** Ownership checks compare `volunteerId` with `account.sub`, for example in `withdrawApplication`, `SubmissionsService.updateDraft` and `ExperiencesService.requireOwned`.
  - **Foreign resources return 404, not 403.** This avoids revealing whether a resource exists, and it is the right behaviour to keep in agent tools.
- **Some routes have no `@Roles` and rely on the service to scope the data:** `/organizations/me*`, `GET /experiences/:id`, and the detail reads for applications, participations, submissions and verifications, which branch on role. They are safe because the service scopes them, but the intent is not declared.
- **Organization state flags.** `verificationStatus` (`pending | verified | rejected`) and `status` (`active | suspended | deleted`). Only publishing checks them.
- **The frontend gate is cosmetic.** See §2.7.

### 4.2 Why it is not yet sufficient for agent authorization

| Gap | Consequence for an agent | Fix (PROPOSED) |
|---|---|---|
| Chat is `@Public`, and global status guards do not run for it | A role-aware chat that simply added `OptionalJwtAuthGuard` would accept tokens from suspended users and dead sessions | An `AgentPrincipalResolver` that applies the `isEligibleViewer` logic plus email verification (§9) |
| A tool calls a service and skips route guards | `@Roles`, `EmailVerifiedGuard`, `MaintenanceGuard` and `@Throttle` do not apply | A capability policy re-checks the role for each tool. The principal carries `emailVerified`. Write tools check maintenance and throttle explicitly. |
| There is no permission concept finer than the role | The tool set cannot be filtered by state, such as "verified organization" or "email verified" | A static capability table computed from role and state (§5.5), local to the agent |
| Admin is all-or-nothing | Any admin tool is available to every admin | Acceptable for the MVP. Keep admin write tools out of the agent (§6.3). |
| Access tokens outlive logout by up to 15 minutes | A copied token keeps working in chat | A session-liveness check in the resolver, and again at confirmation |
| `AuditInterceptor` records only admin requests and `PATCH`/`DELETE` under three prefixes (`core/audit/audit.interceptor.ts:57-60`), and only after success | Accept, verify, publish and apply are all `POST`s and are **not audited**. Neither are failed attempts. | An agent audit trail (§9.10). `status_histories` already records each transition's actor. |
| History is controlled by the client | A model could be persuaded that it "already confirmed" something | Confirmations live on the server only and are bound to the principal (§10.3) |

---

## 5. Role-Based Agent Architecture Proposal

### 5.1 Design principles

1. **The backend is the only authority.** Identity, session, role, state and ownership are resolved and checked by server code on every turn and every tool call. The LLM, the prompt, the client-sent history and the frontend role are *inputs*, never *grants*.
2. **The LLM proposes; the backend decides.** The model may choose a read tool. It may *propose* a write. A write executes only when the server receives an explicit human confirmation through a separate authenticated endpoint.
3. **Tools are adapters over existing services.** A tool:
   - validates its arguments with the *existing* DTO class;
   - calls the *existing* service method with the server-resolved `AccountToken`;
   - maps the result to a minimal projection.

   It never builds its own Mongo filters for private data, and it never accepts `organizationId`, `volunteerId` or `userId` as arguments.
4. **Deny by default.** A tool that is not in the principal's capability set is neither declared to the model nor executable. The executor checks again even when the model calls a tool that was never declared.
5. **Data minimisation towards the provider.** The model receives only what it needs to write the sentence. Fields that are personally identifying go to the UI card, which the server builds, and never to the model (§14.3).
6. **One safety pipeline for every role.** The leak, link, promise and language guards, the size caps and the quotas stay the same. Roles add capabilities; they never remove guards.

### 5.2 Architecture options compared

| Criterion | A. One shared agent, role-aware context and tool filtering | B. A separate agent configuration per role | C. Shared orchestrator with role sub-agents | **D. Hybrid: A, with role profiles as data (recommended)** |
|---|---|---|---|---|
| Security boundary | Backend checks on each tool. The same for every role. | The same backend checks; a smaller surface per role | More hops, and agents pass text to each other, which widens prompt-injection paths | Same as A, with an explicit, reviewable surface per role |
| Provider calls per turn | 1–3 | 1–3 | 2–6 (classifier, then sub-agent, then optional synthesis) | 1–3 |
| Input tokens per turn | Highest if every role tool is declared | Low: only that role's tools | Highest | Low: only that role's tools, grouped |
| Fit with the measured free-tier limit (7,000 ITPM; 80 requests per day) | Medium | Good | Poor | **Good** |
| Code paths to maintain | 1 | N prompts and registries that drift apart | 1 orchestrator plus N agents plus a routing protocol | 1 code path plus a policy table |
| Testability with the existing harness | Good | Needs a suite per role | Poor | Good: the same harness, run per role |
| Reuses the orchestrator as it is | Yes | Partly | No | Yes |

**Recommendation: D.** Keep one `AiAgentOrchestrator`, one provider and one prompt core. Add an `AgentRoleProfile` per principal kind (`anonymous`, `volunteer`, `organization`, `admin`). A profile is plain data:

- a capability list;
- a short prompt addendum;
- the knowledge audiences it may retrieve;
- quota parameters;
- the UI suggestions.

**Why C is rejected now.** The repository's own measurement already shows model-first using 1.7–2.7× more provider calls, and the deployment allows 80 requests per day globally (`ai-agent.config.ts:101-102`). Sub-agents would multiply that cost without adding any security, because authorization is not the model's job.

### 5.3 Proposed component architecture

```mermaid
flowchart TB
  subgraph FE[Frontend widget]
    W[useAiChat + streamChat<br/>sends Bearer via shared auth path]
    UI[Message parts renderer<br/>text + typed cards + confirm card]
  end
  subgraph AG[backend/src/ai-agent]
    G[AgentAuthGuard<br/>optional Bearer, strict if present]
    PR[AgentPrincipalResolver<br/>user status, live session,<br/>org state, email verified]
    CP[AgentCapabilityPolicy<br/>role + state → capabilities]
    RP[AgentRoleProfile<br/>prompt addendum, audiences, quotas]
    O[AiAgentOrchestrator<br/>unchanged safety pipeline]
    TR[ToolRegistry.listFor principal]
    TX[ToolExecutor.execute name, args, ctx<br/>re-checks capability]
    PA[PendingActionService<br/>Mongo TTL collection]
    AU[AgentAuditService]
  end
  subgraph DS[Existing domain services]
    S1[ApplicationsService]
    S2[OpportunitiesService]
    S3[SubmissionsService / VerificationsService]
    S4[ParticipationsService / OrgDashboardService]
    S5[Admin*Service]
  end
  W -->|POST /ai-agent/chat| G --> PR --> CP --> RP --> O
  O --> TR
  O --> TX
  TX -->|read tools: AccountToken from principal| DS
  TX -->|write tools: propose only| PA
  UI -->|POST /ai-agent/actions/:id/confirm| PA
  PA -->|re-resolve principal, re-check, execute| DS
  TX --> AU
  PA --> AU
  O -->|SSE meta/status/token/ui/action/done| W
```

### 5.4 The `AgentPrincipal` (PROPOSED)

```ts
// backend/src/ai-agent/auth/agent-principal.ts (proposed)
export type AgentPrincipalKind = 'anonymous' | 'volunteer' | 'organization' | 'admin';

export interface AgentPrincipal {
  kind: AgentPrincipalKind;
  /** Present for authenticated principals; exactly what services expect. */
  account?: AccountToken;            // { sub, role, sessionId } from the verified JWT
  emailVerified: boolean;            // users.emailVerifiedAt != null (after env/setting relaxation)
  organization?: {                   // only for kind === 'organization'
    id: string;                      // organizations._id (never sent to the model)
    verificationStatus: 'pending' | 'verified' | 'rejected';
    status: 'active' | 'suspended' | 'deleted';
  };
  capabilities: ReadonlySet<AgentCapability>;
  resolvedAt: number;
}
```

- **Built once per request**, by the resolver, from the database. It is never read from the request body.
- **For a write, it is re-built at confirmation time.** A principal from the original chat turn is never reused.
- **`kind` comes from `users.role` in the database, not from the JWT claim.** Today the two cannot differ (§4.1). Reading the database copy costs one indexed `findById`, which `SuspendedGuard` already performs for every authenticated request.

### 5.5 Capability policy (PROPOSED)

The capabilities are a small, static table owned by the AI module. It is not a platform-wide permission system: Spatie-style RBAC would be a refactor with no MVP value. Each capability is computed from the role and the principal's state.

| Capability | Granted when | Gates which tools |
|---|---|---|
| `public.read` | always, including anonymous | the 7 existing tools |
| `volunteer.self.read` | `kind = volunteer` | own applications, participations, submissions, experiences, favorites, dashboard, recommendations |
| `volunteer.application.write` | `volunteer` and `emailVerified` | propose apply, propose withdraw |
| `volunteer.favorites.write` | `volunteer` | save and unsave an opportunity |
| `org.self.read` | `kind = organization` and `organization.status = active` | overview, own opportunities, inbox, participants, contributions, publish gate |
| `org.opportunity.write` | `org.self.read` and `emailVerified` | propose draft, publish, close, cancel, complete. The service still enforces `verified` for publishing. |
| `org.application.decide` | `org.self.read` and `verificationStatus = verified` | propose start-review, accept, reject |
| `org.contribution.decide` | `org.self.read` and `verificationStatus = verified` | propose verify, reject contribution |
| `org.talents.read` | `org.self.read` | search talents (public projection) |
| `admin.read` | `kind = admin` | overview, series, queues, verification and report lists |
| `admin.write` | **not granted in this roadmap** | — (§6.3) |

Tying `org.application.decide` to `verificationStatus = verified` is a **proposed product rule**. Today `acceptApplication` does not check verification. An unverified organization cannot publish, though, so it cannot have applications in the first place. The rule only makes that invariant explicit for the agent. Confirm it with the product owner (§19).

```ts
// backend/src/ai-agent/policy/agent-capability.policy.ts (proposed sketch)
export function capabilitiesFor(p: Omit<AgentPrincipal, 'capabilities'>): Set<AgentCapability> {
  const caps = new Set<AgentCapability>(['public.read']);
  if (p.kind === 'volunteer') {
    caps.add('volunteer.self.read').add('volunteer.favorites.write');
    if (p.emailVerified) caps.add('volunteer.application.write');
  }
  if (p.kind === 'organization' && p.organization?.status === 'active') {
    caps.add('org.self.read').add('org.talents.read');
    if (p.emailVerified) caps.add('org.opportunity.write');
    if (p.organization.verificationStatus === 'verified') {
      caps.add('org.application.decide').add('org.contribution.decide');
    }
  }
  if (p.kind === 'admin') caps.add('admin.read');
  return caps;
}
```

### 5.6 Role profiles (PROPOSED)

| Profile | Prompt addendum (server-written, static per role) | Knowledge audiences | Suggested quota |
|---|---|---|---|
| `anonymous` | none (today's behaviour) | `all`, `visitor` | today's per-IP limits |
| `volunteer` | "The signed-in user is a volunteer. Personal data comes only from the declared `my_*` tools…" | `all`, `volunteer` | per user, e.g. 30 per day |
| `organization` | "The signed-in user manages one organization. Never act on another organization…" | `all`, `organization` | per user, e.g. 40 per day |
| `admin` | "The signed-in user is a platform administrator. Report data; do not take moderation actions…" | `all`, `organization`, `volunteer`, `admin` | per user, e.g. 60 per day |

The quota numbers are placeholders. They must fit within the global provider budget (§17.3).

**The prompt addendum never contains the user's name, email or ids.** At most it says "the user is a volunteer". Facts about the user come only from tools that are scoped by the server.

---

## 6. Role-Specific Capabilities and Tool Matrix

### 6.1 Volunteer

| Aspect | Definition |
|---|---|
| Primary objectives | Find suitable opportunities; know where each application stands; complete tasks and submit evidence; get verified experiences and certificates |
| Information the agent may access | Public data, plus the volunteer's **own** applications, participations, submissions, verified experiences, favorites, dashboard stats, profile completion and recommendations |
| Tasks to support | "Am I accepted?"; "Why don't I have a certificate yet?"; "What fits my skills in Oran?"; "What do I do next on my task?"; "Apply to X"; "Withdraw my application"; "Save this opportunity" |
| Tools available | All public tools; `get_my_applications`, `get_application_status`, `get_my_participations`, `get_my_submissions`, `get_my_verified_experiences`, `get_my_dashboard`, `get_my_saved_opportunities`, `get_recommended_opportunities`; `propose_apply_to_opportunity`, `propose_withdraw_application`, `save_opportunity`, `unsave_opportunity` |
| Tools that must be inaccessible | Every `org.*` and `admin.*` tool; any tool that reads another volunteer's private data; talent search (not a volunteer workflow) |
| Operations | Reads, plus three writes that need confirmation (apply, withdraw) or are reversible (favorites) |
| Business rules to respect | These are enforced by the services; the agent only explains them:<br>– apply needs a `published` opportunity, the deadline not passed and a free seat (`APPLICATIONS_CLOSED`, `POSITION_FULL`, `DUPLICATE_APPLICATION`)<br>– withdrawing an `accepted` application releases the seat<br>– the experience's hours come from the opportunity's configured duration<br>– a submission can be resubmitted after rejection |
| What the agent must **not** do | Create or submit contributions (evidence upload and consent stay in the UI, linked at `/volunteer/tasks/[participationId]/submit`); edit the profile; delete the account |
| Response behaviour | Concise. Shows status cards. Explains the next step and links the real page. Never speculates about the organization's decision. |

### 6.2 Organization / association

| Aspect | Definition |
|---|---|
| Primary objectives | Publish opportunities; process applications quickly; keep reliability high; review contributions; understand the publish gate and verification status |
| Information the agent may access | Public data, plus the organization's **own** opportunities (drafts included), application inbox, participants, contributions to review, publish-gate status, verification status, profile completion, stats and activity. Public talent profiles, only through the projection that respects their flags. |
| Tasks to support | "What needs my attention?"; "Who applied to the beach cleanup?"; "Why can't I publish?"; "Draft an opportunity for 5 volunteers in Oran next Saturday"; "Accept Amina"; "Reject with reason …"; "Verify this contribution" |
| Tools available | Public tools; `get_org_overview`, `list_my_opportunities`, `get_my_opportunity`, `list_applications`, `get_application`, `list_participants`, `list_contributions_to_review`, `get_contribution`, `search_talents`; `propose_opportunity_draft`, `propose_publish_opportunity`, `propose_close_opportunity`, `propose_cancel_opportunity`, `propose_complete_opportunity`, `propose_start_application_review`, `propose_accept_application`, `propose_reject_application`, `propose_verify_contribution`, `propose_reject_contribution` |
| Tools that must be inaccessible | Every volunteer self-tool, every admin tool, and any tool that takes an organization id; **cross-organization reads of any kind** |
| Operations | Reads, plus writes that all need confirmation |
| Business rules | – Publishing needs a verified, active organization and an unlocked gate<br>– a published opportunity with accepted participants is locked for most fields<br>– a reject reason is mandatory and reaches the volunteer<br>– verifying is irreversible: it creates the experience and its proof code<br>– only drafts can be deleted |
| What the agent must **not** do | Edit the organization profile or verification dossier; delete opportunities; remove participants until the seat bug (H8) is fixed; reveal volunteers' contact data in prose |
| Response behaviour | Queue-oriented ("3 applications waiting, oldest 4 days"). Cards with action buttons. Always names the record before proposing an action. |

### 6.3 Administrator

| Aspect | Definition |
|---|---|
| Primary objectives | Keep the platform trustworthy: the verification queue, reports, suspended accounts, platform health and analytics |
| Information the agent may access | Admin analytics (`overview`, `series`, `queue`), stats overview, pending organization verifications, reports, opportunity moderation lists, and user and organization lists **in minimized form** |
| Tasks to support | "What needs attention today?"; "How many verifications are pending, and what is the oldest?"; "Summarise this week's growth"; "Which reports are high priority?" |
| Tools available | Public tools; `get_platform_overview`, `get_platform_series`, `list_org_verifications`, `get_org_verification`, `list_reports`, `list_admin_opportunities`, and optionally `list_users` / `get_user` (minimized) |
| Tools that must be inaccessible | **All admin writes** (approve or reject a verification, suspend, change status, resolve a report, settings, maintenance) and all volunteer or organization self-tools |
| Why there are no admin writes | The admin console already provides every action. Admin actions carry the largest blast radius: suspension, and closing other people's opportunities. An admin reads user-generated report text and dossiers, which is the strongest indirect prompt-injection vector. The agent prepares the decision and **deep-links** to the console page, for example `/admin/verifications`. Revisit only after the confirmation protocol has run safely for the organization role. |
| Response behaviour | Numeric, terse, with trends. Never repeats personal data in prose. Always links to the console. |

### 6.4 Visitor (anonymous)

Today's behaviour is unchanged: the seven public tools and the full knowledge corpus with audience `all` or `visitor`. When asked about personal data, Basma answers with a sign-in hint instead of a flat refusal (§16.2).

### 6.5 Tool × role matrix

| Tool | Anon | Volunteer | Org | Admin | Kind |
|---|:-:|:-:|:-:|:-:|---|
| `search_opportunities`, `get_opportunity_details`, `search_organizations`, `get_organization_details`, `search_reference_data`, `platform_stats`, `search_knowledge` | ✓ | ✓ | ✓ | ✓ | read (existing) |
| `get_my_applications`, `get_application_status`, `get_my_participations`, `get_my_submissions`, `get_my_verified_experiences`, `get_my_dashboard`, `get_my_saved_opportunities`, `get_recommended_opportunities` | | ✓ | | | read |
| `save_opportunity`, `unsave_opportunity` | | ✓ | | | write, reversible |
| `propose_apply_to_opportunity`, `propose_withdraw_application` | | ✓ | | | write (confirmed) |
| `get_org_overview`, `list_my_opportunities`, `get_my_opportunity`, `list_applications`, `get_application`, `list_participants`, `list_contributions_to_review`, `get_contribution`, `search_talents` | | | ✓ | | read |
| `propose_opportunity_draft`, `propose_publish/close/cancel/complete_opportunity` | | | ✓ | | write (confirmed) |
| `propose_start_application_review`, `propose_accept_application`, `propose_reject_application` | | | ✓ (verified) | | write (confirmed) |
| `propose_verify_contribution`, `propose_reject_contribution` | | | ✓ (verified) | | write (confirmed) |
| `get_platform_overview`, `get_platform_series`, `list_org_verifications`, `get_org_verification`, `list_reports`, `list_admin_opportunities` | | | | ✓ | read |
| `list_users`, `get_user` (minimized) | | | | optional | read |

---

## 7. Proposed Backend Tools and Their Contracts

**Conventions for every proposed tool:**

- **Input** is a strict JSON schema with `additionalProperties: false`. After that check, the arguments are converted with `plainToInstance` into the **existing DTO class** and validated with `class-validator`, using the same `whitelist` and `forbidNonWhitelisted` options as `AppValidationPipe`. One validation source, no drift.
- **Identifiers** are format-checked with the existing `OBJECT_ID_PATTERN` (`tool-input.ts:7`). They are safe to pass to the model because every service re-checks ownership and returns 404 for anything foreign.
- **Never an argument:** `userId`, `volunteerId`, `organizationId`, `role`, `status` of the caller.
- **Output** is split into `modelView` (minimal, safe to send to the provider) and `uiView` (rendered as a card; may contain fields the user is authorized to see but that the model does not need). See §14.
- **"Status"** says whether the tool already exists, needs modifying, or must be created.

### 7.1 Public tools (all principals)

| Tool | Purpose | Input | Backend service | Data | Authorization | Side effects | Confirm | Status |
|---|---|---|---|---|---|---|---|---|
| `search_opportunities` | Discover opportunities | unchanged | direct model query today → **move to** a shared public-visibility helper | `opportunities`, `skills`, `skill_categories`, `locations` | `public.read` | read | no | **Modify:** accept a `ToolExecutionContext`; exclude opportunities of non-active organizations once H4 is fixed; make "public status" one shared constant |
| `get_opportunity_details` | One opportunity | `slug` or `title` | same | same | `public.read` | read | no | **Modify:** same visibility constant; decide whether `in_progress` and `cancelled` are public (§19) |
| `search_organizations` / `get_organization_details` | Organizations | unchanged | direct model query | `organizations` | `public.read` | read | no | **Modify:** add the `publicProfile.enabled` filter, matching `OrganizationsService.listPublic` |
| `search_reference_data`, `platform_stats` | Skills, locations, counts | unchanged | direct model query | reference collections | `public.read` | read | no | **Modify:** context parameter only |
| `search_knowledge` | Platform explanations | `query` | `KnowledgeService.search` | the corpus | `public.read`, **audience-filtered** | read | no | **Modify:** filter by `principal.profile.audiences` (§11.3) |

### 7.2 Volunteer tools

| Tool | Purpose | Input schema | Backend service | Data access | Authorization | Side effects | Confirm | Status |
|---|---|---|---|---|---|---|---|---|
| `get_my_applications` | List own applications with status | `{ status?: 'pending'\|'under_review'\|'accepted'\|'rejected'\|'withdrawn', limit?: 1-8 }` | `ApplicationsService.listMyApplications(account, ApplicationListQueryDto)` (`applications.service.ts:306`) | `applications` scoped by `volunteerId = sub`, plus opportunity title and slug | `volunteer.self.read`; the service filter | read | no | **New** |
| `get_application_status` | One application in detail | `{ applicationId: ObjectId }` | `ApplicationsService.getApplication(account, id)` | the same, one row | `volunteer.self.read`; the service returns 404 if it is not the caller's | read | no | **New** |
| `get_my_participations` | Tasks and their states | `{ status?: 'accepted'\|'active'\|'completed'\|'withdrawn'\|'removed', limit? }` | `ParticipationsService.listMyParticipations` | `task_participants` (own) | `volunteer.self.read` | read | no | **New.** Needs `ParticipationsModule` to export `ParticipationsService` (today it exports only `MongooseModule`, `participations.module.ts:45`) |
| `get_my_submissions` | Contribution states and rejection reasons | `{ status?: 'draft'\|'submitted'\|'under_review'\|'approved'\|'rejected', limit? }` | `SubmissionsService.listMine` | `submissions` (own) | `volunteer.self.read` | read | no | **New.** Needs `SubmissionsService` to be exported (`submissions.module.ts:45`) |
| `get_my_verified_experiences` | Experiences and certificates | `{ limit? }` | `ExperiencesService.listMine` | `volunteer_experiences` (own) | `volunteer.self.read` | read | no | **New.** Needs `ExperiencesService` to be exported (`verifications.module.ts:69`). The attestation is a link, never inline. |
| `get_my_dashboard` | Stats and profile completion | `{}` | `VolunteersService.getDashboard(userId)` and `getProfileCompletion` | profile, stats | `volunteer.self.read` | read | no | **New.** Hours are wrong until H7 is fixed. |
| `get_my_saved_opportunities` | Saved opportunities | `{ limit? }` | `FavoritesService.listOwn` | `favorites` (own) plus summaries | `volunteer.self.read` | read | no | **New. Blocked by H3** (draft titles) |
| `get_recommended_opportunities` | Personalized suggestions | `{ limit?: 1-8 }` | `OpportunitiesService.getRecommended(account, RecommendedQueryDto)` (`opportunities.service.ts:713`) | own skills and wilaya; published opportunities | `volunteer.self.read` | read | no | **New** |
| `save_opportunity` / `unsave_opportunity` | Manage favorites | `{ opportunitySlug }` (resolved to an id on the server) | `FavoritesService.saveOpportunity` / `removeOpportunity` | `favorites` | `volunteer.favorites.write` | write, idempotent and reversible | no (audited) | **New. Blocked by H3.** `saveOpportunity` must require `published`. |
| `propose_apply_to_opportunity` | Prepare an application | `{ opportunitySlug, positionId?: ObjectId, message?: string ≤ DTO max }` | at confirmation: `ApplicationsService.apply(account, opportunityId, positionId, message)` (`:179`) | `applications`, positions | `volunteer.application.write`; at proposal time, a read-only pre-check (published, deadline, seats) | **write**: creates an application and notifies the organization | **required** | **New** |
| `propose_withdraw_application` | Prepare a withdrawal | `{ applicationId }` | at confirmation: `ApplicationsService.withdrawApplication` | `applications`, plus participation and seat if accepted | `volunteer.application.write`; ownership in the service | **write** | **required** | **New** |

### 7.3 Organization tools

| Tool | Purpose | Input schema | Backend service | Data access | Authorization | Side effects | Confirm | Status |
|---|---|---|---|---|---|---|---|---|
| `get_org_overview` | "What needs my attention?" | `{}` | `OrgDashboardService.getOrgStats(account)` (`org-dashboard.service.ts:374`), `OrganizationsService.getVerificationStatus` / `getProfileCompletion`, `TrustPublishGateService.status(orgId)` (`trust-publish-gate.service.ts:123`) | own organization's aggregates | `org.self.read` | read | no | **New.** Needs `OrgDashboardService` to be exported |
| `list_my_opportunities` | Own opportunities, drafts included | `{ status?: OPPORTUNITY_STATUSES, query?: string ≤120, limit? }` | `OpportunitiesService.listOwn(account, OwnOpportunityQueryDto)` (`:806`) | `opportunities` where `organizationId = own` | `org.self.read` | read | no | **New** |
| `get_my_opportunity` | One own opportunity with positions and fill | `{ opportunityId }` | `OpportunitiesService.getOwnById` | same | `org.self.read`; `requireOwned` | read | no | **New** |
| `list_applications` | The inbox | `{ opportunityId?: ObjectId, status?: 'pending'\|'under_review'\|'accepted'\|'rejected'\|'withdrawn', limit? }` | `ApplicationsService.listOrganizationInbox` (`:409`) or `listOpportunityApplications` | `applications` (own organization), plus volunteer display data | `org.self.read` | read | no | **New.** `modelView`: first name, position, status, age of the application. Everything else `uiView` only. |
| `get_application` | One application | `{ applicationId }` | `ApplicationsService.getApplication` (organization branch) | same | `org.self.read`; organization comparison in the service | read | no | **New** |
| `list_participants` | Roster | `{ opportunityId?: ObjectId, status? }` | `ParticipationsService.listParticipants` / `OrgDashboardService.listOrgParticipants` | `task_participants` (own) | `org.self.read` | read | no | **New** |
| `list_contributions_to_review` | Review queue | `{ status?: 'submitted'\|'under_review', limit? }` | `SubmissionsService.listForOrganization` | `submissions` (own) | `org.self.read` | read | no | **New. Must exclude `draft`** (H11). Evidence goes to `uiView` only. |
| `get_contribution` | One contribution | `{ submissionId }` | `SubmissionsService.getDetail` | same | `org.self.read` | read | no | **New** |
| `search_talents` | Discover volunteers by skill or place | `{ skill?: code, wilaya?: code, limit? }` | `VolunteersService.listPublicTalents` (`volunteers.service.ts:737`) | public talent projection | `org.talents.read` | read | no | **New. Blocked by H4** (suspended users stay listed). Must keep the `show*` flags. |
| `propose_opportunity_draft` | Turn natural language into a draft | `CreateOpportunityDto` subset: `{ title, description, mode, startDate, endDate?, applicationDeadline?, location{wilayaId, municipalityId?}, durationMinutes?, positions[{ title, requiredCount, requiredSkills[], deliverables[] }] }` | at confirmation: `OpportunitiesService.createOpportunity(account, dto)` (`:209`) | `opportunities` (a new draft) | `org.opportunity.write` | **write**: creates a draft only | **required** (light) | **New.** Skill ids are resolved with `search_reference_data`, never invented |
| `propose_publish_opportunity` | Publish | `{ opportunityId }` | `publishOpportunity` (`:444`) | `opportunities` | `org.opportunity.write`; the service checks verified, active and the gate | **write**: visible to everyone | **required** | **New** |
| `propose_close_opportunity` / `propose_cancel_opportunity` / `propose_complete_opportunity` | Lifecycle | `{ opportunityId, reason?: string }` | `closeOpportunity` / `cancelOpportunity` / `completeOpportunity` | `opportunities`; cancel notifies participants | `org.opportunity.write`; the transition registry | **write** | **required** | **New** |
| `propose_start_application_review` | Mark as under review | `{ applicationId }` | `ApplicationsService.startReview` | `applications` | `org.application.decide` | **write**: the volunteer sees the status | **required** (light) | **New** |
| `propose_accept_application` | Accept | `{ applicationId }` | `acceptApplication` (`:484`), a transaction | `applications`, `task_participants`, `positions.filledCount` | `org.application.decide` | **write**: takes a seat, notifies the volunteer | **required** | **New** |
| `propose_reject_application` | Reject with a reason | `{ applicationId, reason: string (DTO limits) }` | `rejectApplication(account, id, reason)` (`:640`) | `applications` | `org.application.decide` | **write**: the volunteer sees the reason | **required**; the reason is shown verbatim and can be edited | **New** |
| `propose_verify_contribution` | Verify, creating an experience | `{ submissionId, notes?: string, review?: { rating: 1-5, comment?: string } }` per `VerifyDto` | `VerificationsService.verify(account, id, dto)` (`verifications.service.ts:167`), a transaction | `submissions`, `verifications`, `task_participants`, `volunteer_experiences`, `reviews`, stats | `org.contribution.decide` | **write, irreversible**: issues a certificate code | **required (strong)** | **New.** Needs `VerificationsService` to be exported |
| `propose_reject_contribution` | Reject with a reason | `{ submissionId, reason }` per `RejectDto` | `VerificationsService.reject` (`:446`) | `submissions`, `verifications` | `org.contribution.decide` | **write** | **required** | **New** |

Organization actions **not** exposed: `removeParticipation` (until H8 is fixed), `deleteOpportunity`, position CRUD, profile and verification edits, `duplicateOpportunity`. These are better done in the editor UI, and the agent links to it.

### 7.4 Admin tools (read-only)

| Tool | Purpose | Input | Backend service | Data | Authorization | Side effects | Confirm | Status |
|---|---|---|---|---|---|---|---|---|
| `get_platform_overview` | Totals, deltas, queue | `{}` | `AdminAnalyticsService.getOverview` / `getQueue` (`admin/analytics.service.ts:182, 245`), `AdminStatsService.getOverview` (`admin/stats.service.ts:69`) | aggregates | `admin.read` | read | no | **New.** `AdminModule` exports nothing today; add the exports |
| `get_platform_series` | Trends | `{ days }` as in `AnalyticsQueryDto` | `AdminAnalyticsService.getSeries` | aggregates | `admin.read` | read | no | **New** |
| `list_org_verifications` | Verification queue | `{ status?, limit? }` | `AdminOrganizationsService.listVerifications` | `organization_verifications` | `admin.read` | read | no | **New.** Documents go to `uiView` only, as links to the console |
| `get_org_verification` | One dossier summary | `{ organizationId }` | `AdminOrganizationsService.latestVerification` | same | `admin.read` | read | no | **New.** Admin-only exception: the argument is an id because admins legitimately address any organization |
| `list_reports` | Report queue | `{ status?, priority?, targetType?, limit? }` | `AdminReportsService.list` | `reports` | `admin.read` | read | no | **New.** **Report text is untrusted.** It goes in `<tool_results>` escaped and is never followed. |
| `list_admin_opportunities` | Moderation list | `{ status?, query?, limit? }` | `AdminOpportunitiesService.list` | `opportunities` | `admin.read` | read | no | **New** |
| `list_users` / `get_user` | User lookup | `{ role?, status?, limit? }` / `{ userId }` | `AdminUsersService.list` / `getById` | `users` (email excluded from `modelView`) | `admin.read` | read | no | **Optional / New** |

Deferred admin writes, not recommended in this roadmap: `approve` and `reject` verification, `setStatus` (user, organization, opportunity), `resolveWithAction`, settings, maintenance.

---

## 8. Proposed Backend Routes and API Contracts

### 8.1 Route table

| Method | Route (prefix `/api/v1`) | Purpose | Authentication | Role / capability | Request DTO | Response | Service | Status |
|---|---|---|---|---|---|---|---|---|
| GET | `/ai-agent/status` | Availability, mode and limits | public | — | — | unchanged `AiAgentStatusResponse` | `AiAgentController.getStatus` | **Existing, no change.** The widget already knows the role from `GET /auth/me`. |
| POST | `/ai-agent/chat` | One turn over SSE | **optional** (`AgentAuthGuard`) | resolved principal | **unchanged** `ChatDto {message, locale, history?}`. There is **no** role or user field, deliberately. | SSE. Additive: `meta.principal`; new `ui` and `action` events (§8.3) | `AiAgentController.chat` → orchestrator | **Existing; modify** |
| POST | `/ai-agent/actions/:actionId/confirm` | Execute a proposed write | **required** (normal global guards; not `@Public`) | `@Roles('volunteer','organization')` and the capability recorded on the action | `ConfirmActionDto { edits?: { reason?: string; message?: string } }` | `200 { status: 'executed', result: AiAgentActionResult }`. Errors: `404 ACTION_NOT_FOUND`, `409 ACTION_STATE_CHANGED`, `410 ACTION_EXPIRED`, `403 FORBIDDEN`, `422` business codes passed through, e.g. `POSITION_FULL`, `ORG_NOT_VERIFIED` | `PendingActionService.confirm` → the existing service | **New** |
| POST | `/ai-agent/actions/:actionId/cancel` | Discard a proposal | required | the action's owner | — | `204` | `PendingActionService.cancel` | **New** |
| GET | `/ai-agent/usage` | Admin aggregates | required | `@Roles('admin')` | — | `AiAgentUsageReport`, plus per-role counts and action counts | `UsageMeterService` | **Existing; extend additively** |

**Routes deliberately not proposed:**

- **`/ai-agent/volunteer/chat`, `/ai-agent/org/chat`, `/ai-agent/admin/chat`.** The transport, quota and SSE lifecycle are identical for every role. Separate routes would duplicate `AiAgentController.chat`, which is about 270 lines of lifecycle code. They would also suggest a security boundary that does not exist: the role must come from the principal, never from the URL.
- **`/ai-agent/tools/:name`.** Tools are an internal contract. Exposing them over HTTP would create a second, unaudited API surface parallel to the real controllers.
- **Conversation persistence endpoints.** None until persistence itself is decided (§13).

### 8.2 Chat authentication semantics (PROPOSED)

| Request | Result |
|---|---|
| No `Authorization` header | `anonymous` principal (today's behaviour) |
| `Bearer` that is valid, for an active user with a live session | Role principal |
| `Bearer` that is invalid or expired | **401 `UNAUTHORIZED` before the stream starts.** The client refreshes and retries once. Silently downgrading to anonymous would answer "I can't see your applications" to a signed-in user and hide the real fault. |
| Valid `Bearer` but the user is suspended or deleted, or the session was revoked or rotated | **403 `ACCOUNT_SUSPENDED` / `ACCOUNT_INACCESSIBLE` / 401 `SESSION_REVOKED`** before the stream starts. The same codes as `SuspendedGuard`. |
| Maintenance mode | Unchanged. `MaintenanceGuard` already covers `/ai-agent/*`; only admins bypass it. |

### 8.3 SSE contract additions (additive, per the rule in `ai-agent.types.ts:1-7`)

```ts
// meta: one new optional field
interface AiAgentMetaEvent { conversationId: string; locale: AiAgentLocale; mode: AiAgentMode;
  principal?: 'anonymous' | 'volunteer' | 'organization' | 'admin'; }

// ui: a server-built card derived from a tool result of this turn (never from model text)
interface AiAgentUiEvent {
  id: string;                         // unique per turn
  component: AiAgentUiComponent;      // discriminated union, see §14.2
}

// action: a proposed write awaiting human confirmation
interface AiAgentActionEvent {
  actionId: string;                   // random 128-bit, bound to user + session, single use
  kind: AgentActionKind;              // e.g. 'application.accept'
  danger: 'low' | 'normal' | 'high';  // drives the card styling and the confirm copy
  title: string;                      // server-localized, e.g. "Accept Amina B. for 'Logistics'"
  facts: Array<{ label: string; value: string }>;  // server-built preview
  editable?: Array<'reason' | 'message'>;
  expiresAt: string;                  // ISO, e.g. now + 10 min
}
```

**The model never sees `actionId`.** Its tool result says only `{ ok: true, data: { proposal: 'created', kind, needsUserConfirmation: true } }`. So no model output can name, reuse or confirm an action.

---

## 9. Required Guards, Decorators, Services, and DTOs

Each component below lists:

1. **Responsibility** — what it does.
2. **Why it is needed.**
3. **Existing equivalent** — whether something like it already exists.
4. **Location** — where it should live.
5. **Reuses** — which existing components it builds on.

Everything sits under `backend/src/ai-agent/` unless stated otherwise.

### 9.1 `AgentAuthGuard`

- **Responsibility.** If no `Bearer` is present, it passes as anonymous. If one is present, it validates it through the existing `JwtStrategy` and **fails** on an invalid or expired token.
- **Why it is needed.** `OptionalJwtAuthGuard` swallows invalid tokens by design (`auth/guards/optional-jwt-auth.guard.ts`). That is correct for public reads and wrong for a personalised assistant (§8.2).
- **Existing equivalent.** Partly: `OptionalJwtAuthGuard`.
- **Location.** `ai-agent/auth/agent-auth.guard.ts`. Applied as `@Public() @UseGuards(AgentAuthGuard)` on `chat`.
- **Reuses.** `AuthGuard('jwt')` and `JwtStrategy`.

### 9.2 `AgentPrincipalResolver`

- **Responsibility.** Builds the `AgentPrincipal` (§5.4):
  - user status and role from the database;
  - session liveness;
  - email-verification state;
  - the organization's state, for organization accounts;
  - capabilities.
- **Why it is needed.** Global status guards do not run for `@Public` routes (§2.3), and agent tools call services directly.
- **Existing equivalent.** The same logic exists in three places:
  - `OrganizationsService.isEligibleViewer` (`organizations.service.ts:228-250`): user active, plus a live session that is unrotated and unexpired;
  - `SuspendedGuard`: user status;
  - `EmailVerifiedGuard`: the env flag, the `moderation.requireVerifiedEmail` setting, and `emailVerifiedAt`.
- **Location.** `ai-agent/auth/agent-principal.resolver.ts`.
- **Reuses, with one small extraction.** Move the session-liveness query out of `isEligibleViewer` into an exported `AuthService.isSessionLive(sub, sessionId)`. Move the email-requirement check out of `EmailVerifiedGuard` into a function both can call. Without the extraction the rule would exist twice; this is the only refactor of existing code the design asks for. The resolver then calls `UsersService.findById`, `OrganizationsService.findByUserId`, `AuthService.isSessionLive` and the email-requirement helper.

### 9.3 `AgentCapabilityPolicy` and `AgentRoleProfiles`

- **Responsibility.** Turns principal state into a capability set (§5.5). Supplies the prompt addendum, knowledge audiences and quotas for each role (§5.6).
- **Why it is needed.** One reviewable table instead of role checks scattered across tools.
- **Existing equivalent.** None. `@Roles` is HTTP-only.
- **Location.** `ai-agent/policy/agent-capability.policy.ts` and `agent-role-profiles.ts`.
- **Reuses.** The `UserRole` type.

### 9.4 Tool contract v2 (modify `tools/tool.types.ts` and `tool-registry.ts`)

```ts
export interface ToolExecutionContext {
  principal: AgentPrincipal;     // never derived from model output
  requestId: string;
  locale: AiAgentLocale;
  signal: AbortSignal;
}

export type ToolHandler = (input: unknown, ctx: ToolExecutionContext) => Promise<ToolOutput> | ToolOutput;

export interface ToolOutput {
  modelView: unknown;            // goes to the provider; per-audience forbidden-key guard
  uiView?: AiAgentUiComponent[]; // goes to the client only; validated against UI schemas
  proposal?: PendingActionDraft; // only for sideEffect: 'write'
}

export interface ToolDescriptor {
  name: string; description: string; inputSchema: ToolInputSchema;
  allowedIntents: readonly ToolIntent[];       // keep for router pre-filtering
  requiredCapability: AgentCapability;         // NEW
  sideEffect: 'read' | 'propose_write';        // NEW (no tool ever writes directly)
  audience: 'public' | 'self' | 'admin';       // NEW → selects the forbidden-key set
}
```

- **Registry.** The `readOnly: true` invariant becomes "`sideEffect` is `read` or `propose_write`". A handler can return a proposal but can never call a mutating service; tests assert this through a service double. Add `listFor(principal)`, which filters on `requiredCapability`.
- **Forbidden keys** become a set per audience:
  - `public` keeps today's list;
  - `self` allows `applications` / `submissions` shapes but still bans `email`, `phone`, `passwordHash`, `registryId`, `coordinates`, `birthDate`, raw `_id` and `userId`;
  - `admin` bans contact fields in `modelView`.

### 9.5 `ToolExecutor` (modify)

- **Responsibility.** Passes `ctx`. Re-checks `requiredCapability` before running, even for a tool that was declared, as defence in depth. Maps a `BusinessException` thrown by a service to a safe tool error.
- **Error mapping:**
  - `404` → `NOT_FOUND`
  - `403` → `FORBIDDEN`
  - `409` / `410` / `422` → `PRECONDITION_FAILED` with the **allowlisted** business code: `APPLICATIONS_CLOSED`, `POSITION_FULL`, `DUPLICATE_APPLICATION`, `ORG_NOT_VERIFIED`, `PUBLISHING_DISABLED`, `OPPORTUNITY_FIELD_LOCKED`, …
  - anything else → `UNAVAILABLE`
- **Limit.** At most one write proposal per turn.
- **Existing equivalent.** `ToolExecutor`.
- **Location.** `tools/tool-executor.ts`.
- **Reuses.** `BusinessException` (`common/exceptions/business.exception.ts`).

### 9.6 Role tool classes

- **Location.** `ai-agent/tools/volunteer/*.tool.ts`, `tools/organization/*.tool.ts`, `tools/admin/*.tool.ts`, plus mappers under `tools/mappers/self-*.mapper.ts`.
- **Module wiring.** `AiAgentModule` imports `ApplicationsModule`, `OpportunitiesModule`, `OrganizationsModule`, `VolunteersModule`, `FavoritesModule`, `TrustModule`, `ActivityModule`, `ParticipationsModule`, `SubmissionsModule`, `VerificationsModule` and `AdminModule`.
- **Additive export changes this requires:**

| Module | Exports today | Add |
|---|---|---|
| `participations/participations.module.ts:45` | `MongooseModule` | `ParticipationsService`, `OrgDashboardService` |
| `submissions/submissions.module.ts:45` | `MongooseModule` | `SubmissionsService` |
| `verifications/verifications.module.ts:69` | `MongooseModule` | `VerificationsService`, `ExperiencesService` |
| `admin/admin.module.ts` | none | `AdminAnalyticsService`, `AdminStatsService`, `AdminOrganizationsService`, `AdminReportsService`, `AdminOpportunitiesService`, `AdminUsersService` |

- **Circular imports.** None are expected. `AdminModule` imports only `MongooseModule` and `NotificationsModule`, and no domain module imports `AiAgentModule`. Use `forwardRef` only if the build proves otherwise.

### 9.7 `ToolDtoBridge`

- **Responsibility.** `validateToolDto(DtoClass, plain)`: `plainToInstance`, then `validate` with `{ whitelist: true, forbidNonWhitelisted: true }`. Failures throw `ToolInputError`.
- **Why it is needed.** Services expect validated DTO instances. The tool must not invent a second validation rule set.
- **Existing equivalent.** `AppValidationPipe` (`common/pipes/validation.pipe.ts:13-18`).
- **Location.** `ai-agent/tools/tool-dto-bridge.ts`.
- **Reuses.** `class-validator`, `class-transformer`, and the existing DTO classes (`CreateOpportunityDto`, `VerifyDto`, `RejectDto`, `ApplicationListQueryDto`, …).

### 9.8 `PendingActionService` and the `ai_agent_pending_actions` collection

```ts
// ai-agent/actions/pending-action.schema.ts (proposed)
{
  _id: String,                    // random UUID v4 (the actionId)
  userId: ObjectId, sessionId: ObjectId, role: UserRole,
  kind: String,                   // 'application.accept' | 'opportunity.publish' | …
  capability: String,             // capability required at confirmation time
  args: Mixed,                    // validated DTO plain object (no ids of the caller)
  argsHash: String,               // sha256(kind + canonical args) for idempotency/tamper checks
  precondition: { entityType: String, entityId: ObjectId, expectedStatus: String },
  preview: Mixed,                 // the facts shown on the card
  status: 'proposed' | 'executing' | 'executed' | 'cancelled' | 'failed',
  resultCode: String, errorCode: String,
  expiresAt: { type: Date, index: { expires: 0 } },   // TTL, same pattern as sessions.expiresAt
}
```

- **Responsibility:**
  - `propose(principal, draft)` stores the row and returns the SSE `action` payload;
  - `confirm(account, actionId, edits)` and `cancel` act on it.
- **Why it is needed.** It is a confirmation that the server can verify, survives a Render restart, and is bound to one user.
- **Existing equivalent.** None. The TTL pattern comes from `auth/schemas/session.schema.ts:40`.
- **Location.** `ai-agent/actions/`.
- **Reuses.** `createSchema` and `TokenUtil` (`auth/token.util.ts`) for hashing.

### 9.9 `ActionExecutorRegistry`

- **Responsibility.** Maps `kind` to `(account, args) → existing service call`. For example, `application.accept` → `ApplicationsService.acceptApplication(account, args.applicationId)`.
- **Why it is needed.** It keeps *what a write does* in one reviewable place.
- **Location.** `ai-agent/actions/action-executors.ts`.
- **Reuses.** The domain services.

### 9.10 `AgentAuditService`

- **Responsibility.** Appends a row to the existing `audit_logs` collection for every write proposal, confirmation, cancellation, execution and failure, and for every capability denial. Fields: `actorId`, `action: 'ai_agent.<event>'`, `method`, `path`, `entityType`, `entityId`. **It never stores message, prompt or argument text.**
- **Why it is needed.** `AuditInterceptor` does not record business `POST`s (`core/audit/audit.interceptor.ts:57-60`).
- **Existing equivalent.** The `audit_logs` schema (`core/audit/audit-log.schema.ts`) and the admin reader `GET /admin/audit-logs`.
- **Location.** `ai-agent/audit/agent-audit.service.ts`.
- **Reuses.** The `AuditLog` model, and the admin audit UI unchanged.

### 9.11 Changes to existing AI components

| Component | Change |
|---|---|
| `orchestrator/answer-policy.ts` | Replace `isPrivateDataRequest(message)` with `classifyPrivacyRequest(message, principal)`, returning `refuse_third_party` / `sign_in_hint` / `self_data`. Third-party contact requests are always refused. First-person requests ("طلباتي", "my applications") get a sign-in hint when anonymous, and are routed to self-tools when authenticated. |
| `budget/quota.service.ts` | Key the reservation by `user:<sub>` when authenticated, otherwise `ip:<ip>`, with per-role limits from the profile. Global limits are unchanged. |
| `prompt/prompt-builder.ts`, `system-prompt.ts` | A new reserved section, `<principal_context>`, holding the escaped profile addendum. Bump to router-first v10 and model-first v3, adding these rules: "personal data only from `my_*` and `org` tools"; "propose writes only with `propose_*` tools"; "never state that an action happened unless an action result is present"; "never ask the user to type yes; the confirmation card is the only way". |
| `knowledge/*` | An `audience` front-matter field, with filtering at retrieval time (§11.3) |
| `orchestrator/answer-sanitizer.ts`, `answer-links.ts` | Per-principal link allowlists, e.g. `/{locale}/volunteer/applications/<id>` only for volunteers and `/{locale}/org/applications/<id>` only for organizations. Contact redaction is **unchanged**. |
| `ai-agent.controller.ts` | `@UseGuards(AgentAuthGuard)`; resolve the principal before `quota.reserve`; pass it to `orchestrator.run`; register `ActionsController` |
| `frontend/src/lib/api/aiAgent.ts` | Attach the Bearer token from `frontend/src/lib/auth/storage.ts`. On a 401 before the stream starts, call the shared `refreshSession` and retry once. Parse the `ui` and `action` events. |
| `frontend/src/components/ai-agent/*` | Render message parts and cards; a confirmation card that calls the confirm and cancel endpoints through the axios `api`; role-specific suggestions |
| `backend/ai-agent/09-ai-agent/*` | Update the capability, limitation and roadmap documents in the same release |

---

## 10. Request Execution Flow and Architecture Diagrams

### 10.1 The thirteen steps, mapped to components

| # | Step | Component | Exists? |
|---|---|---|---|
| 1 | The user sends a message | `streamChat` with a Bearer token | modify |
| 2 | Validate the session | `AgentAuthGuard` (signature and expiry) plus `AgentPrincipalResolver` (live session) | new |
| 3 | Identify the user | `account.sub` from the verified JWT | existing claim |
| 4 | Load the real role and permissions | resolver: `users.role` and `status`, organization state, email verification → capabilities | new (reuses services) |
| 5 | Build role-aware context | `AgentRoleProfile` → `<principal_context>`, audience-filtered knowledge, role-scoped tool list | new |
| 6 | Decide whether a tool is needed | router pre-filter of tool *groups*, then model choice (§12.1) | modify |
| 7 | Check the tool is available to this role | `ToolRegistry.listFor(principal)` at declaration; `ToolExecutor` again at execution | new |
| 8 | Validate the tool inputs | `validateToolArguments`, then the tool parser, then `ToolDtoBridge` | modify |
| 9 | Check ownership and permission | the **existing** service method with `principal.account` | existing |
| 10 | Execute the tool | read: service call. Write: `PendingActionService.propose` only. | new |
| 11 | Return the result to the agent | `modelView` to the provider; `uiView` held for the client | new |
| 12 | Generate the response | existing guards, then `sanitizeAnswer` | existing |
| 13 | Stream to the frontend | `token`, plus `ui` and `action` events, then `done` | modify |

### 10.2 Read-only flow

```mermaid
sequenceDiagram
  autonumber
  participant U as User (volunteer)
  participant FE as Widget
  participant G as AgentAuthGuard + PrincipalResolver
  participant O as Orchestrator
  participant P as LLM provider
  participant T as ToolExecutor
  participant S as ApplicationsService
  U->>FE: "هل قُبلت في فرصة تنظيف الشاطئ؟"
  FE->>G: POST /ai-agent/chat (Bearer)
  G->>G: JWT ok → users.status active → session live → caps
  G->>O: run(principal=volunteer, message, history)
  O->>O: classifyPrivacyRequest → self_data (allowed)
  O->>P: tools = public + volunteer.self.read
  P-->>O: tool_call get_my_applications {status: undefined}
  O->>T: execute(name, args, ctx)
  T->>T: capability volunteer.self.read ✓, schema ✓, DTO ✓
  T->>S: listMyApplications(principal.account, dto)
  S-->>T: rows scoped to volunteerId = sub
  T-->>O: modelView [{opportunityTitle, status:'accepted', position}] + uiView cards
  O->>P: function_result (modelView only)
  P-->>O: "نعم، قُبلت في …"
  O->>O: guards + sanitize + role link allowlist
  O-->>FE: token… ui(application_status card) … done
```

### 10.3 Write flow with confirmation

```mermaid
sequenceDiagram
  autonumber
  participant U as User (organization)
  participant FE as Widget
  participant O as Orchestrator
  participant P as LLM provider
  participant T as ToolExecutor
  participant PA as PendingActionService
  participant AC as ActionsController
  participant S as ApplicationsService
  U->>FE: "Accept Amina for logistics"
  FE->>O: POST /ai-agent/chat (Bearer)
  O->>P: tools = public + org.* (role-scoped)
  P-->>O: tool_call list_applications {status:'pending'}
  O->>T: execute → modelView rows (ids + first names)
  O->>P: function_result
  P-->>O: tool_call propose_accept_application {applicationId}
  O->>T: execute (capability org.application.decide ✓)
  T->>S: getApplication(account, id) — read-only precheck (owned, status pending/under_review)
  T->>PA: propose(principal, {kind:'application.accept', args, precondition})
  PA-->>T: actionId (kept server-side) + preview
  T-->>O: modelView {proposal:'created', needsUserConfirmation:true}
  O-->>FE: token("I prepared the acceptance…") + action{actionId, title, facts, expiresAt}
  U->>FE: clicks "Accept" on the card
  FE->>AC: POST /ai-agent/actions/{id}/confirm (Bearer) — normal global guards run
  AC->>PA: confirm(account, id)
  PA->>PA: row exists, owner = sub, same session, status proposed, not expired
  PA->>PA: re-resolve principal → capability still granted
  PA->>PA: atomically set status executing (findOneAndUpdate on status:'proposed')
  PA->>S: acceptApplication(account, applicationId)  ← existing transaction + ownership
  S-->>PA: accepted (or POSITION_FULL / 404 / 409)
  PA->>PA: status executed|failed + audit row
  AC-->>FE: 200 {status:'executed', result} | 409/410/422
```

### 10.4 How reads and writes differ

| Concern | Read | Write |
|---|---|---|
| Can the model trigger it? | Yes, within its declared tools | It can trigger a **proposal**, never an execution |
| Where the data mutation happens | Nowhere | `POST /ai-agent/actions/:id/confirm`, a normal authenticated route |
| Guards on the executing request | Resolver equivalents (the chat route is `@Public`) | **All global guards** (JWT, Suspended, EmailVerified, Roles, Maintenance, Throttler) plus the capability re-check |
| What the provider sees | `modelView` | `{proposal:'created'}`, without the id |
| What the user sees | Text plus cards | A confirmation card showing the server-built facts and the exact effect |
| Audit | Capability denials only | Proposed, confirmed or cancelled, executed or failed |
| Idempotency | n/a | Single use: an atomic `proposed → executing` claim. Plus the service's own conditional updates. |
| If state changed in between | n/a | The service rejects it (status matching, `$inc` guards); mapped to `409 ACTION_STATE_CHANGED` |

### 10.5 Rules of the confirmation protocol

1. **It is bound to a user and a session.** `userId = sub` and `sessionId` must equal those of the confirming request. Logging out makes every open proposal unusable.
2. **It is short-lived.** The TTL is 10 minutes (a proposal). Expired rows are deleted by the TTL index; a confirm against one returns `410`.
3. **It is single-use.** `findOneAndUpdate({ _id, status: 'proposed' }, { status: 'executing' })` claims the row. A second click finds nothing.
4. **Authorization is checked again.** The principal and capability are recomputed at confirmation time, so an organization suspended in between is refused.
5. **The service is the final check.** The existing service enforces ownership, the status machine and its invariants. The agent never pre-empts them.
6. **Edits are validated again.** An edited `reason` or `message` goes back through the DTO, and `argsHash` is recomputed. The edit is recorded in the audit (the fact that it was edited, never the text).
7. **There is no LLM on the confirmation path.** The confirm endpoint does not call the provider.
8. **Typing "yes" in chat never executes anything.** If a user replies "نعم" while a proposal is pending, the orchestrator shows the card again. History, which the client controls, is never consulted.
9. **Destructive kinds get an extra step** (`danger: 'high'`: cancel an opportunity, verify a contribution). The card needs a second, deliberate interaction, such as a checkbox or holding the button, which the UI implements.

---

## 11. RAG and Dynamic Data Integration

### 11.1 Two kinds of grounding

| | Knowledge base (BM25 over `backend/ai-agent/`) | Live platform data (backend tools) |
|---|---|---|
| Answers | *How the platform works*: rules, steps, statuses, pages, privacy, FAQ | *What is true now*: this opportunity, my applications, my queue, today's counts |
| Content | Curated, static, bilingual, public. The folder is treated as public (`docs/AI_AGENT_PROPOSAL.md:258`). | Database rows, partly private, changing every minute |
| Access control | **None needed.** It must never contain private data. An audience filter only improves relevance. | **Mandatory.** Capability, then the service's ownership check |
| Freshness | Rebuilt at boot | Read at the moment of asking |
| Caching | Fine (10-minute retrieval cache) | Public reference data only. **Never cache private results across users.** |
| Example | "Why does a rejected contribution go back to draft?" | "Which of my contributions were rejected, and why?" |

Most useful answers combine both. For example, "Why can't I publish?" needs `get_org_overview`, which shows the gate locked by 3 opportunities with pending contributions, together with the knowledge chunk that explains the publish limit, from `03-user-roles/organization-role` ("The default threshold is 3 and it is configurable"). The model is told to state the user's *state* from tools and the *rule* from knowledge, never the other way round.

### 11.2 Is BM25 still sufficient?

**Yes, for the knowledge path. The evidence:**

- **The corpus is small and curated.** 139 files, about 657 KB, in en/ar pairs, with titles, headings and tags weighted.
- **Its failures are not retrieval failures.** In the Phase 1 measurement, the router-first generalization failures (15/30) were attributed to **tool selection**, not retrieval (`phase-1-comparison.md`, "Scripted generalization failures").
- **The alternatives cost more than they return.** Embeddings would add a provider, a quota and a data-use dependency. The project's own proposal rejected them for v1 on those grounds (`docs/AI_AGENT_PROPOSAL.md:92`).

**Weaknesses worth fixing before considering embeddings:**

| Weakness | Evidence | Proposed improvement (cheap) |
|---|---|---|
| No Arabic light stemming. "التطوعية", "متطوعين" and "تطوع" only match through the hand-written synonym groups. | `normalizer.ts:327-342`, which has normalization but no affix stripping | Add a light-stem token variant at lower weight, e.g. 0.6: strip `و/ف/ب/ك/ل` + `ال` prefixes and `ات/ون/ين/ية/ه/ها` suffixes, guarded by a minimum stem length |
| Algerian Darija and code-switching (French words in Arabic script, Arabizi) | The synonym groups are MSA, English and some French | Add Darija groups to `_config/synonyms.json`: "كيفاش" → "كيف", "واش" → "هل/ماذا", "نقدر" → "أستطيع". Treat Arabizi as out of scope. |
| No audience metadata | `knowledge.types.ts:39-53` | §11.3 |
| No retrieval-quality metric of its own | The regression harness scores whole dialogues | Add `recall@4` / `MRR` over (question → expected source) pairs taken from the 70 existing dialogues |

**When to revisit embeddings.** Only if `recall@4` stays below an agreed target, for example 0.85, after the fixes above. The candidates then:

- A hybrid: BM25 plus dense vectors, merged with reciprocal-rank fusion.
- Vectors either from the configured provider's embedding API (adds a quota) or from MongoDB Atlas Vector Search, which would keep everything in the existing database.

**Check the current Atlas M0 limits and the free Render instance's memory before planning either.** A self-hosted multilingual embedding model is unlikely to fit the free instance.

### 11.3 Making retrieval role-aware (PROPOSED)

1. **Metadata.** Add optional front matter, `audience: [volunteer]` / `[organization]` / `[admin]` / `[visitor]`. If it is missing, the audience is `all`. Start by tagging `08-faq/volunteer-faq`, `organization-faq` and `visitor-faq`, `03-user-roles/*-role`, and the role-specific `04-workflow` pages.
2. **Filtering.** `KnowledgeService.search(query, locale, { audiences })`. Filter the chunks to the allowed audiences, then apply BM25 top-k. With 139 files, filtering after over-fetching (for example top 12, then filter, then take 4) is cheap and keeps one index.
3. **Cache key.** **Include the audience set in `buildRetrievalCacheKey`** (`retriever.ts:121`). Otherwise an admin-audience result cached for one user would be served to a volunteer asking the same words.
4. **Indexing rule.** No dynamic or private data is ever indexed. Applications, submissions, reports and verification documents are reached through tools only.
5. **Security note.** The audience filter is about relevance, not confidentiality. Anything confidential must not be in the corpus at all, because the folder ships in the repository.

### 11.4 Role-specific live data

- **Each role gets its own tool group** (§6.5). Filtering happens **in the service query**, scoped by `account.sub` or the caller's own organization, never in the prompt and never after the fact.
- **The router's topic signals** (`TopicSignals` in `intent-router.ts`) extend to select tool *groups*:
  - `self-applications`, `self-tasks`, `self-experiences`
  - `org-inbox`, `org-contributions`, `org-opportunities`
  - `admin-queue`

  §12.1 explains how these groups bound the declarations.

---

## 12. Reasoning and Multi-Step Tool Calling

### 12.1 Recommended orchestration: model-first inside a role-scoped, router-pre-filtered tool set

| Choice | Why |
|---|---|
| **Model-first for choosing read tools** | Measured at 40/40 and 30/30 against 37/40 and 15/30. Follow-ups such as ordinals, pronouns and "yes" are exactly what role conversations look like ("accept the second one"). |
| **The router as a pre-filter, not a selector** | Model-first today declares *every* tool on *every* turn (`ai-agent.orchestrator.ts:504-509, 979-981`). With 7 tools that is about 5k input tokens per turn already (`phase-1-comparison.md`). An organization with roughly 20 tools would roughly double the declaration cost. The router's topic signals should pick the public group plus at most 2 role groups, about 8–10 tools in all. |
| **Writes stay deterministic** | The model may call `propose_*`. Everything after that (persisting, rendering the card, confirming, executing) has no LLM in it. |
| **Degraded modes stay deterministic** | Extend the existing fallbacks so own-data questions can still be answered when the provider is down or the quota is exhausted. "My applications" can be answered by calling `get_my_applications` directly and rendering the cards with a fixed localized sentence. This costs no provider tokens. |
| **Honour the configured tool-round cap** | Fix the discrepancy in §3.14. Model-first should use `min(config.maxToolRounds, 2)`, so operators keep their kill lever. |

### 12.2 Planning, decomposition and stopping conditions

- **No separate planner.** The bounded tool loop is the plan: at most 3 provider calls, 2 tool rounds, 3 calls per round, and 45 s. Basmatak's tasks are shallow and follow one of these shapes:
  - list → pick → detail
  - list → pick → propose
  - state + rule → explain

  Two rounds cover all of them.
- **Stopping conditions:**
  1. The model returns text with no tool calls.
  2. A `propose_*` tool succeeded. **The turn ends after one proposal.** The model is not allowed to chain a second write.
  3. The round or call budget is exhausted. The existing deterministic fallback runs.
  4. A capability denial or an error that will not change on retry (`FORBIDDEN`, `NOT_FOUND` twice). The model explains it and stops.
  5. Abort, or the deadline passes.
- **Dependent operations** happen across rounds. Round 1 lists; round 2 acts on an id from round 1. Ids come from the previous `modelView`. If the model invents one, it simply 404s, because the service scopes every lookup.

### 12.3 Error recovery

| Tool error | Behaviour |
|---|---|
| `INVALID_ARGUMENT` | One corrective round allowed, with the safe message (this exists today for the schema) |
| `NOT_FOUND` | Say it was not found **among the user's own records**. Never suggest the record exists elsewhere. |
| `FORBIDDEN` (capability) | Explain what the role or state allows, e.g. "Publishing needs a verified organization", and link the verification page. Audited. |
| `PRECONDITION_FAILED` with a business code | Explain using the matching knowledge chunk. For example, `POSITION_FULL` → "This position is full"; `OPPORTUNITY_FIELD_LOCKED` → the rule about editing published opportunities. |
| `UNAVAILABLE` / `TIMEOUT` | The existing `toolUnavailable` policy message |
| Confirmation returns `409` / `410` | The card shows "This changed since it was prepared", with a *Refresh* action that sends a new chat turn |

### 12.4 Ambiguity and missing information

- **Two or more matches for a write target:** never pick one. Show the candidates as cards and ask which. The existing "Did you mean [X](link)?" pattern is fine **for reads**.
- **A required field is missing** (a reject reason, a position for a multi-position apply): ask exactly one question. The confirmation card also lets the user edit `reason` / `message`.
- **A date in an opportunity draft** ("next Saturday"): the server resolves it to an absolute date in the preview facts. The user sees the date that will be sent before confirming.

### 12.5 Basmatak-specific use cases

| # | Role | Request | Expected tool trace | Notes |
|---|---|---|---|---|
| 1 | Volunteer | "هل قُبلت في فرصة تنظيف الشاطئ؟" | `get_my_applications` → match the title → text plus an `application_status` card | Today `isPrivateDataRequest` refuses this ("طلباتي" pattern) |
| 2 | Volunteer | "I'm in Oran and do graphic design, what can I apply to?" | `get_recommended_opportunities` **or** `search_reference_data` (skill) → `search_opportunities {wilaya:'31', skill}` | Prefer recommendations when the profile has skills |
| 3 | Volunteer | "Why don't I have my certificate yet?" | `get_my_participations` + `get_my_submissions` → knowledge chunk `02-concepts/submission-vs-verified-experience` | Explain the state: draft, submitted, under review or rejected, with the reason |
| 4 | Volunteer | "Apply to the second one with the message …" | `recent_entities` resolves the ordinal → `get_opportunity_details` → `propose_apply_to_opportunity` | Confirmation card; the service checks the deadline and seats |
| 5 | Organization | "What needs my attention?" | `get_org_overview` | One call. Cards: pending applications, contributions to review, gate status. |
| 6 | Organization | "Who applied to the beach cleanup this week?" | `list_my_opportunities {query}` → `list_applications {opportunityId, status:'pending'}` | Two rounds. Names appear in the cards; the model gets first names only. |
| 7 | Organization | "Reject Karim: the position needs a driving licence" | `list_applications` → `propose_reject_application {reason}` | The card shows the reason verbatim and lets the user edit it |
| 8 | Organization | "Why can't I publish?" | `get_org_overview` → knowledge on the publish limit | State from the tool, rule from knowledge |
| 9 | Organization | "Prepare an opportunity: 5 volunteers to distribute food in Bab El Oued on 20 November" | `search_reference_data` (place → codes) → `propose_opportunity_draft` | Creates a **draft** only. Publishing is a separate proposal. |
| 10 | Admin | "What needs attention today?" | `get_platform_overview` → optionally `list_org_verifications {status:'pending'}` | Links to `/admin/verifications`; no actions |

### 12.6 Avoiding unnecessary calls

- Keep the deterministic shortcuts: greetings, thanks, exact organization lookup, generic browse, and focused follow-ups in router-first.
- Declare only the role-scoped groups.
- `get_org_overview` merges three reads into one tool, so it costs one call instead of three.
- Answer "how do I …" questions from knowledge alone when the router's knowledge score is high and no state word ("my", "طلباتي", "حالتي") is present.

---

## 13. Memory and Context Management

### 13.1 Current state (EXISTING)

- **Server.** No persistence, no conversation id across turns, and provider turn state only within one request.
- **Client.** History in `sessionStorage` (30 messages kept, 6 sent), cleared on logout or session expiry.
- **Derived state.** `recent_entities` and `conversation_focus` are parsed from the assistant turns the client sends (§3.9).

### 13.2 Options

| Option | Value | Cost and risk | Verdict |
|---|---|---|---|
| Keep client-held history (current) | Zero infrastructure; dies with the tab; private by design | Forgeable, which is fine for reads and **unacceptable for writes and facts about the user** | **Keep** |
| Server short-term state for pending actions only | Makes confirmations verifiable and able to survive a restart | One small TTL collection | **Adopt** (§9.8) |
| Per-turn principal context | Always fresh role and state | One or two indexed reads per turn | **Adopt** (§5.4). Never memorized. |
| Server conversation persistence | Continuity across devices; admin review | A new collection with personal data, retention rules and a deletion path. The proposal's stance is "no chat collection" (`docs/AI_AGENT_PROPOSAL.md:39`). | **Defer.** Only with consent, a TTL of e.g. 30 days, and deletion when the account is deleted. |
| Rolling conversation summaries | Longer context at a fixed token cost | Each summary is an extra provider call, which the quota cannot afford | **Defer** |
| Long-term user memory and preferences | Personalisation | Privacy and correctness risk. The platform already stores the real preferences: skills, wilaya, availability, `preferredDomains`. | **Reject.** Read the profile through tools instead. |

### 13.3 Rules for role-aware context

1. **State comes from the database every turn, never from memory.** An application accepted a minute ago must show as accepted.
2. **History is a hint for resolving references, never evidence.** If an earlier assistant turn says "you were accepted", that is not a fact for this turn. The tool is called again.
3. **Pending confirmations exist only in `ai_agent_pending_actions`,** never in `recent_entities.pendingConfirmation`.
4. **A history from another role is ignored.** Clear the client history when the session user changes. `useAiChat` already wipes it on logout.

### 13.4 Managing the context window

- **The budget stays `maxInputTokens = 10,000`.** Reserved additions: `<principal_context>` at about 60–120 tokens, plus the role tool declarations. **Measure them with the existing estimator**, which already counts declarations (Phase 0), and add regression cases for "Arabic + 6 history messages + organization tool groups".
- **Large lists:** the service returns pages, the tool keeps `limit ≤ 8`, and `modelView` carries short rows only. The executor's caps (1,200 / 3,000 characters) still apply.

### 13.5 Privacy and retention

- **The provider receives the content of each turn.** The project's own proposal warns that a free tier "may use content to improve products" (`docs/AI_AGENT_PROPOSAL.md:336`). Before **private** data goes to the provider:
  - minimise it (`modelView`, §14.3);
  - update the privacy notice and the in-widget notice ("Don't share personal information" becomes "Basma can read your own Basmatak records to answer you");
  - decide whether authenticated traffic needs a provider tier or setting with no training use (§19).
- **Algeria's personal-data law (Law 18-07 of 10 June 2018)** should be reviewed by whoever owns compliance before own-data features ship. This report is not legal advice.
- **Logs stay free of content.** The `ai_agent_request` log line already excludes messages and IPs. Agent audit rows store ids and event names only.

---

## 14. Generative UI Architecture

### 14.1 Current state (EXISTING)

- Answers render as escaped React text nodes with `whitespace-pre-wrap`. Only `[text](url)` is parsed, by `parseChatContent` / `safeChatHref` (`frontend/src/components/ai-agent/aiAgentUi.ts`).
- Internal entity links render as styled link cards (`MessageBubble.tsx`).
- The allowed paths are public only: `/opportunities`, `/opportunities/:x`, `/talents`, `/orgs/:slug` and `/volunteers/:u`.
- There is no Markdown library and no `dangerouslySetInnerHTML` in the chat.
- 💤 `SourceChips.tsx` exists but is unused.

### 14.2 Component contracts (PROPOSED)

```ts
// Shared contract (backend: ai-agent/ui/ui-components.ts, frontend: zod mirror)
type AiAgentUiComponent =
  | { type: 'opportunity_card'; v: 1; slug: string; title: string; status: string;
      wilaya: string | null; deadline: string | null; openPositions: number; href: string }
  | { type: 'organization_card'; v: 1; slug: string; name: string; orgType: string | null;
      wilaya: string | null; verified: true; href: string }
  | { type: 'application_status'; v: 1; applicationId: string; opportunityTitle: string;
      positionTitle: string; status: 'pending'|'under_review'|'accepted'|'rejected'|'withdrawn';
      reason?: string; updatedAt: string; href: string }          // href into the user's own area
  | { type: 'contribution_status'; v: 1; submissionId: string; opportunityTitle: string;
      status: 'draft'|'submitted'|'under_review'|'approved'|'rejected'; reason?: string; href: string }
  | { type: 'experience_card'; v: 1; experienceId: string; title: string; organizationName: string;
      verifiedAt: string; attestationHref: string }               // PDF link, auth-gated route
  | { type: 'applicant_row'; v: 1; applicationId: string; displayName: string; positionTitle: string;
      status: string; waitingDays: number; href: string }         // org only
  | { type: 'stats_panel'; v: 1; title: string; items: Array<{ label: string; value: number; hint?: string }> }
  | { type: 'admin_queue'; v: 1; pendingVerifications: number; openReports: number;
      underReviewSubmissions: number; href: string };
// action confirmation is the separate `action` SSE event (§8.3)
```

### 14.3 Separating what the model sees from what the user sees

The same tool call produces two views. Here, `list_applications` for an organization:

```jsonc
// modelView → provider (minimal; enough to write the sentence and pick an id)
[{ "id": "66f…a1", "firstName": "Amina", "position": "Logistics", "status": "pending", "waitingDays": 4 }]

// uiView → client card (what the org user is already authorized to see in /org/applications)
[{ "type": "applicant_row", "v": 1, "applicationId": "66f…a1", "displayName": "Amina B.",
   "positionTitle": "Logistics", "status": "pending", "waitingDays": 4,
   "href": "/ar/org/applications/66f…a1" }]
```

- **The model never receives contact data, evidence URLs or document links.** The user still gets them, through the card or the linked page, under the existing authorization.
- **`sanitizeAnswer` keeps redacting contact data in prose,** so a model that "remembers" a phone number cannot print it.

### 14.4 Backend rendering rules

1. Cards are built **only** from tool results of the **current turn** that were usable, by the tool's own mapper. They are never parsed from model text.
2. They are emitted **after** the answer passes every guard. They are validated against the backend schema, with at most 5 per turn and deduplicated by id.
3. Every `href` is built by the server from a per-principal route allowlist. No URL supplied by the model ever reaches a card.
4. Card data passes the forbidden-key guard for the principal's audience (`uiView` has its own set, which allows display names).
5. Strings are plain text. There is never HTML.

### 14.5 Frontend rendering

- **Messages.** `useAiChat` stores `parts: Array<{kind:'text'} | {kind:'ui', component} | {kind:'action', action}>`. `MessageBubble` renders the parts through a **component registry** keyed by `type` and `v`. An unknown type or version is skipped, never rendered raw.
- **Validation.** zod schemas mirror §14.2. An invalid card is dropped, the same way invalid SSE frames are dropped today.
- **The confirmation card:**
  - shows `title` and `facts`, the editable fields, and a countdown to `expiresAt`;
  - calls `api.post(`/ai-agent/actions/${id}/confirm`, { edits })` through the shared axios client, which handles Bearer and refresh;
  - after success, shows the result and invalidates the related TanStack Query keys, e.g. `applications`, so open pages refresh.
- **Persistence.** Action cards are **not** persisted to `sessionStorage`; they expire anyway. Data cards may be persisted with the transcript, which is already wiped on logout.
- **Links.** Extend `safeChatHref` with the role-area routes, mirroring the backend allowlist. The frontend allowlist is defence in depth; the backend one is authoritative.

### 14.6 Security separation in one sentence

The model decides *what to say*. The server decides *what is true*, *what may be shown* and *what may be done*. The client only renders typed data and sends a confirmation for an id it was given.

---

## 15. Specialized AI/ML Opportunities

> **Limit.** I had no database access. Everything below is based on the **schemas** and **code paths**, not on observed volumes or distributions. Training any model first requires a data audit, which nobody has done yet.

### 15.1 Available signals (EXISTING schemas)

| Signal | Source | Quality notes |
|---|---|---|
| Volunteer skills, with `level` 1–5 and `isPrimary` | `volunteer_skills` | Self-declared, never verified |
| Weekly availability | `volunteer_availability.schedule.monday…sunday` | Optional |
| Volunteer location, `preferredDomains`, `geographicBase` | `volunteer_profiles` | Optional |
| Opportunity facts: `requiredSkills[]` per position, `categoryId`, wilaya and municipality, `mode`, `startDate`, `durationMinutes`, seats | `opportunities` | `durationMinutes` may be missing, in which case the duration is 0 (`verifications.service.ts:57`) |
| Application outcomes and timing | `applications.status` plus `status_histories` | **Noisy.** Removing or withdrawing a participation leaves the application `accepted` (H8). |
| Completion outcome | `task_participants.status` | **Noisy.** Withdrawn or removed volunteers can still submit (H6). |
| Contribution outcome and rejection reasons | `submissions`, `verifications` | Free-text reasons in Arabic, French or English |
| Ratings 1–5 | `reviews` | Sparse; there is one review per submission at most |
| Implicit interest | `favorites` | Opportunity and talent targets |
| Organization reliability | `trust/reliability.service.ts` (refreshed on submission events) | Derived; documented as response rate and median decision time |
| Volunteer hours | `volunteer_profiles.stats.volunteerHours` | **Wrong unit.** It is incremented by minutes (`verifications.service.ts:405`, H7). |
| **What was shown to the user** (exposure / impressions) | **Not recorded anywhere** | Without it, learning from clicks or applications is biased |

### 15.2 Feasibility

| Capability | Feasible now (no training) | Needs more and cleaner data (supervised) | Risks |
|---|---|---|---|
| **Volunteer–opportunity matching** | **Yes.** `scoreRecommendedOpportunity` already exists (`opportunities.service.ts:72-94`): +10 per matching skill, +5 more if it is primary, +5 for the same wilaya. Possible extensions:<br>– availability against the start weekday<br>– `mode: remote` as a fallback when no wilaya matches<br>– `preferredDomains` ↔ `categoryId`<br>– skill level<br>– how close the deadline is<br>– the organization's reliability<br>Each recommendation can carry an explanation ("matches 2 of your skills"), and the agent can show it through `get_recommended_opportunities`. | Learning-to-rank (logistic regression or gradient boosting over the same features). Label: applied, or accepted. It needs exposure logging and enough positive pairs across many opportunities. **A rule of thumb, not a measurement:** several thousand labelled outcomes before a model is likely to beat a tuned heuristic. | Popularity feedback loops; geographic exclusion |
| **Opportunity classification** (suggest a category and skills for a draft) | **Yes, through the LLM zero-shot** inside `propose_opportunity_draft`, restricted to ids returned by `search_reference_data` and validated by the DTO. No training is needed. | A TF-IDF plus linear classifier once a few hundred opportunities have `categoryId` set by organizations | Low |
| **Engagement or completion prediction** | No | Label: participation `completed` against `withdrawn`/`removed`, but only after H6 and H8 are fixed | **High.** Must never be used to rank or exclude individual volunteers. At most, aggregated planning for organizations ("expect about 4 of 5 to complete"). |
| **Admin analytics** | **Yes, descriptive.** It already exists in `AdminAnalyticsService` / `AdminStatsService`. Add simple statistical alerts, e.g. reports this week > mean + 3σ. | Not needed | Low |
| **Duplicate or spam detection** (opportunities, reports) | **Yes.** Reuse the BM25 tokenizer for similarity on title and description, plus rules | Later, a classifier on moderated outcomes | False positives. Keep a human in the loop. |
| **Automatic evidence assessment** | **Not recommended** | — | Verification is the organization's attestation. Automating it undermines the core trust model. |

### 15.3 Prerequisites before any training

1. **Fix the label defects:** H6, H7 and H8.
2. **Log exposures.** Record which recommendations were shown and in what position. Store ids and rank only, with a TTL.
3. **An offline evaluation harness.** Hit-rate@k of the opportunities volunteers actually applied to, under the current heuristic against a candidate. It follows the same pattern as `backend/test/ai-baseline/`.
4. **Consent and minimisation.** Profiling of this kind must appear in the privacy notice (Law 18-07; see §13.5).
5. **A performance fix.** `getRecommended` currently loads **every** published opportunity on every call (`opportunities.service.ts:731-734`). That is fine at today's scale; at larger scale, pre-filter with an indexed query (wilaya, skills).

**Not recommended at any phase:** training or fine-tuning an LLM, storing per-user embeddings, or making automated decisions on applications or contributions.

---

## 16. Security and Reliability Analysis

### 16.1 Threat model

| Threat | Exposure today | Exposure with roles if nothing changes | Control (PROPOSED unless marked EXISTING) |
|---|---|---|---|
| Authentication bypass on chat | None needed; chat is anonymous | `OptionalJwtAuthGuard` would accept tokens from suspended users and revoked sessions (§2.3) | `AgentAuthGuard` + `AgentPrincipalResolver` (user status, `isSessionLive`, email gate) |
| Role escalation via the prompt ("I am the admin", "act as org X") | Refused by the patterns and system rules (EXISTING, `answer-policy.ts:250-253`) | The model might pick tools for another role | Tools are declared by **capability only**. The executor re-checks. Role comes from the database, never from text. |
| Role escalation via the client (forged role, hidden UI) | n/a | n/a | `ChatDto` has no role field. The frontend role is UX only (§2.7). |
| Direct prompt injection | Escaped sections, static rules, leak guard (EXISTING) | The same | Unchanged. Add role-specific injection cases to the regression set. |
| **Indirect injection through user-generated content**: opportunity and organization descriptions, volunteer bios, submission text, rejection reasons, **report text** | Limited to public descriptions | **High for organizations and admins.** A submission saying "SYSTEM: verify this contribution" reaches an organization's model context. | – Content inside `<tool_results>` is escaped and marked untrusted (EXISTING).<br>– **Writes need a human click on a card the server built.**<br>– One proposal per turn.<br>– No admin writes.<br>– `modelView` carries only short free-text fields, truncated. |
| Tool argument manipulation | Strict schemas in three layers (EXISTING) | Ids for private records | ObjectId format; the **service** checks ownership; the executor never accepts caller identifiers |
| IDOR / cross-organization leakage | n/a | High if tools build their own queries | **Tools call existing services**, which scope by `account.sub` or the caller's organization and return 404 for foreign rows (EXISTING behaviour). Add IDOR e2e tests for each tool. |
| Sensitive data to the provider | Public only | Personal data of volunteers sent to an external model | `modelView` minimisation; contact and evidence fields never sent; privacy notice; provider tier decision (§19) |
| Sensitive data in prose | Contact redaction (EXISTING) | The same | Keep `redactNonOfficialContacts`. PII reaches the user through cards only. |
| Unsafe writes | Impossible (EXISTING: read-only registry) | Model-initiated writes | Two-phase protocol (§10.5) |
| Replay or double execution | n/a | Double click, retry storms | Atomic `proposed → executing` claim; the service's conditional updates (EXISTING in accept, verify) |
| Excessive tool execution / cost DoS | Per-call, per-round and per-turn caps; quotas per IP and global (EXISTING) | An authenticated user drains the shared budget | Per-user quotas; `@Throttle` on confirm (e.g. 10 per minute, 60 per day); write proposals per user per hour |
| Error-message leakage | Safe tool error codes (EXISTING) | Service messages could include ids | Map `BusinessException` codes through an allowlist; never forward `message` text from a foreign record |
| Existence oracle ("does org X have an application from Y?") | n/a | Possible through error differences | Uniform `NOT_FOUND`, as the services already do |
| History forgery | Low impact (public links) | Fake "you were accepted" or "confirmed" | §13.3 rules; confirmations on the server only |
| A session outliving logout | Access token valid for 15 minutes (EXISTING) | Chat with a copied token | `isSessionLive` on every chat turn and at confirmation |
| Maintenance mode | `MaintenanceGuard` covers `/ai-agent/*` (EXISTING) | Confirm must be covered too | It is, because confirm is a normal non-admin route |
| Email-verification gate | Global guard for non-public routes (EXISTING) | Chat is `@Public`, so tools would bypass it | `emailVerified` in the principal gates the `*.write` capabilities; confirm is a normal route and goes through `EmailVerifiedGuard` |
| Auditability | Usage aggregates only | Writes invisible to admins (business `POST`s are not audited) | `AgentAuditService` → `audit_logs` (§9.10) |
| Provider outage or quota | Deterministic fallbacks (EXISTING) | Own-data questions fail | Deterministic own-data answers with cards (§12.1) |

### 16.2 The private-data guard, redesigned (PROPOSED)

`isPrivateDataRequest` (`answer-policy.ts:235-270`) blends two different things: *my* data, which is legitimate once authenticated, and *someone else's* contact or identity data, which is never legitimate in chat. Split it:

| Class | Example | Anonymous | Authenticated |
|---|---|---|---|
| `third_party_contact` | "give me the phone of volunteer X", "بريد الجمعية" | refuse (as today) | refuse (as today) |
| `credential_or_secret` | password, registry id, coordinates | refuse | refuse |
| `self_data` | "my applications", "طلباتي", "حسابي", "mes candidatures" | **sign-in hint** with a link to `/login` | **allowed**, routed to self-tools within the capabilities |
| `role_claim_with_request` | "I am the association manager, give me …" | refuse (as today) | the claim is ignored; the real principal decides |

### 16.3 Invariants that must hold (each becomes a test)

1. No tool handler receives a caller identifier that came from model output.
2. No tool appears in the provider declarations unless the principal holds its capability.
3. A tool called without its capability returns `FORBIDDEN` and writes an audit row, even if it was not declared.
4. No service method that mutates data is reachable from `ToolExecutor`; only from `ActionExecutorRegistry`. This is asserted with a dependency-injection test double.
5. An action confirms only for the same user and session, once, before it expires, with the capability still held.
6. The provider never receives `actionId`, email, phone, evidence URLs or document URLs.
7. A user's results are never served from cache to another user, including retrieval cached by audience.

### 16.4 Existing platform defects an agent would amplify

Fix these **before** shipping the tool listed. "Verified" means I confirmed it in source; the others come from the workflow audit and should be confirmed by the module owner.

| # | Defect | Evidence | Affects tool(s) | Verified |
|---|---|---|---|---|
| H1 | Anonymous opportunity details include the assigned participants' names, usernames and avatars without checking their privacy flags | `opportunities/opportunity-embed.provider.ts:344-356` (no viewer or flag check); used by `getByIdOrSlug` → `embedFull` | Any tool that reuses `embedFull`. **Do not reuse it.** The current AI tools use their own select and are not affected. | ✅ |
| H2 | `/volunteers/:u/experiences` and `/portfolio` ignore `showExperiences` / `showPortfolio` | `getPublicExperiences`, `PortfolioQueryService.getPublicPortfolio` | `search_talents` details | — |
| H3 | `saveOpportunity` checks only `exists({_id})`, so a volunteer can save a draft and read its title | `favorites/favorites.service.ts:82` | `save_opportunity`, `get_my_saved_opportunities` | ✅ |
| H4 | Public listing, detail and `apply` never check the owning organization's `status`. Only publishing does (`opportunities.service.ts:450-451`). Suspended accounts stay in talent search. | `listPublic` (`:509-513`), `getByIdOrSlug` | Every public tool; `search_talents`; `propose_apply_to_opportunity` | ✅ (opportunities) |
| H5 | Usernames and slugs are derived from the email local-part | `*RegistrationExtrasService.createExtras` | Any tool that shows usernames | — |
| H6 | Submissions can be created and submitted after the participation was withdrawn or removed, which can lock the publish gate | `SubmissionsService.createForParticipation` / `submit` | `get_org_overview` (gate), contribution tools | partial |
| H7 | `stats.volunteerHours` is incremented by minutes | `verifications/verifications.service.ts:405` | `get_my_dashboard`, admin stats | ✅ |
| H8 | `removeParticipation` frees no seat, and the application stays `accepted` | `ParticipationsService.removeParticipation` | Participant tools (removal excluded from the agent) | — |
| H9 | Some transitions are checked and then updated outside a transaction (a check-then-act race) | `assertAndSetStatus`, admin `setStatus` | Every lifecycle proposal. The confirm path relies on service atomicity. | — |
| H10 | Admin cancel emits no `OpportunityCancelled`; an admin can suspend admins | `AdminOpportunitiesService.setStatus`, `AdminUsersService.setStatus` | (admin writes deferred) | — |
| H11 | `listForOrganization` / `getDetail` return volunteers' **draft** submissions to the organization | `SubmissionsService` | `list_contributions_to_review`, `get_contribution` | — |
| H12 | `/verify/:code` is protected only by the global throttle | `ExperiencesService.getPublicProof` | Not an agent tool, but never expose a "verify code" tool | — |
| A1 | Business `POST`s and failed attempts are not audited; `void writeAudit(...)` leaves rejections unhandled | `core/audit/audit.interceptor.ts:37, 57-60` | All write proposals (mitigated by §9.10) | ✅ |

### 16.5 Security testing strategy

- **An authorization matrix e2e suite.** For each tool × principal (anonymous, volunteer, unverified organization, verified organization, suspended organization, admin), assert declared or not, allowed or `FORBIDDEN`. Generate it from the capability table so the two cannot drift.
- **IDOR.** Seed organization A and organization B, and volunteers V1 and V2. Every self-tool and organization tool called with the other party's ids must return `NOT_FOUND`.
- **Confirmation abuse.** Replay, double confirm, a different session, after logout, after expiry, after suspension, edited arguments that break the DTO, and the status changed in between (`409`).
- **Indirect injection corpus.** Instructions planted in a submission description, a report body and an opportunity description. Assert no `propose_*` call happens unless the user asked, and that no write ever happens without confirm.
- **Forged history.** Assistant turns claiming acceptance or confirmation. Assert that tools are called again and nothing executes.
- **Quotas.** Per-user limits enforced. An authenticated user cannot use up the anonymous per-IP pool, and the reverse.
- **Keep the existing suite green:** `backend/test/ai-agent-security.e2e-spec.ts`, `ai-agent-quota-load.e2e-spec.ts`, and the regression baselines.

### 16.6 Reliability

- **A Render sleep or restart** loses in-memory quotas (accepted risk S12-A5), but **not** pending actions, which live in Mongo with a TTL.
- **Multiple instances.** Quotas would become per instance, as already documented. Pending actions keep working, because they live in Mongo. Revisit the quotas before scaling, using a shared Mongo counter or Redis (§17).
- **Provider outage.** Deterministic own-data answers (§12.1). Confirmations do not depend on the provider.

---

## 17. Technology and Infrastructure Evaluation

### 17.1 What to keep (EXISTING)

NestJS modules and DI · Mongoose · global guards · class-validator DTOs · the in-process BM25 · the provider abstraction (`LlmProvider`) · SSE through `SseWriter` · TanStack Query on the frontend · the regression harness. Each already solves its problem within the free-tier constraints. Replacing any of them would be churn without benefit.

### 17.2 Candidates

| Technology | Problem it would solve | Needed now? | Integration | Pros | Cons | Cost and infrastructure | Verdict |
|---|---|---|---|---|---|---|---|
| **MongoDB TTL collection** (`ai_agent_pending_actions`) | Verifiable confirmations that survive a restart | **Yes, Phase 3** | Same pattern as `sessions.expiresAt` | No new service | One more collection | None (M0) | **Adopt** |
| Agent frameworks (LangChain.js, LangGraph, Vercel AI SDK, Mastra, OpenAI Agents SDK) | Tool loops, memory, graphs | No | Would sit on top of, or replace, the orchestrator | Ecosystem, tracing | They duplicate `LlmProvider`, the bounded loop and the guards that are already tested. They add their own abstractions over authorization. They are dependency-heavy on a small instance. | Bundle and memory | **Reject for now** |
| MCP server exposure | External agents using Basmatak tools | No | A new transport | Interoperability | A second API surface that needs the same authorization | — | **Postpone** |
| Redis | Shared quotas and state across instances | No (single instance) | `QuotaService` backend | Fast counters | A new service; the free tiers are limited | A hosted plan | **Postpone** until horizontal scaling. Mongo counters are an option. |
| Queue (BullMQ, …) | Background or long jobs | No | — | — | Needs Redis; nothing in the agent is long-running | — | **Reject** |
| Hosted vector database (Pinecone, Qdrant, …) | Semantic retrieval | No | A new network hop | Recall on paraphrases | Already rejected by the proposal (`docs/AI_AGENT_PROPOSAL.md:52`); a free-tier risk | A new account | **Reject** |
| Atlas Vector Search + an embedding API | Hybrid retrieval if BM25 recall falls short | Not yet | Inside the existing database | No new service | Embedding quota; limits on M0 to verify | Embedding calls | **Conditional** (§11.2) |
| A Markdown renderer (`react-markdown` + a sanitizer) | Rich formatting | No | Frontend | Lists and bold | Attack surface; cards cover the real need | Bundle | **Postpone** |
| LLM observability (Langfuse, OpenTelemetry) | Tracing prompts and tools | No | Logger | Debugging | Sends content to a third party unless self-hosted | A service | **Postpone**. Extend the content-free structured logs (`ai_agent_request`, `ai_agent_router_shadow`) with tool and denial events. |
| **A paid or higher LLM tier** | Capacity, and data-use terms for private data | **Decision needed before Phase 2 ships to real users** | `AI_AGENT_PROVIDER` / `AI_AGENT_MODEL` | No code change | Money | Per-token prices must be checked at decision time | **Decide** (§19) |
| Env feature flags | Safe rollout | **Yes** | The existing pattern (`AI_AGENT_MODEL_FIRST`) | Byte-identical default | — | None | **Adopt** `AI_AGENT_ROLE_AWARE`, `AI_AGENT_WRITE_ACTIONS` |

### 17.3 Capacity: the binding constraint

From the repository's own measurement (`phase-1-comparison.md`, "Quota capacity"):

- The global cap of 80 requests per day allows **about 57–64 conversations per day** at the measured number of turns per conversation.
- Under the default 150,000-token budget, model-first drops to **about 19–22 conversations per day**.
- Model-first at 100 conversations per day would need **about 671k tokens per day**.

**Every authenticated volunteer, organization and admin would share this same pool.** Before Phase 2 reaches real users, decide:

- the provider tier;
- the per-role daily allocation (for example, reserve a share for organizations, because their actions have the highest value);
- whether anonymous visitors keep a separate, smaller pool.

---

## 18. Implementation Roadmap

The order follows the dependencies found in the code, not the order the categories were listed in. **Two changes from the suggested sequence:**

- A **Phase 0** of prerequisites (platform fixes and decisions) is added.
- A **minimal generative UI** moves into Phase 2. Cards are what keep personal data out of the model (§14.3), and the confirmation card is what makes writes safe.

```mermaid
flowchart LR
  P0[Phase 0<br/>prerequisites:<br/>repo state, decisions,<br/>H3 H4 H7 H11 fixes] --> P1[Phase 1<br/>role-based foundation]
  P1 --> P2a[Phase 2a<br/>role read tools<br/>+ minimal cards]
  P2a --> P2b[Phase 2b<br/>write actions<br/>with confirmation]
  P0 -->|H6 H8 fixes| P2b
  P2a --> P3[Phase 3<br/>advanced intelligence]
  P2b --> P4[Phase 4<br/>rich generative UI]
  P3 --> P4
  P2a --> P5[Phase 5<br/>specialized ML<br/>heuristic first]
```

### Phase 0: prerequisites

- **Objectives.** Start from a clean, agreed baseline.
- **Required changes:**
  1. **Settle the repository state.** The Phase 1 model-first work is uncommitted. `backend/` and `frontend/` are nested git repositories, and the outer repository also tracks their files (§ front matter). Decide which repository is authoritative before any new branch, or changes will diverge.
  2. **Decide** the provider tier, the per-role quota allocation, the privacy notice and the product rules (§19).
  3. **Platform fixes needed by Phase 2:**
     - H3: `saveOpportunity` must require `published`;
     - H4: public reads exclude organizations that are not active, and the talent list excludes non-active users;
     - H7: hours unit;
     - H11: organizations must not receive draft submissions.
  4. **Fixes needed by Phase 2b:** H6 (check participation status in submissions) and H8 (seat and application consistency on removal).
- **Modules affected:** `favorites/`, `opportunities/`, `volunteers/`, `verifications/`, `submissions/`, `participations/`. These are owned outside the AI module.
- **Testing.** Each fix gets a regression e2e test in the existing suites (`backend/test/*.e2e-spec.ts`).
- **Completion criteria:**
  - one authoritative repository, with Phase 1 committed or reverted;
  - the decisions recorded, e.g. in an OpenSpec change;
  - the listed fixes merged, with tests.

### Phase 1: role-based foundation

- **Objectives.** Basma knows who is asking, safely. Tools receive a principal. The capability policy decides which tools exist for each principal. Nothing personal is answered yet, except one pilot tool.
- **Required changes:**
  - `AgentAuthGuard`, `AgentPrincipalResolver`, `AgentCapabilityPolicy`, `AgentRoleProfiles`;
  - tool contract v2 (`ToolExecutionContext`, `requiredCapability`, `sideEffect`, `audience`);
  - `ToolRegistry.listFor`, and the capability re-check in `ToolExecutor`;
  - `classifyPrivacyRequest`;
  - per-user quota keys;
  - the `meta.principal` field;
  - knowledge `audience` front matter and the retriever filter, including the cache key;
  - prompt v10 / model-first v3 with `<principal_context>`;
  - the frontend sends the Bearer token and refreshes once on a 401 before the stream starts;
  - the knowledge corpus `09-ai-agent/*` updated.
- **Backend files affected:**
  - `ai-agent/ai-agent.controller.ts`, `ai-agent.module.ts`, `ai-agent.types.ts`
  - `orchestrator/ai-agent.orchestrator.ts`, `orchestrator/answer-policy.ts`
  - `prompt/prompt-builder.ts`, `prompt/system-prompt.ts`
  - `tools/tool.types.ts`, `tool-registry.ts`, `tool-executor.ts`, and all seven tool files (signature only)
  - `budget/quota.service.ts`
  - `knowledge/knowledge.types.ts`, `parser.ts`, `retriever.ts`, `knowledge.service.ts`
  - `auth/auth.service.ts` (extract `isSessionLive`), `auth/guards/email-verified.guard.ts` (extract the requirement helper)
  - `organizations/organizations.service.ts` (`isEligibleViewer` delegates to `isSessionLive`)
- **New files:**
  - `ai-agent/auth/agent-auth.guard.ts`, `agent-principal.resolver.ts`, `agent-principal.ts`
  - `ai-agent/policy/agent-capability.policy.ts`, `agent-role-profiles.ts`
  - `ai-agent/audit/agent-audit.service.ts`
  - `ai-agent/tools/volunteer/get-my-applications.tool.ts` (the pilot)
- **Frontend files:** `frontend/src/lib/api/aiAgent.ts`, `frontend/src/hooks/useAiChat.ts`, `frontend/src/components/ai-agent/MessageList.tsx` (role suggestions).
- **Routes.** `POST /ai-agent/chat` (modified). No new route.
- **Tools.** The seven public tools (signature change); the pilot `get_my_applications`.
- **Dependencies.** Phase 0, items 1 and 2.
- **Security:**
  - the §16.3 invariants 1–3 and 7 hold;
  - a 401 or 403 is returned before the stream for bad or ended sessions;
  - the flag `AI_AGENT_ROLE_AWARE=false` keeps today's behaviour byte-identical, proven by a test that compares bytes, as Phase 1 already does for `AI_AGENT_MODEL_FIRST`.
- **Testing:**
  - unit tests for the resolver (every status and session combination) and for the policy (generated table);
  - an executor denial test;
  - e2e tests for the authorization matrix and IDOR on the pilot tool;
  - regression: anonymous dialogues unchanged; new volunteer dialogues for "my applications" in ar and en.
- **Completion criteria:**
  - with the flag on, a signed-in volunteer gets their application statuses;
  - an organization asking the same question gets no volunteer tool;
  - a suspended user or logged-out session gets a 403 or 401 before the stream;
  - all existing AI suites pass.

### Phase 2a: role-specific read capabilities and minimal cards

- **Objectives.** Useful read assistance for each role, with personal data kept out of the model.
- **Required changes:**
  - volunteer read tools (§7.2), then organization read tools (§7.3), then admin read tools (§7.4);
  - the `ToolDtoBridge`;
  - mappers that split `modelView` and `uiView`;
  - per-audience forbidden-key sets;
  - the `ui` SSE event, with 4 card types first: `application_status`, `contribution_status`, `applicant_row`, `admin_queue`;
  - role link allowlists in the backend sanitizer and the frontend `safeChatHref`;
  - deterministic own-data fallbacks in the `exhausted` and `retrieval_only` modes.
- **Backend modules affected:** `participations.module.ts`, `submissions.module.ts`, `verifications.module.ts` and `admin.module.ts` (additive exports only); `ai-agent.module.ts` (imports).
- **New files:**
  - `ai-agent/tools/volunteer/*.tool.ts` (8)
  - `tools/organization/*.tool.ts` (9)
  - `tools/admin/*.tool.ts` (6–8)
  - `tools/mappers/self-*.mapper.ts`
  - `tools/tool-dto-bridge.ts`
  - `ai-agent/ui/ui-components.ts`
  - frontend `components/ai-agent/cards/*.tsx` and `lib/api/aiAgentUi.schemas.ts`
- **Routes.** None new.
- **Dependencies.** Phase 1; Phase 0 item 3.
- **Security.** Invariants 6 and 7. The admin tools return minimized `modelView`. Report and dossier text is treated as untrusted.
- **Testing:**
  - for each tool: a happy path, a foreign-id 404, a capability denial, and a forbidden-key guard check;
  - card schema tests on both ends;
  - the regression corpus extended with about 10 dialogue families per role, in ar and en.
- **Completion criteria:**
  - use cases 1–3, 5, 6, 8 and 10 of §12.5 pass in scripted mode;
  - no personal fields appear in any captured provider request (asserted in the harness);
  - token use per turn for each role is within budget, as reported by the harness.

### Phase 2b: write actions with confirmation

- **Objectives.** The agent prepares actions, and humans confirm them.
- **Required changes:**
  - `PendingActionService` and its schema;
  - `ActionExecutorRegistry`;
  - `ActionsController` (confirm and cancel);
  - the `action` SSE event;
  - the confirmation card, with edits and expiry;
  - TanStack Query invalidation after a confirmation;
  - audit rows.
- **Rollout order of the write tools:**
  1. volunteer favorites;
  2. apply and withdraw;
  3. organization draft, start-review, accept and reject;
  4. publish, close, cancel and complete;
  5. contribution verify and reject, last, because they are irreversible.
- **New files:**
  - `ai-agent/actions/pending-action.schema.ts`, `pending-action.service.ts`, `action-executors.ts`, `actions.controller.ts`, `dto/confirm-action.dto.ts`
  - `tools/*/propose-*.tool.ts`
  - frontend `components/ai-agent/ActionConfirmCard.tsx`
- **Routes.** `POST /ai-agent/actions/:actionId/confirm` and `/cancel`.
- **Dependencies.** Phase 2a; Phase 0 item 4; the decision on organization verification rules.
- **Security.** Invariants 4 and 5. `@Throttle` on confirm. One proposal per turn. `danger: high` needs a second interaction. Behind the flag `AI_AGENT_WRITE_ACTIONS=false`.
- **Testing.** The confirmation-abuse suite (§16.5), the indirect-injection corpus, and the double-click race test.
- **Completion criteria:**
  - use cases 4, 7 and 9 pass end to end;
  - no mutation is possible without a confirm request, proven by tests;
  - an audit row exists for every proposal and outcome.

### Phase 3: advanced agent intelligence

- **Objectives.** Better choices at lower cost.
- **Required changes:**
  - router-scoped tool groups, so model-first declares at most about 10 tools;
  - model-first honours `AI_AGENT_MAX_TOOL_ROUNDS`;
  - **paced** live evaluation, the missing evidence from `phase-1-comparison.md`, before enabling model-first by default;
  - Arabic light stemming and Darija synonym groups;
  - the retrieval `recall@4` metric;
  - deterministic fast paths for the most frequent own-data questions;
  - a decision on conversation persistence (if yes: opt-in, a TTL, deletion with the account).
- **Files.** `router/intent-router.ts`, `orchestrator/ai-agent.orchestrator.ts`, `knowledge/normalizer.ts`, `backend/ai-agent/_config/synonyms.json`, `regression/*`.
- **Dependencies.** Phase 2a; the provider capacity decision.
- **Testing.** The regression baselines are regenerated for each role, and the safety rate stays at 100%.
- **Completion criteria:**
  - live dialogue pass rate measured with a sample large enough to compare the two modes, which Phase 1 lacked;
  - input tokens per turn reduced against Phase 2a;
  - `recall@4` at or above the agreed target.

### Phase 4: generative UI and advanced interactions

- **Objectives.** Richer, interactive answers.
- **Required changes:**
  - the remaining card types (`opportunity_card`, `organization_card`, `experience_card`, `stats_panel`);
  - list cards with "show more", using a cursor through a follow-up turn;
  - optional page context: the frontend sends the current pathname as an **untrusted hint**, e.g. on `/org/applications/[id]` → "this application", and the server resolves it through the normal tools;
  - suggestions per page;
  - a decision on `sources` / `SourceChips`: delete the dead code, or bring it back deliberately.
- **Files.** `ai-agent/ui/*`, the frontend `components/ai-agent/*`, `ChatDto` (an optional `pageContext`, with strict validation).
- **Security.** `pageContext` never selects a record by itself; tools re-check ownership.
- **Completion criteria.** Accessibility (RTL, keyboard), and card rendering verified in both locales.

### Phase 5: specialized AI/ML

- **Objectives.** Better matching, driven by data.
- **Required changes:**
  - **Step 1, now:** extend the `scoreRecommendedOpportunity` heuristic (§15.2), add recommendation explanations, pre-filter `getRecommended` with an index, and log exposures.
  - **Step 2, later:** an offline evaluation harness, then learning-to-rank once the data supports it.
- **Files.** `opportunities/opportunities.service.ts` (recommendation), and a new exposure-log schema (TTL).
- **Dependencies.** H6, H7 and H8 fixed; the privacy notice.
- **Completion criteria.** The offline hit-rate@k for the heuristic is measured, and any candidate model beats it on a held-out period before it ships.

---

## 19. Risks, Trade-offs, and Open Questions

### 19.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The shared provider quota is exhausted by authenticated users | High at the current caps (80 requests per day globally) | Basma becomes unusable for everyone | Per-role allocation; deterministic own-data answers; a provider tier decision |
| Personal data reaches a free-tier provider whose terms allow training on it | Medium | Privacy and legal | `modelView` minimisation; notice; tier choice; review under Law 18-07 |
| Indirect prompt injection through user-generated content | Medium for organizations and admins | Unwanted proposals | Human confirmation; one proposal per turn; no admin writes |
| The capability table drifts from the service rules | Medium | Confusing denials, or tools offered that the service rejects | Services remain the final check; a generated matrix test |
| `AiAgentModule` imports many domain modules (boot time and memory on the free instance; coupling) | Medium | Slower cold starts | Measure the boot time; only additive exports; no import of `AiAgentModule` from domain modules |
| Token growth from role tools | High | Cost, ITPM limits | Router-scoped groups (§12.1) |
| A false refusal or false allowance from the new privacy classifier | Medium | UX or privacy | Classifier tests in ar, en and fr; the conservative default for third-party data stays |
| Wrong state shown (stale or misread status) | Low | Trust | Fetch on every turn; cards built from service data; never from history |
| Knowledge documents contradict the new abilities | High if forgotten | Basma says "I can't sign in" | Update the knowledge in the same release (Phase 1) |
| Nested repositories diverge | Already present | Lost work, confusing reviews | Phase 0, item 1 |

### 19.2 Trade-offs accepted by this design

- **Buffered answers instead of true token streaming.** This raises time-to-first-token in exchange for guards over the whole answer. Keep it. Cards and the `status` events cover the perceived latency.
- **Data minimisation instead of answer richness.** The model writes from first names and statuses; the card shows the rest.
- **Confirmation friction instead of one-shot actions.** This is the explicit cost of "the LLM never authorizes".
- **One shared agent instead of a prompt tuned per role.** The role addenda give most of the tuning value without code paths that drift apart.

### 19.3 Open questions for the product owner and maintainers

1. **Provider and budget.** Which tier and model will serve authenticated traffic? Are its data-use terms acceptable for volunteer data?
2. **Quota allocation.** How should the daily budget be split between anonymous, volunteer, organization and admin users?
3. **Organization verification and decisions.** Should an unverified organization be able to use application or contribution decision tools? The services allow it today; the policy proposal does not (§5.5).
4. **Public statuses.** The AI tools show `in_progress` and `cancelled` opportunities, but the public detail route does not (§3.6). Which one is the rule?
5. **Admin writes.** Should they ever be in scope, or is the agent permanently a read-only analyst for admins?
6. **Conversation persistence.** Is it wanted? If so, for how long, and can admins see it?
7. **French.** The UI is ar/en, but users in Algeria often write French, and Basma replies in English to other languages (`system-prompt.ts`, rule 10). Keep this?
8. **Personal data shown to organizations.** Should cards show exactly the fields `/org/applications/[id]` shows today? (Recommended: mirror the existing page, never more.)
9. **Ownership of fixes.** Who fixes H1–H12, and in which release?
10. **Legal review** of own-data processing and of recommendation profiling.

---

## 20. Final Technical Recommendations

1. **Keep one agent.** Add role profiles as data and a backend-owned capability policy. Do not build agents per role or sub-agents.
2. **Make chat optionally authenticated with a strict `AgentAuthGuard`, and resolve the principal from the database every turn.** Reuse the `isEligibleViewer` logic, extracted once into `AuthService.isSessionLive`.
3. **Change the tool contract before adding any tool.** `handler(input, ctx)`, `requiredCapability`, `sideEffect`, `audience`, with a capability re-check in the executor.
4. **Implement private tools as adapters over the existing services, called with the server-resolved `AccountToken`.** Validate through the existing DTO classes. Never accept caller identifiers as arguments. Never write new Mongo queries for private data.
5. **Split every tool output into a `modelView` (minimal) and a `uiView` (a server-built card).** Personal data travels to the user, not to the model.
6. **Writes are proposals.** Execution happens only through `POST /ai-agent/actions/:id/confirm`: bound to the user and session, single-use, TTL'd, re-authorized, audited, with no LLM on the path. Start with reversible and low-risk actions; verifying contributions comes last. Keep admin writes out.
7. **Replace `isPrivateDataRequest` with a role-aware classifier.** Third-party contact data is always refused; own data is allowed once authenticated.
8. **Add `audience` to the knowledge front matter** and filter retrieval by it, including the cache key. Update the `09-ai-agent` documents in the same release.
9. **Adopt model-first tool selection within router-scoped tool groups.** Make it honour the configured tool-round cap. Collect paced live evidence before making it the default.
10. **Fix H3, H4, H7 and H11 before the read tools, and H6 and H8 before the writes.** Never reuse `embedFull` in an agent tool.
11. **Add an agent audit trail** to the existing `audit_logs`, because business `POST`s are not audited today.
12. **Add no infrastructure beyond one MongoDB TTL collection.** No agent framework, vector database, Redis or queue at this stage.
13. **Treat quota as a product decision.** Decide the provider tier and the per-role allocation before Phase 2 reaches real users.
14. **Start ML with the heuristic that already exists.** Add exposure logging and an offline evaluation, and train nothing until the labels are clean and the volume justifies it.

---

## Appendix A: Key file reference (EXISTING)

| Concern | File |
|---|---|
| Global guards, their order | `backend/src/app.module.ts:100-105` |
| JWT payload and strategy | `backend/src/auth/jwt.strategy.ts`, `backend/src/common/interfaces/account-token.interface.ts` |
| Roles guard | `backend/src/common/guards/roles.guard.ts` |
| Suspended guard | `backend/src/common/guards/suspended.guard.ts` |
| Optional JWT guard | `backend/src/auth/guards/optional-jwt-auth.guard.ts` |
| Email gate | `backend/src/auth/guards/email-verified.guard.ts` |
| Session liveness pattern | `backend/src/organizations/organizations.service.ts:222-250` |
| Session schema with TTL | `backend/src/auth/schemas/session.schema.ts:37-52` |
| Access-token TTL | `backend/src/auth/auth.module.ts:44` |
| Audit interceptor | `backend/src/core/audit/audit.interceptor.ts` |
| Chat controller | `backend/src/ai-agent/ai-agent.controller.ts` |
| Agent module wiring | `backend/src/ai-agent/ai-agent.module.ts` |
| Config and limits | `backend/src/ai-agent/config/ai-agent.config.ts` |
| Orchestrator | `backend/src/ai-agent/orchestrator/ai-agent.orchestrator.ts` |
| Private-data guard, answer caps | `backend/src/ai-agent/orchestrator/answer-policy.ts` |
| Sanitizer | `backend/src/ai-agent/orchestrator/answer-sanitizer.ts` |
| Router | `backend/src/ai-agent/router/intent-router.ts` |
| Prompt builder, system prompts | `backend/src/ai-agent/prompt/prompt-builder.ts`, `system-prompt.ts` |
| Tool contract, registry, executor | `backend/src/ai-agent/tools/tool.types.ts`, `tool-registry.ts`, `tool-executor.ts`, `tool-input.ts` |
| BM25, normalizer, retriever | `backend/src/ai-agent/knowledge/bm25.ts`, `normalizer.ts`, `retriever.ts` |
| Providers | `backend/src/ai-agent/llm/*.ts` |
| Quota | `backend/src/ai-agent/budget/quota.service.ts` |
| Recent entities / focus | `backend/src/ai-agent/recent-entities.ts`, `conversation-focus.ts` |
| Knowledge corpus | `backend/ai-agent/**` |
| Phase 1 evidence | `backend/test/ai-baseline/phase-1-comparison.md` |
| Open OpenSpec change | `openspec/changes/model-first-ai-intent-and-tools/` |
| Ownership helpers | `backend/src/applications/applications.service.ts:89-120`, `backend/src/opportunities/opportunities.service.ts:128-160` |
| Recommender | `backend/src/opportunities/opportunities.service.ts:72-94, 713-760` |
| Frontend chat client | `frontend/src/lib/api/aiAgent.ts`, `frontend/src/lib/api/sse.ts`, `frontend/src/hooks/useAiChat.ts` |
| Widget mount | `frontend/src/app/[locale]/layout.tsx:63-65` |
| Frontend tokens | `frontend/src/lib/auth/storage.ts` |

## Appendix B: Verification log

The parallel audits of the frontend and the business workflows supplied many details. These claims were **re-checked directly in source** before being used in this report:

| Claim | Checked at |
|---|---|
| The chat `fetch` sends no `Authorization` header | `frontend/src/lib/api/aiAgent.ts:535-547` |
| The widget is mounted for every audience | `frontend/src/app/[locale]/layout.tsx:63-65` |
| `SourceChips` is referenced only by its test | grep over `frontend/src` |
| The volunteer guard checks sign-in only | `frontend/src/app/[locale]/volunteer/components.tsx:28` |
| Public opportunity embeds include participant names with no flag check | `backend/src/opportunities/opportunity-embed.provider.ts:222-225, 344-356` |
| `volunteerHours` is incremented by `durationMinutes` | `backend/src/verifications/verifications.service.ts:57, 405` |
| The audit scope is admin or `PATCH`/`DELETE` under prefixes, after success | `backend/src/core/audit/audit.interceptor.ts:37, 57-60` |
| Favorites check only `exists({_id})` | `backend/src/favorites/favorites.service.ts:82` |
| Organization status is checked only at publish | `backend/src/opportunities/opportunities.service.ts:450-451` vs `:509-513` |
| `createForParticipation` scopes by volunteer only (no status condition seen in the lookup) | `backend/src/submissions/submissions.service.ts:~228-230` |
| Services take an `AccountToken` and resolve ownership internally | `applications.service.ts:89-120, 179, 306, 409, 484, 640`; `verifications.service.ts:167, 446`; `opportunities.service.ts:128-160, 209, 444, 806` |
| Module exports (which services can be injected) | `*.module.ts` export lines listed in §9.6 |

Claims marked "—" in §16.4 come from the workflow audit and were **not** re-verified. Confirm them with the module owner before planning the fix.

