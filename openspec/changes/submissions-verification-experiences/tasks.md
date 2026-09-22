## 1. Schema and registration

- [ ] 1.1 Create `backend/src/submissions/schemas/submission.schema.ts`: `SubmissionsCollection = 'submissions'`, `SUBMISSION_STATUSES = ['draft','submitted','under_review','approved','rejected']`, fields `participantId` (ObjectId ref `task_participants`, required), `volunteerId`, `opportunityId`, `positionId`, `organizationId` (ObjectId, required), `deliverables` (`[{ title, description }]`, default `[]`), `description` (trim), `consentConfirmed` (Boolean, default `false`), `evidence` (`[{ mediaId: ObjectId }]`, default `[]`), `status` (default `draft`); `createSchema` base options; indexes unique `participantId`, `(opportunityId, status)`, `(volunteerId, status)` per design D1
- [ ] 1.2 Create `backend/src/submissions/submissions.module.ts`: `MongooseModule.forFeature` for `SubmissionsCollection` and re-registered `OpportunitiesCollection` + `TaskParticipantsCollection` (read-only lookup), providers `SubmissionsService`, controller `SubmissionsController`; `OnModuleInit` → `registry.register('submission', [...['draft','submitted'],['submitted','under_review'],['under_review','approved'],['under_review','rejected'],['rejected','draft']])` per design D5

## 2. Create / edit / submit service

- [ ] 2.1 Implement `SubmissionsService.createForParticipation(account, participationId)`: load `task_participants` scoped to caller `volunteerId` (absent/foreign → 404), read the opportunity's embedded position by `positionId`, snapshot `deliverables = [{ title, description }]`; insert `draft` with denormalized ids; explicit duplicate pre-check + catch `E11000` → 409 `SUBMISSION_ALREADY_EXISTS` per design D2
- [ ] 2.2 Implement `updateDraft(account, submissionId, dto)`: owner check (404); status `rejected` → `StatusTransitionService.assert('submission', id, 'rejected', 'draft', actor)` then apply; status `draft` → apply directly; other statuses → 409 `INVALID_STATUS_TRANSITION`; validate every evidence `mediaId` via `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')` before writing per design D3
- [ ] 2.3 Implement `submit(account, submissionId)`: owner check (404); validate `description` non-empty, every `deliverables` entry covered by ≥1 evidence id (400 `EVIDENCE_REQUIRED`), and `consentConfirmed=true` when any evidence is a video `type=link` or image `type=file` with `image/*` mime (400 `CONSENT_REQUIRED`); then `StatusTransitionService.assert('submission', id, 'draft', 'submitted', actor)`, update row to `submitted`, and after both succeed emit `DomainEvents.SubmissionSubmitted` with `{ submission: updated }` exactly once per design D4
- [ ] 2.4 Evidence lookup helper: resolve each `mediaId` through `MediaOwnership.assertFor` once per call and expose the returned rows to the consent check (pdf-only evidence never triggers consent), reusing S8's purpose `'submission_evidence'`

## 3. Read routes and inbox

- [ ] 3.1 Implement `listMine(account, limit, cursor, status?)` scoped `{ volunteerId: caller }` with S1 cursor pagination (default 20/max 50, newest-first) and `GET /submissions/me` in the controller
- [ ] 3.2 Implement `getDetail(account, submissionId)`: access allowed when `volunteerId` matches caller or caller's owned organization equals row's `organizationId`; else 404; return submission with evidence media metadata; expose `GET /submissions/:submissionId`
- [ ] 3.3 Implement `listForOrganization(account, limit, cursor, status?, opportunityId?)`: resolve org id from JWT (`organizations.userId`), query `{ organizationId }` + optional filters against the `(opportunityId, status)` index, cursor-paginated; volunteer caller → 403; expose `GET /organizations/me/submissions`
- [ ] 3.4 Implement `startReview(account, submissionId)`: owning org → 404 for non-owners and any non-`submitted` status → 409 `INVALID_STATUS_TRANSITION`; `submitted → under_review` via `assert`; already-`under_review` treated as idempotent no-op for the implicit inbox-open path per design D8; expose `POST /submissions/:submissionId/start-review`

