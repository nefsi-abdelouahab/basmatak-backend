# Tasks

## 1. Phase 0 - Token budget hardening

- [x] 1.1 Raise the config default and loader fallback to `10000`; keep the `100000` hard maximum and update `.env.example` if needed.
- [x] 1.2 Replace full tool descriptions/schemas in the prompt with a one-line hint.
- [x] 1.3 Include provider-facing declaration tokens in input/total estimates and budget checks.
- [x] 1.4 Add budget tests for empty Arabic, Arabic + six history messages, and Arabic + all registered tools.
- [x] 1.5 Add the structured `ai_agent_prompt_budget_exceeded` log event and a unit test.
- [x] 1.6 Update config/prompt/docs expectations for the new default and accounting.

## 2. Phase 0 - Link-only grounding alignment

- [x] 2.1 Update `docs/AI_AGENT.md` to remove citation/sources claims and describe allowlisted links.
- [x] 2.2 Update `docs/API_ROUTES.md` to remove the `sources` event and adjust the normal event order.
- [x] 2.3 Rewrite stale backend orchestration e2e expectations to assert links and no `sources` event.
- [x] 2.4 Update the frontend AI e2e mock to link-only answers with no `sources` event.

## 3. Phase 0 - Conversation regression harness

- [x] 3.1 Add 20 bilingual dialogue families (40 dialogues, 1–4 turns) with expected tools, arguments, facts, and safety rules.
- [x] 3.2 Implement deterministic knowledge/tool fixtures and a scripted provider for CI.
- [x] 3.3 Capture declared tools, calls/arguments, final text, tokens, provider calls, latency, and errors per turn.
- [x] 3.4 Implement scoring for tool choice, arguments, must/must-not-call, key facts, safety, language, and promise guard.
- [x] 3.5 Add opt-in live mode with three runs per dialogue and semantic assertions.
- [x] 3.6 Add the Jest regression spec and npm script.
- [x] 3.7 Generate the router-first JSON and Markdown baseline under `backend/test/ai-baseline/`.

## 4. Phase 1 - Model-first flag and tools

- [x] 4.1 Add `modelFirst` to the typed config and loader, default `false`, document `AI_AGENT_MODEL_FIRST` in `.env.example`, and add config tests.
- [x] 4.2 Add `knowledge_lookup`, `opportunity_details`, and `organization_details` tool intents.
- [x] 4.3 Convert `SearchKnowledgeTool` to a registered read-only tool.
- [x] 4.4 Add `get_opportunity_details` with an exact public slug, strict schema, public projection, null for missing/draft, and forbidden-key guard.
- [x] 4.5 Add `get_organization_details` with an exact slug or exact name, optional type prefix, no partial/regex matching, public projection, and no email/phone/contact fields.
- [x] 4.6 Register all seven tools in `ToolRegistry` and inject the registry into the orchestrator as an optional last argument.
- [x] 4.7 Add privacy, validation, and forbidden-key tests for both detail tools and the knowledge tool.

## 5. Phase 1 - Recent entities

- [x] 5.1 Parse up to three recent opportunities and organizations from relative, absolute, and locale-agnostic public links, newest first, deduplicated.
- [x] 5.2 Accept plain-text titles only when the same title was linked earlier and bound title/slug lengths.
- [x] 5.3 Derive `last_user_question`, `last_answer_offer`, and `pending_confirmation` from `هل تقصد [X](link)؟` / `Did you mean [X](link)?`.
- [x] 5.4 Resolve ordinals, short yes/no replies, pronouns, and raw slugs against recent entities.
- [x] 5.5 Render a required, escaped `<recent_entities>` block and keep it non-trimmable in the prompt builder.
- [x] 5.6 Add extraction, resolution, formatting, escaping, and trimming tests.

## 6. Phase 1 - Model-first orchestration

- [x] 6.1 Add a separate versioned model-first system prompt with tool-choice, follow-up, grounding, and safety rules.
- [x] 6.2 Keep flag-off prompt/system/version bytes identical and prove it with a test that supplies model-first state while the flag is false.
- [x] 6.3 Run only kill switch, quota, private-data refusal, exhausted reply, and exact greeting/thanks before the provider in model-first mode.
- [x] 6.4 Log the router as a content-free `ai_agent_router_shadow` signal and never use it to choose the tool set.
- [x] 6.5 Declare every registry tool on every provider turn, including final answer turns.
- [x] 6.6 Enforce at most two tool rounds and three provider calls in normal mode; keep one round in conservative mode.
- [x] 6.7 Retry once when the shadow router flags live-data need but no tool was called, then use the deterministic browse/organization fallback.
- [x] 6.8 Degrade to deterministic browse/organization lookup when the provider is unavailable or provider quota is exhausted; use retrieval/knowledge-only degradation otherwise.
- [x] 6.9 Keep leak, link, empty-answer, and unbacked-promise guards.
- [x] 6.10 Add the final Arabic language check with one stricter retry and fail-closed behavior.
- [x] 6.11 Add orchestrator tests for shadow logging, complete declarations, greeting vs capability, live-data retry, language retry, and flag-off isolation.

## 7. Phase 1 - Generalisation corpus and harness

