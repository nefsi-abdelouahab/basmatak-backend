# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `phase2`
- Model-first: `true`
- Mode: `live`
- Provider: `groq` / `qwen/qwen3.8-27b`
- Generated: 2026-11-04T18:53:17.108Z
- Runs per dialogue: 1
- maxInputTokens: 10000
- Families: 18; dialogue runs: 24; turns: 38
- Passed dialogue runs: 3; failed: 21; structural failures: 18
- Dialogue pass rate: 12.5%; turn pass rate: 18.4%
- Per turn: input tokens avg 3472.2 / max 6986; output tokens avg 51.3 / max 163; provider calls avg 1.39 / max 3; tool calls avg 0.74 / max 2; latency avg 1360.2 ms / max 8686 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Greeting | pass | pass |  |
| Capability | — | — |  |
| Platform overview | fail | fail | turn 1 key_facts: missing key fact: volunteering platform; turn 1 key_facts: missing key fact: منصة تطوعية |
| Verification workflow | fail | fail | turn 2 key_facts: missing key fact: verifies; turn 3 key_facts: missing key fact: trustworthy; turn 1 key_facts: missing key fact: الأدلة; turn 2 key_facts: missing key fact: الجمعية; turn 3 key_facts: missing key fact: موثوقية |
| Apply workflow | — | — |  |
| Privacy policy | — | — |  |
| Account deletion | — | — |  |
| Platform statistics | fail | fail | turn 1 key_facts: missing key fact: 17 |
| Opportunity browse | — | — |  |
| Opportunity place filter | — | — |  |
| Opportunity detail follow-up | fail | fail | turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 2 tool_args: tool get_opportunity_details arguments did not match the expected shape; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /en/opportunities/beach-cleanup; turn 3 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 3 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 key_facts: missing key fact: أحدث الفرص المنشورة; turn 2 tool_choice: expected tools ["search_opportunities"], got ["get_opportunity_details"]; turn 2 tool_args: tool get_opportunity_details slugs were [] instead of ["beach-cleanup","tree-planting","remote-tutoring"]; turn 2 key_facts: missing key fact: مفتوحة للتقديم; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup; turn 3 tool_choice: expected tools ["search_opportunities"], got ["get_opportunity_details","search_knowledge"]; turn 3 tool_args: tool get_opportunity_details slugs were [] instead of ["beach-cleanup","tree-planting","remote-tutoring"]; turn 3 key_facts: missing key fact: مفتوحة للتقديم; turn 3 links: missing expected link: /ar/opportunities/beach-cleanup |
| Organization exact lookup | fail | fail | turn 1 tool_args: tool search_organizations name was "Nour Association" instead of ["Nour"]; turn 1 key_facts: missing key fact: I found this organization; turn 1 tool_args: tool search_organizations name was "جمعية نور" instead of ["نور"]; turn 1 key_facts: missing key fact: وجدت هذه الجمعية |
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
| Reference lookup with synonyms | fail | — | turn 1 tool_args: tool search_reference_data expected empty arguments |
| Knowledge follow-up with unseen wording | fail | — | turn 1 key_facts: missing key fact: platform; turn 2 key_facts: missing key fact: platform |
| Ordinal first item | — | fail | turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 key_facts: missing key fact: مفتوحة |
| Pronoun summary | — | fail | turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape |
| Yes/no pending confirmation | — | fail | turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape |
| Lookup confirmation | — | fail | turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape |
| Raw slug reference | — | fail | turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted |
| Topic switch | — | fail | turn 1 key_facts: missing key fact: قيد المراجعة; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape |
| Organization detail tool | fail | — | turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape; turn 1 key_facts: missing key fact: verified |
| Specific opportunity status | — | — |  |
| Private data still refused | — | — |  |
| Off-topic with dialect | — | — |  |

## Failing dialogue runs

- `platform-overview-en` (run 1): turn 1 key_facts: missing key fact: volunteering platform
- `platform-overview-ar` (run 1): turn 1 key_facts: missing key fact: منصة تطوعية
- `verification-workflow-en` (run 1): turn 2 key_facts: missing key fact: verifies; turn 3 key_facts: missing key fact: trustworthy
- `verification-workflow-ar` (run 1): turn 1 key_facts: missing key fact: الأدلة; turn 2 key_facts: missing key fact: الجمعية; turn 3 key_facts: missing key fact: موثوقية
- `platform-stats-en` (run 1): turn 1 key_facts: missing key fact: 17
- `platform-stats-ar` (run 1): turn 1 key_facts: missing key fact: 17
- `opportunity-detail-en` (run 1): turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 2 tool_args: tool get_opportunity_details arguments did not match the expected shape; turn 2 key_facts: missing key fact: Beach cleanup; turn 2 links: missing expected link: /en/opportunities/beach-cleanup; turn 3 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 3 tool_args: tool search_opportunities arguments did not match the expected shape
- `opportunity-detail-ar` (run 1): turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 1 key_facts: missing key fact: أحدث الفرص المنشورة; turn 2 tool_choice: expected tools ["search_opportunities"], got ["get_opportunity_details"]; turn 2 tool_args: tool get_opportunity_details slugs were [] instead of ["beach-cleanup","tree-planting","remote-tutoring"]; turn 2 key_facts: missing key fact: مفتوحة للتقديم; turn 2 links: missing expected link: /ar/opportunities/beach-cleanup; turn 3 tool_choice: expected tools ["search_opportunities"], got ["get_opportunity_details","search_knowledge"]; turn 3 tool_args: tool get_opportunity_details slugs were [] instead of ["beach-cleanup","tree-planting","remote-tutoring"]; turn 3 key_facts: missing key fact: مفتوحة للتقديم; turn 3 links: missing expected link: /ar/opportunities/beach-cleanup
- `organization-lookup-en` (run 1): turn 1 tool_args: tool search_organizations name was "Nour Association" instead of ["Nour"]; turn 1 key_facts: missing key fact: I found this organization
- `organization-lookup-ar` (run 1): turn 1 tool_args: tool search_organizations name was "جمعية نور" instead of ["نور"]; turn 1 key_facts: missing key fact: وجدت هذه الجمعية
- `gen-browse-dialect-en` (run 1): turn 1 tool_args: tool search_opportunities arguments did not match the expected shape
- `gen-stats-typo-en` (run 1): turn 1 key_facts: missing key fact: 17
- `gen-reference-synonyms-en` (run 1): turn 1 tool_args: tool search_reference_data expected empty arguments
- `gen-knowledge-followup-en` (run 1): turn 1 key_facts: missing key fact: platform; turn 2 key_facts: missing key fact: platform
- `gen-ordinal-first-ar` (run 1): turn 1 tool_args: tool search_opportunities arguments did not match the expected shape; turn 2 key_facts: missing key fact: مفتوحة
- `gen-pronoun-summary-ar` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape
- `gen-yesno-confirm-ar` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape
- `gen-lookup-confirm-ar` (run 1): turn 2 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 2 tool_args: tool search_organizations arguments did not match the expected shape
- `gen-slug-reference-ar` (run 1): turn 1 tool_choice: expected tools ["get_opportunity_details"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `gen-topic-switch-ar` (run 1): turn 1 key_facts: missing key fact: قيد المراجعة; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape
- `gen-detail-org-en` (run 1): turn 1 tool_choice: expected tools ["get_organization_details"], got ["search_organizations"]; turn 1 tool_args: tool search_organizations arguments did not match the expected shape; turn 1 key_facts: missing key fact: verified
