## Why

Sessions 2–3 built identity and reference data, but no organization page exists: an `organization` account cannot publish, be discovered, or carry documents. This is the release valve F1 identified — organizations can submit verification documents but have no way back from `rejected`, and nothing before this session creates the `organizations` row a `userId` ties to a login (§9 single-account rule).

## What Changes

- Add `organizations` model: `userId` unique (one org per account), `slug` unique, `nameAr`/`nameFr`/`description`, `logoMediaId?`, `verificationStatus` (`pending → verified | rejected → pending` per F1), `status` (`active | suspended | deleted`), and a `reliability` placeholder sub-document (recomputed by S13).
- Add `organization_verifications` model: `organizationId`, `documents` as `mediaId[]` (ObjectId-format validated only — existence/ownership enforced in S8 per F9), `status`, `rejectionReason`, `submittedAt`, `decidedAt`, `decidedBy`.
- Public routes: `GET /organizations` (only `verificationStatus=verified` AND `status=active`), `GET /organizations/:slug` (404 unless verified+active), `GET /organizations/:slug/opportunities` (published only; empty list until S6 owns the model).
- Org routes: `GET/PATCH /organizations/me`, `POST /organizations/me/verification` (documents `mediaId[]`; allowed from `pending` (update) and `rejected` (→ `pending`, F1 resubmission); 403 `EMAIL_NOT_VERIFIED` for accounts without a verified email per A10), `GET /organizations/me/verification` (latest status + `rejectionReason`).
- Registration hook: org registration creates `users` + `organizations(userId)`, slug generated from the org name server-side via the canonical `src/common/slug` pipeline (A12); slug is never accepted from the body.
- Route ordering safety (§2.7): `/organizations/me` and `/organizations/me/verification` declared before `/organizations/:slug`.
- Public-org seam `getPublicOrganization(slug)` returns the org only when verified+active, else null.

## Capabilities

### New Capabilities
- `organizations`: one-account org pages, public org reads, `/me` internals, document submission + resubmission for verification (`pending → verified | rejected → pending`), registration hook via the S2 seam, and the public-org seam shape.

### Modified Capabilities
- `extension-seams`: the `RegistrationExtrasService` seam binding dispatches on `user.role` — for `organization` it creates the `organizations` row (userId, generated slug, `pending`); every other role delegates to the inert default, keeping non-organization registration unchanged.

## Impact

- New module tree in `/backend/src/organizations`; base schema helper, decorators, guard stack and error envelope reused from S1/S2.
- New collections: `organizations`, `organization_verifications` (inventory §3).
- New routes: the six under `/api/v1` listed above.
- No new runtime packages; no new env vars; `.env.example` unchanged.
- Out of scope (roadmap §4 S5): admin approve/reject (S15), publish gate (S13), publishing (S6), media existence/ownership checks (S8), logo handling beyond storing an ObjectId `mediaId`.