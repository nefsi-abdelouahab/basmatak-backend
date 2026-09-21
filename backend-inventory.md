# Basmatak Tatatoua (بصمتك تطوع) — Backend Inventory

Stack: NestJS + TypeScript + MongoDB (Mongoose). Spec-driven with OpenSpec, implemented with OpenCode.
Purpose of this file: one shared list of **modules, controllers, routes and collections** so each OpenSpec change can be scoped without re-deriving the domain.

Phases: **P1** = core loop (MVP), **P2** = trust layer (reviews, publish gate, reliability), **P3** = admin/moderation/extras.
No AI / matching / ML anywhere. "Recommended" feeds are plain rule-based queries.

---

## 0. Global conventions

- Global prefix `/api/v1`. JSON only. IDs are Mongo ObjectId strings.
- Auth: JWT access token (short-lived) + refresh token (hash stored in `sessions`, rotated on refresh).
- Roles: `volunteer | organization | admin`, plus **public** (no token = Guest, read-only endpoints).
- One organization = one account (`organizations.userId`, unique). Org routes resolve the organization from the logged-in user, so they use `/organizations/me/...`. No team members or per-member roles in the MVP (see §9).
- Access legend below: **Public**, **Auth** (any logged-in), **Vol**, **Org** (the organization's own account), **Admin**.
- Validation: DTOs with class-validator; whitelist + forbidNonWhitelisted.
- Rate limiting: `@nestjs/throttler` with in-memory storage (single instance, no Redis); stricter on login, forgot-password, resend-verification.
- Errors: `{ statusCode, code, message, details? }`. Business codes are UPPER_SNAKE (e.g. `PUBLISH_GATE_LOCKED`).
- Pagination: cursor-based on list endpoints (`?limit=&cursor=`), default limit 20, max 50.
- Every status change goes through one `StatusTransitionService` that validates the transition, writes `status_histories`, and emits a domain event (notifications, stats updates).
- `audit_logs` written by an interceptor for admin actions and sensitive org/volunteer actions.
- Multi-document MongoDB transactions (Atlas replica set) for: accept application, verify submission.
- Media never stored in MongoDB. `StorageProvider` interface (Supabase Storage, S3-compatible): presigned upload → confirm → serve via signed URL when private.
- Soft delete via `status: deleted` / `deletedAt`. No hard deletes except drafts.
- Scheduled work goes through `POST /internal/jobs/run` (secret header, idempotent), called by a free external scheduler, because the free host sleeps when idle (so no `@nestjs/schedule`): at `startDate` move opportunities `published → in_progress` and turn their `accepted` participants into `active`; recompute org reliability (P2). Applying stops at `applicationDeadline` by a check in the apply endpoint (no status change). Token/session cleanup via TTL indexes, not cron.

---

## 1. Modules and controllers

| # | Module | Controller(s) | Collections owned | Phase |
|---|---|---|---|---|
| 1 | core (common) | — (guards, filters, pipes, interceptors, StatusTransitionService) | `status_histories`, `audit_logs` | P1 |
| 2 | config / settings | AdminSettingsController | `system_settings` | P1 |
| 3 | auth (+ MailService) | AuthController | `sessions`, `verification_tokens` | P1 |
| 4 | users | UsersController | `users` | P1 |
| 5 | locations | LocationsController | `locations` | P1 |
| 6 | skills | SkillsController | `skill_categories`, `skills` | P1 |
| 7 | volunteers | VolunteersController, VolunteerSkillsController, VolunteerAvailabilityController | `volunteer_profiles`, `volunteer_skills`, `volunteer_availability` | P1 |
| 8 | organizations | OrganizationsController, OrganizationVerificationController | `organizations`, `organization_verifications` | P1 |
| 9 | opportunities | OpportunitiesController, PositionsController | `opportunities` (positions embedded) | P1 |
| 10 | applications | ApplicationsController | `applications` | P1 |
| 11 | participations | ParticipationsController | `task_participants` | P1 |
| 12 | media | MediaController | `media` | P1 |
| 13 | submissions | SubmissionsController | `submissions` | P1 |
| 14 | verifications | VerificationsController, PublicVerificationController | `verifications` | P1 |
| 15 | experiences | ExperiencesController | `volunteer_experiences` | P1 |
| 16 | talents (discover) | TalentsController, PublicProfilesController | reads `volunteer_profiles` etc. | P1 |
| 17 | portfolio | PortfolioController | `portfolio_items` | P2 |
| 18 | reviews | ReviewsController | `reviews` | P2 |
| 19 | notifications | NotificationsController | `notifications` | P1 (in-app only) |
| 20 | trust (gate + reliability) | PublishGateController, ReliabilityController | derived (see §4) | P2 |
| 21 | reports | ReportsController | `reports` | P3 |
| 22 | admin | AdminUsersController, AdminOrganizationsController, AdminOpportunitiesController, AdminReportsController, AdminAuditController, AdminStatsController | uses others | P3 |
| 23 | jobs | InternalJobsController | — | P1 |

That is 23 modules and 25 active collections in the MVP (each has exactly one owning module). `organization_members` stays in the schema but is **deferred**: no module, no routes (see §9).

---

## 2. Routes per module

### 2.1 auth (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /auth/register/volunteer | Public | Creates `users` + `volunteer_profiles`; sends email verification |
| POST | /auth/register/organization | Public | Creates `users` + `organizations` (`userId` = new user, verificationStatus=pending) |
| POST | /auth/login | Public | Returns access + refresh; creates `sessions` row |
| POST | /auth/refresh | Public | Rotates refresh token |
| POST | /auth/logout | Auth | Revokes current session |
| POST | /auth/logout-all | Auth | Revokes all sessions. P2 |
| POST | /auth/verify-email | Public | Consumes `verification_tokens` |
| POST | /auth/resend-verification | Auth | Rate-limited |
| POST | /auth/forgot-password | Public | Rate-limited, always 204 |
| POST | /auth/reset-password | Public | Consumes token, revokes sessions |
| POST | /auth/change-password | Auth | |
| GET | /auth/me | Auth | User + role (+ own organization for org accounts) |

Auth scope (P1): own implementation in NestJS, no external auth service.
- Access token short-lived; refresh token rotated on every refresh and stored hashed in `sessions`.
- Email verification and password reset use `verification_tokens` and `MailService` (interface; Brevo SMTP first). Env flag `EMAIL_VERIFICATION_REQUIRED` can turn the requirement off for demos.
- An unverified account can browse only: no apply, no publish, no submit.
- Organization accounts stay `pending` until an admin approves the verification; they cannot publish before that.
- No admin registration route: the admin account is created by a seed script from environment variables.
- Deferred: Google login, phone/SMS verification, two-factor auth, session list/revoke (P2).

### 2.2 users (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /users/me | Auth | |
| PATCH | /users/me | Auth | email/phone change re-triggers verification |
| DELETE | /users/me | Auth | Soft delete (`status=deleted`) |
| GET | /users/me/sessions | Auth | P2 |
| DELETE | /users/me/sessions/:sessionId | Auth | P2 |

### 2.3 locations (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /locations/wilayas | Public | Seeded, cacheable |
| GET | /locations/wilayas/:wilayaId/municipalities | Public | |
| POST/PATCH | /admin/locations, /admin/locations/:id | Admin | Seed/maintenance |

### 2.4 skills (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /skill-categories | Public | Ordered by `order`, active only |
| GET | /skills | Public | `?categoryId=&q=` |
| POST/PATCH | /admin/skill-categories, /admin/skill-categories/:id | Admin | Deactivate instead of delete |
| POST/PATCH | /admin/skills, /admin/skills/:id | Admin | |

### 2.5 volunteers (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /volunteers/me | Vol | Own profile |
| PATCH | /volunteers/me | Vol | Names, bio, birthDate, location, avatar (mediaId) |
| PATCH | /volunteers/me/public-settings | Vol | Toggles in `publicProfile` |
| GET | /volunteers/me/dashboard | Vol | Stats, profile completion %, latest verified experience |
| GET | /volunteers/me/skills | Vol | |
| POST | /volunteers/me/skills | Vol | `skillId, level, yearsOfExperience, isPrimary` |
| PATCH | /volunteers/me/skills/:skillId | Vol | |
| DELETE | /volunteers/me/skills/:skillId | Vol | |
| GET | /volunteers/me/availability | Vol | |
| PUT | /volunteers/me/availability | Vol | Replace whole schedule |

### 2.6 talents and public profiles (P1) — Guest-accessible
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /talents | Public | Discover Talents. Filters: `q, skillId, categoryId, wilayaId`. Only `publicProfile.enabled = true` |
| GET | /volunteers/:username | Public | Respects each `publicProfile.show*` flag |
| GET | /volunteers/:username/experiences | Public | Only `publicVisibility = true` |
| GET | /volunteers/:username/portfolio | Public | Only `visibility = public` |

No contact / message / hire endpoints for Guests (by design).

### 2.7 organizations (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /organizations | Public | Verified + active only |
| GET | /organizations/:slug | Public | Public org profile |
| GET | /organizations/:slug/opportunities | Public | Published only |
| GET | /organizations/me | Org | Own organization. Declare before `/:slug` in the controller |
| PATCH | /organizations/me | Org | |
| POST | /organizations/me/verification | Org | Submit documents (`mediaId`s) |
| GET | /organizations/me/verification | Org | Latest status |

### 2.8 opportunities and positions (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /opportunities | Public | Feed. Filters: `q, categoryId, skillId, wilayaId, municipalityId, from, to, hasOpenPositions`. Published only |
| GET | /opportunities/recommended | Vol | Rule-based: matches volunteer skills + location |
| GET | /opportunities/:idOrSlug | Public | Details + positions with open seats |
| POST | /organizations/me/opportunities | Org | Creates `draft` with positions |
| GET | /organizations/me/opportunities | Org | All statuses |
| PATCH | /opportunities/:opportunityId | Org | Limited fields once published |
| DELETE | /opportunities/:opportunityId | Org | Draft only |
| POST | /opportunities/:opportunityId/publish | Org | Checks org verified + publish gate (P2) |
| POST | /opportunities/:opportunityId/close | Org | Stop accepting applications |
| POST | /opportunities/:opportunityId/cancel | Org | |
| POST | /opportunities/:opportunityId/complete | Org | |
| POST | /opportunities/:opportunityId/positions | Org | Draft, or published with no accepted participants |
| PATCH | /opportunities/:opportunityId/positions/:positionId | Org | `requiredCount` cannot go below `filledCount` |
| DELETE | /opportunities/:opportunityId/positions/:positionId | Org | Only if no applications |

### 2.9 applications (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /opportunities/:opportunityId/positions/:positionId/applications | Vol | Apply. One active application per position; needs open seat and open deadline |
| GET | /applications/me | Vol | My Applications. `?status=` |
| GET | /applications/:applicationId | Vol (owner) / Org | |
| POST | /applications/:applicationId/withdraw | Vol | Pending or accepted |
| GET | /opportunities/:opportunityId/applications | Org | `?positionId=&status=` |
| POST | /applications/:applicationId/accept | Org | Transaction: create `task_participants`, atomic `filledCount` increment |
| POST | /applications/:applicationId/reject | Org | Body `{ reason }` |

### 2.10 participations (P1) — "My Tasks"
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /participations/me | Vol | `?status=` |
| GET | /participations/:participationId | Vol (owner) / Org | |
| POST | /participations/:participationId/withdraw | Vol | Decrements `filledCount` |
| GET | /opportunities/:opportunityId/participants | Org | Accepted volunteers |
| POST | /participations/:participationId/remove | Org | Body `{ reason }` |

### 2.11 media (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /media/uploads | Auth | Body `{ filename, mimeType, size, purpose, visibility }` → `{ mediaId, uploadUrl }`. Limits: images (jpeg/png/webp) ≤ 5 MB (compressed client-side), documents (pdf) ≤ 5 MB. Videos are not uploaded (see `/media/links`) |
| POST | /media/:mediaId/confirm | Auth (owner) | Marks upload complete, reads metadata |
| POST | /media/links | Auth | Registers an external video link as `media` (`type = link`, `url`); host allowlist (e.g. youtube.com, youtu.be, drive.google.com) |
| GET | /media/:mediaId | Auth | Signed URL if private and caller is owner / related org / admin |
| DELETE | /media/:mediaId | Auth (owner) | Sets `deletedAt`; blocked if attached to a verified experience |

### 2.12 submissions (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /participations/:participationId/submissions | Vol | Creates `draft` |
| PATCH | /submissions/:submissionId | Vol | `draft` or `rejected` (editing a rejected one returns it to `draft`) |
| POST | /submissions/:submissionId/submit | Vol | draft → submitted; needs description + at least one evidence per `deliverables`; `consentConfirmed` must be `true` when evidence includes image/video |
| GET | /submissions/me | Vol | |
| GET | /submissions/:submissionId | Vol (owner) / Org | Includes media |
| GET | /organizations/me/submissions | Org | Verification inbox. `?status=&opportunityId=` |
| POST | /submissions/:submissionId/start-review | Org | submitted → under_review (may be automatic on first open) |

### 2.13 verifications (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /submissions/:submissionId/verify | Org | Body `{ notes?, review? }`. Transaction (see §5) |
| POST | /submissions/:submissionId/reject | Org | Body `{ reason }` |
| GET | /verifications/:verificationId | Vol (owner) / Org | |
| GET | /verify/:verificationCode | Public | QR / verification link: public summary of the experience |

### 2.14 experiences (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /experiences/me | Vol | |
| GET | /experiences/:experienceId | Vol (owner) | Full detail incl. evidence and review |
| PATCH | /experiences/:experienceId/visibility | Vol | `{ publicVisibility }` |

Experiences are created only by the verify transaction. No create/edit endpoint.

### 2.15 portfolio (P2)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /portfolio/me | Vol | |
| POST | /portfolio/me | Vol | |
| PATCH | /portfolio/:itemId | Vol | |
| DELETE | /portfolio/:itemId | Vol | |
| PUT | /portfolio/me/order | Vol | Reorder |

### 2.16 reviews (P2)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /submissions/:submissionId/review | Org | Only after verification; one per submission |
| GET | /volunteers/me/reviews | Vol | |
| GET | /organizations/me/reviews | Org | Reviews the org has given |

Review ≠ Verification: verification says "done", review says "how well".

### 2.17 notifications (P1, in-app only)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /notifications | Auth | |
| GET | /notifications/unread-count | Auth | |
| PATCH | /notifications/:notificationId/read | Auth | |
| POST | /notifications/read-all | Auth | |

Created by domain events through an in-process EventEmitter set up in `foundation`: new application, application accepted/rejected, submission submitted, submission verified/rejected, organization verification result, opportunity cancelled, publish gate locked (P2). The UI polls `unread-count`; no WebSocket, push or notification emails in the MVP.

### 2.18 trust: publish gate and reliability (P2)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /organizations/me/publish-gate | Org | `{ locked, pendingCount, threshold, pendingOpportunities[] }` |
| GET | /organizations/:slug/reliability | Public | Response rate, decided-vs-uploaded ratio, median response time, "average rating above overall average" flag |

### 2.19 reports (P3)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /reports | Auth | `targetType, targetId, reason, description` |

### 2.20 admin (P3)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /admin/stats/overview | Admin | Counts, hours, verification rate, gate freezes |
| GET | /admin/users | Admin | Filters: role, status, q |
| GET | /admin/users/:userId | Admin | |
| PATCH | /admin/users/:userId/status | Admin | active / suspended |
| GET | /admin/volunteers | Admin | |
| GET | /admin/organizations | Admin | |
| GET | /admin/organizations/verifications | Admin | `?status=pending` |
| POST | /admin/organizations/:organizationId/verification/approve | Admin | Sets `verifiedAt/verifiedBy` |
| POST | /admin/organizations/:organizationId/verification/reject | Admin | `{ rejectionReason }` |
| PATCH | /admin/organizations/:organizationId/status | Admin | |
| GET | /admin/opportunities | Admin | |
| PATCH | /admin/opportunities/:opportunityId/status | Admin | Force close/cancel |
| PATCH | /admin/reviews/:reviewId/hide | Admin | `status = hidden` |
| GET | /admin/reports | Admin | |
| PATCH | /admin/reports/:reportId | Admin | Status + resolution |
| GET | /admin/audit-logs | Admin | Filters: actor, entity, date |
| GET | /admin/settings | Admin | |
| PUT | /admin/settings/:key | Admin | e.g. `publishGate.maxPendingOpportunities` (default 3) |

### 2.21 internal jobs (P1)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /internal/jobs/run | Secret header `X-Jobs-Key` | Idempotent tick: starts opportunities and activates participants at `startDate`; P2: recompute reliability. Called by a free external scheduler (also wakes the sleeping host). Not part of the public API |

Rough total: about 122 routes (P1 ≈ 82, P2 ≈ 20, P3 ≈ 20).

---

## 3. Collections (26 in schema, 25 active in MVP) — owner, key indexes

| Collection | Owner module | Key indexes / constraints |
|---|---|---|
| users | users | unique `email`; unique sparse `phone`; `role, status` |
| sessions | auth | `userId`; `refreshTokenHash`; TTL on `expiresAt` |
| verification_tokens | auth | `tokenHash`; `userId, type`; TTL on `expiresAt` |
| volunteer_profiles | volunteers | unique `userId`; unique `username`; `location.municipalityId`; `publicProfile.enabled` |
| volunteer_skills | volunteers | unique `(volunteerId, skillId)`; `skillId` |
| volunteer_availability | volunteers | unique `volunteerId` |
| skill_categories | skills | unique `slug`; `order` |
| skills | skills | unique `slug`; `categoryId` |
| locations | locations | `(type, parentId)`; 2dsphere `coordinates` |
| organizations | organizations | unique `slug`; unique `userId` (new field, see §9); `verificationStatus, status` |
| organization_members | — (deferred) | Not created in the MVP |
| organization_verifications | organizations | `(organizationId, status)` |
| opportunities | opportunities | unique `slug`; `(status, startDate)`; `(organizationId, status)`; 2dsphere `location.coordinates`; text on `title, description`; `positions.requiredSkills.skillId` |
| applications | applications | partial unique `(positionId, volunteerId)` where status in (pending, accepted); `(opportunityId, status)`; `(volunteerId, status)` |
| task_participants | participations | unique `applicationId`; `(volunteerId, status)`; `(opportunityId, positionId)` |
| submissions | submissions | unique `participantId` (one submission per participant, reused on resubmission); `(opportunityId, status)`; `(volunteerId, status)` |
| media | media | unique `storageKey`; `ownerId`; `submissionId`; `portfolioItemId` |
| verifications | verifications | unique `submissionId`; `(organizationId, status)` |
| reviews | reviews | unique `submissionId`; `organizationId`; `volunteerId` |
| volunteer_experiences | experiences | unique `submissionId`; unique `verificationCode`; `(volunteerId, publicVisibility)` |
| portfolio_items | portfolio | `(volunteerId, order)` |
| notifications | notifications | `(userId, isRead, createdAt)` |
| reports | reports | `(status, createdAt)`; `(targetType, targetId)` |
| audit_logs | core | `(entityType, entityId)`; `actorId`; `createdAt` |
| status_histories | core | `(entityType, entityId, createdAt)` |
| system_settings | settings | unique `key` |

---

## 4. Derived data (no extra collection required)

- **Volunteer stats** (`volunteer_profiles.stats`): updated by event handler on verify (`completedTasks`, `verifiedExperiences`, `volunteerHours`).
- **Publish gate** (P2): count distinct opportunities of the organization that have at least one submission in `submitted` or `under_review`. Submissions still in `draft` never count. Locked when count ≥ `publishGate.maxPendingOpportunities`. Only `publish` is blocked; the account and existing opportunities are untouched. An opportunity stops counting once none of its submissions remain pending, so the gate unlocks when one whole opportunity is fully decided.
- **Reliability** (P2): from `submissions` + `verifications` timestamps (response rate, median time to decide). Anomaly flag compares the org's average of `reviews.ratings` with the platform average.
- Suggested (optional) addition: embed a `reliability` sub-document on `organizations`, refreshed by events + the nightly job, instead of computing on every request.

---

## 5. State machines and transactions

**opportunities:** `draft → published → in_progress → completed`; `published | in_progress → closed | cancelled`.
**applications:** `pending → accepted | rejected | withdrawn`; `accepted → withdrawn`.
**task_participants:** `accepted → active → completed`; `accepted | active → withdrawn | removed`. `accepted → active` is automatic (job at `startDate`); a participant accepted after the opportunity is already `in_progress` is created directly as `active`.
**submissions:** `draft → submitted → under_review → approved | rejected`; `rejected → draft` (edit) `→ submitted` again. Resubmission is unlimited on the same record; every rejection and its reason is kept in `status_histories`.
**verifications:** `pending → verified | rejected`.
**organizations.verificationStatus:** `pending → verified | rejected` (only `verified` organizations can publish).

**Accept application (transaction):**
1. Application must be `pending`, opportunity `published`.
2. `findOneAndUpdate` position with `filledCount < requiredCount` → `$inc filledCount`.
3. Application → `accepted`; insert `task_participants` (`accepted`, or `active` if the opportunity is already `in_progress`).
4. Status history + notification event.

**Verify submission (transaction):**
1. Submission must be `submitted` or `under_review`; caller is the account of the opportunity's organization.
2. Insert `verifications` (verified); submission → `approved`.
3. Participant → `completed`.
4. Insert `volunteer_experiences` (copies title/description/skills/duration, `evidenceIds`, generates `verificationCode`).
5. If `review` was sent, insert `reviews`.
6. Update `volunteer_profiles.stats`.
7. Status histories + notification.

**Reject submission:** verification `rejected`, submission `rejected`, reason stored; volunteer may edit and resubmit.

---

## 6. Access rules worth encoding as guards

- Guest: only `GET` on opportunities, talents, public profiles, organizations, `/verify/:code`, locations, skills.
- A volunteer only sees their own applications, participations, submissions, experiences.
- An organization only sees applications/participants/submissions of its own opportunities.
- An organization account acts only on resources whose `organizationId` matches its own organization (resolved from the token's user).
- Private media: owner, the organization that owns the opportunity, and admins only. Public profile and `/verify/:code` expose only `visibility = public` media.
- Suspended users are rejected at the auth guard; suspended organizations cannot publish.

---

## 7. Decisions (settled)

1. **Participant activation:** automatic. At `startDate` the opportunity becomes `in_progress` and its `accepted` participants become `active`. No `/start` route.
2. **Resubmission after rejection:** allowed, unlimited, same submission record; each rejection and reason kept in `status_histories`.
3. **Media storage:** Supabase Storage (free) behind `StorageProvider`. Images compressed client-side, ≤ 5 MB; documents (pdf) ≤ 5 MB; **videos are external links** (`media.type = link`, e.g. unlisted YouTube), not uploads. Cloudflare R2 is the fallback if a payment card becomes available.
4. **Publish gate:** counts **opportunities** that have at least one submission in `submitted` or `under_review`; threshold 3 in `system_settings` (`publishGate.maxPendingOpportunities`). Unlocks when a whole opportunity is fully decided. Drafts never count.
5. **Opportunity completion:** manual `complete` by the organization. Applying stops automatically at `applicationDeadline` (checked at apply time).
6. **Consent for people shown in media:** boolean `submissions.consentConfirmed`, confirmed by the volunteer at submit time (required when evidence includes image/video).
7. **Assumption kept:** only organizations with `verificationStatus = verified` can publish opportunities.

### Schema additions vs. the original design
- `organizations.userId` (ObjectId, unique): the account that owns the organization page.
- `submissions.consentConfirmed` (Boolean).
- `media.type` gains `link` (external video URL).

---

## 8. Suggested OpenSpec changes (in build order)

1. `foundation` — config, Mongoose setup, common guards/filters/pipes, StatusTransitionService, audit interceptor, settings, EventEmitter, throttler, internal jobs endpoint.
2. `auth-and-users` — auth, sessions, tokens, users, MailService, admin seed script.
3. `reference-data` — locations, skill categories, skills (+ seed scripts).
4. `volunteer-profiles` — profiles, skills, availability.
5. `organizations` — organizations and verification (single account per organization).
6. `opportunities` — opportunities, positions, lifecycle.
7. `applications-and-participation` — apply, accept/reject, participants.
8. `media` — image upload flow, external video links, storage provider, visibility.
8b. `notifications` — in-app only, driven by domain events (moved to P1).
9. `submissions-verification-experiences` — closes the core loop.
10. `public-discovery` — talents, public profiles, `/verify/:code`, recommended feed.
11. `trust-layer` — reviews, publish gate, reliability.
12. `portfolio`.
13. `admin-and-moderation` — admin routes, reports, audit logs.

---

## 9. Deferred (not in MVP): organization team members

- MVP: each organization page is one account. `organizations.userId` (unique) links the account to its organization. This is all organizations need; the `organization_members` collection is not created.
- Later, if needed: create `organization_members` (roles `owner | manager | reviewer`), add an invitation token type, add OrganizationMembersController and a membership guard, switch `/organizations/me/...` routes to `/organizations/:organizationId/...`, and migrate each existing organization by inserting an `owner` row from its `userId`.

---

## 10. Free-services stack (constraint: everything free, no payment card if possible)

Limits checked in September 2026; re-check at signup, free tiers change.

| Need | Service | Free limits | Consequence for the design |
|---|---|---|---|
| Database | MongoDB Atlas Free | 512 MB, 500 connections, transactions supported, 10 GB in/out per rolling 7 days | One free cluster per project; only metadata stored here |
| Backend hosting | Render Free web service | Sleeps after 15 min idle (about 1 min cold start), 750 instance hours/month, ephemeral disk | Jobs via `/internal/jobs/run`; no local file storage |
| Email | Brevo SMTP (fallback: Gmail SMTP app password, or Resend) | Brevo 300/day, no card; Resend 3,000/month and 100/day | `MailService` interface; `EMAIL_VERIFICATION_REQUIRED` flag |
| Media | Supabase Storage | Roughly 0.5–1 GB, 5 GB egress/month, 50 MB per file; project pauses after a week of inactivity | Images only; video as link; keep the project active (light storage call from the jobs tick) |
| Frontend | Vercel Hobby | As planned in the project document | — |
| Scheduling | Any free external scheduler | — | Calls `/internal/jobs/run` |

Rules that follow: no Redis, no queues, no push provider, no paid SMS. Rate limiting is in-memory, events are in-process, notifications are polled from MongoDB.
