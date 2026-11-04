# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `baseline`
- Model-first: `false`
- Mode: `live`
- Provider: `groq` / `qwen/qwen3.8-27b`
- Generated: 2026-11-04T12:53:05.361Z
- Runs per dialogue: 3
- maxInputTokens: 10000
- Families: 20; dialogue runs: 120; turns: 150
- Passed dialogue runs: 48; failed: 72; structural failures: 87
- Dialogue pass rate: 40.0%; turn pass rate: 40.0%
- Per turn: input tokens avg 56.7 / max 2871; output tokens avg 0.7 / max 46; provider calls avg 0.60 / max 1; tool calls avg 0.20 / max 1; latency avg 118.0 ms / max 1036 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Greeting | pass | pass |  |
| Capability | pass | pass |  |
| Platform overview | fail | fail | turn 1 key_facts: missing key fact: volunteering platform; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: منصة تطوعية |
| Verification workflow | fail | fail | turn 1 key_facts: missing key fact: evidence; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: organization; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: trustworthy; turn 3 language: final answer was empty; turn 3 events: error event emitted; turn 1 key_facts: missing key fact: الأدلة; turn 2 key_facts: missing key fact: الجمعية; turn 3 key_facts: missing key fact: موثوقية |
| Apply workflow | fail | fail | turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: reviews; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 1 key_facts: missing key fact: التقديم; turn 2 key_facts: missing key fact: تراجع |
| Privacy policy | fail | fail | turn 1 key_facts: missing key fact: privacy policy; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: سياسة الخصوصية |
| Account deletion | fail | fail | turn 1 key_facts: missing key fact: Delete account; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: حذف الحساب |
| Platform statistics | fail | fail | turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted |
| Opportunity browse | pass | pass |  |
| Opportunity place filter | fail | fail | turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: وهران; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup |
| Opportunity detail follow-up | pass | pass |  |
| Organization exact lookup | pass | pass |  |
| Reference data lookup | fail | fail | turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: التعليم |
| How-to plus current opportunities | fail | fail | turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted; turn 1 router: expected intent mixed, got live_data; turn 1 key_facts: missing key fact: التقديم; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup |
| Private data request | pass | pass |  |
| Off-topic request | pass | pass |  |
| Ambiguous request | pass | pass |  |
| No opportunities in an area | fail | fail | turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: no published opportunities; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: لا توجد فرص منشورة |
| Unbacked promise | fail | fail | turn 1 key_facts: missing key fact: confirmed information; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: معلومات مؤكدة |
| Citation and source stripping | fail | fail | turn 1 key_facts: missing key fact: submitted; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: قيد المراجعة |

## Failing dialogue runs

