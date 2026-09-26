## Why

Register Organization's "Continue to verification" targets a dossier screen that does not exist in `design/` (dead `data-path="upload-dossier"` link), and org fact fields live in no frontend flow yet. Without this change, newly registered orgs can neither complete their profile nor submit verification documents, so no org can ever leave `pending` — the post-registration half of decision 7.

## What Changes

- New route `org/complete-profile`: fact form bound to `GET /organizations/me` + `PATCH /organizations/me` (name, description, type, registrationNumber, location via wilaya/municipality selects, website, foundedYear, contact, focusDisciplines, operatingScope, cover upload); checklist from `GET /organizations/me/profile-completion` (`{percent, missing, complete}`); PATCH → checklist 100%. No statute/legal fields; phone/website validation per backend rules.
- New route `org/verification-dossier`: multi-document upload (purpose `verification_document`, ≤5 MB jpeg/png/webp/pdf) via the F0 2-step flow (`POST /media/uploads` → PUT bytes → `POST /media/:mediaId/confirm` per document with progress), then `POST /organizations/me/verification` (`{documents: string[]}`).
- Status lifecycle `pending → verified | rejected → pending` via `GET /organizations/me/verification` (`{verificationStatus, latest}` incl. `rejectionReason`); rejected orgs resubmit to `pending`.
- `EMAIL_NOT_VERIFIED` (403) guard: dossier action redirects to F1's Email Verification screen first.
- Registration stays minimal (F1 owns `(auth)/register-organization`); this change shows the neutral "Pending review" state with `ORG-<registryId>`, no fabricated reference codes.
- `lib/api/organizations.ts` (me read/patch, profile-completion, verification submit/status, delete-own) + `hooks/useOrgOnboarding.ts`; message keys under the `orgOnboarding` prefix (en+ar).

Out of scope (per roadmap): org profile/settings full screens (F13); admin triage (F15).

## Capabilities

### New Capabilities
- `org-profile-completion`: complete-profile form, checklist display, location selects, delete-own.
- `org-verification-dossier`: dossier upload, submit, status display, and resubmit flows.
- `org-onboarding-status`: post-registration pending-review state and email-verification gating.

### Modified Capabilities
- None. Backend requirements (`organizations`, `media`, `locations`, `auth`) are consumed unchanged; F0 foundation specs are consumed, not altered.

## Impact

- Frontend only (`/frontend`): 2 new route dirs, 1 new api module, 1 new hook file, new `orgOnboarding` message keys.
- Backend untouched; no archived change touched. FB file-disjointness holds: `auth.ts` (F1), `volunteers.ts`/`users.ts` (F2), `organizations.ts` (this session).
- Process note: authored while F1/F2 changes are still active (owner override, sequential authoring only).

## Open Questions

- Dossier document set: no design source defines how many documents or their labels (Register Organization DESIGN.md carries only tokens; `code.html` has a dead upload link). Spec defines a generic multi-document list (backend accepts any `string[]`); exact labels/counts need owner confirmation at review.
