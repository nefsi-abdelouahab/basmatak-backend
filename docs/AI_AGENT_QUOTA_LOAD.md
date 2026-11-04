# AI Agent Quota and Load Report — Session 12

**Status:** complete. Defaults are tuned, documented, and validated against the
mock provider. No Gemini call, real API key, or external network request was
used.

## 1. Method

All scenarios run against the real Nest controller, SSE writer, orchestrator,
quota service, usage meter, and in-memory MongoDB rig, with a deterministic
provider double. The load provider can hold calls open to exercise the
concurrency gate; the scripted provider can return quota errors and cooldowns.
The suite is intentionally run with `--runInBand` because concurrent
`mongodb-memory-server` instances are unreliable in this environment.

Primary artifacts:

- `backend/test/ai-agent-quota-load.e2e-spec.ts` — 11 quota/load scenarios.
- `backend/test/ai-agent-security.e2e-spec.ts` — proxy/rate-limit and kill-switch
  probes that complement this report.
- `backend/src/ai-agent/budget/quota.service.spec.ts` — pure window, boundary,
  cooldown, and concurrency unit tests.
- `backend/test/ai-agent.e2e-spec.ts` — existing SSE, heartbeat, abort,
  provider-429, and usage-endpoint contracts.
- `frontend/e2e/ai-agent.spec.ts` — cold-start/waking and retry behavior in the
  widget.

## 2. Tuned defaults

| Setting | Default | Hard max | Purpose |
|---|---|---|---|
| `AI_AGENT_IP_RPM` | 4 | 1,000 | Per-IP requests per UTC minute. |
| `AI_AGENT_IP_RPD` | 15 | 100,000 | Per-IP requests per UTC day. |
| `AI_AGENT_GLOBAL_RPM` | **8** | 10,000 | All users, UTC minute. **Tuned from 10 to 8 = 80% of the documented 10 RPM free-tier ceiling.** |
| `AI_AGENT_GLOBAL_RPD` | 80 | 1,000,000 | All users, UTC day. Deliberately conservative. |
| `AI_AGENT_MAX_CONCURRENT` | 2 | 100 | Simultaneous provider turns; extra requests fail fast with `AI_AGENT_BUSY`. |
| `AI_AGENT_DAILY_TOKEN_BUDGET` | 150,000 | 10,000,000 | Estimated input + output tokens per UTC day. |
| `AI_AGENT_MAX_OUTPUT_TOKENS` | 400 | 800 | Per-turn output cap. Conservative mode lowers it to 300. |
| `AI_AGENT_MAX_INPUT_TOKENS` | 3,000 | 100,000 | Estimated input cap before a provider call. |
| `AI_AGENT_MAX_HISTORY_MESSAGES` | 6 | 8 | History messages included in the prompt. |
| `AI_AGENT_MAX_HISTORY_CHARS` | 4,000 | 6,000 | Total history characters. |
| `AI_AGENT_MAX_KNOWLEDGE_CHUNKS` | 4 | 6 | BM25 chunks per turn. |
| `AI_AGENT_MAX_KNOWLEDGE_CHARS` | 6,000 | 8,000 | Retrieved knowledge characters. |
| `AI_AGENT_MAX_TOOL_ROUNDS` | 1 | 2 | Tool follow-up rounds per turn. |
| `AI_AGENT_MAX_TOOL_ROWS` | 5 | 8 | Rows per tool call. |
| `AI_AGENT_MAX_TOOL_RESULT_CHARS` | 1,200 | 3,000 | Tool context characters. |
| `AI_AGENT_RETRIEVAL_FALLBACK` | `true` | — | At 100%, serve extractive sources without a provider call. |
| `AI_AGENT_FALLBACK_ENABLED` | `false` | — | Optional second provider; off by default. |

The defaults are also documented in `backend/.env.example` and
`docs/DEPLOY.md`. The environment parser clamps every value to the hard maximum
and falls back to the documented default for invalid input.

## 3. Why these defaults

### 3.1 Global RPM: 8, not 10

The approved starting configuration used 10 RPM globally. For Session 12 the
default is 8 RPM, which is 80% of the 10 RPM free-tier ceiling documented for
the default flash model. This is the top of the requested 70–80% tuning band.

The 20% reserve is intentional:

- a turn can include a tool follow-up, so one visible user request can consume
  more than one provider call;
- transient 5xx retries and provider-side timing consume headroom;
- the free-tier key may be shared with other applications;
- provider quotas can change by model and account.

The live AI Studio quota must still be checked at deploy time. If the published
ceiling falls below 10 RPM, lower `AI_AGENT_GLOBAL_RPM` accordingly. The hard
maximum and the daily/token caps prevent a typo from removing the safety bound.
If the published ceiling rises, raising the global RPM should be a deliberate,
measured change, not a default change.

### 3.2 Daily limits: 80 requests and 150k tokens

The daily provider ceiling is not hard-coded from a published number because it
varies by model and account, and public traffic is unknown at launch. The
starting values therefore stay well below the published ceiling:

