# Deploying the backend (Render Free + Atlas M0)

This is the human-run deploy path for the **Basmatak Tatatoua** backend, written
during Session 20. It matches the machine-checkable `render.yaml` blueprint at
the repo root; either path (dashboard click-path or Blueprint import) produces
the same service.

Every once in the 20-session roadmap is verified against in-memory MongoDB.
Deploying points the app at **Atlas M0** and wakes/drives it with a **free
external scheduler** (inventory §10). The free host sleeps after ~15 min idle
(cold start ~1 min) — the scheduler double purpose is keep-alive.

---

## 0. Prerequisites from the roadmap checklist (§3)

You need these accounts/**env values** before connecting the service:

| Value(s) | Source (roadmap §3) |
|---|---|
| `MONGO_URI` | §3.1 MongoDB Atlas free M0 cluster, database `basmatak` in the URI |
| `MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`/`MAIL_USER`/`MAIL_PASS`/`MAIL_FROM` | §3.2 Brevo SMTP (or a Gmail app password) |
| `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_BUCKET` | §3.3 Supabase project + `media` bucket |
| `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`JOBS_KEY` | §3.6 local secrets generator |
| Anything else the app reads | `.env.example` (dev defaults are safe to leave unset in dev only) |

Atlas network access must allow the app: **Network Access → Add IP
`0.0.0.0/0`** (MVP-only; restrict to your office/static IPs before production —
see `backend/README.md`). The URI must include the database name:

```
mongodb+srv://basmatak:<password>@basmatak.<xxxxx>.mongodb.net/basmatak?retryWrites=true&w=majority
```

---

## 1. Create the web service

### Option A — Blueprint import (uses `render.yaml`)

1. Render dashboard → **New → Blueprint** → connect the repo (branch `main`).
2. Render reads `render.yaml`: service **basmatak-backend**, free plan,
   `rootDir: backend`, build `npm ci && npm run build`, start
   `npm run start:prod`, health check `/api/v1/health`.
3. Fill in every `sync: false` variable via **Environment** (or **Secret Files**;
   see §2) and click **Apply**.

### Option B — Dashboard click-path (the exact clicks)

1. Render dashboard → **New → Web Service** → connect the repo.
2. Branch: **main**; **Runtime: Node**; **Region**: any (e.g. Oregon, free).
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `npm run start:prod`
5. **Instance Type:** **Free**.
6. Add the **Environment** variables (§2) and click **Create Web Service**.
7. Render injects `PORT` itself; the app reads `process.env.PORT`. Keep
   **`NODE_ENV=production`** set.

---

## 2. Environment variables (every var the app reads)

`render.yaml` lists all of them (`sync: false` = you set the value in the
dashboard). `PORT` is injected by Render — do **not** set it.

| Variable | Example / source | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Set by the blueprint (dashboard: add it). |
| `NODE_VERSION` | `20` | Pin Node ~20 (blueprint only). |
| `MONGO_URI` | `mongodb+srv://basmatak:…@basmatak.<cluster>.mongodb.net/basmatak?retryWrites=true&w=majority` | §3.1. Include `/basmatak`. |
| `CORS_ORIGIN` | `https://your-frontend.vercel.app` | Comma-separated **exact** origins (scheme, host, optional port). A bare `*` entry is dropped and there is no wildcard mode; trailing slashes are stripped. Restart after changing. |
| `PUBLIC_BASE_URL` | `https://basmatak-backend.onrender.com` | **The Render URL** — used in `/verify/:code` links and emails. |
| `LOG_LEVEL` | `log` | |
| `SWAGGER_ENABLED` | `false` | Swagger is always off in production regardless. |
| `THROTTLE_TTL` | `60` | |
| `THROTTLE_LIMIT` | `100` | |
| `JOBS_KEY` | random 64-hex | §3.6. Also set as a **GitHub Actions secret** (§3). |
| `JWT_ACCESS_SECRET` | random 64-hex | §3.6. |
| `JWT_REFRESH_SECRET` | random 64-hex | §3.6. |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `30d` | |
| `EMAIL_VERIFICATION_REQUIRED` | `true` | |
| `MAIL_HOST` | `smtp-relay.brevo.com` | §3.2. |
| `MAIL_PORT` | `587` | |
| `MAIL_SECURE` | `true`/`false` | |
| `MAIL_USER` | Brevo login | §3.2. |
| `MAIL_PASS` | SMTP key | §3.2. |
| `MAIL_FROM` | verified sender | §3.2. |
| `STORAGE_PROVIDER` | `supabase` | Never `local` on Render. |
| `STORAGE_LOCAL_DIR` | (leave unset) | Dev-only niche. |
| `SUPABASE_URL` | `https://<project>.supabase.co` | §3.3. |
| `SUPABASE_ANON_KEY` | anon key | §3.3. |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | §3.3. |
| `SUPABASE_BUCKET` | `media` | §3.3 (public bucket off). |
| `ADMIN_EMAIL` | admin email | Used by the seed (S17). |
| `ADMIN_PASSWORD` | strong password | Used by the seed (S17). |
| `PUBLISH_GATE_ENABLED` | `true` | |
| `TRUST_PROXY` | `1` | Express proxy hops. Defaults to `1` in production and `false` locally; see §2.1. |
| `AI_AGENT_ENABLED` | `true` | Kill switch. Only the literal `true` enables chat; anything else returns `AI_AGENT_DISABLED` (503). |
| `AI_AGENT_PROVIDER` | `gemini` | `gemini`, `groq`, `mock`, or `fake`. Unknown values fail closed on the first turn. |
| `AI_AGENT_MODEL` | `gemini-3.8-flash` | Provider-specific model id. For Groq, use an id returned by `GET https://api.groq.com/openai/v1/models`. |
| `GROQ_API_KEY` | Groq key | Server-side secret only, required when `AI_AGENT_PROVIDER=groq`. Never expose it to the frontend, SSE, logs, or errors. |
| `GEMINI_API_KEY` | Gemini key | Server-side secret only, required when `AI_AGENT_PROVIDER=gemini`. Never expose it to the frontend, SSE, logs, or errors. |
| `AI_AGENT_KNOWLEDGE_DIR` | (unset) | Unset → `<backend cwd>/ai-agent`; the folder ships with the repo. |
| `AI_AGENT_MAX_INPUT_TOKENS` | `3000` | Estimated input cap before each provider call. |
| `AI_AGENT_MAX_OUTPUT_TOKENS` | `400` | Hard max 800. |
| `AI_AGENT_MAX_HISTORY_MESSAGES` | `6` | Hard max 8. |
| `AI_AGENT_MAX_HISTORY_CHARS` | `4000` | Hard max 6000. |
| `AI_AGENT_MAX_KNOWLEDGE_CHUNKS` | `4` | Hard max 6. |
| `AI_AGENT_MAX_KNOWLEDGE_CHARS` | `6000` | Hard max 8000. |
| `AI_AGENT_MAX_TOOL_ROUNDS` | `1` | Hard max 2. |
| `AI_AGENT_MAX_TOOL_ROWS` | `5` | Hard max 8. |
| `AI_AGENT_MAX_TOOL_RESULT_CHARS` | `1200` | Shared tool context ≤3000. |
| `AI_AGENT_IP_RPM` | `4` | Per-IP requests per UTC minute. |
| `AI_AGENT_IP_RPD` | `15` | Per-IP requests per UTC day. |
| `AI_AGENT_GLOBAL_RPM` | `8` | 80% of the published 10 RPM free-tier ceiling; verify in AI Studio. |
| `AI_AGENT_GLOBAL_RPD` | `80` | Deliberately below the provider daily ceiling because traffic is unknown. |
| `AI_AGENT_MAX_CONCURRENT` | `2` | Extra requests get `AI_AGENT_BUSY` (429) immediately. |
| `AI_AGENT_DAILY_TOKEN_BUDGET` | `150000` | Estimated input + output tokens per UTC day. |
| `AI_AGENT_RETRIEVAL_FALLBACK` | `true` | Extractive sources instead of an LLM at 100%. |
| `AI_AGENT_FALLBACK_ENABLED` | `false` | Parsed for forward compatibility, but no second adapter is selected in this build. Keep `false`; automatic fallback is not active. |

### 2.1 Proxy, AI switches, cold starts, and restarts

- `TRUST_PROXY` is what makes per-IP throttling see the real client behind
  Render. `1` is correct for Render's single reverse-proxy hop. Leave it
  `false`/unset for local direct connections so `X-Forwarded-For` cannot be
  spoofed; never set `1` on a directly reachable instance, because rotating the
  header would bypass `AI_AGENT_IP_RPM`/`RPD`. The value is resolved once at
  boot; an invalid value fails closed to `false`.
- The AI kill switch (`AI_AGENT_ENABLED`) and provider/model are read at boot.
  Only the literal trimmed `true` enables chat. Render applies environment
  changes by restarting the service, so a switch is a config change + restart,
  not a zero-downtime hot reload.
- The in-memory quota/usage counters (UTC minute/day windows, concurrency,
  provider cooldowns, and the daily token budget) reset on every restart. That
  is expected single-instance behavior, not a way to bypass provider limits;
  do not use restarts to evade a quota.
- **Cold start:** the free instance sleeps after about 15 minutes idle and the
  first request can take about a minute. The widget's status probe times out
  after 10 seconds and shows its waking/offline state; retry status after the
  host wakes. The 15-minute keep-alive in §3 reduces (but does not eliminate)
  cold starts. Do not retry chat in a tight loop while waking: every accepted
  request counts against the per-IP and provider quotas.
- Changing `AI_AGENT_PROVIDER` selects the adapter at boot; no orchestrator,
  prompt, SSE, or frontend change is needed. Automatic fallback is **not active
  in this build**: `AI_AGENT_FALLBACK_ENABLED` is parsed but no second adapter
  is configured. Keep it `false`.

### 2.2 AI secrets and deploy order

Set the key for the selected provider (`GROQ_API_KEY` for `groq`,
`GEMINI_API_KEY` for `gemini`) in the Render **Environment** or **Secret File**
with `sync: false`; never put it in `render.yaml`, `.env.example`, git, a shell
history, a screenshot, a build log, an issue, the frontend bundle, an SSE frame,
or an error body. It is read lazily, so boot, `/health`, and `/ai-agent/status`
work without it; a chat turn without a valid key fails closed with
`AI_AGENT_PROVIDER_UNAVAILABLE`.

Never ask a user to paste the key into a chat, ticket, or commit. If a key is
exposed:

1. Set `AI_AGENT_ENABLED=false` and restart; verify `status.enabled=false` and
   `503 AI_AGENT_DISABLED`.
2. Revoke/replace the key in the Google AI Studio console.
3. Update the Render secret (never print the value) and verify the disabled
   state again.
4. Re-enable only after a successful smoke turn.

Do not create extra Google projects, rotate keys, or enable billing to get
around a free-tier limit.

**Deploy order** (do not enable chat on the first deploy):

1. Pre-deploy: run the backend/frontend validation commands in §7 and
   `AI_AGENT.md` §11, including `npm run ai:check` and
   `test/deployment-config.e2e-spec.ts`.
2. In Render, set `AI_AGENT_ENABLED=false`, `AI_AGENT_PROVIDER=gemini`,
   `AI_AGENT_MODEL=gemini-3.8-flash`, the default caps, `TRUST_PROXY=1`, the
   exact `CORS_ORIGIN` allowlist, and `GEMINI_API_KEY` as a `sync: false`
   secret (or use `groq` with `GROQ_API_KEY` and a Groq model id). Keep
   `AI_AGENT_FALLBACK_ENABLED=false`.
3. Deploy the commit. Wait for the health check and the knowledge index to load.
4. Verify the disabled state: `GET /api/v1/ai-agent/status` returns `200` with
   `"enabled": false`, and `POST /api/v1/ai-agent/chat` returns
   `503 AI_AGENT_DISABLED` without starting SSE. The widget shows unavailable.
5. Set `AI_AGENT_ENABLED=true`, apply (Render restarts), and verify
   `status.enabled=true`, `status.mode=normal` (or the expected degraded mode),
   and non-zero `knowledge.files`/`knowledge.chunks`.
6. Run the production smoke checklist in §9. If any check fails, set
   `AI_AGENT_ENABLED=false` immediately, restart, verify the disabled state, and
   stop. Do not keep testing a broken deployment.

---

## 3. Scheduler + keep-alive

The free host sleeps when idle, and scheduled work must go through
`POST /api/v1/internal/jobs/run` (secret header `X-Jobs-Key`, idempotent). Pick
**one** of these two; both also warm the host.

### A — GitHub Actions keep-alive (no third party, no card)

1. Repo **Settings → Secrets and variables → Actions**:
   - **Secrets**: `JOBS_KEY` = the same value as the Render `JOBS_KEY`.
   - **Variables**: `RENDER_SERVICE_URL` = `basmatak-backend.onrender.com`
     (bare host, no `https://`).
2. The committed workflow `.github/workflows/keep-alive.yml` runs every 15
   minutes (`*/15 * * * *`), POSTs to the internal jobs endpoint with the
   secret, tolerates cold-start timeouts, and keeps the host awake. Run it
   manually any time via **Actions → Keep-alive scheduler → Run workflow**.

### B — cron-job.org (primary per roadmap §3.5)

1. <https://cron-job.org> → free signup.
2. **Create cronjob**: URL
   `POST https://basmatak-backend.onrender.com/api/v1/internal/jobs/run`.
