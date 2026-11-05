# Phase 1 - model-first comparison and recommendation

- Change: `model-first-ai-intent-and-tools`
- Branch: `ai-agent-session-2` (uncommitted)
- Date: 2026-11-04
- Flag: `AI_AGENT_MODEL_FIRST` (default `false`)
- Locales: `en`, `ar`
- Scripted artifacts: authoritative for behavior comparison
- Live artifacts: evidence of provider capacity only; not enough successful provider turns to compare model behavior

## Executive summary

1. **Scripted quality improved.** Model-first passed the 40-dialogue baseline 40/40 vs router-first 37/40, and the 30-dialogue generalization set 30/30 vs router-first 15/30. The improvement comes from letting the model use the seven read-only tools, especially `get_opportunity_details` and `get_organization_details`, for ordinal, pronoun, yes/no, slug, and lookup follow-ups.
2. **Safety stayed at 100%.** Every set, scripted and live, passed every safety check: 50/50, 42/42, 150/150, and 126/126.
3. **Cost increased materially.** Model-first used 2.36x the baseline input tokens and 2.95x the generalization input tokens. Provider calls rose 1.68x and 2.67x. Tool calls were flat on the baseline (20 vs 20) and 1.28x on generalization (32 vs 25).
4. **Live behavior is inconclusive.** Groq `qwen/qwen3.8-27b` was reachable, but the 7,000 input-tokens-per-minute (ITPM) free-tier limit rejected almost every request. The harness recorded 39-89 explicit `AI_AGENT_QUOTA_EXHAUSTED` turns per set, plus 79 silent zero-token degradations in the model-first generalization set. Only 1-3 turns per set were actually served by the provider.
5. **Current quotas cannot support 100 or 500 conversations/day.** The global daily request cap of 80 is the hard ceiling: about 57-64 conversations/day at the measured turns-per-conversation. The default 150,000-token budget lowers model-first to about 19-22 conversations/day. The local `.env` raises the budget to 550,000, but that does not raise the 80-request/day ceiling (and model-first at 100 conversations/day needs about 671k tokens/day at 1.25 turns/conversation).
6. **Recommendation: keep the flag off / not ready for production enablement.** The scripted quality gain is real and the implementation is safe, but there is no usable live quality evidence, model-first costs 2.4-3.0x in input tokens, and the existing quotas cannot serve the target volumes. Re-test with paced live traffic and a quota review before enabling.

## What was compared

| Set | Families | Dialogues | Turns | Runs in live mode |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 20 | 40 | 50 | 3 per dialogue |
| Generalization | 15 | 30 | 42 | 3 per dialogue |

- Scripted mode replaces only the LLM with a deterministic scripted provider and uses deterministic public fixtures for database-backed tools. The router, prompt builder, orchestrator, tool descriptors, schemas, guards, and scoring are real.
- Live mode uses the configured Groq provider and the same fixtures and scoring, so it measures model tool selection, arguments, language, and answer quality, not production database data.
- `provider-served` below means the provider returned a usage count (`inputTokens > 0`). A zero-token provider call is a quota/transport degradation, even when model-first hides it behind a deterministic fallback.

## Scripted results (authoritative for behavior)

| Set | Flag | Dialogue pass | Turn pass | Structural failures | Safety | Input avg / max | Output avg / max | Provider calls avg / max | Tool calls avg / max | Latency avg / max |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | router-first | 37/40 (92.5%) | 47/50 (94.0%) | 0 | 50/50 | 2,108.9 / 4,117 | 14.4 / 41 | 0.76 / 2 | 0.40 / 1 | 2.7 / 19 ms |
| Baseline | model-first | 40/40 (100%) | 50/50 (100%) | 0 | 50/50 | 4,969.3 / 6,130 | 25.6 / 73 | 1.28 / 2 | 0.40 / 1 | 4.6 / 50 ms |
| Generalization | router-first | 15/30 (50.0%) | 27/42 (64.3%) | 14 | 42/42 | 1,792.5 / 4,983 | 14.6 / 50 | 0.64 / 2 | 0.60 / 1 | 4.2 / 41 ms |
| Generalization | model-first | 30/30 (100%) | 42/42 (100%) | 0 | 42/42 | 5,293.3 / 6,662 | 27.5 / 50 | 1.71 / 2 | 0.76 / 1 | 5.0 / 43 ms |

