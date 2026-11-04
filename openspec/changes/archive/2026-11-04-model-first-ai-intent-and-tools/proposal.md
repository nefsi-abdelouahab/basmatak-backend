## Why

The router-first assistant currently fails its own default input budget for an empty Arabic prompt, sends full tool JSON schemas in the prompt while also sending declarations separately, and still has stale citation/`sources` expectations in documentation and e2e specs. Phase 0 fixed that safety baseline, ground answers in allowlisted links, and measured conversation-level behavior.

Phase 0 also showed the remaining quality gap is intent selection: 3 of 40 baseline dialogues and 15 of 30 unseen-phrasing dialogues fail only because the deterministic router chooses the wrong tool, not because the answer pipeline is unsafe. The router cannot generalise to synonyms, dialect, ordinals, pronouns, or topic switches. Phase 1 therefore lets the model choose from the same approved read-only tools while the router becomes a shadow signal, behind an off-by-default flag so the deployed behavior stays byte-identical until the comparison is reviewed.

## What Changes

### Phase 0 (implemented, retained)

- Raise the default `AI_AGENT_MAX_INPUT_TOKENS` from `3000` to `10000` (hard maximum stays `100000`) in configuration, `.env.example`, and operator docs.
- Remove full tool schemas and descriptions from the prompt's `<tools>` section. Keep a single neutral hint because declarations are sent through the provider's tool channel. Count declaration tokens in `estimatedInputTokens`, `estimatedTotalTokens`, and budget failures.
- Add budget coverage for empty Arabic, Arabic with six history messages, and Arabic with every registered tool; emit a content-free structured log event when `PROMPT_BUDGET_EXCEEDED` occurs.
- Make the grounding contract explicitly link-only: answers contain allowlisted Markdown links, never citation markers or a `sources` SSE event. Update docs and stale backend/frontend e2e specs; do not restore citations or the sources UI.
- Add a 40-dialogue bilingual regression suite (20 families × `en`/`ar`, 1–4 turns) with a deterministic scripted provider for CI and an opt-in live-provider mode (three runs per dialogue).
- Store the router-first baseline as JSON plus a short Markdown table, listing failing dialogues and reasons.

### Phase 1 (this change)

- Add `AI_AGENT_MODEL_FIRST` (`false` by default). With the flag off, routing, prompting, tool declaration, and answer bytes are identical to the Phase 0 router-first behavior; a byte-comparison test proves it.
- With the flag on, only the kill switch, quota checks, private-data refusal, exhausted-reply handling, and exact greeting/thanks replies run before the provider. The router still runs once per turn but is logged as `ai_agent_router_shadow` and never selects the tool set.
- Declare every approved read-only tool on every provider turn: `search_opportunities`, `search_organizations`, `search_reference_data`, `platform_stats`, `search_knowledge`, and the two new detail tools `get_opportunity_details` (exact public slug) and `get_organization_details` (exact public slug or exact name). All tools keep strict `additionalProperties: false` schemas, bounded rows/characters, and the forbidden-key result guard.
- Add a required, non-trimmable `<recent_entities>` prompt block derived from client history: the last three opportunities and last three organizations with title and slug (from relative, absolute, or locale-agnostic public links, plus plain-text titles linked earlier), `last_user_question`, `last_answer_offer`, and `pending_confirmation` parsed from `هل تقصد [X](link)؟` / `Did you mean [X](link)?`. Ordinals, short yes/no replies, pronouns, and raw slugs resolve deterministically; the block is escaped as untrusted data.
- Add model-first prompt rules (tool choice, follow-up resolution, grounding, safety) as a separate versioned system prompt so router-first prompt bytes do not change.
- Allow at most two tool rounds and three provider calls in normal mode. If the shadow router flags a live-data need but the model answered without calling a tool, retry once with a corrective instruction. If no tool is used after the retry, degrade to the existing deterministic browse/organization lookup, then to the localized safe answer.
- Keep provider-unavailable and quota degradation: model-first turns fall back to the deterministic browse or exact organization lookup, then to retrieval-only or a fixed limitation. Quota values and safety rules are unchanged.
- Keep all post-model guards (leak, ungrounded link sanitization, unbacked promise, empty answer) and add a final language check: an Arabic question must receive an Arabic answer; retry once with a stricter instruction, then fail closed to a localized safe message.
- Add a 30-dialogue generalisation corpus (15 families × `en`/`ar`) with unseen phrasing, synonyms, dialect, pronouns, topic switches, and typos; run both corpora in scripted and live modes with the flag off and on, and report pass rate, failures with reasons, safety rate, tokens, provider/tool calls, latency, and quota capacity.

## Capabilities

### New Capabilities
- `ai-agent-prompt-budget`: default and hard input-token limits, prompt/declaration accounting, trimming, and budget-exceeded observability.
- `ai-agent-grounding`: link-only answer contract, citation-marker removal, and absence of a `sources` event/UI.
- `ai-agent-conversation-regression`: bilingual dialogue corpus, scripted/live execution, per-turn telemetry, scoring, and baseline reporting.
- `ai-agent-model-first`: off-by-default rollout flag, shadow routing, complete read-only tool declaration, recent-entity follow-up state, bounded tool rounds, degraded fallbacks, and the final language guard.

### Modified Capabilities
- `ai-agent-conversation-regression`: adds the 30-dialogue generalisation corpus, flag-off/flag-on runs, per-mode artifact names, and model-first assertions.

## Impact

- Backend config, prompt builder/system prompt, orchestrator, tool registry, three new public detail/knowledge tools, recent-entity parsing, tests, docs (`AI_AGENT.md`), regression harness, npm script options, and baseline artifacts.
- No API request/response shape change, no quota change, no safety-rule relaxation, no database or schema migration, and no new dependency.
- Default behavior is unchanged: the flag ships `false` and the model-first path is opt-in through the environment.