- **80 global requests/day** is the absolute shared request budget.
- **15 requests/day per IP** means one client can consume at most about 19% of
  the global daily request budget, leaving room for other users.
- **150,000 tokens/day** is estimated input + output. At the default 3,000 input
  and 400 output caps, one worst-case turn reserves 3,400 tokens, so the token
  budget is the binding constraint before 80 full-size turns. Normal FAQ turns
  are much smaller.
- The token reservation includes the maximum possible output, not just the
  prompt, so an in-flight turn cannot overspend the budget before it commits.

### 3.3 Concurrency: 2

Two simultaneous provider turns keep the free service responsive without
building a queue. A third request is rejected immediately with
`AI_AGENT_BUSY` and `Retry-After: 1`; it never waits behind the held calls.
Health and status endpoints remain responsive while both slots are occupied.

### 3.4 Per-IP limits: 4/minute and 15/day

These are the approved starting values. They stop one client from monopolizing
the shared key while still allowing a short conversation burst. The per-IP map
is keyed by the real client IP behind the production proxy; see
`docs/AI_AGENT_SECURITY_CHECKLIST.md` §2.5 for the proxy validation.

## 4. Validation results

The quota/load suite passed **11/11** scenarios (`backend/test/ai-agent-quota-load.e2e-spec.ts`).

### 4.1 Request windows

| Scenario | Expected | Observed |
|---|---|---|
| Four requests from one IP | All `200`; provider called 4 times | Pass |
| Fifth request from that IP | `429` / `RATE_LIMITED` / `ip_minute`; `Retry-After > 0`; provider still at 4 calls | Pass |
| A different IP after the first is limited | `200`; provider called once more | Pass |
| Fifteen requests from one IP | All `200`; provider called 15 times | Pass |
| Sixteenth request from that IP | `429` / `RATE_LIMITED` / `ip_day`; provider still at 15 calls | Pass |
| Eight global requests from distinct IPs | All `200`; provider called 8 times | Pass |
| Ninth global request in the same minute | `429` / `RATE_LIMITED` / `global_minute`; provider still at 8 calls | Pass |
| Global daily window | Requests 1–79 reach the provider; request 80 is admitted at the boundary and served `retrieval_only` without a provider call; request 81 gets `429` / `global_day` | Pass |

**Daily boundary semantics:** the 80th admitted request fills the counter to
100%. The controller evaluates the effective mode after admission, so it returns
a complete extractive answer with `done.usage.totalTokens = 0` and makes no
provider call. The next request is denied with `global_day`. This is intentional:
the cap is not overspent, the user gets a safe answer at the boundary, and the
request after the budget is a hard `429`.

### 4.2 Concurrency and burst load

| Scenario | Expected | Observed |
|---|---|---|
| Two provider calls held open | Both turns eventually `200`; `maxActive <= 2` | Pass |
| Third request while both slots are held | Immediate `429` / `AI_AGENT_BUSY` / `concurrency`; `Retry-After: 1`; no provider call | Pass |
| Status request while both slots are held | `200` within 2 seconds | Pass |
| Release the two held calls | Both finish `200`; a new request succeeds; active concurrency returns to 0 | Pass |
| Burst of 20 parallel requests with a 2-slot cap | A mix of `200` and `429 AI_AGENT_BUSY`; no `5xx`; no hang; `maxActive <= 2`; provider called exactly once per admitted turn; active concurrency 0 at the end | Pass |

The burst settles within the test's 20-second bound. The third-request rejection
is a fast fail, not a queue wait. No request hung or exceeded the provider-slot
cap.

### 4.3 Degradation ladder

| Budget utilization | Mode | Behavior | Observed |
|---|---|---|---|
| `< 70%` | `normal` | Normal prompt, tools, and output cap. | Covered by baseline suites |
| `>= 70%` | `conservative` | Provider still called; knowledge chunks ≤ 3, history ≤ 2, output cap ≤ 300, tool rows ≤ 3, one tool call/round. | `meta.mode = conservative`; provider called; `maxOutputTokens <= 300`; cited answer returned |
| `>= 90%` | `knowledge_only` | No tools. Live-data questions get the localized policy refusal without a provider call; knowledge questions still get a provider answer. | Live request: `meta.mode = knowledge_only`, provider calls 0, `knowledgeOnlyLive` message. Knowledge request: provider called once, no tools. |
| `>= 100%` | `retrieval_only` | No provider call; top extractive knowledge snippets and browse links. | `meta.mode = retrieval_only`; `retrievalIntro`; `done.usage.totalTokens = 0` |
| `>= 100%`, fallback off | `exhausted` | Fixed quota message and browse links; no provider call. | `meta.mode = exhausted`; `quotaExhausted` message; provider calls 0 |

The thresholds are computed from the most restrictive of daily request and token
utilization. The 70/90/100 modes are unit-tested at their exact boundaries, and
the e2e suite seeds the token budget to reach each mode.

### 4.4 Cooldown and simulated provider 429