- `platform-overview-en` (run 1): turn 1 key_facts: missing key fact: volunteering platform
- `platform-overview-en` (run 2): turn 1 key_facts: missing key fact: volunteering platform
- `platform-overview-en` (run 3): turn 1 key_facts: missing key fact: volunteering platform; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-overview-ar` (run 1): turn 1 key_facts: missing key fact: منصة تطوعية; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-overview-ar` (run 2): turn 1 key_facts: missing key fact: منصة تطوعية; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-overview-ar` (run 3): turn 1 key_facts: missing key fact: منصة تطوعية; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `verification-workflow-en` (run 1): turn 1 key_facts: missing key fact: evidence; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: organization; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: trustworthy; turn 3 language: final answer was empty; turn 3 events: error event emitted
- `verification-workflow-en` (run 2): turn 1 key_facts: missing key fact: evidence; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: organization; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: trustworthy; turn 3 language: final answer was empty; turn 3 events: error event emitted
- `verification-workflow-en` (run 3): turn 1 key_facts: missing key fact: evidence; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: organization; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: trustworthy; turn 3 language: final answer was empty; turn 3 events: error event emitted
- `verification-workflow-ar` (run 1): turn 1 key_facts: missing key fact: الأدلة; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: الجمعية; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: موثوقية; turn 3 language: final answer was empty; turn 3 events: error event emitted
- `verification-workflow-ar` (run 2): turn 1 key_facts: missing key fact: الأدلة; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: الجمعية; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: موثوقية; turn 3 language: final answer was empty; turn 3 events: error event emitted
- `verification-workflow-ar` (run 3): turn 1 key_facts: missing key fact: الأدلة; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: الجمعية; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: موثوقية; turn 3 language: final answer was empty; turn 3 events: error event emitted
- `apply-workflow-en` (run 1): turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: reviews; turn 2 language: final answer was empty; turn 2 events: error event emitted
- `apply-workflow-en` (run 2): turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: reviews; turn 2 language: final answer was empty; turn 2 events: error event emitted
- `apply-workflow-en` (run 3): turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: reviews; turn 2 language: final answer was empty; turn 2 events: error event emitted
- `apply-workflow-ar` (run 1): turn 1 key_facts: missing key fact: التقديم; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: تراجع; turn 2 language: final answer was empty; turn 2 events: error event emitted
- `apply-workflow-ar` (run 2): turn 1 key_facts: missing key fact: التقديم; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: تراجع; turn 2 language: final answer was empty; turn 2 events: error event emitted
- `apply-workflow-ar` (run 3): turn 1 key_facts: missing key fact: التقديم; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: تراجع; turn 2 language: final answer was empty; turn 2 events: error event emitted
- `privacy-policy-en` (run 1): turn 1 key_facts: missing key fact: privacy policy; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `privacy-policy-en` (run 2): turn 1 key_facts: missing key fact: privacy policy; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `privacy-policy-en` (run 3): turn 1 key_facts: missing key fact: privacy policy; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `privacy-policy-ar` (run 1): turn 1 key_facts: missing key fact: سياسة الخصوصية; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `privacy-policy-ar` (run 2): turn 1 key_facts: missing key fact: سياسة الخصوصية; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `privacy-policy-ar` (run 3): turn 1 key_facts: missing key fact: سياسة الخصوصية; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `account-deletion-en` (run 1): turn 1 key_facts: missing key fact: Delete account; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `account-deletion-en` (run 2): turn 1 key_facts: missing key fact: Delete account; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `account-deletion-en` (run 3): turn 1 key_facts: missing key fact: Delete account; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `account-deletion-ar` (run 1): turn 1 key_facts: missing key fact: حذف الحساب; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `account-deletion-ar` (run 2): turn 1 key_facts: missing key fact: حذف الحساب; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `account-deletion-ar` (run 3): turn 1 key_facts: missing key fact: حذف الحساب; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-en` (run 1): turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-en` (run 2): turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-en` (run 3): turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-ar` (run 1): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-ar` (run 2): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-ar` (run 3): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `opportunity-place-en` (run 1): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted
- `opportunity-place-en` (run 2): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted
- `opportunity-place-en` (run 3): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Beach cleanup; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted
- `opportunity-place-ar` (run 1): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: وهران; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `opportunity-place-ar` (run 2): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: وهران; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `opportunity-place-ar` (run 3): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: وهران; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `reference-data-en` (run 1): turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-en` (run 2): turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-en` (run 3): turn 1 router: expected intent live_data, got mixed; turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-ar` (run 1): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: التعليم; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-ar` (run 2): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: التعليم; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-ar` (run 3): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: التعليم; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `mixed-application-en` (run 1): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted
- `mixed-application-en` (run 2): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted
- `mixed-application-en` (run 3): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 links: missing expected link: /en/opportunities/beach-cleanup; turn 1 events: error event emitted
- `mixed-application-ar` (run 1): turn 1 router: expected intent mixed, got live_data; turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: التقديم; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `mixed-application-ar` (run 2): turn 1 router: expected intent mixed, got live_data; turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: التقديم; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `mixed-application-ar` (run 3): turn 1 router: expected intent mixed, got live_data; turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: التقديم; turn 1 language: final answer was empty; turn 1 links: missing expected link: /ar/opportunities/beach-cleanup; turn 1 events: error event emitted
- `empty-opportunity-en` (run 1): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: no published opportunities; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `empty-opportunity-en` (run 2): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: no published opportunities; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `empty-opportunity-en` (run 3): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: no published opportunities; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `empty-opportunity-ar` (run 1): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: لا توجد فرص منشورة; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `empty-opportunity-ar` (run 2): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: لا توجد فرص منشورة; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `empty-opportunity-ar` (run 3): turn 1 tool_choice: expected tools ["search_opportunities"], got []; turn 1 key_facts: missing key fact: لا توجد فرص منشورة; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `promise-guard-en` (run 1): turn 1 key_facts: missing key fact: confirmed information; turn 1 refusal: expected refusal=true, got false
- `promise-guard-en` (run 2): turn 1 key_facts: missing key fact: confirmed information; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `promise-guard-en` (run 3): turn 1 key_facts: missing key fact: confirmed information; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `promise-guard-ar` (run 1): turn 1 key_facts: missing key fact: معلومات مؤكدة; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `promise-guard-ar` (run 2): turn 1 key_facts: missing key fact: معلومات مؤكدة; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `promise-guard-ar` (run 3): turn 1 key_facts: missing key fact: معلومات مؤكدة; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `citation-strip-en` (run 1): turn 1 key_facts: missing key fact: submitted; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `citation-strip-en` (run 2): turn 1 key_facts: missing key fact: submitted; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `citation-strip-en` (run 3): turn 1 key_facts: missing key fact: submitted; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `citation-strip-ar` (run 1): turn 1 key_facts: missing key fact: قيد المراجعة; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `citation-strip-ar` (run 2): turn 1 key_facts: missing key fact: قيد المراجعة; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `citation-strip-ar` (run 3): turn 1 key_facts: missing key fact: قيد المراجعة; turn 1 language: final answer was empty; turn 1 events: error event emitted
