## ADDED Requirements

### Requirement: Default input budget is 10000 tokens
The AI agent configuration MUST default `AI_AGENT_MAX_INPUT_TOKENS` to `10000` when the variable is missing, blank, or invalid. The configured value MUST remain clamped to the hard maximum of `100000`. `.env.example` and operator documentation MUST show the same default.

#### Scenario: Missing environment value
- **WHEN** the AI agent configuration is loaded without `AI_AGENT_MAX_INPUT_TOKENS`
- **THEN** `limits.maxInputTokens` is `10000`

#### Scenario: Out-of-range environment value
- **WHEN** `AI_AGENT_MAX_INPUT_TOKENS` is greater than `100000`
- **THEN** `limits.maxInputTokens` is clamped to `100000`

### Requirement: Prompt tool section is a hint, not a schema dump
When tools are supplied to the prompt builder, the `<tools>` section MUST contain at most one neutral hint line. It MUST NOT contain tool descriptions, JSON schemas, or handler data. Tool declarations MUST continue to be sent through the provider tool channel.

#### Scenario: Rendering tool declarations
- **WHEN** the prompt builder receives one or more tool descriptors
- **THEN** the prompt contains a `<tools>` section with no `input_schema`, no tool description body, and no handler output
- **AND** the orchestrator still sends the declarations as `LlmTurnRequest.tools`

### Requirement: Input-token estimates include declarations
`estimatedInputTokens` MUST equal the estimated prompt text plus the estimated provider-facing tool declarations. `estimatedTotalTokens` MUST equal that input estimate plus the configured output reserve. Trimming and budget failures MUST use the combined estimate.

#### Scenario: Tools consume part of the budget
- **WHEN** the prompt builder receives tool descriptors whose declarations consume tokens
- **THEN** the reported input estimate is greater than the prompt-text-only estimate by the declaration estimate

#### Scenario: Declaration-aware trimming
- **WHEN** prompt text plus declarations exceed the input budget
- **THEN** optional history, knowledge, tool results, and examples are trimmed until the combined estimate fits or the build fails closed

### Requirement: Budget coverage for realistic Arabic prompts
The test suite MUST cover an empty Arabic prompt, an Arabic prompt with six history messages, and an Arabic prompt with every registered tool using the default configuration. Each case MUST build successfully within the default budget.

#### Scenario: Empty Arabic prompt
- **WHEN** an empty Arabic message is built with default limits
- **THEN** the build succeeds and the estimated input tokens do not exceed `10000`

#### Scenario: Arabic with six history messages
- **WHEN** an Arabic message with six history messages is built with default limits
- **THEN** the build succeeds and the estimated input tokens do not exceed `10000`

#### Scenario: Arabic with every registered tool
- **WHEN** an Arabic message with all four registered tool descriptors is built with default limits
- **THEN** the build succeeds and the estimated input tokens do not exceed `10000`

### Requirement: Budget-exceeded events are observable
When the prompt builder returns `PROMPT_BUDGET_EXCEEDED`, the orchestrator MUST emit a structured log record with `event` equal to `ai_agent_prompt_budget_exceeded`, provider, model, tool count, history-message count, estimated required tokens, and max input tokens. The record MUST NOT contain message text, prompt text, knowledge text, or tool arguments.

#### Scenario: Budget failure logging
- **WHEN** the orchestrator receives a `PROMPT_BUDGET_EXCEEDED` result
- **THEN** it emits one structured budget event with the safe accounting fields
- **AND** the SSE answer remains the existing safe invalid-input response
