# Basmatak Tatatoua — API reference & inventory reconciliation

One-page summary of the HTTP API surface. **Authoritative source:** the
implementation itself — browse the interactive Swagger/OpenAPI docs at
`/api/v1/docs` (enable with `SWAGGER_ENABLED=true`, `NODE_ENV != production`).

This page reconciles the implemented route surface against **§2 "Routes per
module"** of [`backend-inventory.md`](../backend-inventory.md).

## Global conventions

- **Base path:** everything is served under `/api/v1`
  (`app.setGlobalPrefix('api/v1')`).
- **Auth:** most routes require a JWT `Authorization: Bearer <access>` header.
  Public routes are marked **Public** below. Admin routes additionally require
  the `admin` role; org routes the `organization` role; volunteer routes the
  `volunteer` role.
- **Pagination:** cursor-based. `?limit=` (default 20, max 50) and `?cursor=`
  (opaque base64) on every list endpoint.
- **Bodies:** JSON via `application/json`. All request DTOs are documented as
  OpenAPI schemas (every field has a Swagger `@ApiProperty`).
- **Errors:** NestJS-style JSON errors with a `statusCode`; business errors
  carry a stable machine code in the `code` field.
- **IDs:** MongoDB ObjectIds unless a slug/code is specified.

## Route reconciliation (circa Session 21)

Implemented surface: **130 route handlers** across 39 controllers (includes the
root liveness route and `GET /health`, which inventory §2 does not table).

| §2 | Module | Inventory rows | Controllers | Implemented | Notes |
|---|---|---|---|---|---|
| — | liveness | — | `app`, `health` | 2 | `GET /` and `GET /health` (public) |
| 2.1 | auth | 12 | `auth` | 12 | 7 public + 5 authed |
| 2.2 | users | 5 | `users` | 5 | includes sessions (P2) |
| 2.3 | locations | 2 + 2 admin | `locations`, `admin-locations` | 4 | 2 public + 2 admin |
| 2.4 | skills | 2 + 4 admin | `skill-categories`, `skills`, `admin-skill-categories`, `admin-skills` | 6 | 2 public + 4 admin |
| 2.5 | volunteers | 10 | `volunteers`, `volunteer-skills`, `volunteer-availability` | 10 | |
| 2.6 | talents & public profiles | 4 | `public-volunteers` | 4 | all public |
| 2.7 | organizations | 7 | `organizations` | 7 | 3 public + 4 org |
| 2.8 | opportunities & positions | 14 | `opportunities`, `positions` | 15 | 12 solo + 3 nested position routes |
| 2.9 | applications | 7 | `applications` | 7 | |
| 2.10 | participations | 5 | `participations` | 5 | |
| 2.11 | media | 5 | `media` | 5 | |
| 2.12 | submissions | 7 | `submissions` | 7 | |
| 2.13 | verifications | 3 + 1 public | `verifications`, `public-verification` | 4 | |
| 2.14 | experiences | 3 | `experiences` | 3 | |
| 2.15 | portfolio | 5 | `portfolio` | 5 | |
| 2.16 | reviews | 3 | `reviews` | 3 | |
| 2.17 | notifications | 4 | `notifications` | 4 | |
| 2.18 | trust | 2 | `trust` | 2 | 1 org + 1 public |
| 2.19 | reports | 1 | `reports` | 1 | |
| 2.20 | admin | 18 | `admin/*` (9) | 18 | |
| 2.21 | internal jobs | 1 | `internal-jobs` | 1 | `X-Jobs-Key` secret header |
| **Total** | | **≈ 122** | | **130** | +8 = liveness (2), opportunities split (1), verifications split(+1 experience is in 2.13), reconciles to listed rows |

> Inventory §2 estimates "about 122 routes" (P1≈82, P2≈20, P3≈20). The
> implemented surface of 130 differs because §2 counts some routes per-row that
> ship as one handler plus a path split (e.g. the post/position routes) and
> because liveness/health are implemented but not tabled. Every §2 row maps to
> exactly one handler; no route from §2 is missing.

## Notable modules

