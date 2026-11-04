# ai-agent-grounding Specification

## Purpose
How AI assistant answers are grounded: allowlisted public entity links only, with citation markers and the sources event/UI removed.

## Requirements

### Requirement: Answers are grounded with allowlisted links
Final answers MUST use the public Markdown links returned by tools in the current turn (or deterministic browse links when the local fallback allows them). They MUST NOT contain citation markers such as `[K1]`, `[T1]`, or `[D1]`, and unknown, external, or model-invented links MUST be reduced to plain text.

#### Scenario: Valid entity link
- **WHEN** a tool returns a public opportunity and the model writes a link to its locale-prefixed path
- **THEN** the answer keeps that Markdown link

#### Scenario: Citation marker
- **WHEN** the model writes `[K1]` or `[T1]` in an otherwise valid answer
- **THEN** the sanitizer removes the marker before any token is streamed

#### Scenario: Unknown link
- **WHEN** the model writes a link whose path was not returned by a tool in this turn
- **THEN** the link is rendered as plain text and is not emitted as a URL

### Requirement: No sources event or sources UI
The chat stream MUST NOT emit a `sources` SSE event. The orchestrator MUST expose grounding links only inside the answer text. The frontend MUST NOT render source chips or a sources list for assistant messages, even if an older payload contains one.

#### Scenario: Knowledge answer
- **WHEN** a knowledge-grounded answer completes
- **THEN** the SSE events are `meta`, optional `status`, one or more `token`, and `done`
- **AND** no `sources` event is emitted

#### Scenario: Tool-grounded answer
- **WHEN** a live-data answer completes after a tool round
- **THEN** the tool's public entity links are in the answer text
- **AND** no `sources` event is emitted

### Requirement: Documentation and e2e specs describe link-only grounding
Operator/API documentation and end-to-end specs MUST describe and assert the link-only contract. Stale citation or `sources` expectations MUST be removed rather than preserved behind compatibility code.

#### Scenario: Documentation review
- **WHEN** a maintainer reads the AI agent or API documentation
- **THEN** it states that answers carry allowlisted links and that no `sources` event exists

#### Scenario: E2E regression
- **WHEN** the backend orchestration e2e suite runs
- **THEN** it asserts answer links and explicitly asserts that no `sources` event is present
