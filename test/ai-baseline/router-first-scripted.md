# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `baseline`
- Model-first: `false`
- Mode: `scripted`
- Provider: `scripted` / `scripted`
- Generated: 2026-11-04T12:51:44.201Z
- Runs per dialogue: 1
- maxInputTokens: 10000
- Families: 20; dialogue runs: 40; turns: 50
- Passed dialogue runs: 37; failed: 3; structural failures: 0
- Dialogue pass rate: 92.5%; turn pass rate: 94.0%
- Per turn: input tokens avg 2108.9 / max 4117; output tokens avg 14.4 / max 41; provider calls avg 0.76 / max 2; tool calls avg 0.40 / max 1; latency avg 2.7 ms / max 19 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Greeting | pass | pass |  |
| Capability | pass | pass |  |
| Platform overview | pass | pass |  |
| Verification workflow | pass | pass |  |
| Apply workflow | pass | pass |  |
| Privacy policy | pass | pass |  |
| Account deletion | pass | pass |  |
| Platform statistics | fail | pass | turn 1 router: expected intent live_data, got mixed |
| Opportunity browse | pass | pass |  |
| Opportunity place filter | pass | pass |  |
| Opportunity detail follow-up | pass | pass |  |
| Organization exact lookup | pass | pass |  |
| Reference data lookup | fail | pass | turn 1 router: expected intent live_data, got mixed |
| How-to plus current opportunities | pass | fail | turn 1 router: expected intent mixed, got live_data |
| Private data request | pass | pass |  |
| Off-topic request | pass | pass |  |
| Ambiguous request | pass | pass |  |
| No opportunities in an area | pass | pass |  |
| Unbacked promise | pass | pass |  |
| Citation and source stripping | pass | pass |  |

## Failing dialogue runs

- `platform-stats-en` (run 1): turn 1 router: expected intent live_data, got mixed
- `reference-data-en` (run 1): turn 1 router: expected intent live_data, got mixed
- `mixed-application-ar` (run 1): turn 1 router: expected intent mixed, got live_data