- [x] 7.1 Add 15 families and 30 dialogues with unseen phrasing, synonyms, dialect, pronouns, topic switches, and typos.
- [x] 7.2 Add model-first scripts, answers, and per-turn overrides so detail follow-ups use the new tools.
- [x] 7.3 Add corpus/model-first selection to the harness, npm script, CLI flags, and environment variables.
- [x] 7.4 Record model-first score skips and metrics while preserving router-first scoring.
- [x] 7.5 Name artifacts `router-first-scripted`, `router-first-generalization`, `model-first-scripted`, and `model-first-generalization`, with live suffixes.
- [x] 7.6 Generate the scripted reports for both corpora and both flag states.

## 8. Phase 1 - Documentation

- [x] 8.1 Update `docs/AI_AGENT.md`: seven tools, model-first flow, `AI_AGENT_MODEL_FIRST`, fixed two-round/three-call limits, recent entities, and the language guard.
- [x] 8.2 Update `proposal.md`, `design.md`, `tasks.md`, and the model-first/regression specs for Phase 1.

## 9. Phase 1 - Live matrix and comparison

- [x] 9.1 Run live baseline (40) and generalisation (30) with the flag off, three runs per dialogue; record the exact provider error and keep scripted results if unreachable.
- [x] 9.2 Run live baseline (40) and generalisation (30) with the flag on, three runs per dialogue; record the exact provider error and keep scripted results if unreachable.
- [x] 9.3 Compare before/after pass rates and name the required failures (`أخبرني عن الأولى`, `نعم`, `قدم لي نبذة عنها`, `هل هي مفتوحة`, `هل تحققت`, `اشرح أكثر`) with reasons.
- [x] 9.4 Confirm the safety rate is 100% in both modes.
- [x] 9.5 Report average/max input and output tokens, provider calls, tool calls, and latency.
- [x] 9.6 Compute conversations/day under the current quotas and the settings needed for 100 and 500 conversations/day without changing quotas; note the `dailyTokenBudget=150000` vs requested `550000/day` discrepancy.
- [x] 9.7 Write the recommendation (enable, keep the flag off, or not ready) with the evidence.

## 10. Phase 1 - Verification

- [x] 10.1 Run `npm run ai:check`.
- [x] 10.2 Run `npx jest src/ai-agent --runInBand`.
- [x] 10.3 Run `npm run ai:eval`.
- [x] 10.4 Run both harness sets with the flag off and on.
- [x] 10.5 Run `npm run build`.
- [x] 10.6 Run `npm run lint`.
- [x] 10.7 Run `openspec validate --strict`.
- [x] 10.8 Report all real command outputs and every modified file.

## 11. Phase 2 - Prompt and tool input-cost reduction

- [x] 11.1 Rewrite the model-first system prompt compactly while keeping every safety, grounding, language, link, and style rule; bump the model-first prompt version and report tokens before/after.
- [x] 11.2 Add model-first-only compact response-style, few-shot (two short examples per language), and link-rule constants; keep the shared flag-off constants byte-identical.
- [x] 11.3 Shorten every exposed tool description to one precise sentence and remove non-essential optional parameters/descriptions; keep strict schema validation and handler support.
- [x] 11.4 Let `get_opportunity_details` accept an exact slug or an exact title, matching the organization detail tool.
- [x] 11.5 Cap model-first history at the last four messages and compact every prior assistant message to its first sentence plus linked entity titles.
- [x] 11.6 Render `recent_entities` as compact titles/slugs only, with reference rules stated once in the system prompt.
- [x] 11.7 Add a scripted phase-2 regression test asserting model-first average input tokens <= 3,000 and max <= 4,000 over all 70 dialogues.

## 12. Phase 2 - Silent-fallback observability

- [x] 12.1 Add per-reason fallback counters to `UsageMeterService` with structured `ai_agent_fallback` warnings (`quota`, `provider_error`, `no_tool_retry_failed`, `language_retry_failed`).
- [x] 12.2 Instrument every model-first silent fallback and zero-token provider turn, deduplicating each reason once per turn.
- [x] 12.3 Expose `fallbacks.today` and `fallbacks.last7Days` on the existing usage report with no user data.
- [x] 12.4 Add usage-meter and orchestrator tests for counters, warning logs, and the zero-token path.

## 13. Phase 2 - Paced live sample and reporting

- [x] 13.1 Add the combined 70-dialogue `phase2` corpus and a 24-dialogue live sample (12 baseline + 12 generalization, 12 en + 12 ar) that includes all required named failures.
- [x] 13.2 Add live pacing from the previous request's input tokens (`AI_REGRESSION_INPUT_TOKENS_PER_MINUTE`, default 7,000) or a fixed `AI_REGRESSION_PACE_MS`, plus configurable turn retries and retry waits.
- [x] 13.3 Load `backend/.env` inside the live CLI without printing values, estimate and print duration before starting, and classify provider-served, quota, silent-fallback, and deterministic turns separately.
- [x] 13.4 Write phase-2 artifacts and add regression tests for corpus shape, pacing math, turn classification, artifact names, and dialogue filtering.
- [x] 13.5 Run the 24-dialogue live sample once for each flag state after the pacing changes, retrying degraded turns up to two times.
- [x] 13.6 Add a Phase-2 section to `backend/test/ai-baseline/phase-1-comparison.md` with token cost before/after, provider-served pass rates, named-failure outcomes, and safety.
- [x] 13.7 Run all Phase-1 verification commands again and report the real outputs.