3. Add header `X-Jobs-Key: <JOBS_KEY>`.
4. Schedule: every 15 minutes. (Note cron-job.org runs in its own timezone —
   set the cron to the server clock; the 15-min tick is timezone-insensitive.)

Either way the jobs tick moves `published` opportunities → `in_progress`,
activates accepted participants, and refreshes reliability (S6/S13).

---

## 4. Health check

Render's health check is wired to **`GET /api/v1/health`**
(`render.yaml` `healthCheckPath` — or on the dashboard: **Health Check Path**
`/api/v1/health`). It returns `200 { "status": "ok", "version": … }`. The
scheduler ping also warms the host.

---

## 5. Seed data (one-shot, ephemeral disk)

Render free disks are ephemeral: run seeds once as a **one-off** against the
service. In the Render web service **Shell** (or a one-shot `npm run` job):

```bash
npm run seed:admin     # admin account from ADMIN_EMAIL/ADMIN_PASSWORD (S17)
npm run seed:all       # locations + skills + admin + demo org (S17)
```

Seeds are not part of the start/health path — the app boots and answers
`/health` with or without them.

---

## 6. Free-tier runtime rules (inventory §10)

- **No Redis, no queues, no push, no paid SMS** anywhere. Throttling is
  in-memory (single instance — correct for Render free), events are in-process,
  notifications are polled from MongoDB.
