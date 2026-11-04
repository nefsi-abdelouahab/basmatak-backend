# AI Agent Security Checklist — Session 12

**Status:** complete. All P0/P1 findings are fixed. No open critical or high-risk
issue blocks launch. Accepted low-risk items are listed in §4.

**Scope:** the public AI agent (`backend/src/ai-agent/`, the floating frontend
widget, and the deployment contract). Validation used deterministic mock/fake
providers, the in-memory MongoDB test rig, and local HTTP servers only. No
Gemini call, no real API key, and no external network request was made.

## 1. How the checks were run

| Layer | Command / artifact | Result |
|---|---|---|
| Security probes | `npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent-security.e2e-spec.ts` | 14/14 passed |
| Quota/load probes | `npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent-quota-load.e2e-spec.ts` | 11/11 passed |
| Existing AI contract | `test/ai-agent.e2e-spec.ts`, `test/ai-agent-orchestration.e2e-spec.ts` | 32/32 passed |
| Combined AI e2e | the four suites above, `--runInBand` | 4 suites / 57 tests passed |
| AI unit suite | `npx jest src/ai-agent src/main.spec.ts src/common/filters --runInBand --silent` | 23 suites / 340 passed / 2 skipped |
| AI quality + build | `npm run ai:check && npm run build` | 8 files / 0 warnings / 0 errors; build passed |
| Frontend widget | `npx playwright test e2e/ai-agent.spec.ts` | 13/13 passed |
| Frontend unit/build | `npm test`, `npm run build` | 724 passed / the 5 known baseline failures; build passed |
| Deploy contract | `test/deployment-config.e2e-spec.ts` | 5/5 passed |

The frontend's five failures are the pre-existing i18n placeholder audit,
audit-log route coverage, two theme/hex audits, and the theme token gate. They
are unchanged from the baseline and are unrelated to the AI agent.

## 2. Checklist results

### 2.1 Prompt injection and system instructions

| Probe | Result | Evidence |
|---|---|---|
| User message tries to close the data delimiter and inject `<system_rules>` | Pass — the user message is escaped inside the single `<user_message>` section; the system instruction is unchanged and does not contain the canary text; the canary is not echoed in the answer | `ai-agent-security.e2e-spec.ts` → “keeps user-message injection inside the escaped data section” |
| Injection arrives through retrieved knowledge text | Pass — every untrusted section (message, history, knowledge, tool result) is escaped so delimiter-like text cannot close its section | `src/ai-agent/prompt/prompt-builder.spec.ts` → “confines delimiter injection to the data section that contains it” |
| Injection arrives through a tool result | Pass — same escaping path and test as knowledge; tool results are also bounded by the row/character caps | `prompt-builder.spec.ts`; `src/ai-agent/tools/public-tools.spec.ts` |
| User asks the model to print its system prompt | Pass — the complete buffered answer is checked before streaming; two distinct verbatim six-word windows from the private rules mark the output as a leak and replace it with the normal `ungrounded` refusal | `ai-agent-security.e2e-spec.ts` → “refuses a system-instruction extraction instead of streaming it”; `answer-policy.spec.ts`; orchestrator guard |
| A model output reproduces the prompt but keeps the literal `[K1]` markers | Pass — citation validation alone would accept it, so the dedicated normalized-window leak guard is required and is exercised by the extraction test | `src/ai-agent/orchestrator/answer-policy.ts` (`containsSystemInstructionLeak`) |

Escaping confines untrusted text structurally; it cannot make an LLM immune to
semantic persuasion. The residual model-level risk is mitigated by public-data-
only tools, bounded tool execution, citation validation, the leak guard, and
the deterministic private-data refusal (see §4).

### 2.2 Privacy and PII

