# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `phase2`
- Model-first: `false`
- Mode: `live`
- Provider: `groq` / `qwen/qwen3.8-27b`
- Generated: 2026-11-04T18:00:18.505Z
- Runs per dialogue: 1
- maxInputTokens: 10000
- Families: 18; dialogue runs: 24; turns: 38
- Passed dialogue runs: 7; failed: 17; structural failures: 8
- Dialogue pass rate: 29.2%; turn pass rate: 42.1%
- Per turn: input tokens avg 1839.1 / max 5988; output tokens avg 28.5 / max 130; provider calls avg 0.61 / max 2; tool calls avg 0.53 / max 1; latency avg 537.7 ms / max 2746 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Greeting | pass | pass |  |
| Capability | — | — |  |
| Platform overview | fail | fail | turn 1 key_facts: missing key fact: volunteering platform; turn 1 key_facts: missing key fact: منصة تطوعية |
| Verification workflow | fail | fail | turn 1 key_facts: missing key fact: reviews; turn 2 key_facts: missing key fact: verifies; turn 1 key_facts: missing key fact: الأدلة; turn 2 key_facts: missing key fact: الجمعية; turn 3 key_facts: missing key fact: موثوقية |
| Apply workflow | — | — |  |
| Privacy policy | — | — |  |
| Account deletion | — | — |  |
| Platform statistics | fail | fail | turn 1 router: expected intent live_data, got mixed; turn 1 key_facts: missing key fact: 17 |
| Opportunity browse | — | — |  |
| Opportunity place filter | — | — |  |
| Opportunity detail follow-up | pass | pass |  |
| Organization exact lookup | pass | pass |  |
| Reference data lookup | — | — |  |
| How-to plus current opportunities | — | — |  |
| Private data request | — | — |  |
| Off-topic request | — | — |  |
| Ambiguous request | — | — |  |
| No opportunities in an area | — | — |  |
| Unbacked promise | — | — |  |
| Citation and source stripping | — | — |  |
| Browse with dialect and synonyms | fail | — | turn 1 tool_args: tool search_opportunities arguments did not match the expected shape |
| Statistics with a typo | fail | — | turn 1 key_facts: missing key fact: 17 |
| Organization lookup with dialect | pass | — |  |
| Reference lookup with synonyms | fail | — | turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching |
| Knowledge follow-up with unseen wording | fail | — | turn 1 key_facts: missing key fact: platform; turn 2 key_facts: missing key fact: platform |
| Ordinal first item | — | fail | turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup |
| Pronoun summary | — | fail | turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup |
| Yes/no pending confirmation | — | fail | turn 2 tool_choice: expected tools ["get_organization_details"], got []; turn 2 key_facts: missing key fact: Nour; turn 2 links: missing expected link: /ar/orgs/nour-association |
| Lookup confirmation | — | fail | turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape |
| Raw slug reference | — | fail | turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup |
| Topic switch | — | fail | turn 1 key_facts: missing key fact: مرفوضة; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup |
| Organization detail tool | fail | — | turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape; turn 1 key_facts: missing key fact: verified |
| Specific opportunity status | — | — |  |
| Private data still refused | — | — |  |
| Off-topic with dialect | — | — |  |

## Failing dialogue runs

- `platform-overview-en` (run 1): turn 1 key_facts: missing key fact: volunteering platform
- `platform-overview-ar` (run 1): turn 1 key_facts: missing key fact: منصة تطوعية
- `verification-workflow-en` (run 1): turn 1 key_facts: missing key fact: reviews; turn 2 key_facts: missing key fact: verifies
- `verification-workflow-ar` (run 1): turn 1 key_facts: missing key fact: الأدلة; turn 2 key_facts: missing key fact: الجمعية; turn 3 key_facts: missing key fact: موثوقية
- `platform-stats-en` (run 1): turn 1 router: expected intent live_data, got mixed; turn 1 key_facts: missing key fact: 17
- `platform-stats-ar` (run 1): turn 1 key_facts: missing key fact: 17
- `gen-browse-dialect-en` (run 1): turn 1 tool_args: tool search_opportunities arguments did not match the expected shape
- `gen-stats-typo-en` (run 1): turn 1 key_facts: missing key fact: 17
- `gen-reference-synonyms-en` (run 1): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching
- `gen-knowledge-followup-en` (run 1): turn 1 key_facts: missing key fact: platform; turn 2 key_facts: missing key fact: platform
- `gen-ordinal-first-ar` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-pronoun-summary-ar` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-yesno-confirm-ar` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got []; turn 2 key_facts: missing key fact: Nour; turn 2 links: missing expected link: /ar/orgs/nour-association
- `gen-lookup-confirm-ar` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape
- `gen-slug-reference-ar` (run 1): turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-topic-switch-ar` (run 1): turn 1 key_facts: missing key fact: مرفوضة; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-detail-org-en` (run 1): turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape; turn 1 key_facts: missing key fact: verified