### Scripted baseline failures (router-first)

- `platform-stats-en`: expected intent `live_data`, got `mixed`.
- `reference-data-en`: expected intent `live_data`, got `mixed`.
- `mixed-application-ar`: expected intent `mixed`, got `live_data`.

### Scripted generalization failures (router-first)

All 15 failures are follow-up or detail-tool cases that router-first cannot express because it never declares the detail tools:

- `gen-reference-synonyms-en` (1 locale): `search_reference_data` not selected.
- `gen-ordinal-first-*` (2 locales): expected `get_opportunity_details`, got `search_opportunities` or no tool; missing entity link.
- `gen-pronoun-summary-*` (2): expected `get_opportunity_details`, got `search_opportunities` or no tool; missing Oran/entity link.
- `gen-yesno-confirm-*` (2): expected `get_organization_details`, got no tool; missing Nour Association link.
- `gen-lookup-confirm-*` (2): expected `get_organization_details`, got `search_organizations` with the wrong argument shape.
- `gen-slug-reference-*` (2): expected `get_opportunity_details`, got `search_opportunities` or no tool; wrong link count.
- `gen-detail-org-*` (2): expected `get_organization_details`, got `search_organizations`.
- `gen-status-check-*` (2): expected `get_opportunity_details`, got no tool or `search_opportunities`; missing status fact/link.

Model-first passed all 30 generalization dialogues and made the expected detail calls with exact public slugs.

## Live results (capacity-limited, not behavioral evidence)

Live artifacts use Groq `qwen/qwen3.8-27b`. The provider returned HTTP 429 / rate-limit errors mapped to `AI_AGENT_QUOTA_EXHAUSTED`. The raw error observed in the live run was:

```text
Rate limit reached for model `qwen/qwen3.8-27b` ... input tokens per minute (ITPM): Limit 7000
```

| Set | Flag | Runs | Dialogue pass | Turn pass | Explicit quota turns | Silent zero-token turns | Provider-served turns | Provider-served quality | Safety |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | router-first | 120 | 48/120 (40.0%) | 60/150 (40.0%) | 87 | 0 | 3 | 0/3 | 150/150 |
| Baseline | model-first | 120 | 34/120 (28.3%) | 43/150 (28.7%) | 89 | 48 | 1 | 1/1 | 150/150 |
| Generalization | router-first | 90 | 18/90 (20.0%) | 45/126 (35.7%) | 61 | 0 | 2 | 0/2 | 126/126 |
| Generalization | model-first | 90 | 12/90 (13.3%) | 39/126 (31.0%) | 39 | 79 | 2 | 0/2 | 126/126 |

Interpretation:

- The raw live pass rates are mostly deterministic shortcuts or fallbacks, not model answers. For example, the router-first baseline's 60 passing turns are all `providerCalls === 0`; the three provider-served turns passed 0/3.
- Model-first hides quota failures behind its deterministic browse/organization fallback. Those turns have `providerCalls > 0` but zero input/output tokens, so they look like successful turns in the raw report. They are counted separately above as "silent zero-token".
- Only 8 turns across all four live sets were actually provider-served. That is far too small a sample to claim model-first is better or worse in live conditions.
- The exact provider failure is capacity, not prompt/tool behavior: the model-first prompt is about 5.0-5.3k input tokens per turn, so the 7,000 ITPM window is exhausted after roughly one call per minute. The harness issues calls faster than that and does not pace them.

### Live raw metrics (including degraded turns)

