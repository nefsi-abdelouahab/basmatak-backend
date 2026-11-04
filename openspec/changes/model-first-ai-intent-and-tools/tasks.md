# Tasks

## 1. Token budget hardening

- [x] 1.1 Raise the config default and loader fallback to `10000`; keep the `100000` hard maximum and update `.env.example` if needed.
- [x] 1.2 Replace full tool descriptions/schemas in the prompt with a one-line hint.
- [x] 1.3 Include provider-facing declaration tokens in input/total estimates and budget checks.
- [x] 1.4 Add budget tests for empty Arabic, Arabic + six history messages, and Arabic + all registered tools.
- [x] 1.5 Add the structured `ai_agent_prompt_budget_exceeded` log event and a unit test.
- [x] 1.6 Update config/prompt/docs expectations for the new default and accounting.

## 2. Link-only grounding alignment

- [x] 2.1 Update `docs/AI_AGENT.md` to remove citation/sources claims and describe allowlisted links.
- [x] 2.2 Update `docs/API_ROUTES.md` to remove the `sources` event and adjust the normal event order.
- [x] 2.3 Rewrite stale backend orchestration e2e expectations to assert links and no `sources` event.
- [x] 2.4 Update the frontend AI e2e mock to link-only answers with no `sources` event.

## 3. Conversation regression harness

- [x] 3.1 Add 20 bilingual dialogue families (40 dialogues, 1–4 turns) with expected tools, arguments, facts, and safety rules.
- [x] 3.2 Implement deterministic knowledge/tool fixtures and a scripted provider for CI.
- [x] 3.3 Capture declared tools, calls/arguments, final text, tokens, provider calls, latency, and errors per turn.
- [x] 3.4 Implement scoring for tool choice, arguments, must/must-not-call, key facts, safety, language, and promise guard.
- [x] 3.5 Add opt-in live mode with three runs per dialogue and semantic assertions.
- [x] 3.6 Add the Jest regression spec and npm script.
- [x] 3.7 Generate the router-first JSON and Markdown baseline under `backend/test/ai-baseline/`.

## 4. Verification

- [x] 4.1 Run `npm run ai:check`.
- [x] 4.2 Run `npx jest src/ai-agent --runInBand`.
- [x] 4.3 Run `npm run ai:eval`.
- [x] 4.4 Run the new regression harness and record the baseline totals.
- [x] 4.5 Run `npm run build` and `npm run lint`.
- [x] 4.6 Remove temporary measurement files and confirm the final diff.