- **No runtime local-disk writes**: media lives in Supabase
  (`STORAGE_PROVIDER=supabase`); `local` is dev-only.
- **`PUBLIC_BASE_URL`** = the Render URL so `/verify/:code` links and emails
  are correct.

### 6.1 AI free-tier quota and 429 procedure

The assistant is intentionally capped below the provider's free tier:
`AI_AGENT_GLOBAL_RPM=8` is 80% of the documented 10 RPM ceiling, and the daily
request/token caps are lower than the provider limits because launch traffic is
unknown. **Verify the live AI Studio limits for the chosen model at deploy
time**; quotas change by model/account. Never exceed them and never rotate keys,
create projects, or enable billing to work around a limit.

Quota behavior is documented in detail in `AI_AGENT.md` §6; the operator rules
are:

1. Read `GET /api/v1/ai-agent/status` (`mode`) and the admin
   `GET /api/v1/ai-agent/usage` report before changing anything.
2. A pre-stream `429` carries `details.reason` and
   `details.retryAfterSeconds` (also `Retry-After`, which CORS does not expose).
   Honor the wait; do not retry immediately.
3. `RATE_LIMITED` = local per-IP/global window; `AI_AGENT_BUSY` = concurrency;
   `AI_AGENT_QUOTA_EXHAUSTED` = provider cooldown or exhausted day. A
   `mode`/`token_budget` denial is **not** a 429: the user gets a local
   `retrieval_only`/`exhausted` SSE answer with browse links and no provider
   call.
