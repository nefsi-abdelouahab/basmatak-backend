## Context

`GET /organizations/:slug` is public and already uses `OptionalJwtAuthGuard`. The current uncommitted implementation passes `account?.sub` and returns `contact.phone: null` for guests, with a display fallback to the owning account's phone. The frontend additionally masks the phone for guests. The assistant has no contact sanitizer; it relies on the organization tools excluding `contact` and on prompt instructions.

The privacy boundary must be server-side and must work for both expired/revoked sessions and suspended/deleted accounts. The endpoint is client-fetched, so no SSR payload leaks are involved.

## Goals / Non-Goals

**Goals**
- Guest and ineligible payloads contain no `contact.phone` key.
- Eligible viewers receive only the dedicated organization contact phone.
- One deterministic, testable assistant contact policy plus a final-answer sanitizer.
- No guest regression (public profile still returns `200` without a token).

**Non-Goals**
- No database migration, new collection, or new DI module.
- No changes to volunteer phone visibility or to authenticated `/me` reads.
- No UI redesign beyond removing the client-side mask.
- No changes to `useAiChat.ts`, `aiAgent.ts`, or their tests.

## Decisions

1. **Viewer eligibility lives in `OrganizationsService`.** The controller passes the optional `AccountToken`; the service first checks `viewer`, then validates `users.status=active` and a matching `sessions` row with `rotatedAt: null` and `expiresAt > now`. This covers revoked/expired sessions and suspended/deleted accounts even though global guards skip `@Public` routes. The lookup is skipped entirely when no token is present.

2. **Omit, never null.** The DTO `PublicOrganizationContactDto.phone` becomes optional. The service builds `contact: { email, ...(phone ? { phone } : {}) }`. `email` keeps its current behavior. No owner-account fallback is used.

3. **Cache headers.** The controller uses `@Res({ passthrough: true })` and calls `res.vary('Authorization')`, `res.vary('Cookie')`, then sets `Cache-Control: private, no-store`. `res.vary` appends, so an existing CORS `Vary: Origin` survives.

4. **Frontend relies on the contract.** Remove `isGuest ? null : ...` masking. Guests keep the existing sign-in prompt; signed-in viewers render a `tel:` link only when the backend returns the key. E2E fixtures model the real guest and signed-in payloads.

5. **Assistant contact policy.** The system prompt distinguishes official support contacts (allowed) from organization/personal contacts (forbidden). Few-shot examples must not instruct users to read an organization's email or phone from the profile; they point to the profile page and say the assistant cannot display them.

6. **Final-answer sanitizer.** Extend `sanitizeAnswer` with a pure contact-redaction pass using the same email and Algerian-phone patterns as `ai-check`. Official emails and phone digit sets are preserved; every other contact token is replaced with a locale-specific phrase pointing to the public profile. This runs on the final text before streaming, so injected organization contacts cannot reach the user. Sentence-level removal was rejected because it destroys useful context; token replacement is deterministic and keeps the answer readable.

7. **Knowledge alignment.** Update contact, organization-role, no-messaging, privacy, and troubleshooting files in en/ar. No literal organization contact values are introduced, so the four-file contact allowlist in `ai-check` is preserved.

## Risks / Trade-offs

- [Cached guest response carrying a phone] → `private, no-store` plus `Vary: Authorization, Cookie` prevents shared caching; tests assert both headers.
- [Session lookup on every signed-in profile read] → one indexed `findOne` plus one user lookup, only when a token exists; no guest cost.
- [Sanitizer over-redacts a legitimate official number in local format] → normalize `+213…`/`00213…`/`0…` digits against both official numbers before replacing.
- [Sanitizer phrase is awkward in some sentences] → replace the contact token only, tidy punctuation, and test the exact output.
- [Knowledge ranking misses the new Q&A] → add eval queries and verify top-4 recall before finishing.

## Migration Plan

Deploy the backend before the frontend. The frontend already tolerates an absent phone because the zod schema marks it optional; until the backend deploys, the client mask removal could briefly show a guest phone, so deploy order matters. Rollback is a code revert only; no data changes.

## Open Questions

None.