These are the values written by the harness. They are dominated by zero-token quota failures and are not representative of model cost.

| Set | Flag | Input avg / max | Output avg / max | Provider calls avg / max | Tool calls avg / max | Latency avg / max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | router-first | 56.7 / 2,871 | 0.7 / 46 | 0.60 / 1 | 0.20 / 1 | 118.0 / 1,036 ms |
| Baseline | model-first | 36.2 / 5,435 | 0.4 / 57 | 0.92 / 1 | 0.32 / 1 | 186.3 / 1,170 ms |
| Generalization | router-first | 52.4 / 3,304 | 0.6 / 40 | 0.50 / 1 | 0.40 / 1 | 92.6 / 962 ms |
| Generalization | model-first | 82.4 / 5,249 | 1.0 / 77 | 0.96 / 2 | 0.65 / 2 | 357.6 / 2,951 ms |

### Live provider-served subset

Only turns with `inputTokens > 0` are included. The sample is too small for a stable comparison, but it shows the real per-turn token size.

| Set | Flag | Served turns | Input tokens | Output tokens | Provider calls | Latency avg |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | router-first | 3 | 8,507 | 111 | 3 | 646.3 ms |
| Baseline | model-first | 1 | 5,435 | 57 | 1 | 1,170.0 ms |
| Generalization | router-first | 2 | 6,608 | 74 | 2 | 917.0 ms |
| Generalization | model-first | 2 | 10,388 | 128 | 3 | 2,184.0 ms |

## Required named failures

"Before" = router-first, "after" = model-first. Live results include the quota caveat.

| Prompt | Scripted before | Scripted after | Live before | Live after | Reason |
| --- | --- | --- | --- | --- | --- |
| `أخبرني عن الأولى` | fail | pass | fail (quota) | fail (silent degradation) | Router-first has no detail tool and cannot resolve the ordinal to `beach-cleanup`; model-first scripted calls `get_opportunity_details` with the resolved slug. Live model-first falls back to `search_opportunities` after a zero-token provider call. |
| `نعم` | fail | pass | fail (quota) | fail (silent degradation) | Router-first does not rerun the pending organization lookup; model-first scripted calls `get_organization_details` with `nour-association`. Live falls back to `search_organizations`. |
| `قدم لي نبذة عنها` | fail | pass | fail (quota) | fail (silent degradation) | Router-first sends the pronoun follow-up to search and returns multiple links; model-first scripted resolves `beach-cleanup` and calls the detail tool. Live fallback repeats the search. |
| `هل هي مفتوحة؟` | pass | pass | pass (deterministic) | pass (deterministic) | The baseline focused-detail path already handles this. In live mode the model-first pass is a zero-token fallback, not a model answer. No regression. |
| `هل تحققت` | fail | pass | fail (quota) | fail (silent degradation) | Router-first reruns `search_organizations` with the wrong shape; model-first scripted calls `get_organization_details` with the resolved slug. Live falls back to `search_organizations`. |
| `اشرح أكثر` | pass | pass | fail (quota) | fail (quota) | Both scripted modes continue the knowledge answer correctly. Live fails because the provider quota is exhausted before an answer is produced. |

## Cost comparison

| Set | Metric | Router-first | Model-first | Change |
| --- | --- | ---: | ---: | ---: |
| Baseline | Input tokens (total) | 105,443 | 248,463 | 2.36x |
| Baseline | Output tokens (total) | 718 | 1,278 | 1.78x |
| Baseline | Provider calls | 38 | 64 | 1.68x |
| Baseline | Tool calls | 20 | 20 | 1.00x |
| Baseline | Scripted latency (total) | 137 ms | 231 ms | 1.69x |
| Generalization | Input tokens (total) | 75,284 | 222,318 | 2.95x |
| Generalization | Output tokens (total) | 612 | 1,154 | 1.89x |
| Generalization | Provider calls | 27 | 72 | 2.67x |
| Generalization | Tool calls | 25 | 32 | 1.28x |
| Generalization | Scripted latency (total) | 177 ms | 208 ms | 1.18x |