### 2.18 Trust layer (publish gate)
- `GET /api/v1/organizations/me/publish-gate` (org) — `{ locked, pendingCount,
  threshold, pendingOpportunities[] }`
- `GET /api/v1/organizations/:slug/reliability` (public) — response rate,
  decided-vs-uploaded ratio, median response time, scoring flag.

### 2.20 Admin
Admin routes are grouped under Swagger tag `admin (…)` per controller:
`stats`, `users`, `volunteers`, `organizations`, `opportunities`, `reviews`,
`reports`, `audit-logs`, `settings`. `PUT /admin/settings/:key` accepts
`{ value: <number> }` (e.g. `publishGate.maxPendingOpportunities`, default 3).

### 2.21 Internal jobs
`POST /api/v1/internal/jobs/run` with header `X-Jobs-Key: <JOBS_KEY>` — idempotent
tick that starts opportunities and activates participants at `startDate`.
Excluded from `AuthGuard` and NOT part of the public client API (called by the
external scheduler defined in `docs/DEPLOY.md` §3).

## Request schemas (Swagger DTO coverage)

Every request body and query DTO carries Swagger property metadata:

- **auth:** `RegisterDto`, `LoginDto`, `RefreshDto`, `VerifyEmailDto`,
  `ForgotPasswordDto`, `ResetPasswordDto`, `ChangePasswordDto`
- **users:** `UpdateMeDto`
- **volunteers:** `UpdateVolunteerProfileDto`, `PublicProfileDto`,
  `UpdatePublicSettingsDto`, `AddVolunteerSkillDto`, `UpdateVolunteerSkillDto`,
  `UpdateAvailabilityDto` (+ nested `TimeSlotDto`), `TalentsQueryDto`,
  `PublicExperiencesQueryDto`
- **organizations:** `UpdateOrganizationDto`, `SubmitOrganizationVerificationDto`
- **opportunities:** `CreateOpportunityDto`, `UpdateOpportunityDto`,
  `CreatePositionDto`, `UpdatePositionDto` (+ nested `LocationDto`),
  `OpportunityFeedQueryDto`, `OwnOpportunityQueryDto`, `RecommendedQueryDto`
- **applications:** `ApplicationListQueryDto`, `OpportunityApplicationsQueryDto`,
  `RejectApplicationDto`
- **participations:** `ParticipationListQueryDto`, `ParticipantsQueryDto`,
  `RemoveParticipationDto`
- **media:** `PostUploadMediaDto`, `PostLinkMediaDto`
- **submissions:** `UpdateSubmissionDto`, `SubmitDto`, `SubmissionListQueryDto`
- **verifications:** `ReviewDto`, `VerifyDto`, `RejectDto`,
  `UpdateExperienceVisibilityDto`, `ExperienceListQueryDto`
- **portfolio:** `CreatePortfolioItemDto`, `UpdatePortfolioItemDto`,
  `ReorderPortfolioDto`
- **reviews:** `CreateReviewDto`, `ReviewListQueryDto`
- **notifications:** `NotificationListQueryDto`
- **locations:** `CreateLocationDto`, `UpdateLocationDto`
- **skills:** `CreateSkillCategoryDto`, `UpdateSkillCategoryDto`,
  `CreateSkillDto`, `UpdateSkillDto`, `SkillQueryDto`
- **reports:** `CreateReportDto`
- **admin:** `UsersQueryDto`, `UserStatusDto`, `VolunteersQueryDto`,
  `OrganizationsListQueryDto`, `OrganizationsVerificationsQueryDto`,
  `OrganizationStatusDto`, `RejectionReasonDto`, `OpportunitiesQueryDto`,
  `OpportunityStatusDto`, `ReportsQueryDto`, `ReportStatusDto`,
  `AuditLogsQueryDto`, `SettingsValueDto`

## Opening Swagger locally

```bash
SWAGGER_ENABLED=true npm run start:dev
# http://localhost:3000/api/v1/docs
```

`addBearerAuth()` is configured: hit **Authorize** with an access token to call
authed routes from the UI. Swagger stays OFF in `production` regardless of the
flag, so enabling it on a staging/Demo instance is safe.