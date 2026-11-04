## Context

Phase 0 prepared the safety baseline without changing router-first runtime behavior. Measurements against the code then showed the base Arabic prompt needed about 3061 estimated tokens against a 3000 default; adding six history messages or all tool declarations exceeded it further. The provider already receives tool declarations out of band (`LlmTurnRequest.tools`), but the prompt still embedded every description and JSON schema.

Answers are already sanitized into link-only text: citation markers are stripped, only links returned by this turn's tools survive, and the orchestrator emits no `sources` event. Documentation and older e2e specs still described citations and sources, so they were aligned with the implementation rather than changing the implementation back.

Phase 0's 40-dialogue baseline passed 37/40. The three failures (`platform-stats-en`, `reference-data-en`, `mixed-application-ar`) were router-intent mismatches with no structural failure. A separate 30-dialogue generalisation set with unseen phrasing passed only 15/30, with 14 structural failures caused by missing detail tools or wrong router intents (`gen-reference-synonyms-en`, `gen-ordinal-first-en`, `gen-ordinal-first-ar`, `gen-pronoun-summary-en`, and others). The remaining bottleneck is deterministic intent selection, not safety.

## Goals / Non-Goals

**Goals:**
- Make the default prompt budget sufficient for realistic Arabic inputs, history, and every registered tool.
- Make prompt token accounting match what the provider actually receives.
- Produce an auditable baseline of conversation-level behavior before and after model-first routing.
- Keep CI deterministic and fast; make live-provider evaluation explicitly opt-in.
- Let the model choose among approved read-only tools while keeping safety, quotas, link grounding, and language guarantees intact.
- Keep the flag-off path byte-identical and roll back by configuration alone.

**Non-Goals:**
- Changing quotas, safety rules, tool allowlists, public DTOs, database schemas, or dependencies.
- Restoring citations, `sources`, or source chips.
- Giving the model write access, private data, or arbitrary database queries.
- Enabling the flag in production as part of this change; the recommendation is reported for a separate rollout decision.

## Decisions

### Raise the default input budget to 10000 (Phase 0)

The measured worst realistic case was roughly 4.1k tokens with full schemas. Removing schemas reduced that further, but a 10k default leaves room for system prompt growth, bilingual history, and tool declarations while staying far below the 100k hard maximum. `.env.example` already documents 10000, so this made code and docs agree. Alternative: 6000, rejected because it leaves little headroom for the Phase 1+ prompt.

### Prompt hint plus declaration accounting (Phase 0)

The `<tools>` section contains one line: the tool count and a statement that declarations are supplied separately. `PromptBuilder` computes declaration tokens with the same estimator used for prompt text, against exactly `toLlmToolDeclaration(...)` JSON. `estimatedInputTokens` becomes prompt text + declarations; trimming and fail-closed checks use that total. `BuiltPrompt` exposes the declaration estimate so tests and diagnostics can tell the two apart. Alternative: remove the `<tools>` section entirely; rejected because section order/delimiters are pinned and a neutral hint is useful to the model.

### Structured budget event without content (Phase 0)

When `build()` returns `PROMPT_BUDGET_EXCEEDED`, the orchestrator emits `warn`-level JSON with `event: "ai_agent_prompt_budget_exceeded"`, `provider`, `model`, `toolCount`, `historyMessages`, `estimatedRequiredTokens`, and `maxInputTokens`. It never logs message text, prompt text, or tool arguments. The existing user-facing `AI_AGENT_INVALID_INPUT` SSE behavior is unchanged.

### One harness, two providers (Phase 0)

A reusable harness module owns the dialogue definitions, deterministic knowledge/tool fixtures, per-turn metrics, and scoring. CI uses a scripted provider that chooses from the declarations the runtime actually supplied; live mode swaps in the configured real provider and repeats each dialogue three times. The script/provider split keeps assertions deterministic while still measuring real behavior.

### Baseline artifacts, not a hard pass gate (Phase 0)

