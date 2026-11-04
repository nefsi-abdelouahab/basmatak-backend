## ADDED Requirements

### Requirement: Bilingual conversation corpus
The regression harness MUST define 20 dialogue families. Each family MUST have one English and one Arabic dialogue, for 40 dialogues total. Each dialogue MUST contain between one and four turns. Only the `en` and `ar` locales are in scope.

#### Scenario: Corpus shape
- **WHEN** the harness is loaded
- **THEN** it exposes exactly 40 dialogues covering 20 families in both `en` and `ar`
- **AND** every dialogue has one to four turns

### Requirement: Deterministic CI mode and opt-in live mode
CI MUST run every dialogue with a scripted provider that is deterministic and performs no network call. Live evaluation MUST be opt-in through `AI_REGRESSION_LIVE=1`, MUST use the configured real provider, and MUST run each dialogue three times. Scripted mode MUST complete within the normal unit-test suite.

#### Scenario: Default CI run
- **WHEN** the test suite runs without live-mode opt-in
- **THEN** all dialogues use the scripted provider and no provider network call is made

#### Scenario: Live evaluation
- **WHEN** `AI_REGRESSION_LIVE=1` is set
- **THEN** each dialogue runs three times against the configured provider
- **AND** semantic assertions are evaluated for each run

### Requirement: Per-turn telemetry
For every turn the harness MUST record the declared tools, actual tool calls and arguments, final answer text, estimated input/output tokens, provider call count, latency, and any error or refusal outcome.

#### Scenario: Capturing a tool round
- **WHEN** a scripted turn calls a tool and then answers
- **THEN** the turn record includes the declared tool names, the called tool name, its arguments, both provider calls, the final text, and latency

#### Scenario: Capturing a direct reply
- **WHEN** the router answers without a provider call
- **THEN** the turn record shows zero provider calls, zero tool calls, and the deterministic answer text

### Requirement: Conversation scoring
The harness MUST score tool choice, tool arguments, must-call and must-not-call rules, required key facts, safety, response language, and unbacked-promise behavior. Slug and exact-name arguments MUST be checked as slugs or names; passing the whole user sentence as a search argument MUST fail the argument check.

#### Scenario: Correct slug argument
- **WHEN** a focused follow-up calls `search_opportunities` with the expected slug
- **THEN** the argument check passes

#### Scenario: Whole-sentence argument
- **WHEN** a tool receives the entire user sentence where a slug or exact name is expected
- **THEN** the argument check fails with a reason naming the offending argument

#### Scenario: Must-not-call
- **WHEN** a dialogue forbids a tool that the runtime calls
- **THEN** the dialogue fails the must-not-call check

### Requirement: Baseline artifacts
The scripted run MUST write a JSON baseline and a short Markdown table under `backend/test/ai-baseline/`. The baseline MUST identify the change name, generation time, pass/fail totals, and every failing dialogue with its reasons. The Markdown report MUST remain short enough to review in a pull request.

#### Scenario: Baseline generation
- **WHEN** the baseline script runs against router-first behavior
- **THEN** `router-first.json` and `router-first.md` are written
- **AND** failing dialogues and their reasons appear in both artifacts

### Requirement: Structural safety invariants
Every dialogue run MUST assert that no private or secret field reaches the answer, no citation markers or `sources` event appear, the response language matches the dialogue locale, and a promise-only answer is not accepted as a final answer.

#### Scenario: Private-data request
- **WHEN** a dialogue asks for private account or contact data
- **THEN** the response is a localized refusal and no private value appears

#### Scenario: Promise answer
- **WHEN** the provider returns only a promise such as “let me check”
- **THEN** the promise guard marks the answer as a failure

### Requirement: Generalisation corpus with unseen phrasing
The harness MUST define a separate generalisation corpus of 15 families and 30 dialogues (one `en` and one `ar` per family). The corpus MUST exercise phrasing that is absent from the baseline corpus, including synonyms, dialect, pronouns, ordinals, short yes/no replies, topic switches, and typographical errors. Each dialogue MUST have one to four turns.

#### Scenario: Generalisation shape
- **WHEN** the generalisation corpus is loaded
- **THEN** it exposes exactly 30 dialogues covering 15 families in both `en` and `ar`
- **AND** every dialogue has one to four turns

#### Scenario: Router-first baseline gap
- **WHEN** the generalisation corpus runs against router-first behavior
- **THEN** expected detail follow-ups fail when the router cannot select `get_opportunity_details` or `get_organization_details`
- **AND** the failure reasons are recorded instead of aborting the run

### Requirement: Flag-off and flag-on execution
The harness MUST accept a model-first flag and MUST run both corpora with the flag off and on. Scripted runs MUST remain deterministic and perform no network call. Live runs MUST remain opt-in through `AI_REGRESSION_LIVE=1`, MUST use the configured provider, and MUST run each dialogue three times.

#### Scenario: Scripted matrix
- **WHEN** the scripted matrix runs
- **THEN** router-first and model-first reports are produced for the baseline and generalisation corpora

#### Scenario: Live matrix
- **WHEN** `AI_REGRESSION_LIVE=1` is set
- **THEN** each dialogue runs three times per corpus and flag state
- **AND** the configured provider is used

### Requirement: Mode-specific comparison reporting
The harness MUST record per set and per flag state: dialogue pass rate, turn pass rate, structural failures, safety incidents, failures with reasons, average/max input tokens, average/max output tokens, average/max provider calls, average/max tool calls, and average/max latency. Reports for the router-first baseline, router-first generalisation, model-first baseline, and model-first generalisation MUST be written under `backend/test/ai-baseline/` as JSON and a short Markdown table. Live reports MUST use a `-live` suffix.

#### Scenario: Artifact names
- **WHEN** the scripted baseline runs with the flag off
- **THEN** `router-first-scripted.json` and `router-first-scripted.md` are written
- **WHEN** the scripted baseline runs with the flag on
- **THEN** `model-first-scripted.json` and `model-first-scripted.md` are written
- **WHEN** the generalisation corpus runs
- **THEN** the report name includes `generalization`
- **AND** live reports add `-live`

#### Scenario: Safety rate
- **WHEN** any dialogue asks for private data or attempts a prompt injection
- **THEN** the safety check passes and the turn never leaks private or secret data
- **AND** the aggregate safety rate is reported as 100% for both flag states
