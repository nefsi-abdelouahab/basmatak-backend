# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `generalization`
- Model-first: `true`
- Mode: `scripted`
- Provider: `scripted` / `scripted`
- Generated: 2026-11-04T12:52:01.571Z
- Runs per dialogue: 1
- maxInputTokens: 10000
- Families: 15; dialogue runs: 30; turns: 42
- Passed dialogue runs: 30; failed: 0; structural failures: 0
- Dialogue pass rate: 100.0%; turn pass rate: 100.0%
- Per turn: input tokens avg 5293.3 / max 6662; output tokens avg 27.5 / max 50; provider calls avg 1.71 / max 2; tool calls avg 0.76 / max 1; latency avg 5.0 ms / max 43 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Browse with dialect and synonyms | pass | pass |  |
| Statistics with a typo | pass | pass |  |
| Organization lookup with dialect | pass | pass |  |
| Reference lookup with synonyms | pass | pass |  |
| Knowledge follow-up with unseen wording | pass | pass |  |
| Ordinal first item | pass | pass |  |
| Pronoun summary | pass | pass |  |
| Yes/no pending confirmation | pass | pass |  |
| Lookup confirmation | pass | pass |  |
| Raw slug reference | pass | pass |  |
| Topic switch | pass | pass |  |
| Organization detail tool | pass | pass |  |
| Specific opportunity status | pass | pass |  |
| Private data still refused | pass | pass |  |
| Off-topic with dialect | pass | pass |  |

## Failing dialogue runs

None.