4. At 70% the mode is `conservative`, at 90% `knowledge_only`, at 100%
   `retrieval_only` (when `AI_AGENT_RETRIEVAL_FALLBACK=true`) or `exhausted`.
   These are safety degradations, not failures.
5. Tune one cap at a time, restart, and watch usage/logs. Raising several caps
   together makes a free-tier 429 likely and obscures the cause.
6. If a provider 429 is recurrent, lower the relevant cap or keep the feature
   disabled until the UTC day/cooldown resets. Do not add a second key or
   project.
7. A restart clears in-memory counters and cooldowns; use it only for a
   deliberate config change, never to manufacture more free quota.

For the production degraded-path smoke, the smallest safe temporary change is
`AI_AGENT_DAILY_TOKEN_BUDGET=1` (the minimum accepted value), followed by a
restart. The next chat must be `200` SSE with `meta.mode=retrieval_only`, a
local answer/browse links, and zero provider tokens; restore `150000` and
restart immediately afterward. An optional transport-gate check is
`AI_AGENT_IP_RPD=1`, two requests (second `429 RATE_LIMITED`,
`reason=ip_day`), then restore `15` and restart. Record every temporary value and
its restoration in the smoke record.

---

## 7. Verify locally (prod smoke) before/while connecting

```bash
cd backend
npm ci
npm run build
# point MONGO_URI at the real Atlas connection string (or a local mongod) and boot the compiled app:
npm run start:prod
curl http://localhost:3000/api/v1/health
```

