## Context

F0 foundation is archived (axios client with 401 refresh-and-retry, unified `{statusCode, code, message}` error shape, TanStack Query provider + key factory, next-intl en/ar catalogs, theme tokens, `components/ui/*` primitives, system screens incl. 403 variants). F1 owns `(auth)/*` routes + `lib/api/auth.ts`; F2 owns `volunteer/*` + `volunteers.ts`/`users.ts`/`notifications.ts`. This session owns `org/complete-profile`, `org/verification-dossier`, `lib/api/organizations.ts`, `hooks/useOrgOnboarding.ts`, and the `orgOnboarding` message-key prefix. Backend contract (verified read-only in `organizations.controller.ts` / `organizations.service.ts`): `GET/PATCH /organizations/me`, `GET /organizations/me/profile-completion` (`{percent, missing, complete}` over 11 keys), `POST /organizations/me/verification` (`{documents: string[]}`, 403 `EMAIL_NOT_VERIFIED` when unverified, 409 `ORG_ALREADY_VERIFIED` when verified, `rejected → pending` resubmit), `GET /organizations/me/verification` (`{verificationStatus, latest}`), `DELETE /organizations/me`, wilaya/municipality location reads.

## Goals / Non-Goals

**Goals:**
- Complete-profile fact form (fields per backend DTO) with wilaya/municipality selects, phone/website validation, and `PATCH → checklist 100%`.
- Dossier upload → confirm → submit → pending, with per-file progress and 5 MB/type guards.
- `pending → verified | rejected → pending` status display with `rejectionReason` and resubmit; delete-own behind confirm.
- `EMAIL_NOT_VERIFIED` gate redirecting to F1's Email Verification screen; neutral "Pending review" + `ORG-<registryId>`.
- Registration stays minimal in F1; facts live here; no statute/legal fields.

**Non-Goals:**
- `(auth)/register-organization` itself (F1); org profile/settings full screens (F13); admin triage (F15).
- New shared primitives — F0 `components/ui/*` and the upload path are consumed as-is.

## Decisions

- **Route placement:** `app/[locale]/org/complete-profile/page.tsx` and `app/[locale]/org/verification-dossier/page.tsx`. Rationale: exact roadmap route names; disjoint from F1 `(auth)/*` and F2 `volunteer/*`.
- **API module ownership:** `lib/api/organizations.ts` with one typed function per endpoint (`getOwnOrganization`, `updateOwnOrganization`, `getProfileCompletion`, `deleteOwnOrganization`, `submitOrganizationVerification`, `getOrganizationVerificationStatus`, `listWilayas`, `listMunicipalities`, `createMediaUpload`, `confirmMediaUpload`), consumed only via `hooks/useOrgOnboarding.ts`. Rationale: roadmap §3 assigns `organizations.ts` to F3; one-function-per-endpoint per mandate 3. PUT-bytes uses the F0 upload path (no per-screen fetch).
- **Checklist math:** rendered verbatim from `GET /organizations/me/profile-completion`; no client-side percent computation (unit test pins display mapping, not math).
- **Location selects:** wilaya select drives municipality options per wilaya (backend requires the pair; `INVALID_LOCATION` otherwise).
- **Generic document list:** no fixed document count or labels (no design source defines them; backend accepts any `string[]`). The UI renders an open "add document" list with per-file type/size validation. Alternative (inventing fixed labels) rejected — would fabricate product requirements.
- **Guard handling:** `EMAIL_NOT_VERIFIED` (403) from submit/status, plus the unverified-account state, both route to F1's verify-email screen with a return CTA. `ORG_ALREADY_VERIFIED` (409) renders an info state, not an error.
- **i18n:** new `orgOnboarding` key prefix in `messages/en.json` + `messages/ar.json`; RTL via logical properties; no hardcoded strings.

## Risks / Trade-offs

- [Risk] F1/F2 changes still active with stub-only artifacts → their final file claims unverified; a future adjacent helper could collide → Mitigation: re-verify disjointness at implementation start (done: no `organizations.ts`/`useOrgOnboarding.ts`/org routes exist in `/frontend/src`).
- [Risk] Uploads throttle bucket (20/min) → 429 mid-dossier → Mitigation: bind 429 to the F0 system screen state; per-file retry.
- [Risk] Generic document list may not match owner expectations → Mitigation: Open Question below; resolved at Phase 1 review before code.

## Open Questions

1. Dossier document set: exact number of documents and their labels — undefined in every design source. Proposed default: open list, no fixed labels. Owner to confirm at review.
