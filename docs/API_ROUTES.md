# API routes - full reference

> Base URL: `/api/v1` (prefix each path below with it). Generated from the live OpenAPI spec
> (144 paths, 163 operations - verified against every controller).
> Auth: `[public]` needs no token; `[Bearer]` needs `Authorization: Bearer <accessToken>`.
> Error envelope everywhere: `{ statusCode, code, message, details? }` with UPPER_SNAKE `code`.
> Cursor pages: `{ items, nextCursor, limit, total, page?, pages? }`.

## Contents

- [activity](#activity)
- [admin (analytics)](#admin-analytics-)
- [admin (audit)](#admin-audit-)
- [admin (opportunities)](#admin-opportunities-)
- [admin (ops)](#admin-ops-)
- [admin (organizations)](#admin-organizations-)
- [admin (reports)](#admin-reports-)
- [admin (reviews)](#admin-reviews-)
- [admin (settings)](#admin-settings-)
- [admin (stats)](#admin-stats-)
- [admin (status-histories)](#admin-status-histories-)
- [admin (users)](#admin-users-)
- [admin (volunteers)](#admin-volunteers-)
- [applications](#applications)
- [auth](#auth)
- [core](#core)
- [experiences](#experiences)
- [favorites](#favorites)
- [internal](#internal)
- [locations](#locations)
- [locations (admin)](#locations-admin-)
- [media](#media)
- [notifications](#notifications)
- [opportunities](#opportunities)
- [opportunity-positions](#opportunity-positions)
- [organizations](#organizations)
- [participations](#participations)
- [portfolio](#portfolio)
- [reports](#reports)
- [reviews](#reviews)
- [skill-categories](#skill-categories)
- [skill-categories (admin)](#skill-categories-admin-)
- [skills](#skills)
- [skills (admin)](#skills-admin-)
- [submissions](#submissions)
- [trust](#trust)
- [users](#users)
- [verifications](#verifications)
- [verifications-public](#verifications-public)
- [volunteers](#volunteers)
- [volunteers-public](#volunteers-public)

---

## activity

### 1. `GET /api/v1/organizations/me/activity`

List the caller's organization activity (newest first)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 2. `GET /api/v1/volunteers/me/activity`

List the caller's volunteer activity (newest first)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


## admin (analytics)

### 3. `GET /api/v1/admin/analytics/overview`

Totals with deltas, activity, queue and medians

**Auth:** [Bearer]

**Responses**

- `200` - 


### 4. `GET /api/v1/admin/analytics/queue`

Attention totals per category plus maintenance

**Auth:** [Bearer]

**Responses**

- `200` - 


### 5. `GET /api/v1/admin/analytics/series`

Per-day UTC signups, applications, verifications

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `days` | query | no | number | Trailing days of per-day activity (1–90, default 30) |

**Responses**

- `200` - 


## admin (audit)

### 6. `GET /api/v1/admin/audit-logs`

Browse audit logs (actor/entity/date filters)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `actor` | query | no | string | Actor user id |
| `entityType` | query | no | string | Entity type, e.g. opportunity |
| `entityId` | query | no | string |  |
| `date` | query | no | string | ISO date filter |
| `q` | query | no | string | Action/path keyword |
| `sort` | query | no | enum("newest" | "oldest") |  |
| `format` | query | no | enum("json" | "csv") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


## admin (opportunities)

### 7. `PATCH /api/v1/admin/opportunities/{opportunityId}/status`

Force close/cancel an opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `status` | enum("closed" | "cancelled") | yes |  | `"closed"` |
| `reason` | string | no | Short reason recorded in status_histories | `"string"` |
| `notes` | string | no | Longer context recorded in status_histories | `"string"` |

**Example**

```json
{
  "status": "closed",
  "reason": "string",
  "notes": "string"
}
```

**Responses**

- `200` - 


### 8. `GET /api/v1/admin/opportunities`

List opportunities (newest-first)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Title/slug/registryId keyword |
| `status` | query | no | enum("draft" | "published" | "in_progress" | "completed" | "closed" | "cancelled") |  |
| `organizationId` | query | no | string |  |
| `sort` | query | no | enum("newest" | "oldest" | "title") |  |
| `format` | query | no | enum("json" | "csv") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


## admin (ops)

### 9. `POST /api/v1/admin/ops/maintenance`

Toggle runtime maintenance mode

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `enabled` | boolean | yes | Switch maintenance mode on or off | `true` |
| `message` | string | no | Neutral message shown on 503s and system status | `"string"` |

**Example**

```json
{
  "enabled": true,
  "message": "string"
}
```

**Responses**

- `200` - 


## admin (organizations)

### 10. `PATCH /api/v1/admin/organizations/verifications/{rowId}/assign`

Assign a verification dossier to an admin

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `rowId` | path | yes | string | The organization_verifications row id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `assignedAdminId` | string | yes | Admin user id taking ownership | `"string"` |

**Example**

```json
{
  "assignedAdminId": "string"
}
```

**Responses**

- `200` - 


### 11. `GET /api/v1/admin/organizations/verifications`

Moderator triage queue (default status=pending)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `status` | query | no | enum("pending" | "verified" | "rejected") |  |
| `assignedAdminId` | query | no | string | Assigned admin filter |
| `sort` | query | no | enum("oldest" | "newest") | FIFO triage order (oldest first by submittedAt) |
| `format` | query | no | enum("json" | "csv") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


### 12. `PATCH /api/v1/admin/organizations/{organizationId}/status`

Suspend or reinstate an organization account

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `organizationId` | path | yes | string | The organization id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `status` | enum("active" | "suspended") | yes |  | `"active"` |
| `reason` | string | no | Short reason recorded in status_histories | `"string"` |
| `notes` | string | no | Longer context recorded in status_histories | `"string"` |

**Example**

```json
{
  "status": "active",
  "reason": "string",
  "notes": "string"
}
```

**Responses**

- `200` - 


### 13. `POST /api/v1/admin/organizations/{organizationId}/verification/approve`

Approve the pending verification (F1 decision)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `organizationId` | path | yes | string | The organization id |

**Responses**

- `201` - 


### 14. `GET /api/v1/admin/organizations/{organizationId}/verification/latest`

Newest verification dossier for one organization

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `organizationId` | path | yes | string | The organization id |

**Responses**

- `200` - 


### 15. `POST /api/v1/admin/organizations/{organizationId}/verification/reject`

Reject the pending verification with a reason

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `organizationId` | path | yes | string | The organization id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `rejectionReason` | string | yes |  | `"Documents do not match the registry"` |

**Example**

```json
{
  "rejectionReason": "Documents do not match the registry"
}
```

**Responses**

- `201` - 


### 16. `GET /api/v1/admin/organizations`

List every organization

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Name/slug/registryId keyword |
| `type` | query | no | string | Organization type filter |
| `wilayaId` | query | no | string | Wilaya code filter |
| `municipalityId` | query | no | string | Municipality code filter |
| `verificationStatus` | query | no | enum("pending" | "verified" | "rejected") |  |
| `status` | query | no | enum("active" | "suspended" | "deleted") |  |
| `sort` | query | no | enum("newest" | "oldest" | "name") |  |
| `format` | query | no | enum("json" | "csv") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


## admin (reports)

### 17. `PATCH /api/v1/admin/reports/{reportId}/assign`

Assign a report to an admin

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `reportId` | path | yes | string | The report id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `assignedAdminId` | string | yes | Admin user id taking ownership | `"string"` |

**Example**

```json
{
  "assignedAdminId": "string"
}
```

**Responses**

- `200` - 


### 18. `PATCH /api/v1/admin/reports/{reportId}`

Resolve/dismiss a report (optionally with a moderation consequence)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `reportId` | path | yes | string | The report id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `status` | enum("in_review" | "resolved" | "dismissed") | yes |  | `"in_review"` |
| `resolution` | string | no | Resolution notes | `"string"` |
| `action` | object | no | Optional moderation consequence executed atomically with a `resolved` status (Session 20). Requires `resolution`. Without `action` the route resolves/dismisses exactly as before. | `{"type":"unpublish_opportunity","payload":{"userId":"string","message":"string"}}` |

**Example**

```json
{
  "status": "in_review",
  "resolution": "string",
  "action": {
    "type": "unpublish_opportunity",
    "payload": {
      "userId": "string",
      "message": "string"
    }
  }
}
```

**Responses**

- `200` - 


### 19. `GET /api/v1/admin/reports`

List reports (optional status filter)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `status` | query | no | enum("open" | "in_review" | "resolved" | "dismissed") |  |
| `targetType` | query | no | enum("opportunity" | "user" | "organization" | "review" | "submission") |  |
| `priority` | query | no | enum("low" | "normal" | "high") |  |
| `assignedAdminId` | query | no | string |  |
| `q` | query | no | string | Title/reason keyword |
| `from` | query | no | string | Created-at window start (ISO) |
| `to` | query | no | string | Created-at window end (ISO) |
| `sort` | query | no | enum("newest" | "oldest" | "priority") |  |
| `format` | query | no | enum("json" | "csv") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


## admin (reviews)

### 20. `PATCH /api/v1/admin/reviews/{reviewId}/hide`

Hide a review (excluded from reliability)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `reviewId` | path | yes | string | The review id |

**Responses**

- `200` - 


## admin (settings)

### 21. `PUT /api/v1/admin/settings/{key}`

Upsert a known setting by key

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `key` | path | yes | string | System settings key |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `value` | object | yes | Value stored under the setting key (shape validated per key by the settings service) | `3` |

**Example**

```json
{
  "value": 3
}
```

**Responses**

- `200` - 


### 22. `GET /api/v1/admin/settings`

List all system settings

**Auth:** [Bearer]

**Responses**

- `200` - 


## admin (stats)

### 23. `GET /api/v1/admin/stats/overview`

Dashboard counts, hours, verification rate, gates

**Auth:** [Bearer]

**Responses**

- `200` - 


## admin (status-histories)

### 24. `GET /api/v1/admin/status-histories`

Read status history for one entity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `entityType` | query | no | string | Entity type, e.g. user |
| `entityId` | query | no | string |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


## admin (users)

### 25. `POST /api/v1/admin/users/{userId}/notice`

Send a neutral system notice to a user

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `userId` | path | yes | string | The user id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `message` | string | yes | Neutral system-notice text | `"string"` |

**Example**

```json
{
  "message": "string"
}
```

**Responses**

- `201` - 


### 26. `PATCH /api/v1/admin/users/{userId}/status`

Suspend or reinstate a user account

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `userId` | path | yes | string | The user id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `status` | enum("active" | "suspended") | yes |  | `"active"` |
| `reason` | string | no | Short reason recorded in status_histories | `"string"` |
| `notes` | string | no | Longer context recorded in status_histories | `"string"` |

**Example**

```json
{
  "status": "active",
  "reason": "string",
  "notes": "string"
}
```

**Responses**

- `200` - 


### 27. `GET /api/v1/admin/users/{userId}`

User detail (no password hash)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `userId` | path | yes | string | The user id |

**Responses**

- `200` - 


### 28. `GET /api/v1/admin/users`

List users with role/status/email filters

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `role` | query | no | enum("volunteer" | "organization" | "admin") |  |
| `status` | query | no | enum("active" | "suspended" | "deleted") |  |
| `q` | query | no | string | Email/name keyword |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit (default 20, max 50) |
| `sort` | query | no | enum("newest" | "oldest") |  |
| `format` | query | no | enum("json" | "csv") |  |

**Responses**

- `200` - 


## admin (volunteers)

### 29. `GET /api/v1/admin/volunteers/{volunteerId}/experiences`

Latest verified engagement for one volunteer

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `volunteerId` | path | yes | string | The volunteer user id |

**Responses**

- `200` - 


### 30. `GET /api/v1/admin/volunteers`

List volunteer profiles joined with their users

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Username/name/email keyword |
| `wilayaId` | query | no | string | Wilaya code filter |
| `municipalityId` | query | no | string | Municipality code filter |
| `skillId` | query | no | string | Skill id(s), comma-separated |
| `from` | query | no | string | Created-at window start (ISO) |
| `to` | query | no | string | Created-at window end (ISO) |
| `sort` | query | no | enum("newest" | "oldest" | "name") |  |
| `format` | query | no | enum("json" | "csv") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `pageSize` | query | no | string | Alias of limit |

**Responses**

- `200` - 


## applications

### 31. `GET /api/v1/applications/me`

List the caller's own applications

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `status` | query | no | enum("pending" | "under_review" | "accepted" | "rejected" | "withdrawn") |  |
| `from` | query | no | string | Created-at lower bound (ISO) |
| `to` | query | no | string | Created-at upper bound (ISO) |
| `cursor` | query | no | string | Opaque base64 cursor from the previous page |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 32. `POST /api/v1/applications/{applicationId}/accept`

Accept an application (transaction)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `applicationId` | path | yes | string | The application id |

**Responses**

- `200` - 


### 33. `POST /api/v1/applications/{applicationId}/reject`

Reject an application with a reason

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `applicationId` | path | yes | string | The application id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `reason` | string | yes |  | `"Position already filled"` |

**Example**

```json
{
  "reason": "Position already filled"
}
```

**Responses**

- `200` - 


### 34. `POST /api/v1/applications/{applicationId}/start-review`

Move a pending application under review (org-owner only)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `applicationId` | path | yes | string | The application id |

**Responses**

- `200` - 


### 35. `POST /api/v1/applications/{applicationId}/withdraw`

Withdraw an application (accepted path is a transaction)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `applicationId` | path | yes | string | The application id |

**Responses**

- `200` - 


### 36. `GET /api/v1/applications/{applicationId}`

Application detail (own volunteer or owning org)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `applicationId` | path | yes | string | The application id |

**Responses**

- `200` - 


### 37. `GET /api/v1/opportunities/{opportunityId}/applications`

List an owned opportunity applications

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |
| `positionId` | query | no | string | Filter by embedded position id |
| `status` | query | no | enum("pending" | "under_review" | "accepted" | "rejected" | "withdrawn") |  |
| `cursor` | query | no | string | Opaque base64 cursor from the previous page |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 38. `POST /api/v1/opportunities/{opportunityId}/positions/{positionId}/applications`

Apply to an open position (cover message optional)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |
| `positionId` | path | yes | string | The position id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `message` | string | no | Optional cover message ("why I want to participate"), trimmed and stored on the application; immutable after apply | `"string"` |

**Example**

```json
{
  "message": "string"
}
```

**Responses**

- `201` - 


### 39. `GET /api/v1/organizations/me/applications`

Aggregate application inbox across the caller’s opportunities

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | query | no | string | Filter by a single opportunity |
| `status` | query | no | enum("pending" | "under_review" | "accepted" | "rejected" | "withdrawn") |  |
| `q` | query | no | string | Text search over the org’s own opportunity / position titles (caller-name search lands with the Session 17 name join) |
| `sort` | query | no | enum("newest" | "oldest") | Server-defined sort whitelist |
| `cursor` | query | no | string | Opaque base64 cursor from the previous page |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


## auth

### 40. `POST /api/v1/auth/change-password`

Change the current password, revoking other sessions

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `currentPassword` | string | yes | The current password | `"string"` |
| `newPassword` | string | yes |  | `"new-password"` |

**Example**

```json
{
  "currentPassword": "string",
  "newPassword": "new-password"
}
```

**Responses**

- `204` - 


### 41. `POST /api/v1/auth/forgot-password`

Initiate a password reset (always 204)

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `email` | string | yes |  | `"user@example.com"` |

**Example**

```json
{
  "email": "user@example.com"
}
```

**Responses**

- `204` - 


### 42. `POST /api/v1/auth/login`

Login with email and password

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `email` | string | yes |  | `"user@example.com"` |
| `password` | string | yes |  | `"s3cret-password"` |

**Example**

```json
{
  "email": "user@example.com",
  "password": "s3cret-password"
}
```

**Responses**

- `200` - 


### 43. `POST /api/v1/auth/logout-all`

Revoke every session of the caller

**Auth:** [Bearer]

**Responses**

- `204` - 


### 44. `POST /api/v1/auth/logout-others`

Revoke every session of the caller except the current one

**Auth:** [Bearer]

**Responses**

- `204` - 


### 45. `POST /api/v1/auth/logout`

Revoke the current session

**Auth:** [Bearer]

**Responses**

- `204` - 


### 46. `GET /api/v1/auth/me`

Current account (user + role, org block in S5)

**Auth:** [Bearer]

**Responses**

- `200` - 


### 47. `POST /api/v1/auth/refresh`

Rotate a refresh token into a new token pair

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `refreshToken` | string | yes | The refresh token issued at login/refresh | `"string"` |

**Example**

```json
{
  "refreshToken": "string"
}
```

**Responses**

- `200` - 


### 48. `POST /api/v1/auth/register/organization`

Register an organization account

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `email` | string | yes |  | `"user@example.com"` |
| `password` | string | yes |  | `"s3cret-password"` |
| `phone` | string | no | Optional international phone number | `"+213555123456"` |

**Example**

```json
{
  "email": "user@example.com",
  "password": "s3cret-password",
  "phone": "+213555123456"
}
```

**Responses**

- `201` - 


### 49. `POST /api/v1/auth/register/volunteer`

Register a volunteer account

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `email` | string | yes |  | `"user@example.com"` |
| `password` | string | yes |  | `"s3cret-password"` |
| `phone` | string | no | Optional international phone number | `"+213555123456"` |

**Example**

```json
{
  "email": "user@example.com",
  "password": "s3cret-password",
  "phone": "+213555123456"
}
```

**Responses**

- `201` - 


### 50. `POST /api/v1/auth/resend-verification`

Invalidate prior tokens and resend a verification email

**Auth:** [Bearer]

**Responses**

- `204` - 


### 51. `POST /api/v1/auth/reset-password`

Consume a reset token and set a new password

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `token` | string | yes | Password reset token from the email link | `"string"` |
| `newPassword` | string | yes |  | `"new-password"` |

**Example**

```json
{
  "token": "string",
  "newPassword": "new-password"
}
```

**Responses**

- `204` - 


### 52. `POST /api/v1/auth/verify-email`

Consume an email verification token

**Auth:** [public]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `token` | string | yes | Email verification token from the email link | `"string"` |

**Example**

```json
{
  "token": "string"
}
```

**Responses**

- `204` - 


## core

### 53. `GET /api/v1/health`

Service liveness check

**Auth:** [public]

**Responses**

- `200` - 


### 54. `GET /api/v1/system/status`

Public system status with maintenance flag

**Auth:** [public]

**Responses**

- `200` - 


### 55. `GET /api/v1`

Root liveness

**Auth:** [Bearer]

**Responses**

- `200` - 


## experiences

### 56. `GET /api/v1/experiences/me`

List the caller's own experiences

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `categoryId` | query | no | string |  |
| `skillId` | query | no | string |  |
| `from` | query | no | string | Created-at lower bound (ISO) |
| `to` | query | no | string | Created-at upper bound (ISO) |

**Responses**

- `200` - 


### 57. `GET /api/v1/experiences/{experienceId}/attestation`

Download the verified-experience attestation PDF

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `experienceId` | path | yes | string | The verified experience id |
| `lang` | query | no | enum("ar" | "en") | Certificate content language (default en; Arabic-script fidelity deferred) |

**Responses**

- `200` - 


### 58. `PATCH /api/v1/experiences/{experienceId}/visibility`

Toggle public/private visibility (own row)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `experienceId` | path | yes | string | The experience id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `publicVisibility` | enum("public" | "private") | yes |  | `"public"` |

**Example**

```json
{
  "publicVisibility": "public"
}
```

**Responses**

- `200` - 


### 59. `GET /api/v1/experiences/{experienceId}`

Experience detail (owning volunteer only)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `experienceId` | path | yes | string | The experience id |

**Responses**

- `200` - 


### 60. `GET /api/v1/organizations/me/experiences`

List verified experiences minted from the caller's own opportunities

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `q` | query | no | string | Literal match on title, verificationCode, or registryId |
| `opportunityId` | query | no | string |  |
| `visibility` | query | no | enum("public" | "private") |  |
| `sort` | query | no | enum("newest" | "oldest") |  |
| `format` | query | no | enum("csv") | Set to csv to stream the full filtered set as text/csv |

**Responses**

- `200` - 


## favorites

### 61. `GET /api/v1/favorites/counts`

The caller's per-type save totals

**Auth:** [Bearer]

**Responses**

- `200` - 


### 62. `GET /api/v1/favorites/lookup`

Batch card state ({ favorited, favoriteCount } per key)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `targetType` | query | yes | enum("opportunity" | "talent") | Target type for every requested key |
| `targetIds` | query | yes | string | Comma-separated keys (opportunity ObjectIds, or talent usernames); 1–50 |

**Responses**

- `200` - 


### 63. `DELETE /api/v1/favorites/opportunities/{id}`

Unsave an opportunity (idempotent)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string | Opportunity id |

**Responses**

- `204` - 


### 64. `POST /api/v1/favorites/opportunities/{id}`

Save an opportunity (idempotent)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string | Opportunity id |

**Responses**

- `201` - 


### 65. `DELETE /api/v1/favorites/talents/{username}`

Unsave a talent by username (idempotent)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `username` | path | yes | string | Volunteer username |

**Responses**

- `204` - 


### 66. `POST /api/v1/favorites/talents/{username}`

Save a talent by username (idempotent)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `username` | path | yes | string | Volunteer username |

**Responses**

- `201` - 


### 67. `GET /api/v1/favorites`

List the caller's saves (both target types)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `targetType` | query | no | enum("opportunity" | "talent") | Filter by target type |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


## internal

### 68. `POST /api/v1/internal/jobs/run`

Run the registered job handlers (idempotent tick)

**Auth:** [public]

**Responses**

- `200` - 


## locations

### 69. `GET /api/v1/locations/wilayas/{wilayaId}/municipalities`

List a wilaya's municipalities, ordered by code

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `wilayaId` | path | yes | string | Wilaya code (2 digits) |

**Responses**

- `200` - 


### 70. `GET /api/v1/locations/wilayas`

List all 58 wilayas, ordered by code

**Auth:** [public]

**Responses**

- `200` - 


## locations (admin)

### 71. `PATCH /api/v1/admin/locations/{id}`

Update a location's editable fields

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string | The location id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `nameAr` | string | no |  | `"الجزائر"` |
| `nameFr` | string | no |  | `"Alger"` |
| `legacyId` | string | no | Legacy administrative code | `"string"` |

**Example**

```json
{
  "nameAr": "الجزائر",
  "nameFr": "Alger",
  "legacyId": "string"
}
```

**Responses**

- `200` - 


### 72. `POST /api/v1/admin/locations`

Create a wilaya or municipality

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `code` | string | yes |  | `"16"` |
| `type` | enum("wilaya" | "municipality") | yes |  | `"wilaya"` |
| `parentCode` | string | no | Required when type=municipality | `"16"` |
| `nameAr` | string | yes |  | `"الجزائر"` |
| `nameFr` | string | yes |  | `"Alger"` |
| `legacyId` | string | no | Legacy administrative code | `"string"` |

**Example**

```json
{
  "code": "16",
  "type": "wilaya",
  "parentCode": "16",
  "nameAr": "الجزائر",
  "nameFr": "Alger",
  "legacyId": "string"
}
```

**Responses**

- `201` - 


## media

### 73. `POST /api/v1/media/links`

Register an external link as media

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `url` | string | yes | External URL (video link, e.g. unlisted YouTube) | `"https://www.youtube.com/watch?v=abc123"` |
| `purpose` | enum("avatar" | "organization_logo" | "verification_document" | "submission_evidence" | "portfolio_item" | "opportunity_cover" | "organization_cover" | "organization_document") | yes |  | `"avatar"` |
| `visibility` | enum("public" | "private") | no |  | `"private"` |

**Example**

```json
{
  "url": "https://www.youtube.com/watch?v=abc123",
  "purpose": "avatar",
  "visibility": "private"
}
```

**Responses**

- `201` - 


### 74. `POST /api/v1/media/uploads`

Request a presigned upload URL (intent)

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `filename` | string | yes | Original file name | `"avatar.jpg"` |
| `mimeType` | enum("image/jpeg" | "image/png" | "image/webp" | "application/pdf") | yes | Upload intent type | `"image/jpeg"` |
| `size` | number | yes | Advisory size in bytes (server re-verifies on confirm) | `1048576` |
| `purpose` | enum("avatar" | "organization_logo" | "verification_document" | "submission_evidence" | "portfolio_item" | "opportunity_cover" | "organization_cover" | "organization_document") | yes |  | `"avatar"` |
| `visibility` | enum("public" | "private") | no |  | `"private"` |

**Example**

```json
{
  "filename": "avatar.jpg",
  "mimeType": "image/jpeg",
  "size": 1048576,
  "purpose": "avatar",
  "visibility": "private"
}
```

**Responses**

- `201` - 


### 75. `POST /api/v1/media/{mediaId}/confirm`

Confirm an upload by re-reading storage metadata

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `mediaId` | path | yes | string | The media id |

**Responses**

- `200` - 


### 76. `DELETE /api/v1/media/{mediaId}`

Soft-delete owned media (F6 guard)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `mediaId` | path | yes | string | The media id |

**Responses**

- `204` - 


### 77. `GET /api/v1/media/{mediaId}`

Read media metadata + signed URL (visibility-gated)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `mediaId` | path | yes | string | The media id |

**Responses**

- `200` - 


## notifications

### 78. `GET /api/v1/notifications/preferences`

Get the caller's notification preferences (lazily seeded)

**Auth:** [Bearer]

**Responses**

- `200` - 


### 79. `PATCH /api/v1/notifications/preferences`

Update the caller's notification preferences

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|


**Example**

```json
{}
```

**Responses**

- `200` - 


### 80. `POST /api/v1/notifications/read-all`

Mark all of the caller's notifications read

**Auth:** [Bearer]

**Responses**

- `200` - 


### 81. `GET /api/v1/notifications/unread-count`

Count the caller's unread notifications

**Auth:** [Bearer]

**Responses**

- `200` - 


### 82. `PATCH /api/v1/notifications/{notificationId}/read`

Mark one notification read

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `notificationId` | path | yes | string | The notification id |

**Responses**

- `200` - 


### 83. `GET /api/v1/notifications`

List the caller's notifications (newest first)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


## opportunities

### 84. `GET /api/v1/opportunities/recommended`

Recommended feed for the volunteer (rule-based scoring)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 85. `GET /api/v1/opportunities/{idOrSlug}`

Public opportunity detail by id or slug

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `idOrSlug` | path | yes | string | Opportunity id or slug |

**Responses**

- `200` - 


### 86. `POST /api/v1/opportunities/{opportunityId}/cancel`

Cancel an opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Responses**

- `200` - 


### 87. `POST /api/v1/opportunities/{opportunityId}/close`

Close an opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Responses**

- `200` - 


### 88. `POST /api/v1/opportunities/{opportunityId}/complete`

Complete an in_progress opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Responses**

- `200` - 


### 89. `POST /api/v1/opportunities/{opportunityId}/publish`

Publish a draft (verified org + gate)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Responses**

- `200` - 


### 90. `DELETE /api/v1/opportunities/{opportunityId}`

Delete a draft opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Responses**

- `204` - 


### 91. `PATCH /api/v1/opportunities/{opportunityId}`

Update an owned opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | no |  | `"Ramadan food distribution"` |
| `description` | string | no |  | `"Help distribute meal boxes in Algiers"` |
| `categoryId` | string | no |  | `"string"` |
| `startDate` | string | no | ISO date | `"string"` |
| `endDate` | string | no | ISO date; must not precede startDate | `"string"` |
| `durationMinutes` | number | no | Real duration in minutes (positive int) | `1` |
| `mode` | enum("onsite" | "remote" | "hybrid") | no | Participation mode (pre-publish only) | `"onsite"` |
| `coverMediaId` | string | no | Cover media id (purpose opportunity_cover) | `"string"` |
| `prerequisites` | array<string> | no | Prerequisites for volunteers (pre-publish only) | `["string"]` |
| `applicationDeadline` | string | no | ISO date (forward-only once published) | `"string"` |
| `location` | object | no |  | `{"wilayaId":"16","municipalityId":"1601","coordinates":[3.05,36.75]}` |

**Example**

```json
{
  "title": "Ramadan food distribution",
  "description": "Help distribute meal boxes in Algiers",
  "categoryId": "string",
  "startDate": "string",
  "endDate": "string",
  "durationMinutes": 1,
  "mode": "onsite",
  "coverMediaId": "string",
  "prerequisites": [
    "string"
  ],
  "applicationDeadline": "string",
  "location": {
    "wilayaId": "16",
    "municipalityId": "1601",
    "coordinates": [
      3.05,
      36.75
    ]
  }
}
```

**Responses**

- `200` - 


### 92. `GET /api/v1/opportunities`

Public feed (published only, cursor paginated)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Keyword on title/description |
| `categoryId` | query | no | string | Skill category id(s), comma-separated for multi-select |
| `skillId` | query | no | string | Skill id(s), comma-separated for multi-select |
| `wilayaId` | query | no | string | Wilaya code(s), comma-separated for multi-select |
| `municipalityId` | query | no | string | Municipality code(s), comma-separated for multi-select |
| `from` | query | no | string | Start-date lower bound (ISO) |
| `to` | query | no | string | Start-date upper bound (ISO) |
| `hasOpenPositions` | query | no | boolean | Only opportunities with at least one open seat |
| `nearMe` | query | no | enum("me") | Restrict to the caller volunteer wilaya (`me` only) |
| `sort` | query | no | enum("newest" | "oldest" | "deadline_asc" | "startDate_asc") | Server-defined sort whitelist |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 93. `POST /api/v1/organizations/me/opportunities/{id}/duplicate`

Duplicate an owned opportunity as a new draft

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string |  |

**Responses**

- `201` - 


### 94. `GET /api/v1/organizations/me/opportunities/{id}`

Read one own opportunity (any status, incl. drafts)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string |  |

**Responses**

- `200` - 


### 95. `GET /api/v1/organizations/me/opportunities`

List the caller's own opportunities (all statuses)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `status` | query | no | enum("draft" | "published" | "in_progress" | "completed" | "closed" | "cancelled") | Filter by opportunity status |
| `q` | query | no | string | Title/location/skill keyword (own rows) |
| `sort` | query | no | enum("newest" | "oldest") | Server-defined sort whitelist |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 96. `POST /api/v1/organizations/me/opportunities`

Create an opportunity draft with positions

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | yes |  | `"Ramadan food distribution"` |
| `description` | string | yes |  | `"Help distribute meal boxes in Algiers"` |
| `categoryId` | string | no | Skill category id | `"string"` |
| `startDate` | string | no | ISO date; past starts auto-start (job) | `"string"` |
| `endDate` | string | no | ISO date; must not precede startDate | `"string"` |
| `durationMinutes` | number | no | Real duration in minutes (positive int) | `1` |
| `mode` | enum("onsite" | "remote" | "hybrid") | no | Participation mode | `"onsite"` |
| `coverMediaId` | string | no | Cover media id (purpose opportunity_cover) | `"string"` |
| `prerequisites` | array<string> | no | Prerequisites for volunteers | `["string"]` |
| `applicationDeadline` | string | no | Last day applications are accepted | `"string"` |
| `location` | object | no |  | `{"wilayaId":"16","municipalityId":"1601","coordinates":[3.05,36.75]}` |
| `positions` | array<object> | no |  | `[{"title":"Distribute hygiene kits","description":"Help 3 families in Algiers","requiredCount":3,"requiredSkills":["string"],"deliverables":["string"],"startAt":"string"}]` |

**Example**

```json
{
  "title": "Ramadan food distribution",
  "description": "Help distribute meal boxes in Algiers",
  "categoryId": "string",
  "startDate": "string",
  "endDate": "string",
  "durationMinutes": 1,
  "mode": "onsite",
  "coverMediaId": "string",
  "prerequisites": [
    "string"
  ],
  "applicationDeadline": "string",
  "location": {
    "wilayaId": "16",
    "municipalityId": "1601",
    "coordinates": [
      3.05,
      36.75
    ]
  },
  "positions": [
    {
      "title": "Distribute hygiene kits",
      "description": "Help 3 families in Algiers",
      "requiredCount": 3,
      "requiredSkills": [],
      "deliverables": [],
      "startAt": "string"
    }
  ]
}
```

**Responses**

- `201` - 


### 97. `GET /api/v1/organizations/{slug}/opportunities`

Public opportunities of an organization (per-status archive)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `slug` | path | yes | string | Organization slug |
| `status` | query | no | enum("published" | "completed" | "closed") | Opportunity status filter (default published) |

**Responses**

- `200` - 


## opportunity-positions

### 98. `DELETE /api/v1/opportunities/{opportunityId}/positions/{positionId}`

Delete a position with no applications/seats

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |
| `positionId` | path | yes | string | The position id |

**Responses**

- `200` - 


### 99. `PATCH /api/v1/opportunities/{opportunityId}/positions/{positionId}`

Edit a position (requiredCount >= filledCount)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |
| `positionId` | path | yes | string | The position id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | no |  | `"Distribute hygiene kits"` |
| `description` | string | no |  | `"Help 3 families in Algiers"` |
| `requiredCount` | number | no | Seats; never below the filled count | `1` |
| `requiredSkills` | array<string> | no | Skill ids required for this position | `["string"]` |
| `deliverables` | array<string> | no | Expected contributions / deliverables for this position | `["string"]` |
| `startAt` | string | no | Optional per-position schedule start | `"string"` |

**Example**

```json
{
  "title": "Distribute hygiene kits",
  "description": "Help 3 families in Algiers",
  "requiredCount": 1,
  "requiredSkills": [
    "string"
  ],
  "deliverables": [
    "string"
  ],
  "startAt": "string"
}
```

**Responses**

- `200` - 


### 100. `POST /api/v1/opportunities/{opportunityId}/positions`

Add a position to an owned opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | yes |  | `"Distribute hygiene kits"` |
| `description` | string | no |  | `"Help 3 families in Algiers"` |
| `requiredCount` | number | yes | Number of seats | `3` |
| `requiredSkills` | array<string> | no | Skill ids required for this position | `["string"]` |
| `deliverables` | array<string> | no | Expected contributions / deliverables for this position | `["string"]` |
| `startAt` | string | no | Optional per-position schedule start | `"string"` |

**Example**

```json
{
  "title": "Distribute hygiene kits",
  "description": "Help 3 families in Algiers",
  "requiredCount": 3,
  "requiredSkills": [
    "string"
  ],
  "deliverables": [
    "string"
  ],
  "startAt": "string"
}
```

**Responses**

- `200` - 


## organizations

### 101. `GET /api/v1/organizations/me/participants`

Cross-opportunity participant roster of the caller's org

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Match on volunteer name/username, opportunity title, or position title |
| `opportunityId` | query | no | string | Scope to one owned opportunity (ObjectId) |
| `status` | query | no | enum("accepted" | "active" | "completed" | "withdrawn" | "removed") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 102. `GET /api/v1/organizations/me/profile-completion`

Profile-completion checklist of the caller's org

**Auth:** [Bearer]

**Responses**

- `200` - 


### 103. `GET /api/v1/organizations/me/stats`

Private dashboard aggregates of the caller's org

**Auth:** [Bearer]

**Responses**

- `200` - 


### 104. `GET /api/v1/organizations/me/verification`

Latest verification status of the caller's organization

**Auth:** [Bearer]

**Responses**

- `200` - 


### 105. `POST /api/v1/organizations/me/verification`

Submit (or resubmit) verification documents

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `documents` | array<string> | yes | Verification document media ids (at least one) | `["string"]` |

**Example**

```json
{
  "documents": [
    "string"
  ]
}
```

**Responses**

- `201` - 


### 106. `DELETE /api/v1/organizations/me`

Delete the caller's own organization account

**Auth:** [Bearer]

**Responses**

- `200` - 


### 107. `GET /api/v1/organizations/me`

Read the caller's own organization

**Auth:** [Bearer]

**Responses**

- `200` - 


### 108. `PATCH /api/v1/organizations/me`

Update the caller's own organization

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `nameAr` | string | no |  | `"جمعية الأمل"` |
| `nameFr` | string | no |  | `"Association El-Amel"` |
| `description` | string | no |  | `"Volunteer charity in Algiers"` |
| `logoMediaId` | string | no | Own media id | `"string"` |
| `coverMediaId` | string | no | Cover media id (purpose organization_cover) | `"string"` |
| `type` | string | no | Organization type (free-form short text) | `"Association"` |
| `registrationNumber` | string | no |  | `"string"` |
| `location` | object | no |  | `{"wilayaId":"16","municipalityId":"1601","address":"string"}` |
| `website` | string | no |  | `"https://example.org"` |
| `foundedYear` | number | no |  | `2018` |
| `contact` | object | no |  | `{"email":"contact@example.org","phone":"+213555123456"}` |
| `focusDisciplines` | array<string> | no | Skill-category refs backing the focus-disciplines chips | `["string"]` |
| `operatingScope` | string | no | Operating scope (free-form short text) | `"Algiers and surroundings"` |
| `publicProfile` | object | no |  | `{"enabled":true}` |
| `annualReportMediaId` | string | no | Optional annual-report attachment (purpose organization_document, no workflow) | `"string"` |

**Example**

```json
{
  "nameAr": "جمعية الأمل",
  "nameFr": "Association El-Amel",
  "description": "Volunteer charity in Algiers",
  "logoMediaId": "string",
  "coverMediaId": "string",
  "type": "Association",
  "registrationNumber": "string",
  "location": {
    "wilayaId": "16",
    "municipalityId": "1601",
    "address": "string"
  },
  "website": "https://example.org",
  "foundedYear": 2018,
  "contact": {
    "email": "contact@example.org",
    "phone": "+213555123456"
  },
  "focusDisciplines": [
    "string"
  ],
  "operatingScope": "Algiers and surroundings",
  "publicProfile": {
    "enabled": true
  },
  "annualReportMediaId": "string"
}
```

**Responses**

- `200` - 


### 109. `GET /api/v1/organizations/{slug}`

Public organization profile by slug

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `slug` | path | yes | string | Organization slug |

**Responses**

- `200` - 


### 110. `GET /api/v1/organizations`

List verified, active organizations

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Bounded public search (name/slug) |
| `page` | query | no | string | Legacy roadmap `page` input — accepted but ignored; pagination stays cursor-based and `page` is returned as response metadata |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


## participations

### 111. `GET /api/v1/opportunities/{opportunityId}/participants`

List active participants of an owned opportunity

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `opportunityId` | path | yes | string | The opportunity id |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 112. `GET /api/v1/participations/me`

List the caller's own participations

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `status` | query | no | enum("accepted" | "active" | "completed" | "withdrawn" | "removed") |  |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 113. `POST /api/v1/participations/{participationId}/remove`

Remove a participant with a reason (seat stays allocated)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `participationId` | path | yes | string | The participation id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `reason` | string | yes |  | `"Failed to reach the volunteer"` |

**Example**

```json
{
  "reason": "Failed to reach the volunteer"
}
```

**Responses**

- `200` - 


### 114. `POST /api/v1/participations/{participationId}/withdraw`

Withdraw from a task (frees the seat, transaction)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `participationId` | path | yes | string | The participation id |

**Responses**

- `200` - 


### 115. `GET /api/v1/participations/{participationId}`

Participation detail (own volunteer or owning org)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `participationId` | path | yes | string | The participation id |

**Responses**

- `200` - 


## portfolio

### 116. `PUT /api/v1/portfolio/me/order`

Atomically reorder the whole portfolio (Mongo batch)

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `itemIds` | array<string> | yes | All item ids in the desired display order | `["string"]` |

**Example**

```json
{
  "itemIds": [
    "string"
  ]
}
```

**Responses**

- `200` - 


### 117. `GET /api/v1/portfolio/me`

List the caller's own curated portfolio items

**Auth:** [Bearer]

**Responses**

- `200` - 


### 118. `POST /api/v1/portfolio/me`

Create a portfolio item with media linkage

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | yes |  | `"Beach cleanup 2026"` |
| `description` | string | no |  | `"Photo of the team at work"` |
| `mediaIds` | array<string> | no | Own media ids (max 50) | `["string"]` |
| `visibility` | enum("public" | "private") | no |  | `"private"` |
| `typeLabel` | string | no | Short work-sample type label (max 40) | `"Audio"` |
| `tags` | array<string> | no | Tags shown on the work-sample card (max 10, each max 30) | `["string"]` |

**Example**

```json
{
  "title": "Beach cleanup 2026",
  "description": "Photo of the team at work",
  "mediaIds": [
    "string"
  ],
  "visibility": "private",
  "typeLabel": "Audio",
  "tags": [
    "string"
  ]
}
```

**Responses**

- `201` - 


### 119. `DELETE /api/v1/portfolio/{itemId}`

Delete an owned item and clear its media linkage

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `itemId` | path | yes | string | The portfolio item id |

**Responses**

- `204` - 


### 120. `PATCH /api/v1/portfolio/{itemId}`

Update an owned portfolio item

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `itemId` | path | yes | string | The portfolio item id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | no |  | `"Beach cleanup 2026"` |
| `description` | string | no |  | `"Photo of the team at work"` |
| `mediaIds` | array<string> | no | Own media ids (max 50) | `["string"]` |
| `visibility` | enum("public" | "private") | no |  | `"private"` |
| `typeLabel` | string | no | Short work-sample type label (max 40) | `"Audio"` |
| `tags` | array<string> | no | Tags shown on the work-sample card (max 10, each max 30) | `["string"]` |

**Example**

```json
{
  "title": "Beach cleanup 2026",
  "description": "Photo of the team at work",
  "mediaIds": [
    "string"
  ],
  "visibility": "private",
  "typeLabel": "Audio",
  "tags": [
    "string"
  ]
}
```

**Responses**

- `200` - 


## reports

### 121. `POST /api/v1/reports`

Report an entity (any logged-in role)

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `targetType` | enum("opportunity" | "user" | "organization" | "review" | "submission") | yes |  | `"opportunity"` |
| `targetId` | string | yes | Target entity id | `"string"` |
| `reason` | string | yes |  | `"Inappropriate content"` |
| `description` | string | no | Longer context for moderators | `"string"` |
| `title` | string | no | Moderator-facing title | `"string"` |
| `priority` | enum("low" | "normal" | "high") | no |  | `"normal"` |

**Example**

```json
{
  "targetType": "opportunity",
  "targetId": "string",
  "reason": "Inappropriate content",
  "description": "string",
  "title": "string",
  "priority": "normal"
}
```

**Responses**

- `201` - 


## reviews

### 122. `GET /api/v1/organizations/me/reviews`

Reviews the caller's organization has given

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 123. `POST /api/v1/submissions/{submissionId}/review`

Review a verified submission (owning organization)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `rating` | number | yes | 1-5 rating | `5` |
| `comment` | string | no |  | `"Punctual and careful"` |

**Example**

```json
{
  "rating": 5,
  "comment": "Punctual and careful"
}
```

**Responses**

- `201` - 


### 124. `GET /api/v1/volunteers/me/reviews`

Reviews the caller has received

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 125. `GET /api/v1/volunteers/{username}/reviews`

Public reviews of a volunteer (visible rows only)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `username` | path | yes | string | Volunteer username |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


## skill-categories

### 126. `GET /api/v1/skill-categories`

List active skill categories, ordered by order

**Auth:** [public]

**Responses**

- `200` - 


## skill-categories (admin)

### 127. `PATCH /api/v1/admin/skill-categories/{id}`

Update a skill category (active:false deactivates)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string | The skill category id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `nameAr` | string | no |  | `"صحة وإسعافات أولية"` |
| `nameFr` | string | no |  | `"First Aid & Health"` |
| `order` | number | no | Order in the list | `1` |
| `active` | boolean | no | Deactivate instead of delete | `true` |

**Example**

```json
{
  "nameAr": "صحة وإسعافات أولية",
  "nameFr": "First Aid & Health",
  "order": 1,
  "active": true
}
```

**Responses**

- `200` - 


### 128. `POST /api/v1/admin/skill-categories`

Create a skill category (slug generated server-side)

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `nameAr` | string | yes |  | `"صحة وإسعافات أولية"` |
| `nameFr` | string | yes |  | `"First Aid & Health"` |
| `order` | number | yes | Order in the list | `1` |

**Example**

```json
{
  "nameAr": "صحة وإسعافات أولية",
  "nameFr": "First Aid & Health",
  "order": 1
}
```

**Responses**

- `201` - 


## skills

### 129. `GET /api/v1/skills`

List active skills, filter by category or text

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `categoryId` | query | no | string | Skill category id |
| `q` | query | no | string | Keyword on skill names |

**Responses**

- `200` - 


## skills (admin)

### 130. `PATCH /api/v1/admin/skills/{id}`

Update a skill (active:false deactivates)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `id` | path | yes | string | The skill id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `nameAr` | string | no |  | `"إسعافات أولية"` |
| `nameFr` | string | no |  | `"First aid"` |
| `order` | number | no | Order within the category | `1` |
| `active` | boolean | no | Deactivate instead of delete | `true` |
| `categoryId` | string | no | Owning skill category | `"string"` |

**Example**

```json
{
  "nameAr": "إسعافات أولية",
  "nameFr": "First aid",
  "order": 1,
  "active": true,
  "categoryId": "string"
}
```

**Responses**

- `200` - 


### 131. `POST /api/v1/admin/skills`

Create a skill (slug generated server-side)

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `nameAr` | string | yes |  | `"إسعافات أولية"` |
| `nameFr` | string | yes |  | `"First aid"` |
| `order` | number | yes | Order within the category | `1` |
| `categoryId` | string | yes | Owning skill category | `"string"` |

**Example**

```json
{
  "nameAr": "إسعافات أولية",
  "nameFr": "First aid",
  "order": 1,
  "categoryId": "string"
}
```

**Responses**

- `201` - 


## submissions

### 132. `GET /api/v1/organizations/me/submissions`

Verification inbox of the caller organization

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `status` | query | no | string | Submission status(es); single or comma-separated multi-status (e.g. submitted,under_review) |
| `opportunityId` | query | no | string |  |
| `q` | query | no | string | Text search over title, description and deliverable titles (org inbox) |
| `format` | query | no | enum("image" | "video" | "document" | "link") | Filter by evidence format (image, video, document, link) |
| `sort` | query | no | enum("newest" | "oldest") | Server-defined sort whitelist |

**Responses**

- `200` - 


### 133. `POST /api/v1/participations/{participationId}/submissions`

Create a draft submission for an owned participation

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `participationId` | path | yes | string | The participation id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | no | Optional contribution title | `"string"` |

**Example**

```json
{
  "title": "string"
}
```

**Responses**

- `201` - 


### 134. `GET /api/v1/submissions/me`

List the caller's own submissions

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |
| `status` | query | no | string | Submission status(es); single or comma-separated multi-status (e.g. submitted,under_review) |
| `opportunityId` | query | no | string |  |
| `q` | query | no | string | Text search over title, description and deliverable titles (org inbox) |
| `format` | query | no | enum("image" | "video" | "document" | "link") | Filter by evidence format (image, video, document, link) |
| `sort` | query | no | enum("newest" | "oldest") | Server-defined sort whitelist |

**Responses**

- `200` - 


### 135. `POST /api/v1/submissions/{submissionId}/start-review`

Move a submitted submission to under_review (owning org)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Responses**

- `200` - 


### 136. `POST /api/v1/submissions/{submissionId}/submit`

Submit a draft (description, evidence, consent rules)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `consentConfirmed` | boolean | no | Consent for people shown in evidence media | `true` |

**Example**

```json
{
  "consentConfirmed": true
}
```

**Responses**

- `200` - 


### 137. `GET /api/v1/submissions/{submissionId}`

Submission detail (own volunteer or owning organization)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Responses**

- `200` - 


### 138. `PATCH /api/v1/submissions/{submissionId}`

Edit a draft (rejected returns to draft)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `title` | string | no | Contribution title | `"string"` |
| `description` | string | no | Work description | `"string"` |
| `evidence` | array<string> | no | Evidence media ids (max 50) | `["string"]` |
| `consentConfirmed` | boolean | no | Consent for people shown in media (required when evidence includes image/video) | `true` |

**Example**

```json
{
  "title": "string",
  "description": "string",
  "evidence": [
    "string"
  ],
  "consentConfirmed": true
}
```

**Responses**

- `200` - 


## trust

### 139. `GET /api/v1/organizations/me/publish-gate`

Caller's organization publish-gate state

**Auth:** [Bearer]

**Responses**

- `200` - 


### 140. `GET /api/v1/organizations/{slug}/reliability`

Public reliability metrics by organization slug

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `slug` | path | yes | string | Organization slug |

**Responses**

- `200` - 


## users

### 141. `DELETE /api/v1/users/me/sessions/{sessionId}`

Revoke one of the caller's own sessions

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `sessionId` | path | yes | string | The session id |

**Responses**

- `204` - 


### 142. `GET /api/v1/users/me/sessions`

List the caller's own active sessions

**Auth:** [Bearer]

**Responses**

- `200` - 


### 143. `DELETE /api/v1/users/me`

Soft delete own account and revoke all sessions

**Auth:** [Bearer]

**Responses**

- `204` - 


### 144. `GET /api/v1/users/me`

Read own account

**Auth:** [Bearer]

**Responses**

- `200` - 


### 145. `PATCH /api/v1/users/me`

Update own contact fields (email/phone only)

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `email` | string | no |  | `"new@example.com"` |
| `phone` | string | no |  | `"+213555123456"` |

**Example**

```json
{
  "email": "new@example.com",
  "phone": "+213555123456"
}
```

**Responses**

- `200` - 


## verifications

### 146. `POST /api/v1/submissions/{submissionId}/reject`

Reject an owned submission with a reason

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `reason` | string | yes |  | `"Evidence does not match the deliverable"` |

**Example**

```json
{
  "reason": "Evidence does not match the deliverable"
}
```

**Responses**

- `200` - 


### 147. `POST /api/v1/submissions/{submissionId}/verify`

Verify (approve) an owned submission

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `submissionId` | path | yes | string | The submission id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `notes` | string | no |  | `"Verified on site"` |
| `review` | object | no | Optional in-transaction review | `{"rating":5,"comment":"Great work"}` |

**Example**

```json
{
  "notes": "Verified on site",
  "review": {
    "rating": 5,
    "comment": "Great work"
  }
}
```

**Responses**

- `200` - 


### 148. `GET /api/v1/verifications/{verificationId}`

Verification decision detail (own volunteer or owning org)

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `verificationId` | path | yes | string | The verification id |

**Responses**

- `200` - 


## verifications-public

### 149. `GET /api/v1/verify/{verificationCode}`

Public proof summary for a verification code

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `verificationCode` | path | yes | string | Verification code from the experience completion email |

**Responses**

- `200` - 


## volunteers

### 150. `GET /api/v1/volunteers/me/availability`

Read own weekly availability

**Auth:** [Bearer]

**Responses**

- `200` - 


### 151. `PUT /api/v1/volunteers/me/availability`

Replace own weekly availability

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `monday` | array<object> | yes | Monday slots | `[{}]` |
| `tuesday` | array<object> | yes | Tuesday slots | `[{}]` |
| `wednesday` | array<object> | yes | Wednesday slots | `[{}]` |
| `thursday` | array<object> | yes | Thursday slots | `[{}]` |
| `friday` | array<object> | yes | Friday slots | `[{}]` |
| `saturday` | array<object> | yes | Saturday slots | `[{}]` |
| `sunday` | array<object> | yes | Sunday slots | `[{}]` |

**Example**

```json
{
  "monday": [
    {}
  ],
  "tuesday": [
    {}
  ],
  "wednesday": [
    {}
  ],
  "thursday": [
    {}
  ],
  "friday": [
    {}
  ],
  "saturday": [
    {}
  ],
  "sunday": [
    {}
  ]
}
```

**Responses**

- `200` - 


### 152. `GET /api/v1/volunteers/me/dashboard`

Read own volunteer dashboard

**Auth:** [Bearer]

**Responses**

- `200` - 


### 153. `PATCH /api/v1/volunteers/me/public-settings`

Update public-profile privacy flags

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `publicProfile` | object | yes |  | `{"enabled":true,"showAvatar":true,"showBiography":true,"showLocation":true,"showSkills":true,"showExperiences":true,"showAvailability":true,"showPortfolio":true,"showStats":true}` |

**Example**

```json
{
  "publicProfile": {
    "enabled": true,
    "showAvatar": true,
    "showBiography": true,
    "showLocation": true,
    "showSkills": true,
    "showExperiences": true,
    "showAvailability": true,
    "showPortfolio": true,
    "showStats": true
  }
}
```

**Responses**

- `200` - 


### 154. `DELETE /api/v1/volunteers/me/skills/{skillId}`

Remove one of own skills

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `skillId` | path | yes | string | The skill id |

**Responses**

- `204` - 


### 155. `PATCH /api/v1/volunteers/me/skills/{skillId}`

Update one of own skills

**Auth:** [Bearer]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `skillId` | path | yes | string | The skill id |

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `level` | number | no | 1-5 proficiency level | `1` |
| `yearsOfExperience` | number | no | Years of experience | `1` |
| `isPrimary` | boolean | no | Only one skill can be primary | `true` |

**Example**

```json
{
  "level": 1,
  "yearsOfExperience": 1,
  "isPrimary": true
}
```

**Responses**

- `200` - 


### 156. `GET /api/v1/volunteers/me/skills`

List own skills

**Auth:** [Bearer]

**Responses**

- `200` - 


### 157. `POST /api/v1/volunteers/me/skills`

Add a skill to own profile

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `skillId` | string | yes | Seeded skill id | `"string"` |
| `level` | number | yes | 1-5 proficiency level | `3` |
| `yearsOfExperience` | number | no | Years of experience | `2` |
| `isPrimary` | boolean | no | Only one skill can be primary | `true` |

**Example**

```json
{
  "skillId": "string",
  "level": 3,
  "yearsOfExperience": 2,
  "isPrimary": true
}
```

**Responses**

- `201` - 


### 158. `GET /api/v1/volunteers/me`

Read own volunteer profile

**Auth:** [Bearer]

**Responses**

- `200` - 


### 159. `PATCH /api/v1/volunteers/me`

Update own volunteer profile

**Auth:** [Bearer]

**Request body** (`application/json`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `firstName` | string | no |  | `"Amine"` |
| `lastName` | string | no |  | `"Benali"` |
| `bio` | string | no |  | `"Volunteer since 2024"` |
| `birthDate` | string | no | ISO date | `"string"` |
| `location` | object | no |  | `{"wilayaId":"16","municipalityId":"1601"}` |
| `avatar` | string | no | Own media id with purpose=avatar | `"string"` |
| `banner` | string | no |  | `"string"` |
| `headline` | string | no |  | `"Community health volunteer"` |
| `availabilityNote` | string | no |  | `"Available for on-site and remote missions"` |
| `preferredDomains` | array<string> | no |  | `["health","education"]` |
| `geographicBase` | string | no |  | `"Algiers"` |

**Example**

```json
{
  "firstName": "Amine",
  "lastName": "Benali",
  "bio": "Volunteer since 2024",
  "birthDate": "string",
  "location": {
    "wilayaId": "16",
    "municipalityId": "1601"
  },
  "avatar": "string",
  "banner": "string",
  "headline": "Community health volunteer",
  "availabilityNote": "Available for on-site and remote missions",
  "preferredDomains": [
    "health",
    "education"
  ],
  "geographicBase": "Algiers"
}
```

**Responses**

- `200` - 


## volunteers-public

### 160. `GET /api/v1/talents`

Talents feed (enabled profiles, filters, cursor)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `q` | query | no | string | Matches username, names and bio |
| `skillId` | query | no | string | Skill id(s); single or comma-separated multi-select |
| `categoryId` | query | no | string | Skill category id(s); single or comma-separated |
| `wilayaId` | query | no | string | Wilaya code(s); single or comma-separated multi-select |
| `skillIds` | query | no | string | Multi-select skill ids (comma-separated) |
| `wilayaIds` | query | no | string | Multi-select wilaya codes (comma-separated) |
| `minExperiences` | query | no | string | Minimum verified experiences (roadmap talents filter) |
| `hasAvailability` | query | no | boolean | Only volunteers with availability set |
| `portfolio` | query | no | boolean | Only volunteers with at least one portfolio item |
| `sort` | query | no | enum("newest" | "oldest" | "experiences_desc") | Server-defined sort whitelist |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 161. `GET /api/v1/volunteers/{username}/experiences`

Public experiences of a volunteer (public rows only)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `username` | path | yes | string | Volunteer username |
| `cursor` | query | no | string | Opaque base64 cursor |
| `limit` | query | no | string | Page size (default 20, max 50) |

**Responses**

- `200` - 


### 162. `GET /api/v1/volunteers/{username}/portfolio`

Public portfolio of a volunteer (public rows only)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `username` | path | yes | string | Volunteer username |

**Responses**

- `200` - 


### 163. `GET /api/v1/volunteers/{username}`

Public volunteer profile by username (A5 gating)

**Auth:** [public]

**Parameters**

| Name | In | Required | Type | Description |
|---|---|---|---|---|
| `username` | path | yes | string | Volunteer username |

**Responses**

- `200` - 

---

*Total: 163 operations across 144 paths.*
