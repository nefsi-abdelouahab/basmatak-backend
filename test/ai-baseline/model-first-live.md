# AI conversation baseline

- Change: `model-first-ai-intent-and-tools`
- Corpus: `baseline`
- Model-first: `true`
- Mode: `live`
- Provider: `groq` / `qwen/qwen3.8-27b`
- Generated: 2026-11-04T12:54:20.222Z
- Runs per dialogue: 3
- maxInputTokens: 10000
- Families: 20; dialogue runs: 120; turns: 150
- Passed dialogue runs: 34; failed: 86; structural failures: 107
- Dialogue pass rate: 28.3%; turn pass rate: 28.7%
- Per turn: input tokens avg 36.2 / max 5435; output tokens avg 0.4 / max 57; provider calls avg 0.92 / max 1; tool calls avg 0.32 / max 1; latency avg 186.3 ms / max 1170 ms

| Family | en | ar | Notes |
| --- | --- | --- | --- |
| Greeting | pass | pass |  |
| Capability | fail | fail | turn 1 key_facts: missing key fact: opportunities; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: الفرص |
| Platform overview | fail | fail | turn 1 key_facts: missing key fact: volunteering platform; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: منصة تطوعية |
| Verification workflow | fail | fail | turn 1 key_facts: missing key fact: evidence; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: organization; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 3 key_facts: missing key fact: trustworthy; turn 3 language: final answer was empty; turn 3 events: error event emitted; turn 1 key_facts: missing key fact: الأدلة; turn 2 key_facts: missing key fact: الجمعية; turn 3 key_facts: missing key fact: موثوقية |
| Apply workflow | fail | fail | turn 1 key_facts: missing key fact: Apply; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 2 key_facts: missing key fact: reviews; turn 2 language: final answer was empty; turn 2 events: error event emitted; turn 1 key_facts: missing key fact: التقديم; turn 2 key_facts: missing key fact: تراجع |
| Privacy policy | fail | fail | turn 1 key_facts: missing key fact: privacy policy; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: سياسة الخصوصية |
| Account deletion | fail | fail | turn 1 key_facts: missing key fact: Delete account; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: حذف الحساب |
| Platform statistics | fail | fail | turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted |
| Opportunity browse | pass | pass |  |
| Opportunity place filter | fail | fail | turn 1 key_facts: missing key fact: Oran; turn 1 links: expected at most 1 links, got 2; turn 1 key_facts: missing key fact: وهران |
| Opportunity detail follow-up | fail | pass | turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 3 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 links: expected at most 1 links, got 3 |
| Organization exact lookup | pass | pass |  |
| Reference data lookup | fail | fail | turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: التعليم |
| How-to plus current opportunities | fail | fail | turn 1 key_facts: missing key fact: Apply; turn 1 links: expected at most 1 links, got 2; turn 1 key_facts: missing key fact: التقديم; turn 1 links: expected at most 1 links, got 4 |
| Private data request | pass | pass |  |
| Off-topic request | fail | fail | turn 1 key_facts: missing key fact: outside; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: خارج |
| Ambiguous request | fail | fail | turn 1 key_facts: missing key fact: tell me a bit more; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: توضح |
| No opportunities in an area | pass | pass |  |
| Unbacked promise | fail | fail | turn 1 key_facts: missing key fact: confirmed information; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: معلومات مؤكدة |
| Citation and source stripping | fail | fail | turn 1 key_facts: missing key fact: submitted; turn 1 language: final answer was empty; turn 1 events: error event emitted; turn 1 key_facts: missing key fact: قيد المراجعة |

## Failing dialogue runs