The scripted run writes JSON plus a short Markdown table under `test/ai-baseline/`. Quality failures are reported with reasons rather than failing the harness process, because the baseline intentionally captures known router-first gaps. Structural invariants (locale correctness, no private data, no citation markers, no `sources`, argument shape) are asserted. Live mode is opt-in via `AI_REGRESSION_LIVE=1` and not part of CI.

### Separate model-first prompt behind one config flag (Phase 1)

`AiAgentConfig.modelFirst` is loaded from `AI_AGENT_MODEL_FIRST` with the same strict boolean parser used by other flags and defaults to `false`. The flag is passed into `PromptBuildInput`; when false, the builder selects the unchanged Phase 0 system prompt and never renders `<recent_entities>`. A dedicated model-first system prompt is a separate constant with its own version, so addition of model-first rules cannot alter flag-off prompt bytes. Alternative: append rules conditionally to one prompt; rejected because byte identity would depend on subtle trimming and no test could prove equivalence cheaply.

### The router becomes a shadow signal when the flag is on

The orchestrator still calls `router.route(...)` once because it cheaply identifies greetings, language, quota-relevant browse hints, and a live-data signal. In model-first mode the decision is logged by `logRouterShadow` and is not used to select tools or to short-circuit except for exact `GREETING` and `THANKS` direct replies. Capability, clarification, off-topic, and knowledge-only questions reach the provider. The log contains intent, action, reason, tool intents, counts, top score, mode, and history size, never message or answer text. Alternative: skip the router entirely; rejected because the live-data retry and deterministic degraded lookup need a cheap signal, and shadow comparisons require the same input.

### Declare the complete approved read-only registry on every turn

`ToolRegistry.list()` is injected into the orchestrator as an optional constructor argument and, in model-first mode, every registered tool is declared on every provider call, including the final answer call. The declared set is: `search_opportunities`, `search_organizations`, `search_reference_data`, `platform_stats`, `search_knowledge`, `get_opportunity_details`, `get_organization_details`. The tool set does not depend on the router decision. When no registry is available the orchestrator falls back to the router's own descriptor list, which keeps existing tests and degraded wiring safe. Alternative: declare a subset based on the shadow router; rejected because that would reintroduce router-first failures.

### Detail tools use new, separate intents

`get_opportunity_details` accepts exactly one public `slug` and returns the existing `PublicOpportunityCard` shape or `{ item: null }`. `get_organization_details` accepts exactly one of `slug` or exact `name`; names are matched as whole normalized values with one optional organization-type prefix removed (`جمعية`, `association`, ...), never as a substring or regex. Both query only published opportunities or verified active organizations, reuse the existing public projections, expose no contact/registration/location-address/internal-id fields, and pass the shared forbidden-key guard. Their intents (`opportunity_details`, `organization_details`) are distinct so the router-first path never declares them and flag-off behavior stays unchanged. `search_knowledge` becomes a normal `ReadOnlyTool` so it can be registered, declared, and executed by name in model-first mode.

### Recent entities are server-derived, required, and untrusted

Assistant history is the only source. The parser accepts relative, absolute, and locale-agnostic public links (`/ar/opportunities/<slug>`, `/en/orgs/<slug>`, and equivalents) and plain-text titles that were linked earlier in the same conversation. It keeps the newest three per kind, deduplicates, bounds titles/slugs, drops unsafe hrefs, and derives `last_user_question`, `last_answer_offer`, and `pending_confirmation` from confirmation sentences. Short yes/no replies target the pending confirmation; ordinals select displayed opportunities; pronouns select the pending confirmation or newest entity; a raw slug in the message wins. The formatted block is required and non-trimmable: trimming drops history, knowledge chunks, and tool results first, and fails closed only if the required block alone exceeds the budget. Titles and slugs are escaped so they cannot close `<recent_entities>` or inject sections. Alternative: ask the client to send structured references; rejected because the existing client only sends chat messages and is not changed.

### Bounded model-first loop with one live-data corrective retry

