# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Mode: `scripted`
- Provider: `scripted` / `scripted`
- Generated: 2026-11-04T09:52:15.586Z
- Runs per dialogue: 1
- maxInputTokens: 10000
- Families: 20; dialogue runs: 40; turns: 50
- Passed dialogue runs: 37; failed: 3; structural failures: 0

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
