## Context

Phase 0 prepares for model-first intent selection without changing the current router-first runtime behavior. Measurements against the current code show the base Arabic prompt needs about 3061 estimated tokens against a 3000 default; adding six history messages or all tool declarations exceeds it further. The provider already receives tool declarations out of band (`LlmTurnRequest.tools`), but the prompt still embeds every description and JSON schema.

Answers are already sanitized into link-only text: citation markers are stripped, only links returned by this turn's tools survive, and the orchestrator emits no `sources` event. Documentation and older e2e specs still describe citations and sources, so they must be aligned with the implementation rather than changing the implementation back.

## Goals / Non-Goals

**Goals:**
- Make the default prompt budget sufficient for realistic Arabic inputs, history, and all four registered tools.
- Make prompt token accounting match what the provider actually receives.
- Produce an auditable baseline of conversation-level behavior before model-first routing.
- Keep CI deterministic and fast; make live-provider evaluation explicitly opt-in.

**Non-Goals:**
- Implementing model-first intent/tool selection; current routing behavior stays unchanged.
- Changing quotas, safety rules, tool allowlists, or the public DTO.
- Restoring citations, `sources`, or source chips.
- Adding dependencies, persistence, or database migrations.

## Decisions

### Raise the default input budget to 10000

The measured worst realistic case is roughly 4.1k tokens with full schemas. Removing schemas reduces that further, but a 10k default leaves room for the system prompt growth, bilingual history, and tool declarations while staying far below the 100k hard maximum. `.env.example` already documents 10000, so this makes code and docs agree. Alternative: 6000, rejected because it leaves little headroom for the Phase 1+ prompt.

### Prompt hint plus declaration accounting

The `<tools>` section will contain one line: the tool count and a statement that declarations are supplied separately. `PromptBuilder` computes declaration tokens with the same estimator used for prompt text, against exactly `toLlmToolDeclaration(...)` JSON. `estimatedInputTokens` becomes prompt text + declarations; trimming and fail-closed checks use that total. `BuiltPrompt` exposes the declaration estimate so tests and diagnostics can tell the two apart. Alternative: remove the `<tools>` section entirely; rejected because section order/delimiters are pinned and a neutral hint is useful to the model.

### Structured budget event without content

When `build()` returns `PROMPT_BUDGET_EXCEEDED`, the orchestrator emits `warn`-level JSON with `event: "ai_agent_prompt_budget_exceeded"`, `provider`, `model`, `toolCount`, `historyMessages`, `estimatedRequiredTokens`, and `maxInputTokens`. It never logs message text, prompt text, or tool arguments. The existing user-facing `AI_AGENT_INVALID_INPUT` SSE behavior is unchanged.

### One harness, two providers

A reusable harness module owns the dialogue definitions, deterministic knowledge/tool fixtures, per-turn metrics, and scoring. CI uses a scripted provider that chooses from the declarations the router actually supplied; live mode swaps in the configured real provider and repeats each dialogue three times. The script/provider split keeps assertions deterministic while still measuring router-first tool exposure.

### Baseline artifacts, not a hard pass gate

The scripted run writes `test/ai-baseline/router-first.json` and `router-first.md`. Quality failures are reported with reasons rather than failing the harness process, because the baseline intentionally captures known router-first gaps. Structural invariants (locale correctness, no private data, no citation markers, no `sources`, argument shape) are asserted. Live mode is opt-in via `AI_REGRESSION_LIVE=1` and not part of CI.

## Risks / Trade-offs

- [Declaration estimate differs from provider tokenizer] → Use the existing conservative estimator and prefer provider-reported usage when present; baseline records estimates explicitly.
- [Scripted provider makes quality look better than production] → Script only chooses among declared tools and ideal arguments; missing declarations still surface as failures, and live mode validates real model behavior.
- [Baseline failures become ignored] → Baseline JSON records per-criterion pass/fail and Markdown lists each failure with a reason; future phases compare against it.
- [Large default budget increases cost] → Hard maximum and daily quotas are unchanged; only the per-turn prompt cap rises, and no automatic behavior change is enabled.

## Migration Plan

1. Ship the config default and prompt-accounting change; restart applies it at boot.
2. Update docs/e2e expectations to link-only.
3. Run the scripted harness to produce the baseline.
4. Roll back by reverting the commit; no migration or persisted state.

## Open Questions

- None for Phase 0. Phase 1 will use the baseline to decide when model-first routing replaces deterministic intent selection.