Then confirm in the Render dashboard that the first build succeeded, the health
check shows green, and the scheduler log shows jobs runs.

---

## 8. Rollback / clean-up

- **AI feature rollback (first action)**: set `AI_AGENT_ENABLED=false` in
  Render, apply/restart, verify `GET /api/v1/ai-agent/status` is `200` with
  `"enabled": false`, and verify chat returns `503 AI_AGENT_DISABLED`. This
  stops provider calls and quota consumption without touching the rest of the
  site or the database.
- **AI code rollback**: deploy the previous commit (`3fa5de6` is the last
  Session 12 code commit) after the kill switch is verified. There is no AI
  collection, schema migration, or runtime upload; the knowledge corpus ships
  with `backend/ai-agent/`.
- **AI provider rollback**: switch `AI_AGENT_PROVIDER`/`AI_AGENT_MODEL` back to
  the previous values, restart, and verify one turn. Keep the key server-side.
  Automatic fallback is not active, so a provider outage is handled by the
  explicit unavailable/timeout errors and the kill switch.
- **Secret rollback**: disable first, revoke/replace the key in the provider
  console, update the Render secret, verify the disabled state, then re-enable
  after a successful smoke turn. Never print or commit the value.
- **Revert the deploy**: Render dashboard → service → **Settings → Delete
  Service**, or pause — the data stays in Atlas untouched.
- **Code rollback (non-AI)**: `git revert` the `chore(deploy)` commit. Removing
  the keep-alive workflow leaves the scheduler stopped; the app keeps running.
