## Why

The public organization profile currently returns `contact.phone: null` to guests and relies on the frontend to hide it, while the service falls back to the owning account's phone. That is not a backend-enforced privacy boundary, and the assistant can still repeat organization contact details from user prompts. Phase 2 needs one server-side rule that guests never receive the phone and only eligible signed-in viewers do.

## What Changes

- `GET /organizations/:slug` omits `contact.phone` entirely for guests and ineligible viewers (no `null`, no masking). Guest access stays `200`, never `401`.
- Phone is returned only for a live, active account with a non-revoked, unexpired session. The eligibility lookup runs only when a bearer token is present.
- Remove the owner-account phone fallback. Only the dedicated organization contact phone is eligible; when absent, the key is omitted.
- Make the public contact `phone` field optional in the DTO.
- Add `Cache-Control: private, no-store` and `Vary: Authorization, Cookie` through `res.vary()` without replacing the existing CORS `Vary`.
- Frontend: remove the guest client-side mask, rely on backend omission, keep the guest sign-in prompt, and render a `tel:` link for signed-in viewers. Update API and Playwright fixtures to the real contract.
- AI: the assistant cannot show an organization's email or phone; point to the organization's public profile. Official Roeya Association and platform-support contacts remain exempt.
- Add a deterministic final-answer sanitizer that removes or replaces every non-allowlisted email/phone, including prompt-injection attempts.
- Align en/ar knowledge: organization email is public, organization phone is signed-in only, and the assistant cannot display either. Add the three requested Q&As and one eval query per language.

## Capabilities

### New Capabilities
- `ai-assistant-contact-privacy`: assistant contact allowlist, final-answer contact redaction, and organization-contact knowledge rules.

### Modified Capabilities
- `organizations`: public profile phone eligibility, omission, optional DTO, no owner fallback, cache/Vary headers.
- `public-org-profile`: backend-driven contact visibility, session-aware query, guest prompt, signed-in `tel:` link.

## Impact

- Backend: `organizations` service/controller/DTO/spec, e2e, AI sanitizer/prompt/tools tests, knowledge corpus, eval script.
- Frontend: public org page, public-orgs API tests, Playwright public-orgs spec.
- No database migration. No changes to `useAiChat.ts`, `aiAgent.ts`, or their tests.
