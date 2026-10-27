# Basmatak AI assistant — operator and developer guide

> **Status:** Session 13 documentation. The implementation is on
> `ai-agent-session-2`; the last code commit before this document is
> `3fa5de6` (security and quota hardening).
>
> **Audience:** backend/frontend maintainers, content owners, and the person
> operating the Render deployment.
>
> **Related documents:** the HTTP contract is in
> [`API_ROUTES.md`](./API_ROUTES.md#ai-agent); deployment and production smoke
> steps are in [`DEPLOY.md`](./DEPLOY.md); security evidence and accepted risks
> are in [`AI_AGENT_SECURITY_CHECKLIST.md`](./AI_AGENT_SECURITY_CHECKLIST.md);
> quota evidence is in [`AI_AGENT_QUOTA_LOAD.md`](./AI_AGENT_QUOTA_LOAD.md);
> corpus authoring rules are in
> [`backend/ai-agent/README.md`](../backend/ai-agent/README.md).

## 1. What the assistant is, and what it is not

The Basmatak assistant is an optional, public, bilingual chat widget. It answers
only from two sources:

1. the reviewed knowledge corpus committed under `backend/ai-agent/`; and
2. read-only public database tools: published opportunities, verified active
   public organization profiles, public reference data, and public platform
   counts.

Every substantive answer must carry validated citations (`[K#]` for knowledge,
`[T#]` for public data) or be replaced by a localized refusal. There is no web
search, no general-knowledge fallback, no browsing, and no runtime knowledge
upload.

**Out of scope, by design:**

- individual volunteer or talent profiles, contact details, applications,
  submissions, account data, private organization fields, and internal ids;
- private data of the person chatting, including their identity or account;
- PDF/DOCX ingestion, embeddings, a vector database, a new collection, or a
  schema migration;
- server-side chat persistence;
- paid services, key rotation, extra Google projects, or billing to bypass
  quota.

The feature is free-tier constrained. Its safety depends on conservative
defaults, in-memory quotas, a single Render instance, and the ability to turn it
off immediately with `AI_AGENT_ENABLED=false`.

## 2. Architecture and request flow

### 2.1 Components

| Layer | Component | Responsibility |
|---|---|---|
| Frontend | `frontend/src/components/ai-agent/` (`AiAgentWidget`, panel, launcher, message/source views) | Floating launcher, accessible panel, RTL/i18n, status and retry states, plain-text rendering, safe source links. |
| Frontend | `frontend/src/hooks/useAiChat.ts` | Client conversation state, request history (at most the recent turns), abort/retry, session-storage hydration. |
| Frontend | `frontend/src/lib/api/aiAgent.ts`, `sse.ts` | Typed status/chat client, POST streaming with `fetch`, SSE frame parser, error mapping, `Retry-After` fallback. |
| Backend transport | `backend/src/ai-agent/ai-agent.controller.ts` | Validation boundary, kill switch, quota reservation/commit/release, SSE lifecycle, `meta` and `done`, request logging. |
| Backend transport | `sse/sse-writer.ts` | Exact SSE headers, `event:`/`data:` framing, 15-second comment heartbeat, close detection. |
| Backend engine | `orchestrator/ai-agent.orchestrator.ts` | Private-data guard, routing, retrieval, prompt, provider/tool rounds, citation validation, refusals, degradation, 45-second deadline. |
| Backend engine | `router/intent-router.ts` | Deterministic intent/language routing (knowledge, live data, mixed, direct reply, refusal). |
| Backend engine | `knowledge/` | Boot-time safe loader, parsers, chunker, normalizer, BM25 index, bounded retrieval. |
| Backend engine | `prompt/` | Versioned grounded prompt, untrusted-section escaping, input-token budget and trimming order. |
| Backend engine | `tools/` | Four read-only public tools with explicit projections and a bounded executor. |
| Backend engine | `llm/` | Provider-neutral contract and `gemini`, `mock`, and `fake` adapters; normalized provider errors. |
| Backend budget | `budget/quota.service.ts` | UTC minute/day windows per IP and globally, concurrency, token reservation, mode ladder, provider cooldowns. |
| Backend budget | `usage/` | In-memory aggregates and the admin-only usage report; allowlisted structured log line. |

### 2.2 One chat request

1. **Validation.** The global validation pipe rejects unknown fields, invalid
   JSON, oversized bodies, and DTO violations before the handler runs. The
   public contract is fixed: message 1–2,000 characters, locale `en`/`ar`,
   optional history of at most 4 messages and 2,400 characters.
2. **Kill switch.** If `AI_AGENT_ENABLED` is not the literal trimmed `true`,
   the handler logs a disabled outcome and returns `503 AI_AGENT_DISABLED`
   before touching quota or SSE state.
3. **Reservation.** The controller estimates input tokens, checks per-IP
   minute/day, global minute/day, concurrency, any provider cooldown, the
   degradation mode, and the daily token budget. All checks are in memory and
   all-or-nothing.
4. **SSE start.** On an allowed or locally degraded request the response becomes
   `200 text/event-stream`, and `meta` is written first with a random
   `conversationId`, the requested locale, and the effective mode.
5. **Answer policy.** The orchestrator refuses private-data requests before any
   provider call, applies the mode caps, retrieves knowledge, routes live-data
   questions to tools, and builds a grounded prompt.
6. **Provider and tools.** The selected provider may request at most three
   provider calls in one turn (default one tool round). Tool calls are
   allowlisted, schema-validated, bounded by rows/characters, and executed
   read-only.
7. **Grounding check.** Model output is buffered until the turn ends. Citations
   are validated against the actual retrieved chunks/tool rows, and a
   system-instruction leak guard runs before any answer text is streamed. A
   failed check becomes the localized ungrounded refusal, never partial text.
8. **Sources and tokens.** `sources` is emitted only after validation, followed
   by `token` deltas. The controller commits real usage, releases the
   concurrency slot exactly once, writes the structured request log, and emits
   `done`.
9. **Abort or failure.** A client disconnect aborts the provider and writes no
   further events. A known provider failure writes a localized in-stream
   `error` and no `done`. Pre-stream denials remain ordinary JSON errors.

### 2.3 Grounding and refusal rules

- The assistant refuses requests for the caller's or another person's private
  data before routing or calling a provider.
- Knowledge-only, mixed, and live-data questions are routed deterministically;
  greetings and capability questions get citation-exempt direct replies.
- A tool result with no usable public rows is treated as “not found”; there is
  no speculative follow-up call.
- An answer with missing/invalid citations, an empty answer, or a prompt-leak
  match is replaced by a complete refusal. `sources` is not emitted for an
  unvalidated answer.
- The provider never receives volunteer profiles, private organization fields,
  applications, submissions, account data, or the caller's IP.

## 3. HTTP surface

The full request/response contract, including every SSE event and error code,
is in [`API_ROUTES.md`](./API_ROUTES.md#ai-agent). The three routes are:

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/v1/ai-agent/status` | public | Feature flag, degradation mode, aggregate knowledge counts, fixed public limits. Never exposes provider/model/key/usage. |
| `POST /api/v1/ai-agent/chat` | public, quota-limited | `200` SSE answer stream. Pre-stream denials are JSON; in-stream failures use `error`. |
| `GET /api/v1/ai-agent/usage` | admin Bearer | Aggregate today/7-day counters and the daily budget snapshot. Anonymous `401`, non-admin `403`. |

The public limits do not change with environment variables:
`messageChars=2000`, `historyMessages=4`, `historyChars=2400`.

## 4. Knowledge authoring and update workflow

### 4.1 Where content lives

The canonical corpus is `backend/ai-agent/`. On Render the service root is
`backend/`, so the committed folder ships with the service. At boot the loader
resolves:

```text
AI_AGENT_KNOWLEDGE_DIR, otherwise <backend cwd>/ai-agent
```

Do not point the override at `docs/`, the repository root, a home directory, or
a folder containing environment files. Files outside `backend/ai-agent/` are
outside the deployed service root.

### 4.2 Formats and limits

| Format | How it is indexed |
|---|---|
| `.md` | UTF-8 prose with optional YAML front matter; split by headings/paragraphs with a heading trail. |
| `.txt` | UTF-8 prose with optional front matter; split by paragraphs; first H1 is the title fallback. |
| `.json` | UTF-8 JSON; string leaves flattened with key paths; arrays of objects become records. |
| `.csv` | UTF-8 CSV with a header row; one chunk per row with column names. |

`README.md`, `_config/`, hidden files/directories, underscore directories,
`node_modules`, `dist`, `.git`, and symlinks are ignored or rejected. The
checker enforces at most 100 indexed files, 5 MB total, 1 MB per file, strict
UTF-8, valid front matter, unique titles, and the secret/PII/formula/content
rules. A corpus that fails the checker cannot produce a backend build.

### 4.3 Update procedure

1. Edit the English and Arabic counterparts together. Keep facts, conditions,
   and section order parallel; use a native-speaker review for Arabic.
2. From `backend/`, run `npm run ai:check`. Fix every error; read every warning,
   especially a missing English/Arabic pair.
3. Review the diff for public-only content: no secrets, env names, emails,
   phone numbers, private addresses, application data, internal ids, or draft
   notes.
4. Commit the content with the code or documentation change that caused it.
5. Deploy. The folder ships with the backend; there is no runtime upload step.
6. Restart the service (Render restarts on deploy or env change). The index is
   built **once at boot**; there is no file watching or hot reload.
7. Verify `GET /api/v1/ai-agent/status` shows a non-zero `knowledge.files` and
   `knowledge.chunks`, then ask one question that should cite the changed
   content.

`npm run build` runs `npm run ai:check` through the `prebuild` hook. The
runtime loader logs only aggregate counts and issue codes, never file contents.
If loading or chunking fails, the service still boots with zero counts and
answers “not found” rather than serving stale or unsafe content.

## 5. Configuration

All AI settings are read once at boot from the environment. Missing, blank, or
non-integer numeric values use the documented default; out-of-range integers
are clamped to the hard bound. Booleans accept `true`/`false` (case-insensitive)
and otherwise fall back to the default. Only the literal trimmed `true` enables
the feature.

### 5.1 Variables

| Variable | Default | Hard maximum | Notes |
|---|---|---|---|
| `AI_AGENT_ENABLED` | `false` | — | Kill switch. Only literal `true` enables chat. |
| `AI_AGENT_PROVIDER` | `gemini` | — | Case-insensitive `gemini`, `mock`, or `fake`. Unknown values fail closed on the first turn. |
| `AI_AGENT_MODEL` | `gemini-3.8-flash` | — | Provider-specific model id. Changing it is a config-only change after restart. |
| `GEMINI_API_KEY` | unset | — | **Secret.** Server-side only, read lazily; never commit, log, expose to the frontend, or put in SSE/errors. |
| `AI_AGENT_KNOWLEDGE_DIR` | unset → `<cwd>/ai-agent` | — | Override for local testing only; keep unset in production. |
| `AI_AGENT_MAX_INPUT_TOKENS` | `3000` | `100000` | Estimated input cap; the prompt builder trims optional content to fit and fails closed if reserved content cannot fit. |
| `AI_AGENT_MAX_OUTPUT_TOKENS` | `400` | `800` | Per-turn output cap; conservative mode lowers it to 300. |
| `AI_AGENT_MAX_HISTORY_MESSAGES` | `4` | `8` | Prompt history cap. The public DTO still accepts at most 4. |
| `AI_AGENT_MAX_HISTORY_CHARS` | `2400` | `6000` | Prompt history character cap. The public DTO still accepts at most 2,400. |
| `AI_AGENT_MAX_KNOWLEDGE_CHUNKS` | `4` | `6` | BM25 chunks considered per turn. |
| `AI_AGENT_MAX_KNOWLEDGE_CHARS` | `6000` | `8000` | Retrieved knowledge characters in the prompt. |
| `AI_AGENT_MAX_TOOL_ROUNDS` | `1` | `2` | Tool follow-up rounds per turn; the executor also caps total provider calls at 3. |
| `AI_AGENT_MAX_TOOL_ROWS` | `5` | `8` | Rows per tool call. |
| `AI_AGENT_MAX_TOOL_RESULT_CHARS` | `1200` | `3000` | Shared tool-context characters. |
| `AI_AGENT_IP_RPM` | `4` | `1000` | Per-IP requests per UTC minute. |
| `AI_AGENT_IP_RPD` | `15` | `100000` | Per-IP requests per UTC day. |
| `AI_AGENT_GLOBAL_RPM` | `8` | `10000` | All users, UTC minute. 8 is 80% of the documented 10 RPM free-tier ceiling; verify the live AI Studio value at deploy. |
| `AI_AGENT_GLOBAL_RPD` | `80` | `1000000` | All users, UTC day. Deliberately conservative while traffic is unknown. |
| `AI_AGENT_MAX_CONCURRENT` | `2` | `100` | Simultaneous provider turns; extra requests get `AI_AGENT_BUSY`. |
| `AI_AGENT_DAILY_TOKEN_BUDGET` | `150000` | `10000000` | Estimated input + output tokens per UTC day. |
| `AI_AGENT_RETRIEVAL_FALLBACK` | `true` | — | At 100%, serve extractive knowledge snippets instead of calling a provider. |
| `AI_AGENT_FALLBACK_ENABLED` | `false` | — | Parsed for forward compatibility, but **no second adapter is selected in this build**. Leave `false`; do not rely on automatic fallback. |

Fixed, non-environment limits: 45-second total turn deadline, three provider
calls maximum, one 250 ms transient-5xx retry only before any text/tool call,
no retry for 429/timeout/abort/invalid responses, and a 15-second SSE heartbeat.

### 5.2 Secrets and provider access

- `GEMINI_API_KEY` belongs in the Render dashboard or Secret Files with
  `sync: false`. It must never appear in `render.yaml`, `.env.example`, a
  screenshot, a build artifact, an error body, an SSE frame, or a log line.
- The provider SDK client is constructed lazily on the first turn. Boot,
  `/health`, and `/ai-agent/status` work without a key; a turn without a key
  fails closed with `AI_AGENT_PROVIDER_UNAVAILABLE`.
- Do not put keys in the knowledge corpus. The checker rejects Google-style
  keys and provider env names.
- If a key is exposed: disable the feature first (`AI_AGENT_ENABLED=false`,
  restart), revoke/replace the key in the provider console, update the Render
  secret, verify the disabled state, then re-enable after a successful smoke.

## 6. Quota modes, degradation, and cooldowns

### 6.1 Mode ladder

The mode is the most restrictive of two daily ratios:

```text
max(committed tokens / AI_AGENT_DAILY_TOKEN_BUDGET,
    global daily requests / AI_AGENT_GLOBAL_RPD)
```

| Utilization | Mode | Behavior |
|---|---|---|
| `< 70%` | `normal` | Full configured caps. |
| `>= 70%` | `conservative` | Fewer chunks/history/output tokens/rows and at most one tool call. |
| `>= 90%` | `knowledge_only` | No tools; live-data questions get a limitation message plus browse links; provider may still answer knowledge questions. |
| `>= 100%` | `exhausted` | No provider and no retrieval. With `AI_AGENT_RETRIEVAL_FALLBACK=true` this is exposed as `retrieval_only`; otherwise as `exhausted`. |

A day-scoped provider cooldown also forces `exhausted`, even when local counters
are low. A minute-scoped cooldown does not change the public mode; it denies the
next reservation instead.

### 6.2 Per-mode caps

| Mode | Knowledge chunks | History messages | Output tokens | Tool calls | Tool rounds | Tool rows | Provider |
|---|---|---|---|---|---|---|---|
| `normal` | configured (4) | configured (4) | configured (400) | 3 | configured (1) | configured (5) | yes |
| `conservative` | min(3, configured) | min(2, configured) | min(300, configured) | 1 | min(1, configured) | min(3, configured) | yes |
| `knowledge_only` | configured | configured | configured | 0 | 0 | 0 | yes |
| `retrieval_only` | min(2, configured) | 0 | 0 | 0 | 0 | 0 | no |
| `exhausted` | 0 | 0 | 0 | 0 | 0 | 0 | no |

`retrieval_only` extracts up to two knowledge chunks with citations and a fixed
intro. For a mixed/live question it adds the live-results limitation and browse
links. `exhausted` returns the fixed free-limit message plus browse links.

### 6.3 Request gates and denial behavior

Checks run in this order: per-IP minute, per-IP day, global minute, global day,
concurrency, provider cooldown, mode, then token-budget reservation.

| Denial reason | Code | HTTP | Retry behavior |
|---|---|---|---|
| `ip_minute`, `ip_day`, `global_minute`, `global_day` | `RATE_LIMITED` | `429` | Pre-stream JSON with `Retry-After` and `details.retryAfterSeconds`. Wait for the UTC window. |
| `concurrency` | `AI_AGENT_BUSY` | `429` | Pre-stream JSON; retry after 1 second. |
| `cooldown_minute`, `cooldown_day` | `AI_AGENT_QUOTA_EXHAUSTED` | `429` | Pre-stream JSON with the cooldown reset. |
| `mode`, `token_budget` | `AI_AGENT_QUOTA_EXHAUSTED` | not returned | The controller answers locally with `retrieval_only`/`exhausted` and HTTP `200` SSE. No provider call is made. |

A token-budget denial can occur before 100% utilization when a
worst-case reservation no longer fits. It deliberately degrades to the local
fallback instead of returning 429, so the user still gets public browse links.

### 6.4 Provider 429s and cooldowns

A provider 429/`RESOURCE_EXHAUSTED` is normalized to a quota error. The
orchestrator marks a minute or day cooldown (a retry hint over 60 seconds is
treated as a day), emits an in-stream `error` with code
`AI_AGENT_QUOTA_EXHAUSTED` and `retryAfterSeconds`, and does not retry. The HTTP
status is already `200` because the SSE stream has started.

While a minute cooldown is active, the next request is denied before streaming
with `429 AI_AGENT_QUOTA_EXHAUSTED`. A day cooldown additionally makes
`status.mode` `exhausted`. Cooldowns reset at the relevant UTC boundary (or when
the process restarts); there is no key rotation or billing workaround.

### 6.5 Tuning rules

- Keep `AI_AGENT_GLOBAL_RPM` below the live provider ceiling. The default 8
  leaves 20% headroom for tool follow-ups, retries, and a key shared with other
  apps.
- Keep daily request/token caps deliberately below the provider’s daily quota;
  traffic is unknown at launch.
- Do not raise multiple caps at once. Change one cap, restart, watch
  `GET /ai-agent/usage` and the structured logs, then decide.
- Restarting Render (deploy or env change) resets all in-memory quota/usage
  counters and cooldowns. A restart temporarily restores the daily budget.
- All counters are per process. The current deployment is one Render instance;
  horizontal scaling would weaken global limits and is not supported by this
  design.
- 70% and 90% threshold alerts are logged once per UTC day (WARN and ERROR);
  100% logs an explicit budget alert.

## 7. Provider selection and fallback

`AI_AGENT_PROVIDER` is selected case-insensitively at boot:

| Value | Adapter | Intended use |
|---|---|---|
| `gemini` | Real Gemini Interactions API adapter | Production/default. Requires `GEMINI_API_KEY`. |
| `mock` | Deterministic mock answer | Local tests and deterministic smoke only; not a production answer source. |
| `fake` | Scripted provider double | Unit/e2e tests only. |
| anything else | Unavailable adapter | Fails closed on the first turn with `AI_AGENT_PROVIDER_UNAVAILABLE`; the process still boots. |

Switch procedure:

1. Change `AI_AGENT_PROVIDER` (and `AI_AGENT_MODEL` if needed) in the Render
   environment.
2. Restart/redeploy. Render applies environment changes by restarting, so this
   is not a hot reload.
3. Verify `GET /api/v1/ai-agent/status` is `200` and `enabled` is true.
4. Send one chat. With `mock`/`fake`, expect deterministic text and no real
   provider dependency; do not use those modes for public traffic.
5. Switch back to `gemini`, restart, and confirm one grounded answer with
   citations.

**Automatic fallback is not active in this build.** `AI_AGENT_FALLBACK_ENABLED`
is parsed and defaults to `false`, but no second provider is configured or
selected by the orchestrator. Keep it `false`; a provider outage is handled by
the explicit unavailable/timeout errors, quotas, and the kill switch, not by a
silent paid fallback.

## 8. Kill switch, deployment, and rollback

### 8.1 Kill switch

`AI_AGENT_ENABLED` is intentionally strict: only a trimmed literal `true`
enables chat. Missing, `false`, `TRUE`, `1`, `yes`, or any typo keeps it
disabled.

To disable in production:

1. Set `AI_AGENT_ENABLED=false` in the Render environment.
2. Apply/restart. Render restarts the service; the switch is read at boot.
3. Verify `GET /api/v1/ai-agent/status` returns `200` with `"enabled": false`.
4. Verify `POST /api/v1/ai-agent/chat` returns `503` with code
   `AI_AGENT_DISABLED`. No provider call or quota charge occurs.
5. Confirm the widget shows the unavailable state. The rest of the site
   (opportunities, organizations, accounts) is unaffected.

Re-enable only after the cause is fixed and the smoke check is ready. A restart
also resets in-memory quota/usage counters.

### 8.2 Deploy order

The full Render click-path and environment table are in
[`DEPLOY.md`](./DEPLOY.md). The required order is:

1. Pre-deploy: `npm run ai:check`, backend lint/tests/build, frontend
   lint/tests/build, and the deployment-config test.
2. Set `AI_AGENT_ENABLED=false` and `GEMINI_API_KEY` as a secret (plus the
   provider/model and caps) in Render. Deploy.
3. Verify status is disabled and chat returns `503 AI_AGENT_DISABLED`.
4. Set `AI_AGENT_ENABLED=true`; restart. Verify status `enabled: true`, mode
   `normal` (or the expected degraded mode), and non-zero knowledge counts.
5. Run the production smoke checklist in `DEPLOY.md` §9.
6. If any check fails, set `AI_AGENT_ENABLED=false` immediately, restart, and
   verify the disabled state. Stop; do not keep testing against a broken
   deployment.

### 8.3 Rollback

- **Feature rollback:** `AI_AGENT_ENABLED=false` + restart + verify disabled.
- **Code rollback:** deploy the previous commit. There is no database migration
  and no new collection; the knowledge folder ships with the code.
- **Provider rollback:** switch `AI_AGENT_PROVIDER` back to the previous value,
  restart, and verify one turn. Keep the key server-side.
- **Secret rollback:** disable first, revoke/replace the key in the provider
  console, update Render, then re-enable after verification.

## 9. Privacy, logging, and data handling

### 9.1 What leaves the backend

For a provider-backed turn, the prompt sent to the provider contains:

- the caller’s message and the recent history the caller chose to send;
- reviewed public knowledge chunks and public tool results;
- the system rules and tool declarations.

It does **not** contain the caller’s account identity, email, IP, private
organization fields, volunteer profiles, applications, submissions, or
retrieved private data. Public tool projections are explicit allowlists.

The free-tier provider terms may allow the provider to use submitted data to
improve its services and to review it. The privacy notice tells users not to
include personal, confidential, or sensitive information. Treat every message
and every knowledge file as potentially provider-visible and public.

### 9.2 Logs and usage

The structured AI request log contains only allowlisted operational fields:

```text
event, requestId, mode, provider, locale, messageChars, historyMessages,
historyChars, toolNames, inputTokens, outputTokens, totalTokens, estimated,
firstTokenMs, latencyMs, finishReason, truncated, errorCode
```

It does **not** contain message text, prompts, retrieved text, tool arguments or
payloads, conversation ids tied to a person, emails, or IP addresses. The
`conversationId` is a random per-request UUID. Provider error bodies and keys are
discarded during normalization.

The admin usage report contains aggregate today/7-day counters (requests,
tokens, tool calls, refusals, rate-limited count, average latency) and the
budget snapshot. It contains no content, IP, or per-user rows. Both the report
and the quota state are in memory and reset on restart.

### 9.3 Browser storage and retention

The backend does not persist conversations and has no chat collection. The
frontend keeps the current transcript in `sessionStorage` under
`basmatak.aiAgent.history` (versioned, at most 30 completed messages) so a
reload in the same tab can restore it. It is cleared by “new chat”, sign-out,
session expiry, or closing the tab. The server receives only the recent history
the client chooses to include in a request.

### 9.4 Operational rules

- Never paste a real key, private env value, or user message into an issue,
  screenshot, commit, PR, or log.
- Do not add PII, private data, internal identifiers, or draft notes to the
  knowledge corpus.
- Do not enable debug logging of prompts or tool payloads. The privacy
  guarantees depend on the allowlisted log fields.
- If a user asks for private data, the deterministic guard refuses before the
  provider call. Do not weaken it to “improve” an answer.

## 10. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `status.enabled=false`; chat `503 AI_AGENT_DISABLED` | Kill switch missing/not literal `true` | Set `AI_AGENT_ENABLED=true`, restart, verify status and one turn. |
| Chat starts SSE then `error AI_AGENT_PROVIDER_UNAVAILABLE` | Missing/invalid `GEMINI_API_KEY`, unavailable model, or provider outage | Verify the Render secret exists without printing it; check provider status/model; fix the secret or switch provider deliberately. |
| `error AI_AGENT_TIMEOUT` | Provider/tool exceeded the 45-second turn deadline | Retry once; if persistent, lower caps, check provider latency, or disable. |
| Pre-stream `429 RATE_LIMITED` with `details.reason` `ip_*`/`global_*` | Per-IP or global UTC window exhausted | Honor `Retry-After`; wait for the UTC reset; do not rotate keys or create projects. |
| `429 AI_AGENT_BUSY` | `AI_AGENT_MAX_CONCURRENT` reached | Retry shortly; raise the cap only if the provider and instance can handle it. |
| `429 AI_AGENT_QUOTA_EXHAUSTED` before SSE | Provider cooldown or daily mode/cooldown | Check `GET /ai-agent/usage` and `status.mode`; wait for the window or keep the feature disabled. |
| In-stream `AI_AGENT_QUOTA_EXHAUSTED` | Upstream provider 429 | No automatic retry; the cooldown blocks subsequent calls. Wait, then lower caps if recurrent. |
| `status.mode=conservative` / `knowledge_only` | 70%/90% daily utilization | Expected degradation; check usage and tune deliberately. |
| `status.mode=retrieval_only`/`exhausted` | 100% budget or day cooldown | Expected local fallback; wait for UTC reset or adjust the budget. |
| Answers are refusals / “couldn’t find that” | Knowledge gap, weak retrieval, or invalid citations | Add/repair paired content, run `npm run ai:check`, redeploy, re-test. Do not remove citation checks. |
| `status.knowledge.files=0` or `chunks=0` | Wrong knowledge root, missing folder, or loader/chunker failure | Check the boot log issue codes and `AI_AGENT_KNOWLEDGE_DIR`; keep the folder under `backend/ai-agent/`; restart. |
| SSE arrives all at once | A proxy or client is buffering the stream | Keep `X-Accel-Buffering: no`, `Cache-Control: no-transform`, no compression/buffering proxy; use `curl -N`; test through Render. |
| Browser CORS error | Origin not in `CORS_ORIGIN`, wrong scheme/port, or bare `*` | Use the exact frontend origin, comma-separated; bare `*` is dropped; restart after changing. |
| `413 PAYLOAD_TOO_LARGE` / `415 UNSUPPORTED_MEDIA_TYPE` | Oversized body or unsupported encoding | Send UTF-8 JSON under the body limit; do not retry the same payload. |
| `401`/`403` on usage | Missing/expired token or non-admin role | Use a valid admin Bearer token; this endpoint is not public. |
| Widget shows “waking”/offline | Render free instance is cold or status timed out (10 s) | Wait for wake (about a minute), retry status; keep-alive helps; avoid rapid chat retries. |
| User asks about a private account/contact | Expected privacy guard | The localized refusal is correct; do not add private data to tools or knowledge. |

## 11. Validation commands

From `backend/`:

```powershell
npm run ai:check
npm run lint
npx jest src/ai-agent src/main.spec.ts src/common/filters --runInBand --silent
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent.e2e-spec.ts test/ai-agent-orchestration.e2e-spec.ts test/ai-agent-security.e2e-spec.ts test/ai-agent-quota-load.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/deployment-config.e2e-spec.ts
npm run build
```

From `frontend/`:

```powershell
npm run lint
npm test
npm run build
npx playwright test e2e/ai-agent.spec.ts
```

The five known frontend baseline failures (i18n placeholder audit, audit-log
route coverage, two theme/hex audits, and the theme token gate) are unrelated to
the assistant and must remain unchanged. The production smoke checklist is in
[`DEPLOY.md`](./DEPLOY.md) §9; it requires a human with Render access and a
server-side Gemini secret. Never run it with a key in a shell history or paste a
key into a document.