- No data migration is involved — the host and the database are independent.

---

## 9. Production smoke checklist (AI assistant)

Run this only with explicit Render access and the server-side Gemini secret
available. Never ask for, paste, print, or commit the key. Fill in the record
header and the result/evidence column for every check; a smoke without a record
is not complete. If any check fails, perform the rollback in §8 first, then
record the failure and stop.

> **Session 13 status:** not executed in the documentation environment because
> no Render access or `GEMINI_API_KEY` was available. The exact human handoff is
> the record header plus §9.2 below. Do not mark a check PASS without running it.

### 9.1 Record header

| Field | Value |
|---|---|
| Date/time (UTC) | |
| Operator | |
| Commit SHA | |
| Branch | |
| Service URL | |
| Deployment/build id | |
| `AI_AGENT_ENABLED` before/after | `false` -> `true` |
| `AI_AGENT_PROVIDER` / `AI_AGENT_MODEL` | `gemini` / `gemini-3.8-flash` |
| `TRUST_PROXY` | `1` (Render) |
| `CORS_ORIGIN` (origins only, no secrets) | |
| Overall result | PASS / FAIL / PARTIAL |
| Rollback performed? | No / Yes — time, action, final verification |

### 9.2 Checks

| # | Check | How | Expected | Result / evidence |
|---|---|---|---|---|
| 1 | Disabled status | Set `AI_AGENT_ENABLED=false`; restart; `GET /api/v1/ai-agent/status` | `200`, `enabled:false`; no provider/model/key/usage fields. | |
| 2 | Disabled chat | Same state; `POST /api/v1/ai-agent/chat` with a valid body | `503 AI_AGENT_DISABLED` JSON, no `text/event-stream`, no `meta` frame. | |
| 3 | Enable | Set `AI_AGENT_ENABLED=true`; restart; status | `200`, `enabled:true`, `mode` is `normal` (or documented degraded mode), `knowledge.files=8`, `knowledge.chunks>0`. | |
| 4 | Incremental SSE through Render | `curl -N -sS -D -` to chat with `Origin: $ORIGIN` | `200 text/event-stream`, fixed headers, `meta` first, then `token` frames arriving over time (not one buffered blob), final `done`; heartbeat `: heartbeat` every ~15 s on a long turn. | |
| 5 | CORS allow | Preflight `OPTIONS` and actual chat with an allowlisted `Origin` | `204` preflight / `200` chat with `Access-Control-Allow-Origin: $ORIGIN`; no credentials wildcard. | |
| 6 | CORS reject | Preflight with an unlisted origin | No `Access-Control-Allow-Origin`; browser blocks it. Bare `*` is dropped, so a `*` config allows nothing. | |
| 7 | Knowledge answer + citations | Ask a question covered by the reviewed corpus, in English and Arabic | Grounded answer with `[K#]` citations and `sources.knowledge` entries; Arabic answer is natural and RTL-safe. | |
| 8 | Live public data | Ask “Which opportunities are open now?” (or equivalent) | Answer cites public rows with `[T#]` and `sources.data` paths; no private fields, emails, phones, or internal ids. | |
| 9 | Grounded refusal | Ask for another person's contact/account data, and one out-of-scope question | Localized refusal; no private data; no speculative answer; no provider leak. | |
| 10 | Degraded/quota path | Temp `AI_AGENT_DAILY_TOKEN_BUDGET=1`; restart; one chat; restore `150000`; restart | `200` SSE, `meta.mode=retrieval_only`, local text + browse links, zero provider tokens; after restore, `mode=normal`. Record both temp/restore. Optional 429 gate: `AI_AGENT_IP_RPD=1`, two requests, second `429 RATE_LIMITED`/`reason=ip_day` with `Retry-After`; restore `15`. | |
| 11 | Usage auth | `GET /api/v1/ai-agent/usage` anonymous, volunteer, admin | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `200` with aggregate `today`/`last7Days`/`budget`; no content, IPs, or per-user rows. | |
| 12 | Cold start/widget | Let the host sleep (or simulate a cold start), then open the widget | Widget shows waking/unavailable and retries; status recovers; one user action does not create duplicate/looped chats. Record elapsed time. | |
| 13 | Privacy/log spot check | Search Render logs for the exact test message, prompt, tool payload, key name, and client IP; inspect SSE/network for provider/model/key/private fields | No message/prompt/retrieved text/tool payload/IP/key in logs or frames; only allowlisted operational fields. Do not paste log lines into the record. | |
| 14 | Rollback readiness | Confirm §8 kill switch and the previous commit are known | Disable path verified in checks 1–2; rollback owner/time recorded. | |

