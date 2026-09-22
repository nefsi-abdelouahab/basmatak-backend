## Context

Session 2 shipped identity (`users`/`sessions`/`verification_tokens`, real JWT guard stack, `REGISTRATION_EXTRAS_SERVICE` seam with an inert default) and Session 3 the canonical slug pipeline (`slugifyText` + `createWithUniqueSlug` with E11000 retry) — but nothing links an `organization` account to a page yet. The inventory (§0 "One organization = one account", §2.7, §3, §9) and roadmap Session 5 require: a `organizations` row whose `userId` is unique, a verification state machine that F1 un-deadends (`pending → verified | rejected → pending`), document submission that resubmits from `rejected`, and public reads gated on verified+active. Constraints unchanged: free tier (no Redis/queues), global prefix `api/v1`, `{ statusCode, code, message, details? }` envelope with UPPER_SNAKE codes, DTO `whitelist` + `forbidNonWhitelisted` + transform, `mongodb-memory-server` replica-set rig, `createSchema` base helper, `SuspendedGuard` rejects non-`active` users. Media existence/ownership is deliberately deferred to Session 8 (F9): this session validates `mediaId`s only by ObjectId format.

## Goals / Non-Goals

**Goals:**
- `organizations` model: `userId` (unique — §9 one org per account), `slug` (unique, generated server-side, never from the body), `nameAr`/`nameFr`/`description`, `logoMediaId?` (ObjectId format only), `verificationStatus` (`pending|verified|rejected`, default `pending`), `status` (`active|suspended|deleted`), `reliability` placeholder sub-document (S13 recomputes). Index `(verificationStatus, status)`.
- `organization_verifications` model: `organizationId`, `status`, `documents` (`mediaId[]`), `rejectionReason?`, `submittedAt`, `decidedAt?`, `decidedBy?`; index `(organizationId, status)`.
- Routes (inventory §2.7): public `GET /organizations`, `GET /organizations/:slug`, `GET /organizations/:slug/opportunities`; org `GET/PATCH /organizations/me`; `POST /organizations/me/verification` (documents `mediaId[]`, resubmission `rejected → pending` per F1, email-verified gate per A10); `GET /organizations/me/verification`.
- Organization registration hook: the `REGISTRATION_EXTRAS_SERVICE` binding dispatches on `user.role` — `organization` creates the `organizations` row; every other role delegates to `InertRegistrationExtrasService` (parallel-merge rule; volunteer behavior untouched).
- Public-org seam `getPublicOrganization(slug)` → org only when verified+active, else `null` (consumed by S12).

**Non-Goals:**
- No admin approve/reject routes (S15), no publish gate (S13), no publishing or opportunities model (S6), no media existence/ownership checks (S8), no `logoMediaId` resolution, no reliability computation (placeholder only), no org team members (§9), no `/auth/logout-all` or session routes (S13).

## Decisions

### D1. `organizations.userId` unique enforces the single-account rule (§9)
The schema uses `createSchema` with `userId: { type: ObjectId }, unique: true` plus `slug` unique and `(verificationStatus, status)`. One row per login is guaranteed by the index, not by application logic; a registration guarded by the seam cannot double-insert (E11000 → 409). Rationale: inventory §9 makes `userId` the enforcement mechanism; the unique index is race-free (a pre-check alone has a TOCTOU gap). Alternative rejected: an app-level "find then insert" check — a concurrent duplicate slips through.

### D2. Registration seam dispatches on role (parallel-merge rule)
`CommonModule` still provides `REGISTRATION_EXTRAS_SERVICE`; the organizations module overrides the provider token with `OrganizationRegistrationExtrasService`, whose `createExtras(user, dto)` branches on `user.role`:
- `organization` → `createWithUniqueSlug(...)` an `organizations` row with `userId = user.id`, `verificationStatus=pending`, `status=active`, names empty;
- every other role → delegates to the injected `InertRegistrationExtrasService` (no-op).

Because Session 2's `RegisterDto` is identity-only (email/password/phone — no org name) and must stay untouched, the initial slug derives from the email local-part (`slugifyText(email.split('@')[0]`) with the E11000 retry; `nameAr`/`nameFr`/`description` are filled later via `PATCH /organizations/me`. Rationale: satisfies the roadmap's "org registration creates `organizations(userId)`" without editing the auth module; delegation keeps the volunteer path byte-for-byte identical (explicit parallel-merge instruction). Alternatives rejected: (a) replacing the provider outright — would silently drop volunteer profile creation when S4 lands; (b) adding an `orgName` field to `RegisterDto` — edits the auth DTO and forces a name at registration, both out of scope.

### D3. Verification submission as a status flow through StatusTransitionService
The `organizations` module registers the `organization` entity whitelist in `StatusTransitionRegistry`: `pending→verified`, `pending→rejected`, `rejected→pending` (the F1 machine). `POST /organizations/me/verification`:
- reads the caller's org by `userId`;
- resolves the current `verificationStatus`; `verified` → 409 `ORG_ALREADY_VERIFIED`;
- `pending` → inserts a new `organization_verifications` row (documents replaced, status stays `pending`, `submittedAt` now) — no status transition, so no history entry;
- `rejected` → `StatusTransitionService.assert('organization', orgId, 'rejected', 'pending', user.id)` (writes `status_histories` per inventory §0) and sets `verificationStatus=pending` + inserts the new row.