The scripted latency is local provider emulation and is not a production latency estimate. The live provider-served sample is too small to report a stable latency (about 0.6-2.2 s for the handful of successful calls).

## Quota capacity (no quota changes)

### Effective settings

| Setting | Config default | Local `backend/.env` |
| --- | ---: | ---: |
| `ipRequestsPerMinute` | 4 | 20 |
| `ipRequestsPerDay` | 15 | 15 |
| `globalRequestsPerMinute` | 8 | 29 |
| `globalRequestsPerDay` | 80 | 80 |
| `maxConcurrent` | 2 | 5 |
| `dailyTokenBudget` | 150,000 | 550,000 |
| `maxInputTokens` | 10,000 | 10,000 |
| `maxOutputTokens` | 400 | 400 |
| `maxToolRounds` (env) | 1 | 1 |

Model-first uses up to two tool rounds within three provider calls in normal mode. The request quotas count one request per turn; the internal provider/tool calls do not increment the local request counters, but the token budget reserves estimated input plus max output for each turn.

### Conversations/day

Measured turns per conversation: 1.25 for the baseline (50 turns / 40 dialogues) and 1.4 for generalization (42 / 30).

| Budget / mode | Baseline token-limit turns/day | Baseline conversations/day (1.25) | Generalization token-limit turns/day | Generalization conversations/day (1.4) | Binding limit |
| --- | ---: | ---: | ---: | ---: | --- |
| 150,000, router-first | 59 | 47.2 | 68 | 48.6 | Token budget |
| 150,000, model-first | 27 | 21.6 | 26 | 18.6 | Token budget |
| 550,000, router-first | 219 | 64.0 | 250 | 57.1 | Global RPD 80 |
| 550,000, model-first | 102 | 64.0 | 96 | 57.1 | Global RPD 80 |

Also:

- Per IP, 15 requests/day allows about 12.0 baseline conversations/day (1.25 turns) or 10.7 generalization conversations/day (1.4 turns).
- The global 80 requests/day allows at most 64.0 baseline conversations/day or 57.1 generalization conversations/day, regardless of token budget.
- 100 conversations/day needs 125 turns (1.25) or 140 turns (1.4), i.e. 1.56x-1.75x the current global RPD.
- 500 conversations/day needs 625 turns (1.25) or 700 turns (1.4), i.e. 7.81x-8.75x the current global RPD.
- At 1.25 turns/conversation, 100 conversations/day need at least 9 distinct IPs at the 15/day IP cap; 500/day need at least 42.
- The 150,000 default budget cannot support 100 model-first conversations/day: 125 turns x (4,969 input + 400 output) is about 671k tokens, above both 550k and 150k. Router-first at 100/day needs about 314k tokens, which fits 550k but still needs a higher global RPD.
- At 500/day the token needs are about 1.57M (router-first) and 3.36M (model-first) at 1.25 turns, or 1.76M and 3.76M at 1.4 turns.
- The configured per-minute rates (20/29 locally, 4/8 by default) are not binding for 100 or 500 conversations/day on average; the daily request and token caps are.

**Conclusion:** no non-quota setting can reach 100 or 500 conversations/day while keeping the current quotas. Request quotas must be raised first; the token budget must then be raised for model-first at 100/day, and for either mode at 500/day.

## Recommendation

**Keep `AI_AGENT_MODEL_FIRST` off / not ready for production enablement.**

Evidence for:

- Scripted behavior is clearly better: 40/40 vs 37/40 baseline, 30/30 vs 15/30 generalization, 0 structural failures, safety 100%.
- The new detail tools resolve the required Arabic follow-ups in scripted mode.

Evidence against enabling now:

- No usable live quality sample: only 1-3 provider-served turns per set (model-first 1/1 baseline and 0/2 generalization; router-first 0/3 and 0/2). The remaining live passes are deterministic fallbacks.
- Model-first prompt cost is 2.36x-2.95x router-first input tokens and provider calls are 1.68x-2.67x.
- Current quotas cap the service at about 57-64 conversations/day; 100 and 500/day cannot be reached without raising global RPD and token budget.
- The model-first fallback can hide provider-capacity failures without an error code, which makes live monitoring harder unless zero-token provider calls are alerted on.

Suggested next step before enabling: run a paced live sample (enough spacing to stay under 7,000 ITPM) against both flags, and review the global RPD/token budget. If a staged rollout is still required, keep the flag off by default and enable it only for a small internal cohort after the paced sample passes.

## Reproduction commands

Scripted:

```powershell
cd backend
npm run ai:regression
$env:AI_AGENT_MODEL_FIRST='true'; npm run ai:regression
$env:AI_REGRESSION_CORPUS='generalization'; npm run ai:regression
$env:AI_AGENT_MODEL_FIRST='true'; $env:AI_REGRESSION_CORPUS='generalization'; npm run ai:regression
```

Live (three runs per dialogue):

```powershell
# Load backend/.env into the process environment first. The regression script
# reads process.env only; it does not load .env itself.
$env:AI_REGRESSION_LIVE='1'; npm run ai:regression
$env:AI_REGRESSION_LIVE='1'; $env:AI_AGENT_MODEL_FIRST='true'; npm run ai:regression
$env:AI_REGRESSION_LIVE='1'; $env:AI_REGRESSION_CORPUS='generalization'; npm run ai:regression
$env:AI_REGRESSION_LIVE='1'; $env:AI_REGRESSION_CORPUS='generalization'; $env:AI_AGENT_MODEL_FIRST='true'; npm run ai:regression
```

## Verification (real outputs)

| Command | Result |
| --- | --- |
| `npm run ai:check` | 140 files scanned, 140 indexed, 349,472 bytes; warnings 0, errors 0; passed. |
| `npx jest src/ai-agent --runInBand` | 35 suites passed, 35 total; 697 tests passed, 3 skipped, 700 total; 36.754 s (final rerun). |
| `npm run ai:eval` | 140 files, 879 chunks, 0 loader issues; 53 queries; top-4 53/53 (100%), top-6 53/53 (100%); empty 0; core FAQ 18/18; PASS. |
| Scripted harness, flag off | `router-first-scripted` 37/40, `router-first-generalization` 15/30. |
| Scripted harness, flag on | `model-first-scripted` 40/40, `model-first-generalization` 30/30. |
| Live harness, flag off | `router-first-live` 48/120, `router-first-generalization-live` 18/90; both quota-limited. |
| Live harness, flag on | `model-first-live` 34/120, `model-first-generalization-live` 12/90; both quota-limited. |
| `npm run build` | `ai:check` passed; `nest build` completed with exit 0. |
| `npm run lint` | `eslint "{src,apps,libs,test}/**/*.ts" --fix` completed with exit 0 and no reported problems. |
| `openspec validate model-first-ai-intent-and-tools --strict` | `Change 'model-first-ai-intent-and-tools' is valid`. |

The flag-off path is unchanged: the prompt builder test asserts the original system prompt and version bytes when `modelFirst` is false, and the full Jest run passes.

## Artifacts

- `router-first-scripted.json` / `.md`
- `model-first-scripted.json` / `.md`
- `router-first-generalization.json` / `.md`
- `model-first-generalization.json` / `.md`
- `router-first-live.json` / `.md`
- `model-first-live.json` / `.md`
- `router-first-generalization-live.json` / `.md`
- `model-first-generalization-live.json` / `.md`
- This report: `phase-1-comparison.md`

## Modified files (uncommitted)

Implementation and tests:

- `backend/.env.example`
- `backend/src/ai-agent/ai-agent.controller.spec.ts`
- `backend/src/ai-agent/ai-agent.module.ts`
- `backend/src/ai-agent/config/ai-agent.config.ts`
- `backend/src/ai-agent/orchestrator/ai-agent.orchestrator.spec.ts`
- `backend/src/ai-agent/orchestrator/ai-agent.orchestrator.ts`
- `backend/src/ai-agent/orchestrator/answer-links.ts`
- `backend/src/ai-agent/orchestrator/answer-policy.ts`
- `backend/src/ai-agent/prompt/prompt-builder.spec.ts`
- `backend/src/ai-agent/prompt/prompt-builder.ts`
- `backend/src/ai-agent/prompt/prompt.types.ts`
- `backend/src/ai-agent/prompt/system-prompt.ts`
- `backend/src/ai-agent/recent-entities.ts` (new)
- `backend/src/ai-agent/recent-entities.spec.ts` (new)
- `backend/src/ai-agent/regression/baseline.ts`
- `backend/src/ai-agent/regression/dialogues.ts`
- `backend/src/ai-agent/regression/fixtures.ts`
- `backend/src/ai-agent/regression/generalization.ts` (new)
- `backend/src/ai-agent/regression/harness.ts`
- `backend/src/ai-agent/regression/regression.spec.ts`
- `backend/src/ai-agent/regression/scoring.ts`
- `backend/src/ai-agent/regression/types.ts`
- `backend/src/ai-agent/tools/get-opportunity-details.tool.ts` (new)
- `backend/src/ai-agent/tools/get-organization-details.tool.ts` (new)
- `backend/src/ai-agent/tools/public-tools.spec.ts`
- `backend/src/ai-agent/tools/search-knowledge.tool.ts`
- `backend/src/ai-agent/tools/tool.types.ts`
- `backend/src/scripts/ai-regression.ts`

Documentation and OpenSpec:

- `docs/AI_AGENT.md`
- `openspec/changes/model-first-ai-intent-and-tools/` (proposal, design, tasks, specs)

Baseline artifacts:

- All eight JSON/Markdown artifact pairs listed above
- `backend/test/ai-baseline/phase-1-comparison.md` (this report)

---

# Phase 2 - Input-cost reduction and paced live sample

- Change: `model-first-ai-intent-and-tools`
- Branch: `ai-agent-session-2` (uncommitted)
- Date: 2026-11-04
- Flag: `AI_AGENT_MODEL_FIRST` (default `false`)
- Scope: prompt, history, and tool-declaration compaction; silent-fallback observability; paced live sampling

## Outcome

- **Budget targets met.** The scripted 70-dialogue phase-2 corpus now costs **2,816.2 average** and **3,987 maximum** input tokens per turn for model-first, against targets of `<= 3,000` and `<= 4,000`.
- **Quality held.** Model-first still passes **70/70 dialogues**, **92/92 turns**, with **0 structural failures** and **92/92 safety checks**.
- **Phase-1 costs to beat.** Model-first previously cost 4,969 avg / 6,130 max on the baseline set and 5,293 avg / 6,662 max on the generalization set. Phase 2 replaces both with a single combined corpus.
- **Flag-off prompt bytes are unchanged.** The shared router-first constants, system prompt, and version are untouched, and the byte-identity prompt test still passes.

## Prompt and tool token cost

Measured with the production token estimator (`estimateTokens`, Latin `ceil(chars/4)`, Arabic `ceil(chars/2)`), before = start of Phase 2 and after = final Phase 2 assets.

| Component | Before | After | Change |
| --- | ---: | ---: | ---: |
| Model-first system prompt | 1,762 | 1,245 | -517 (-29.3%) |
| Response style (en) | 336 | 115 | -221 (-65.8%) |
| Response style (ar) | 516 | 159 | -357 (-69.2%) |
| Few-shot examples (4 total) | 177 | 142 | -35 (-19.8%) |
| Link rules (en) | 145 | 100 | -45 (-31.0%) |
| Link rules (ar) | 176 | 130 | -46 (-26.1%) |
| Tool declarations (all 7) | 732 | 590 | -142 (-19.4%) |
| Full prompt, en, no history/knowledge | 3,260 | 2,301 | -959 (-29.4%) |
| Full prompt, ar, no history/knowledge | 3,472 | 2,376 | -1,096 (-31.6%) |