Useful commands (run from a machine with network access; never put the key in a
command line):

```bash
BASE_URL="https://<service>.onrender.com"
ORIGIN="https://<frontend-origin>"

curl -sS "$BASE_URL/api/v1/ai-agent/status"

curl -N -sS -D - \
  -H 'Content-Type: application/json' \
  -H "Origin: $ORIGIN" \
  -d '{"message":"How does volunteering work?","locale":"en"}' \
  "$BASE_URL/api/v1/ai-agent/chat"

curl -i -sS -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  "$BASE_URL/api/v1/ai-agent/chat"

# Admin/volunteer tokens come from test accounts, not the Gemini key.
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE_URL/api/v1/ai-agent/usage"
```

For check 10, env changes restart the service and reset in-memory quota/usage
counters. Change one value, record it, test, restore the documented value, and
restart again. Never leave a temporary cap in place.

### 9.3 Failure and rollback record

| Field | Value |
|---|---|
| Failed check # | |
| Time (UTC) | |
| Observed symptom (no secrets/content) | |
| Immediate action | `AI_AGENT_ENABLED=false` + restart |
| Disabled verification | status `enabled:false`; chat `503 AI_AGENT_DISABLED` |
| Code/provider rollback (if any) | |
| Final state | disabled / previous commit / previous provider |
| Follow-up owner/issue | |

---

## 10. Post-launch monitoring and review

The assistant is a free-tier, single-instance feature. Monitor it before
considering any cap increase:

- **First 24 hours:** check `GET /api/v1/ai-agent/status` and the admin usage
  report at deploy, +15 minutes, +1 hour, +4 hours, and +24 hours. Watch
  `mode`, total tokens, request count, 429/rate-limited count, average latency,
  refusals, and provider errors. Check the structured logs for the 70%/90%/100%
  threshold warnings; they are emitted once per UTC day.
- **First 7 days:** review usage daily. If provider 429s or `AI_AGENT_BUSY`
  recur, lower one cap (usually `AI_AGENT_GLOBAL_RPM` or the token budget) and
  restart; if latency is high, lower output/tool caps. Do not raise several caps
  at once. Never exceed the live AI Studio free-tier limit.
- **Content quality:** sample grounded answers in English and Arabic, verify
  citations point to reviewed public content, and update the corpus through
  `npm run ai:check` + deploy when facts change. Never weaken citation checks
  to make an answer “work”.
- **Privacy:** confirm logs still contain only the allowlisted operational
  fields, the admin report has no content/IP/per-user rows, the widget still
  clears `sessionStorage` on new chat/sign-out/session expiry/tab close, and the
  privacy notice's provider-data-use wording still matches the provider terms.
  Review the free-tier provider terms when they change.
- **Capacity:** the quotas, usage meter, and cooldowns are per process. The
  design is one Render instance; do not scale horizontally without redesigning
  the global limits. Restarts reset counters, so a restart is not a quota
  increase.
- **Decision review:** after 7 days, record whether to keep the current caps,
  lower them, or keep the feature disabled. Store the completed §9 record and
  the decision with the deployment notes; do not include keys or user content.