`pending→verified|rejected` are registered now so S15's admin approve/reject already validates against a known machine, but only `rejected→pending` is exercised in this session. Rationale: one state machine, one enforcement path, auditable history. Alternative rejected: mutating the field directly — violates §0 "every status change goes through StatusTransitionService" and loses history.

### D4. A10 email gate is enforced at the route, not only via the env-gated guard
The global `EmailVerifiedGuard` only runs when `EMAIL_VERIFICATION_REQUIRED=true`, but A10 states that submitting organization-verification documents requires a verified account email regardless. `POST /organizations/me/verification` therefore reads the caller's user (`UsersService.findById`) and throws 403 `EMAIL_NOT_VERIFIED` when `emailVerifiedAt` is unset — before any write. Rationale: A10 is an app-level assumption, not an env toggle; making it route-local avoids depending on operator configuration. Alternative rejected: relying on the env-gated guard — a fresh install with the default flag off would let unverified orgs submit, breaking the spec.

### D5. `mediaId`s validated as ObjectId format only (F9 seam)
`documents` is `@IsArray` of `@IsMongoId()` strings (each validated), and `logoMediaId` in the PATCH DTO is optional `@IsMongoId()`. No existence, ownership, purpose, or non-deleted checks — Session 8 retrofits them onto this route via `MediaOwnership.assertFor`. Rationale: F9 explicitly defers media validation; the format check keeps bad payloads out now and keeps the retrofit mechanical. Alternative rejected: writing validation against a `media` model that does not exist yet.

### D6. Public routes are one seam + thin controllers
`OrganizationsService.getPublicOrganization(slug)` returns the org only when `verificationStatus=verified` AND `status=active`, else `null`. The controllers use it: `GET /organizations` lists `{ verified, active }`; `GET /organizations/:slug` and `GET /organizations/:slug/opportunities` 404 when the seam returns `null`. The opportunities route always returns `[]` — S6 owns the `opportunities` model and will fill the real published-only query. Rationale: a single verified+active predicate (also the S12 contract) so public exposure logic lives in one place. Alternative rejected: per-route inline filters — drift risk across three public shapes.

### D7. Route ordering against the `:slug` shadow trap
In `OrganizationsController`, `@Get('me')`, `@Patch('me')`, `@Post('me/verification')`, `@Get('me/verification')` are declared before `@Get(':slug')` and `@Get(':slug/opportunities')`. Nest matches routes in declaration order; declaring `me` last would shadow `/organizations/me` with `:slug`. Rationale: inventory §2.7 calls this out explicitly. Alternative rejected: separate path-prefix controllers with `MergeParams` — needless indirection; declaration order is the documented fix.

### D8. `PATCH /organizations/me` is audited automatically
The global `AuditInterceptor` (registered as `APP_INTERCEPTOR` in `core.module`) already writes `audit_logs` for any `PATCH`/`DELETE` whose path starts with `/api/v1/organizations/`. `PATCH /organizations/me` therefore lands in `audit_logs` without extra wiring. No new interceptor or decorator is needed.

## Risks / Trade-offs

- [Slug derived from email local-part may be unstable/ugly and is fixed for life] → Mitigation: the slug pipeline normalizes it and E11000 retry guarantees uniqueness; the org's short human-readable identity is its name (`nameAr`/`nameFr`), which admins/orgs edit via `PATCH`; a later session could add an explicit slug-change admin flow, but the inventory does not require one. Decide at S17 demo seeding (which may set a canonical slug directly).
- [Resubmitting from `rejected` sets `pending` without emitting a domain event → S9's `org.verification.updated` handler (registered later) would not fire for it] → Mitigation: accepted — the event is emitted by S15 on admin approve/reject, which is the notification-worthy outcome; resubmission is the org's own action. Noted for S9 so the handler doesn't assume the event fires on resubmission.
- [Touching `REGISTRATION_EXTRAS_SERVICE` risks volunteer registration] → Mitigation: dispatch delegates every non-`organization` role to the inert default; e2e registers a volunteer in the S2 flow as regression coverage.
- [ObjectId-format-only documents could be garbage media ids until S8] → Mitigation: F9 accepted; S8 retrofits existence/ownership, and S5 e2e uses well-formed ObjectIds.
- [A verified org's PATCH or `/me` reads still show rows an admin later rejects] → Mitigation: acceptable; status reads reflect live `verificationStatus` every call.

## Migration Plan

No data migration — two new collections created by the app on boot; rollback = revert this session's commit (S6/S7 read orgs and the roadmap orders strictly). No new env vars; `.env.example` unchanged. The `REGISTRATION_EXTRAS_SERVICE` provider change is additive (role dispatch keeps the inert path). Operational note: existing org accounts registered before this session have no `organizations` row — registering is the only creation path in P1, but a one-off backfill script can be added in S17 if needed (none expected; all accounts are fresh).

## Open Questions

- None blocking. (Demo org slug/name final values are S17 seed data, not code.)