Per-tool declaration cost:

| Tool | Before | After | Change |
| --- | ---: | ---: | ---: |
| `search_knowledge` | 78 | 66 | -12 |
| `search_opportunities` | 199 | 162 | -37 |
| `search_organizations` | 98 | 81 | -17 |
| `search_reference_data` | 101 | 83 | -18 |
| `platform_stats` | 51 | 37 | -14 |
| `get_opportunity_details` | 101 | 81 | -20 |
| `get_organization_details` | 103 | 81 | -22 |

What changed:

- The model-first system prompt was rewritten to 23 dense rules and the version bumped to `2`; every grounding, privacy, language, link, follow-up, and promise rule is preserved.
- Model-first uses its own compact response style, two short examples per language, and compact link rules. The shared flag-off constants are not modified.
- Every exposed tool description is one precise sentence, optional parameters that the model does not need were removed, and property descriptions are terse. Handlers still accept the deterministic-orchestrator extras (`limit`, `sort`, `compact`) where applicable.
- `get_opportunity_details` now accepts an exact `slug` or an exact `name`, matching `get_organization_details`.
- Model-first history is capped at the last four messages, and **every** prior assistant message is compacted to its first sentence plus linked entity titles. The current user message stays full.
- `<recent_entities>` carries only compact entity titles/slugs plus the resolved reference; the reference rules live once in the system prompt.

## Scripted phase-2 results

The `phase2` corpus is the union of the 20-family baseline and the 15-family generalization set: 35 families, 70 dialogues, 92 turns.

| Flag | Dialogue pass | Turn pass | Structural failures | Safety | Input avg / max | Output avg / max | Provider calls avg / max | Tool calls avg / max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| router-first | 52/70 (74.3%) | 74/92 (80.4%) | 14 | 92/92 | 1,909.8 / 4,634 | 14.5 / 50 | 0.71 / 2 | 0.49 / 1 |
| model-first | **70/70 (100%)** | **92/92 (100%)** | **0** | **92/92** | **2,816.2 / 3,987** | 26.4 / 73 | 1.48 / 2 | 0.57 / 1 |

The 18 router-first failures are the same known gaps as Phase 1: three baseline intent mismatches and the generalization follow-up/detail cases that router-first cannot express without the detail tools.

The regression test `scripted model-first phase-2 token budget` asserts the average and maximum limits over all 70 dialogues, plus full pass and the phase-2 artifact name.

## Paced live sample

The live sample is 24 of the 70 dialogues: 12 from the 40-dialogue baseline and 12 from the 30-dialogue generalization set, balanced 12 English / 12 Arabic and including every named Phase-1 failure. It runs one pass per dialogue with a 25,715 ms wait between turns (input-token pacing at the 7,000 ITPM free-tier limit) and up to two retries for quota or zero-token turns.

| Flag | Dialogue pass | Turn pass | Structural failures | Safety | Provider-served turns | Served pass | Served input avg / max | Served output avg / max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| router-first | 7/24 (29.2%) | 16/38 (42.1%) | 8 | 38/38 | 20 | 1/20 (5.0%) | 3,494.3 / 5,988 | 54.1 / 130 |
| model-first | 3/24 (12.5%) | 7/38 (18.4%) | 18 | 38/38 | 27 | 3/27 (11.1%) | 4,886.8 / 6,986 | 72.2 / 163 |

Turn classification (model-first): 27 provider-served, 2 quota, 7 silent fallback, 2 deterministic. Router-first: 20 provider-served, 0 quota, 0 silent fallback, 18 deterministic.