| Check | Result | Evidence |
|---|---|---|
| Private organization fields (`userId`, `contact`, `registryId`, `registrationNumber`, `address`, media ids, reliability) | Pass — the Mongo projection is an explicit public allowlist; serialized tool payloads are asserted not to contain any of these | `search-organizations.tool.ts` (`ORGANIZATION_TOOL_SELECT`); `public-tools.spec.ts` → “returns only verified active organizations with public fields” |
| Volunteer profiles and contact details | Pass — there is no volunteer-profile tool; platform stats expose counts only; volunteer email/phone canaries never appear in the response | `public-tools.spec.ts` (forbidden-key checks); `ai-agent-security.e2e-spec.ts` private-data probes |
| “Show me the email/phone of a volunteer” in English, Arabic, and French | Pass — refused before any provider call (`provider.calls === 0`), with the localized `privateData` policy message; no contact canary is present | `ai-agent-security.e2e-spec.ts` → parameterized “refuses … private-data probes” |
| Private data in the admin usage response | Pass — only aggregate today/7-day counters and the budget snapshot are returned; no `ip`, message, or tool payload | `ai-agent-security.e2e-spec.ts` → “logs no message, prompt, tool payload, or IP and exposes aggregates only” |
| Admin usage authorization | Pass — anonymous `401`, volunteer `403`, admin `200` | `test/ai-agent.e2e-spec.ts` → “protects GET /usage” |

### 2.3 Input validation and tool abuse

| Probe | Result | Evidence |
|---|---|---|
| Unknown / non-whitelisted tool (`delete_all_organizations`) | Pass — the executor is never called; the turn ends with the localized `toolUnavailable` answer | `ai-agent-security.e2e-spec.ts` → “does not execute an unknown tool or malformed tool arguments” |
| Malformed/extended tool arguments (`limit: 9999`, `admin: true`) | Pass — schema/key validation rejects them before execution; the executor is never called | same test |
| Oversized body (200,000 characters) | Pass — `413` / `PAYLOAD_TOO_LARGE`, fixed message, no body echo, provider not called | `ai-agent-security.e2e-spec.ts` → “rejects invalid JSON and oversized bodies…” |
| Message over the 2,000-character DTO limit | Pass — `400` / `VALIDATION_ERROR`, provider not called | same test |
| Too many history messages or too many history characters | Pass — DTO rejects more than 6 messages or more than 4,000 characters | `src/ai-agent/ai-agent.controller.spec.ts` (history validation cases) |
| Invalid JSON | Pass — `400` / `BAD_REQUEST` (Nest wraps the body-parser `SyntaxError` at router level) with no echoed body; provider not called | same security test |
| Unsupported request encoding | Fixed — mapped to `415` / `UNSUPPORTED_MEDIA_TYPE` with a fixed message | `http-exception.filter.ts` (`encoding.unsupported`) |
| Tool/round/row/character caps | Pass — one tool round, at most 8 rows, 1,200 tool-result characters by default; provider and knowledge caps are clamped to hard maxima | config + `answer-policy.ts`; AI unit suite |

### 2.4 Output and client injection

| Check | Result | Evidence |
|---|---|---|
| Answer containing HTML/script is served as HTML | Pass — response is `text/event-stream; charset=utf-8`, never `text/html`; the answer is data, not markup | `ai-agent-security.e2e-spec.ts` → “streams answer HTML as text/event-stream, never text/html” |
| Answer HTML executes in the transcript | Pass — the widget renders message text as plain text; a `<script>` payload produces no script element | `frontend/src/components/ai-agent/MessageBubble.test.tsx` |
| Source chip points to `javascript:`, `data:`, a protocol-relative URL, a backslash path, an admin route, or a private volunteer route | Pass — `safeSourceHref` accepts only same-origin public routes; all unsafe values return `null` and render as non-links | `frontend/src/components/ai-agent/aiAgentUi.ts`, `aiAgentUi.test.ts` |
| Markdown/link rendering | Pass — links use the same allowlisted destination policy; no raw HTML injection path is used | `MessageBubble.tsx` / `SourceChips.tsx` |

### 2.5 Rate limiting behind a proxy

`TRUST_PROXY` is resolved once at boot. Production defaults to one hop (Render);
local/direct defaults to `false`. Invalid values fail closed to `false`.

| Probe | Result | Evidence |
|---|---|---|
| Forwarded headers ignored in local direct mode | Pass — two different `X-Forwarded-For` values share the real socket IP and hit the per-IP limit | `ai-agent-security.e2e-spec.ts` → “ignores forwarded headers in local direct mode” |
| One production proxy hop uses the rightmost client address | Pass — same client is limited; a different rightmost address is a different client | “uses the rightmost client IP for one production proxy hop” |
| Attacker prepends extra leftmost forwarded entries | Pass — extra entries do not create a bypass; the per-IP bucket still matches | “cannot be bypassed with extra leftmost forwarded entries” |
| Global minute limit still applies across client IPs | Pass — the second distinct IP receives `RATE_LIMITED` / `global_minute` when the global cap is 1 | “still enforces the global minute limit across client IPs” |
| Production Render configuration | Set — `render.yaml` declares `TRUST_PROXY=1`; `docs/DEPLOY.md` explains why and how to override it | `render.yaml`, `docs/DEPLOY.md` §2.1 |