Normal mode allows at most two tool rounds and three provider calls (`AI_AGENT_MODEL_FIRST_MAX_TOOL_ROUNDS = 2`, shared `AI_AGENT_MAX_PROVIDER_CALLS = 3`). Conservative mode keeps one round. Empty or unusable results still produce localized `noOpportunities`, `noOpportunitiesInArea`, or `notFound` replies. If the shadow router flags live-data intent and the first answer contains no tool call, the orchestrator sends one corrective instruction; if the next answer still calls no tool, it runs the deterministic browse/organization lookup before accepting model text. Provider-unavailable and provider-quota errors use the same deterministic fallback; quota retrieval/knowledge-only modes use retrieval or the fixed limitation. Alternative: let the model retry indefinitely; rejected by the existing cost and latency bounds.

### Post-model guards and a final language check

The existing guards stay in place: system-instruction leak detection, link allowlisting, list/browse-link policy, empty-answer refusal, and the unbacked-promise guard. A new guard checks that an Arabic question receives an answer whose main script is Arabic; Latin slugs, names, and URLs inside Markdown links or bare URLs are ignored for the check. A failure triggers exactly one retry with a stricter system instruction. If the retry is still not Arabic, the turn fails closed to the localized `ungrounded` message instead of streaming the wrong language. Only the Arabic direction is enforced because English answers may legitimately quote Arabic titles. Alternative: detect language before streaming; rejected because the existing pipeline streams only the final provider turn and a post-hoc check keeps the change localized.

### Run the full matrix before recommending rollout

STEP 3 runs baseline (40) and generalisation (30) corpora with the flag off and on, scripted and live. Reports record pass rate, structural failures, safety rate, failures with reasons, average/max input and output tokens, provider calls, tool calls, and latency. Quota capacity is computed from the existing per-IP, global, concurrency, and daily-token settings without changing any quota. The recommendation is enable, keep the flag off, or not ready, based on the comparison and on whether the 100/500 conversations-per-day targets fit current quotas.

## Risks / Trade-offs

- [Declaration estimate differs from provider tokenizer] → Use the existing conservative estimator and prefer provider-reported usage when present; baseline records estimates explicitly.
- [Scripted provider makes quality look better than production] → Script only chooses among declared tools and ideal arguments; missing declarations still surface as failures, and live mode validates real model behavior.
- [Baseline failures become ignored] → Baseline JSON records per-criterion pass/fail and Markdown lists each failure with a reason; future phases compare against it.
- [Large default budget increases cost] → Hard maximum and daily quotas are unchanged; only the per-turn prompt cap rises, and no automatic behavior change is enabled.
- [Model-first increases input tokens because seven tools are always declared] → Measure both corpora. If cost is unacceptable, keep the flag off; the code path remains opt-in and rollback is configuration-only.
- [Model may ignore live data and answer from memory] → Shadow live-data retry plus deterministic replacement after a second no-tool answer.
- [Model may answer an Arabic question in English] → Final language guard retries once, then fails closed.
- [History-derived entities can be attacker-controlled] → Bounded parsing, public-link allowlist, escaping, and explicit untrusted-data instruction in the prompt.
- [Flag-off drift] → Dedicated prompt constant plus a byte-identity test that supplies model-first state with the flag off and compares the complete prompt text/system/version.

## Migration Plan

1. Ship the Phase 0 config and prompt-accounting change; restart applies it at boot.
2. Update docs/e2e expectations to link-only.
3. Run the scripted harness to produce the baseline.
4. Ship the Phase 1 code with `AI_AGENT_MODEL_FIRST=false`; deployed behavior is unchanged.
5. Run the flag-off/flag-on scripted and live matrix; review pass rates, safety, and cost.
6. Enable for a limited rollout by setting `AI_AGENT_MODEL_FIRST=true`; disable by unsetting the variable or setting it to `false`.
7. Roll back by configuration or by reverting the commit; no migration or persisted state.

## Open Questions

- None blocking implementation. The enablement decision is deferred to the STEP 3 comparison report, including whether the current `dailyTokenBudget` of `150000` supports the requested 100/500 conversations-per-day targets.