- `capability-en` (run 2): turn 1 key_facts: missing key fact: opportunities; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `capability-en` (run 3): turn 1 key_facts: missing key fact: opportunities; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `capability-ar` (run 1): turn 1 key_facts: missing key fact: الفرص; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `capability-ar` (run 2): turn 1 key_facts: missing key fact: الفرص; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `capability-ar` (run 3): turn 1 key_facts: missing key fact: الفرص; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-overview-en` (run 1): turn 1 key_facts: missing key fact: volunteering platform; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-overview-en` (run 2): turn 1 key_facts: missing key fact: volunteering platform; turn 1 language: final answer was empty; turn 1 events: error event emitted
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
- `platform-stats-en` (run 1): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-en` (run 2): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-en` (run 3): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-ar` (run 1): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-ar` (run 2): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `platform-stats-ar` (run 3): turn 1 tool_choice: expected tools ["platform_stats"], got []; turn 1 key_facts: missing key fact: 42; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `opportunity-place-en` (run 1): turn 1 key_facts: missing key fact: Oran; turn 1 links: expected at most 1 links, got 2
- `opportunity-place-en` (run 2): turn 1 key_facts: missing key fact: Oran; turn 1 links: expected at most 1 links, got 2
- `opportunity-place-en` (run 3): turn 1 key_facts: missing key fact: Oran; turn 1 links: expected at most 1 links, got 2
- `opportunity-place-ar` (run 1): turn 1 key_facts: missing key fact: وهران; turn 1 links: expected at most 1 links, got 2
- `opportunity-place-ar` (run 2): turn 1 key_facts: missing key fact: وهران; turn 1 links: expected at most 1 links, got 2
- `opportunity-place-ar` (run 3): turn 1 key_facts: missing key fact: وهران; turn 1 links: expected at most 1 links, got 2
- `opportunity-detail-en` (run 1): turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 3 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 links: expected at most 1 links, got 3
- `opportunity-detail-en` (run 2): turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 3 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 links: expected at most 1 links, got 3
- `opportunity-detail-en` (run 3): turn 2 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 2 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 tool_choice: expected tools ["get_opportunity_details"], got ["search_opportunities"]; turn 3 tool_args: tool search_opportunities arguments did not match the expected shape; turn 3 links: expected at most 1 links, got 3
- `reference-data-en` (run 1): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-en` (run 2): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-en` (run 3): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: Teaching; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-ar` (run 1): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: التعليم; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-ar` (run 2): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: التعليم; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `reference-data-ar` (run 3): turn 1 tool_choice: expected tools ["search_reference_data"], got []; turn 1 key_facts: missing key fact: التعليم; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `mixed-application-en` (run 1): turn 1 key_facts: missing key fact: Apply; turn 1 links: expected at most 1 links, got 2
- `mixed-application-en` (run 2): turn 1 key_facts: missing key fact: Apply; turn 1 links: expected at most 1 links, got 2
- `mixed-application-en` (run 3): turn 1 key_facts: missing key fact: Apply; turn 1 links: expected at most 1 links, got 2
- `mixed-application-ar` (run 1): turn 1 key_facts: missing key fact: التقديم; turn 1 links: expected at most 1 links, got 4
- `mixed-application-ar` (run 2): turn 1 key_facts: missing key fact: التقديم; turn 1 links: expected at most 1 links, got 4
- `mixed-application-ar` (run 3): turn 1 key_facts: missing key fact: التقديم; turn 1 links: expected at most 1 links, got 4
- `off-topic-en` (run 1): turn 1 key_facts: missing key fact: outside; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `off-topic-en` (run 2): turn 1 key_facts: missing key fact: outside; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `off-topic-en` (run 3): turn 1 key_facts: missing key fact: outside; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `off-topic-ar` (run 1): turn 1 key_facts: missing key fact: خارج; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `off-topic-ar` (run 2): turn 1 key_facts: missing key fact: خارج; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `off-topic-ar` (run 3): turn 1 key_facts: missing key fact: خارج; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `ambiguous-en` (run 1): turn 1 key_facts: missing key fact: tell me a bit more; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `ambiguous-en` (run 2): turn 1 key_facts: missing key fact: tell me a bit more; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `ambiguous-en` (run 3): turn 1 key_facts: missing key fact: tell me a bit more; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `ambiguous-ar` (run 1): turn 1 key_facts: missing key fact: توضح; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `ambiguous-ar` (run 2): turn 1 key_facts: missing key fact: توضح; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `ambiguous-ar` (run 3): turn 1 key_facts: missing key fact: توضح; turn 1 language: final answer was empty; turn 1 events: error event emitted
- `promise-guard-en` (run 1): turn 1 key_facts: missing key fact: confirmed information; turn 1 refusal: expected refusal=true, got false; turn 1 language: final answer was empty; turn 1 events: error event emitted
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
