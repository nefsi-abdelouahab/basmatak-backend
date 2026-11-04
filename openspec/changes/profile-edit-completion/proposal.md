## Why

Volunteer and organization profile pages expose only part of the editable model, count completion differently from the backend, show raw ObjectIds for skills and focus disciplines, and expose organization phone numbers to guests. Phase 2 makes the edit surfaces complete, trustworthy, privacy-safe, and consistent with the single backend completion contract.

## What Changes

- Add authoritative, weighted profile completion for volunteers: `GET /volunteers/me/profile-completion` plus a `completion` object (`percent`, `missingFields`, `complete`) on the dashboard, retaining `completionPercent` for compatibility.
- Rework organization completion to weighted keys and return `missingFields` instead of raw `missing`; one value drives org dashboard and edit checklist.
- Complete the volunteer edit surface: birth date, wilaya/municipality, banner upload, headline, availability note, preferred domains, geographic base, name and bio, plus server-accurate visibility defaults.
- Enrich own skills with row `_id` and localized skill/category labels so update/remove actions use the `volunteer_skills` row id.
- Add the `volunteer_banner` media purpose and validate banner ownership against it.
- Make the organization profile form complete and shared with `complete-profile`: logo, cover, location selects, localized focus-discipline multi-select, phone/email, and all fact fields.
- Accept and normalize Algerian phone formats (`0XXXXXXXXX`, `+213…`, `00213…`) to canonical `+213XXXXXXXXX`; reuse the account phone when the organization contact phone is empty and copy it at registration.
- Gate public organization phone display behind optional authentication: signed-in viewers get a `tel:` link; guests see a localized “Sign in to view contact details” message. The public org query key becomes session-aware.
- Introduce shared profile UI primitives (`SectionCard`, `FormField`, `ImageUploader`, `ProfileHero`, `SaveBar`, `VisibilityRow`, `TimeRangeRow`, `CompletionCard`) and wire profile mutations to the global toast system.
- Update English and Arabic catalogs with full parity; no layout, AI-chat, or scrollbar changes are needed.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `volunteer-profile`: complete field coverage, banner, skill row ids/labels, visibility defaults, completion read.
- `org-profile`: shared complete form, localized selects, completion `missingFields`, logo/cover.
- `org-profile-completion`: shared onboarding form, weighted completion, Algerian phone validation.
- `public-org-profile`: signed-in-only phone with `tel:` link and guest sign-in prompt.
- `volunteer-dashboard`: authoritative completion object and consistent missing fields.
- `media`: `volunteer_banner` purpose and ownership.
- `organizations`: weighted completion, phone normalization/fallback, contact gating, registration copy.

## Impact

- Backend: volunteers, organizations, media, auth/registration extras, common phone normalization, DTOs, schemas, tests.
- Frontend: API modules, hooks, volunteer profile page, org profile/complete-profile, public org profile, shared `components/profile`, en/ar catalogs, tests.
- No database migration; all new fields already exist or are optional.
- No changes to `useAiChat.ts`, `aiAgent.ts`, or their tests.
