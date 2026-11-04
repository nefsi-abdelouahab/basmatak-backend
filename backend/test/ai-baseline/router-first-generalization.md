# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `generalization`
- Model-first: `false`
- Mode: `scripted`
- Provider: `scripted` / `scripted`
- Generated: 2026-11-04T12:52:01.687Z
- Runs per dialogue: 1
- maxInputTokens: 10000
- Families: 15; dialogue runs: 30; turns: 42
- Passed dialogue runs: 15; failed: 15; structural failures: 14
- Dialogue pass rate: 50.0%; turn pass rate: 64.3%
- Per turn: input tokens avg 1792.5 / max 4983; output tokens avg 14.6 / max 50; provider calls avg 0.64 / max 2; tool calls avg 0.60 / max 1; latency avg 4.2 ms / max 41 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Browse with dialect and synonyms | pass | pass |  |
| Statistics with a typo | pass | pass |  |
| Organization lookup with dialect | pass | pass |  |
| Reference lookup with synonyms | fail | pass | turn 1 tool_choice: expected tools ["search_reference_data"], got [] |
| Knowledge follow-up with unseen wording | pass | pass |  |
| Ordinal first item | fail | fail | turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup |
| Pronoun summary | fail | fail | turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 key_facts: missing key fact: Oran; turn 2 links: expected at most 1 links, got 4; turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup |
| Yes/no pending confirmation | fail | fail | turn 2 tool_choice: expected tools ["get_organization_details"], got []; turn 2 links: missing expected link: /en/orgs/nour-association; turn 2 links: missing expected link: /ar/orgs/nour-association |
| Lookup confirmation | fail | fail | turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape; turn 2 key_facts: missing key fact: verified |
| Raw slug reference | fail | fail | turn 1 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 key_facts: missing key fact: Oran; turn 1 links: expected at most 1 links, got 4; turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup |
| Topic switch | pass | pass |  |
| Organization detail tool | fail | fail | turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape; turn 1 key_facts: missing key fact: verified |
| Specific opportunity status | fail | fail | turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 key_facts: missing key fact: مفتوحة; turn 1 links: expected at most 1 links, got 4 |
| Private data still refused | pass | pass |  |
| Off-topic with dialect | pass | pass |  |

## Failing dialogue runs

- `gen-reference-synonyms-en` (run 1): turn 1 tool_choice: expected tools ["search_reference_data"], got []
- `gen-ordinal-first-en` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape
- `gen-ordinal-first-ar` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-pronoun-summary-en` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 key_facts: missing key fact: Oran; turn 2 links: expected at most 1 links, got 4
- `gen-pronoun-summary-ar` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got []; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-yesno-confirm-en` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got []; turn 2 links: missing expected link: /en/orgs/nour-association
- `gen-yesno-confirm-ar` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got []; turn 2 links: missing expected link: /ar/orgs/nour-association
- `gen-lookup-confirm-en` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape; turn 2 key_facts: missing key fact: verified
- `gen-lookup-confirm-ar` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape
- `gen-slug-reference-en` (run 1): turn 1 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 key_facts: missing key fact: Oran; turn 1 links: expected at most 1 links, got 4
- `gen-slug-reference-ar` (run 1): turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup
- `gen-detail-org-en` (run 1): turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape; turn 1 key_facts: missing key fact: verified
- `gen-detail-org-ar` (run 1): turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape
- `gen-status-check-en` (run 1): turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 links: missing expected link: /en/opportunities/beach-cleanup
- `gen-status-check-ar` (run 1): turn 1 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 key_facts: missing key fact: مفتوحة; turn 1 links: expected at most 1 links, got 4