**Quota caveat.** The flag-off sample completed before the Groq free-tier daily cap was reached, while the flag-on sample hit the 200,000 tokens-per-day cap near the end of the run. The two explicit quota turns and seven silent zero-token turns are the late Arabic sample after retries; they are classified separately and excluded from the provider-served rate. Both samples are therefore not equally quota-free, and the live pass rates should not be read as a clean mechanism comparison.

**Why the live rates are low.** The live checks compare free-form generations against scripted key facts, links, and exact tool-argument shapes. For model-first, 19 of the 27 served turns failed at least one key-fact check because the model paraphrased the expected phrase, 11 failed a tool-argument shape check, 4 missed an expected link, and 3 used a different tool. Many of these are fixture mismatches rather than wrong answers (for example `search_organizations` with `name: "Nour Association"` instead of the expected `"Nour"`), but the wrong-tool cases are genuine behaviour differences and are called out in the named-failure table. The same key-fact strictness dominates the router-first sample. Safety is 38/38 for both mechanisms.

**Live token cost.** Provider-served model-first turns cost 4,886.8 average and 6,986 maximum input tokens in this sample. These turns include retrieved knowledge, history, and tool results from the live database, unlike the fixed scripted fixtures; the <= 3,000 / <= 4,000 budget assertion is defined over the scripted 70-dialogue corpus. For reference, the three provider-served model-first turns that survived the Phase-1 quota runs averaged 5,194-5,435 input tokens.

### Named-failure outcomes

| Named failure | Router-first live | Model-first live |
| --- | --- | --- |
| `verification-workflow-ar` (`اشرح أكثر`) | Fail: 3/3 turns provider-served, all three miss an exact Arabic key fact | Fail: 3/3 provider-served, same key-fact misses |
| `gen-ordinal-first-ar` (`أخبرني عن الأولى`) | Fail: turn 2 is a deterministic fallback with no detail tool, so the link is missing | Fail: both turns served; the detail lookup runs, but the answer misses `مفتوحة` |
| `gen-pronoun-summary-ar` (`قدم لي نبذة عنها`) | Fail: turn 2 never reaches the provider | Fail: both turns are silent fallbacks after quota exhaustion |
| `gen-yesno-confirm-ar` (`نعم`) | Fail: turn 2 never reaches the provider | Fail: turn 1 passes; turn 2 is a silent fallback with the wrong tool |
| `gen-lookup-confirm-ar` (`هل تحققت`) | Fail: turn 2 calls `search_organizations` instead of `get_organization_details` | Fail: both turns are silent fallbacks with the wrong tool |
| `opportunity-detail-ar` (`هل هي مفتوحة؟`) | Pass: all three turns answered by the deterministic fallback | Fail: three provider-served turns, wrong argument shape and missing link |

Only `opportunity-detail-ar` passes live in either mechanism; the other five remain the same hard cases, now with the failure stage (provider-served, deterministic fallback, quota, or silent fallback) recorded explicitly.

## Silent-fallback observability

`UsageMeterService` now maintains per-reason fallback counters and emits one structured warning per occurrence:

```json
{"event":"ai_agent_fallback","reason":"quota","count":3,"day":"2026-11-04"}
```

- Reasons: `quota`, `provider_error`, `no_tool_retry_failed`, `language_retry_failed`.
- The model-first loop records at most one fallback per reason per turn.
- A provider call that returns zero input tokens is recorded as `provider_error`, so a silent degradation can no longer look like a normal answer.
- `GET /api/v1/ai-agent/usage` exposes `fallbacks.today` and `fallbacks.last7Days` (per reason plus `total`) alongside the existing `today`, `last7Days`, and `budget` fields. No user data is included.
- Usage-meter tests cover counters, warning payloads, rolling windows, and report shape; orchestrator tests cover the quota, provider-error, no-tool, language-retry, and zero-token paths.