| Scenario | Expected | Observed |
|---|---|---|
| Provider quota exhausted for 30 seconds | `429` / `AI_AGENT_QUOTA_EXHAUSTED` / `cooldown_minute`; `Retry-After >= 30`; no provider call | Pass |
| Provider returns a 429 during a turn | Existing `ai-agent.e2e-spec.ts` maps it to the quota error, sets the cooldown, and makes no further call in that window | Pass (existing contract suite) |
| Cooldown expiry | The minute cooldown does not change the public mode and expires at the window; the service remains usable | Pass (quota unit tests) |

There is no automatic 429 retry loop. At most one retry is allowed for a
transient 5xx before any text is streamed; after text starts, errors are emitted
as the streamed error event.

### 4.5 Cold start, retry, and responsiveness

- The frontend Playwright AI spec passes **13/13**, including the status-timeout
  “waking” state, retry after a stream error, quota banner/recheck, stop, offline
  banner, and RTL chat.
- The existing backend e2e contract passes heartbeat frames during a delayed
  provider response and cleans up on client abort while remaining responsive.
- The load suite proves that health/status stays responsive while both provider
  slots are occupied and that a 20-request burst settles without a hang.
- The widget never waits indefinitely: status polling has a timeout and a retry
  action; the chat request can be stopped by the client.

Cold start is a Render sleep/network condition, not a quota behavior. The
widget's waking state is the user-facing handling for it.

## 5. Run evidence

| Run | Result |
|---|---|
| `test/ai-agent-quota-load.e2e-spec.ts` standalone | 11/11 passed |
| Security + quota + existing AI e2e, `--runInBand` | 4 suites / 57 tests passed |
| Security suite standalone | 14/14 passed |
| Existing AI e2e | 22/22 passed |
| AI orchestration e2e | 10/10 passed |
| AI unit suite | 23 suites / 340 passed / 2 skipped |
| Backend `npm run ai:check` | 8 files / 0 warnings / 0 errors |
| Backend `npm run build` | Passed |
| Backend `npm run lint` | Passed |
| Frontend Playwright AI spec | 13/13 passed |
| Frontend unit suite | 724 passed / 5 known baseline failures (unrelated) |
| Frontend build | Passed |

The combined AI e2e run is the authoritative launch evidence; the per-suite
numbers above confirm the same tests when run in isolation. The candidate
suite durations in the combined run were approximately 14.1 s (quota/load),
42.1 s (security), 28.0 s (existing contract), and 16.5 s (orchestration),
including in-memory Mongo startup. These are test-harness durations, not
production latency measurements.

## 6. Operational behavior and tuning

- **UTC windows.** Minute and day counters use UTC; an IP's minute window resets
  at the next UTC minute, and the global/IP day resets at UTC midnight.
- **In-memory state.** Quota and usage counters live in the process. A restart or
  Render environment change clears them. This is acceptable for the current
  single instance but must be revisited before horizontal scaling.
- **Hard gates.** A denied reservation never increments a counter and never
  starts a provider call. Concurrency is released on commit, error, or abort.
- **No overspend.** A reservation includes the estimated input plus the maximum
  output, so the last in-flight turn cannot exceed the daily token budget.
- **Fast failure.** Per-IP and global denials return `429` with `Retry-After`;
  concurrency denials return `AI_AGENT_BUSY` immediately. The composer is
  disabled only for exhaustion, not for a short per-IP throttle.
- **Provider switch.** `AI_AGENT_PROVIDER` selects `gemini`, `groq`, `mock`, or
  `fake` at boot; unknown values fail closed to an unavailable provider. No
  orchestrator, prompt, SSE, or frontend change is required.
- **Kill switch.** `AI_AGENT_ENABLED` is read at boot. In local tests the
  in-process switch disables chat and returns `503 AI_AGENT_DISABLED` without a
  restart; on Render, changing the env var restarts the service, so the effective
  switch is config + restart. See `docs/DEPLOY.md` §2.1.
- **Tuning procedure.** Check the live AI Studio RPM/RPD/TPM for the pinned
  model, set `AI_AGENT_GLOBAL_RPM` below the published RPM (target 70–80%),
  keep `AI_AGENT_GLOBAL_RPD`, the per-IP caps, and the token budget conservative,
  then observe the aggregate admin usage endpoint. Never raise a cap to work
  around a provider 429; keep the provider window and the local cooldown intact.

## 7. Conclusion

The AI agent remains responsive at the configured caps, never overspends the
daily token budget, returns safe extractive/quota answers at 70/90/100%, fails
fast at the concurrency limit, and honors provider cooldowns without retry
loops. The tuned global default is 8 RPM, which is 80% of the documented 10 RPM
free-tier ceiling; the remaining caps stay conservative and retain hard maxima.
No quota or load issue blocks launch, and no P0/P1 finding remains open.

## 8. Reproduce

From `backend/`:

```text
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent-quota-load.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent-security.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent.e2e-spec.ts test/ai-agent-orchestration.e2e-spec.ts
npx jest src/ai-agent src/main.spec.ts src/common/filters --runInBand --silent
```

From `frontend/`:

```text
npx playwright test e2e/ai-agent.spec.ts --reporter=list
```
