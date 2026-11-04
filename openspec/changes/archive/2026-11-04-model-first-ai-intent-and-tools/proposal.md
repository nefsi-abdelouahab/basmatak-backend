## Why

The router-first assistant currently fails its own default input budget for an empty Arabic prompt, sends full tool JSON schemas in the prompt while also sending declarations separately, and still has stale citation/`sources` expectations in documentation and e2e specs. Before changing intent selection, Phase 0 needs a safe token baseline, a link-only grounding contract, and a conversation-level regression harness that measures current behavior without altering production defaults.

## What Changes

- Raise the default `AI_AGENT_MAX_INPUT_TOKENS` from `3000` to `10000` (hard maximum stays `100000`) in configuration, `.env.example`, and operator docs.
- Remove full tool schemas and descriptions from the prompt's `<tools>` section. Keep a single neutral hint because declarations are sent through the provider's tool channel. Count declaration tokens in `estimatedInputTokens`, `estimatedTotalTokens`, and budget failures.
- Add budget coverage for empty Arabic, Arabic with six history messages, and Arabic with every registered tool; emit a content-free structured log event when `PROMPT_BUDGET_EXCEEDED` occurs.
- Make the grounding contract explicitly link-only: answers contain allowlisted Markdown links, never citation markers or a `sources` SSE event. Update docs and stale backend/frontend e2e specs; do not restore citations or the sources UI.
- Add a 40-dialogue bilingual regression suite (20 families × `en`/`ar`, 1–4 turns) with a deterministic scripted provider for CI and an opt-in live-provider mode (three runs per dialogue). Capture per-turn declared tools, calls and arguments, answer text, tokens, provider calls, and latency; score tool choice, arguments, must/must-not-call, key facts, safety, language, and promise guard.
- Store the router-first baseline as JSON plus a short Markdown table, listing failing dialogues and reasons.

## Capabilities

### New Capabilities
- `ai-agent-prompt-budget`: default and hard input-token limits, prompt/declaration accounting, trimming, and budget-exceeded observability.
- `ai-agent-grounding`: link-only answer contract, citation-marker removal, and absence of a `sources` event/UI.
- `ai-agent-conversation-regression`: bilingual dialogue corpus, scripted/live execution, per-turn telemetry, scoring, and baseline reporting.

### Modified Capabilities

## Impact

- Backend config, prompt builder, orchestrator logging, prompt/config tests, docs (`AI_AGENT.md`, `API_ROUTES.md`), and stale e2e specs.
- New regression harness, npm script, baseline artifacts, and unit/e2e coverage.
- No API request/response shape change beyond removing the already-unused `sources` event; no quota, safety-rule, default-behavior, database, or dependency changes.
