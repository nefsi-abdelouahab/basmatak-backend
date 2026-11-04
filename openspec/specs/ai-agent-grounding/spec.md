# ai-agent-grounding Specification

## Purpose
How AI assistant answers are grounded: allowlisted public entity links only, with citation markers and the sources event/UI removed. An optional `cards` event may accompany an answer, but only for public entities already linked in that answer; `sources` remains forbidden.

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
The chat stream MUST NOT emit a `sources` SSE event. The orchestrator MUST expose grounding links only inside the answer text. The frontend MUST NOT render source chips or a sources list for assistant messages, even if an older payload contains one. The optional `cards` event defined below is not a sources event and MUST NOT carry knowledge chunks, citations, source metadata, or private data.

#### Scenario: Knowledge answer
- **WHEN** a knowledge-grounded answer completes
- **THEN** the SSE events are `meta`, optional `status`, one or more `token`, and `done`
- **AND** no `sources` event is emitted
- **AND** no `cards` event is emitted because knowledge chunks are not public entities

#### Scenario: Tool-grounded answer
- **WHEN** a live-data answer completes after a tool round
- **THEN** the tool's public entity links are in the answer text
- **AND** no `sources` event is emitted

### Requirement: Cards accompany linked public entities
The chat stream MAY emit at most one `cards` SSE event per turn. The event MUST be emitted after the final answer has been sanitized and before `done`, and MUST carry at most six compact cards describing public entities or public platform statistics. Every entity card MUST correspond to an allowlisted public link that survives sanitization in the same answer; the orchestrator MUST drop any card whose `href` is not present in the sanitized answer. The event MUST NOT carry knowledge chunks, citations, source metadata, private fields, contact details, account data, or forbidden tool-result fields.

#### Scenario: Cards match the answer links
- **WHEN** a live-data answer completes with allowlisted opportunity and organization links
- **THEN** the stream emits `meta`, optional `status`, one or more `token`, at most one `cards` event, and `done`
- **AND** every emitted entity card has an `href` that appears among the answer's allowlisted links
- **AND** no `sources` event is emitted

#### Scenario: Cards are filtered to sanitized links
- **WHEN** a tool returns an entity but the model omits its link, or the sanitizer removes the link
- **THEN** no card is emitted for that entity

#### Scenario: No linked entities
- **WHEN** an answer contains no allowlisted entity links
- **THEN** no `cards` event is emitted

#### Scenario: Cards never expose private data
- **WHEN** a card is built from tool data
- **THEN** private, contact, email, phone, account, and forbidden tool-result fields are excluded
- **AND** the card carries only the public fields needed to render it

### Requirement: Documentation and e2e specs describe link-only grounding with optional cards
Operator/API documentation and end-to-end specs MUST describe and assert the grounding contract: allowlisted answer links, no `sources` event or sources UI, and optional `cards` limited to entities already linked in the answer. Stale citation or `sources` expectations MUST be removed rather than preserved behind compatibility code.

#### Scenario: Documentation review
- **WHEN** a maintainer reads the AI agent or API documentation
- **THEN** it states that answers carry allowlisted links, that no `sources` event exists, and that `cards` may accompany only linked public entities

#### Scenario: E2E regression
- **WHEN** the backend orchestration e2e suite runs
- **THEN** it asserts answer links, explicitly asserts that no `sources` event is present, and validates any `cards` event against the answer links