## 4. DTOs and controller wiring

- [ ] 4.1 Create `backend/src/submissions/dto/submission.dto.ts`: `SubmitDto` (`consentConfirmed`), `UpdateSubmissionDto` (optional `description`, `evidence`, `consentConfirmed`), `ListQueryDto` (`limit`, `cursor`, `status?`, `opportunityId?`) — all class-validator whitelist + forbidNonWhitelisted
- [ ] 4.2 Create `backend/src/submissions/submissions.controller.ts` with the eight `Auth` routes (volunteer role: POST create, PATCH, POST submit, GET me, GET detail; organization role: GET inbox, GET detail, POST start-review)
- [ ] 4.3 Register `SubmissionsModule` additively in `backend/src/app.module.ts` (re-read the file first; append only, existing style preserved, no reordering)

## 5. Unit tests

- [ ] 5.1 Unit: create — one-per-participant duplicate → 409; foreign participant → 404; `deliverables` snapshot from the position; denormalized ids set correctly
- [ ] 5.2 Unit: edit — draft applies; rejected→draft writes history; submitted/under_review/approved → 409 `INVALID_STATUS_TRANSITION`; foreign evidence media rejected; no partial write on failed validation
- [ ] 5.3 Unit: submit — missing/empty description → 400; unevidenced deliverable → 400 `EVIDENCE_REQUIRED`; image/video evidence without consent → 400 `CONSENT_REQUIRED`; pdf-only evidence passes without consent; success emits `submission.submitted` exactly once and writes a `status_histories` row
- [ ] 5.4 Unit: whitelist — the five registered pairs accepted at bootstrap; unlisted pairs (`draft → approved`) rejected with `INVALID_STATUS_TRANSITION` and no history row

## 6. E2E tests

- [ ] 6.1 Create `backend/test/submissions.e2e-spec.ts`: seed org + volunteer + participation + `submission_evidence` media; volunteer creates a draft via `POST /participations/:participationId/submissions` → 201 with `status=draft` and position-derived `deliverables`
- [ ] 6.2 Full happy path: draft → submit (description + one evidence per deliverable + consent) → org inbox `GET /organizations/me/submissions?status=submitted` lists it → `POST /submissions/:id/start-review` → status `under_review`; assert exactly one org notification row exists after submit
- [ ] 6.3 Constraint paths: second create for same participation → 409; foreign volunteer PATCH → 404 and unchanged; volunteer calling the inbox → 403; non-owning org start-review → 404; image evidence without consent → 400 `CONSENT_REQUIRED`
- [ ] 6.4 Resubmission path: org first transitions the submission to `rejected` (via the whitelist `under_review → rejected` using `StatusTransitionService` directly, simulating Part B), volunteer PATCH → back to `draft` with a `status_histories` entry; volunteer can submit again
- [ ] 6.5 Scoping: two orgs each with own submissions — `GET /organizations/me/submissions` never leaks the other org's rows across pagination depth; `GET /submissions/me` only returns the caller's rows

## 7. Verification and wrap-up

- [ ] 7.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green; investigate and record any pre-existing sibling failure like S8/S9 noted
- [ ] 7.2 From the repo root: `openspec validate submissions-verification-experiences` and `openspec status --change submissions-verification-experiences` (shared change; reports Part A artifacts valid)
- [ ] 7.3 `git add` selectively (backend/src/submissions/**, backend/test/submissions.e2e-spec.ts, backend/src/app.module.ts, openspec change artifacts **only** under `openspec/changes/submissions-verification-experiences/**`); never `git add -A`; leave `openspec/changes/my-opportunities-page/` untouched; commit `feat(submissions): reporting flow, consent, inbox (part A)`