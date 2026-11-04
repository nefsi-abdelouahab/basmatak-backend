## 1. Backend contract

- [x] 1.1 Make `PublicOrganizationContactDto.phone` optional.
- [x] 1.2 Omit `contact.phone` for guests and ineligible viewers; return only the dedicated organization phone for eligible viewers.
- [x] 1.3 Remove the owning-account phone fallback.
- [x] 1.4 Resolve eligibility from a live, active user plus a non-revoked, unexpired session, only when a token is present.
- [x] 1.5 Add `Cache-Control: private, no-store` and `res.vary('Authorization')` / `res.vary('Cookie')` preserving CORS `Vary`.
- [x] 1.6 Update service, controller, and e2e tests for guest omission, eligible/ineligible viewers, no fallback, and headers.

## 2. Frontend

- [x] 2.1 Remove the `isGuest` phone mask from `PublicOrgProfilePage`.
- [x] 2.2 Keep the guest sign-in prompt and render the signed-in `tel:` link only from the backend payload.
- [x] 2.3 Update public-orgs API tests and Playwright fixtures to the real guest/signed-in contract.

## 3. AI policy and knowledge

- [x] 3.1 Add the official-contact allowlist and deterministic final-answer contact sanitizer.
- [x] 3.2 Add sanitizer tests, including a prompt-injection organization-phone request and official-contact preservation.
- [x] 3.3 Align the system prompt and few-shot examples with the organization-contact ban.
- [x] 3.4 Update en/ar knowledge: public email, signed-in-only phone, assistant cannot show either, and point to the public profile.
- [x] 3.5 Add the three requested Q&As in en/ar troubleshooting.
- [x] 3.6 Add one en and one ar eval query.
- [x] 3.7 Strengthen AI tool privacy tests with the seeded email and phone values.

## 4. Verification

- [x] 4.1 Run backend lint, build, targeted and full jest, and `openspec validate --strict`.
- [x] 4.2 Run frontend lint, type-check (new errors only), related vitest, and public-orgs Playwright guest/signed-in assertions.
- [x] 4.3 Run `npm run ai:check`, `npx jest src/ai-agent --runInBand`, `npm run ai:eval`, build, and lint.
- [x] 4.4 Report modified files, real outputs, and the conflicting `profile-edit-completion` lines without editing that change.