### 2.6 Logging, usage, and secrets

| Check | Result | Evidence |
|---|---|---|
| Conversation message in logs | Pass — a message canary is absent from all captured logger output | `ai-agent-security.e2e-spec.ts` → log/usage privacy test |
| Tool arguments/payload in logs | Pass — a tool-argument canary is absent | same test |
| Client IP in logs | Pass — neither the test client IP nor loopback forms (`127.0.0.1`, `::ffff:`) appear | same test |
| IP or conversation data in the admin usage response | Pass — the serialized response contains no `ip` field and no canaries | same test |
| Prompt, retrieved text, or tool payload in logs by code review | Pass — the request log line records mode, counts, tokens, tool-call count, latency, refusal/rate-limit flags, and error code only; content and IP are not fields | `ai-agent.controller.ts` / `usage-meter.service.ts` review |
| Secret in backend build output | Pass — scanned 893 files / 4,306,120 bytes in `backend/dist` for Google keys, Mongo URIs, JWTs, private-key blocks, `sk-` keys, and a literal `GEMINI_API_KEY=`; no matches | local scan |
| Private env/secret in frontend build output | Pass — scanned `frontend/.next` for API-key, Mongo URI, JWT, private-key, `MONGO_URI`, `JWT_ACCESS_SECRET`, and `GEMINI_API_KEY` patterns; no matches | local scan |
| New secret-bearing dependency or lockfile change | Pass — `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, and `frontend/package-lock.json` are unchanged; no dependency was added | `git status` |

### 2.7 Runtime switches and provider selection

| Check | Result | Evidence |
|---|---|---|
| Kill switch disables chat without a process restart | Pass — setting the in-process config to disabled returns `503 AI_AGENT_DISABLED`, status reports `enabled: false`, and no provider call occurs; re-enabling serves the next turn | `ai-agent-security.e2e-spec.ts` → “toggles the kill switch at runtime without a restart” |
| Provider switch is configuration-only | Pass — `gemini`, `mock`, and `fake` are selected case-insensitively by config; an unknown value returns a fail-closed unavailable adapter instead of crashing construction | `provider-contract.spec.ts` → “selects adapters by configuration only” and “fails closed on an unknown provider” |
| Render environment change behavior | Documented — Render restarts the service when env vars change; the switch takes effect at boot, and in-memory quota/usage windows reset | `docs/DEPLOY.md` §2.1 |

### 2.8 Configuration and deployment rules

| Check | Result |
|---|---|
| `AI_AGENT_ENABLED` only enables chat on the literal `true`; everything else keeps it disabled | Pass (config parsing + kill-switch test) |
| All numeric caps have hard maxima and invalid values fall back to documented defaults | Pass (config tests + AI unit suite) |
| `TRUST_PROXY` accepts `false`/`0`, a positive hop count, or `true`; invalid values fail closed | Pass (`src/main.spec.ts`) |
| No automatic fallback or retry loop that could amplify quota use | Pass — automatic fallback is off by default; at most one transient 5xx retry before streaming; no 429 retry |
| `.env.example`, `render.yaml`, and `DEPLOY.md` agree | Pass (`deployment-config.e2e-spec.ts`, 5/5) |

## 3. Findings fixed in Session 12

| ID | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| S12-F1 | P1 | Behind Render the app did not trust the proxy, so `req.ip` could be the proxy address and every client could share one per-IP bucket; trusting all forwarded headers locally would have made the bucket spoofable instead. | Added `TRUST_PROXY` resolution and application (`false` locally, `1` in production, positive hop count, `true` only by explicit choice; invalid values fail closed). Set `TRUST_PROXY=1` in `render.yaml` and documented it. | `backend/src/main.ts`, `main.spec.ts`, security proxy suite |
| S12-F2 | P1 | A model that echoed the private system prompt could pass citation validation because the prompt itself contains literal `[K1]` markers. | Added a deterministic normalized six-word-window leak guard; two distinct matching windows replace the answer with the `ungrounded` refusal before streaming. | `answer-policy.ts`, `answer-policy.spec.ts`, orchestrator guard, extraction e2e |
| S12-F3 | P2 | Body-parser failures were not Nest `HttpException`s, so an oversized body could surface as a generic `500` instead of a client error. | Mapped `entity.too.large` → `413 PAYLOAD_TOO_LARGE`, `entity.parse.failed` → `400 INVALID_JSON`, and `encoding.unsupported` → `415 UNSUPPORTED_MEDIA_TYPE` with fixed, non-echoing messages. | `http-exception.filter.ts`, oversized-body e2e |
| S12-F4 | P2 | The global RPM default was 10, exactly the documented free-tier ceiling, leaving no headroom for retries or tool follow-ups. | Tuned to 8 RPM (80% of the documented 10 RPM ceiling); daily/concurrency/token caps remain conservative. Rationale is in the config comments and `docs/AI_AGENT_QUOTA_LOAD.md`. | `ai-agent.config.ts`, `.env.example`, `DEPLOY.md`, quota tests |

No P0 finding was identified. No P1 finding remains open.

## 4. Accepted low-risk items and open issues

| ID | Item | Impact | Disposition |
|---|---|---|---|
| S12-A1 | The deterministic browse source for organizations uses `/orgs` (no slug), but the frontend only has `/orgs/[slug]`; there is no organization index route. | The organization browse chip is rendered as plain text rather than a link. No broken link, XSS, or data exposure. | Accepted for Session 12. `safeSourceHref` explicitly rejects the slug-less path and documents the backend gap. Follow-up: add an organization index route or change the policy source path in a later session. |
| S12-A2 | Prompt-injection protection is structural, not a guarantee that a model cannot be persuaded by untrusted text. | A model could still follow a semantic instruction that survives escaping. It cannot close a delimiter, call a non-whitelisted tool, read private projections, or bypass quota. | Accepted as inherent LLM risk. Public-data-only context, tool allowlist, citation validation, leak guard, and private-data refusal bound the impact. |
| S12-A3 | System-prompt leak detection matches verbatim six-word windows. | A heavily paraphrased disclosure would not be caught deterministically. | Accepted low risk: the system prompt contains no secrets or credentials; the guard is a defense-in-depth backstop, not the only control. |
| S12-A4 | Malformed JSON returns `400 BAD_REQUEST` rather than the more specific `INVALID_JSON` because Nest wraps the body-parser `SyntaxError` before the filter sees it. | Error code is less specific; status and non-echoing behavior are correct. | Accepted. The `entity.parse.failed` mapping remains for direct body-parser errors. |
| S12-A5 | Quota/usage counters are in memory and reset on process restart; if the service is scaled to multiple instances, each instance has its own counters. | A restart temporarily restores the daily budget; multi-instance scaling would weaken global limits. | Accepted for the current single Render instance. Documented in `docs/DEPLOY.md`. Revisit before horizontal scaling. |
| S12-A6 | Privacy rules intentionally prevent logging client IPs or conversation content. | Abuse forensics and per-client tracing are limited. | Accepted privacy trade-off required by the proposal; aggregate rate-limit counters remain available. |

## 5. Launch gate

- All deterministic security probes pass or are safely refused.
- No private organization field, volunteer profile, or contact detail is exposed
  by the public tools or the usage endpoint.
- No message, prompt, retrieved text, tool payload, or IP is logged.
- Rate limiting uses the real client IP behind one production proxy and cannot
  be spoofed locally or with extra leftmost forwarded entries.
- No secret or private env value was found in the backend or frontend build
  output.
- The kill switch and provider selection work without code changes; Render's
  restart-on-env-change behavior is documented.
- No P0/P1 issue remains open.

**Conclusion:** the Session 12 launch gate is satisfied. Residual risks are the
accepted low-risk items in §4 and should be reviewed again before horizontally
scaling the service or changing the organization browse routes.

## 6. Reproduce

From `backend/`:

```text
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent-security.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent-quota-load.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/ai-agent.e2e-spec.ts test/ai-agent-orchestration.e2e-spec.ts
npx jest src/ai-agent src/main.spec.ts src/common/filters --runInBand --silent
npx jest --config ./test/jest-e2e.json --runInBand --forceExit test/deployment-config.e2e-spec.ts
npm run ai:check
npm run lint
npm run build
```

From `frontend/`:

```text
npm test -- --run
npm run lint
npm run build
npx playwright test e2e/ai-agent.spec.ts --reporter=list
```
