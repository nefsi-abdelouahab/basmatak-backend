## 1. Schema and registration

- [x] 1.1 Create `backend/src/submissions/schemas/submission.schema.ts`: `SubmissionsCollection = 'submissions'`, `SUBMISSION_STATUSES = ['draft','submitted','under_review','approved','rejected']`, fields `participantId` (ObjectId ref `task_participants`, required), `volunteerId`, `opportunityId`, `positionId`, `organizationId` (ObjectId, required), `deliverables` (`[{ title, description }]`, default `[]`), `description` (trim), `consentConfirmed` (Boolean, default `false`), `evidence` (`[{ mediaId: ObjectId }]`, default `[]`), `status` (default `draft`); `createSchema` base options; indexes unique `participantId`, `(opportunityId, status)`, `(volunteerId, status)` per design D1
- [x] 1.2 Create `backend/src/submissions/submissions.module.ts`: `MongooseModule.forFeature` for `SubmissionsCollection` and re-registered `OpportunitiesCollection` + `TaskParticipantsCollection` (read-only lookup), providers `SubmissionsService`, controller `SubmissionsController`; `OnModuleInit` → `registry.register('submission', [...['draft','submitted'],['submitted','under_review'],['under_review','approved'],['under_review','rejected'],['rejected','draft']])` per design D5

## 2. Create / edit / submit service

- [x] 2.1 Implement `SubmissionsService.createForParticipation(account, participationId)`: load `task_participants` scoped to caller `volunteerId` (absent/foreign → 404), read the opportunity's embedded position by `positionId`, snapshot `deliverables = [{ title, description }]`; insert `draft` with denormalized ids; explicit duplicate pre-check + catch `E11000` → 409 `SUBMISSION_ALREADY_EXISTS` per design D2
- [x] 2.2 Implement `updateDraft(account, submissionId, dto)`: owner check (404); status `rejected` → `StatusTransitionService.assert('submission', id, 'rejected', 'draft', actor)` then apply; status `draft` → apply directly; other statuses → 409 `INVALID_STATUS_TRANSITION`; validate every evidence `mediaId` via `MediaOwnership.assertFor(mediaId, volunteer, 'submission_evidence')` before writing per design D3
- [x] 2.3 Implement `submit(account, submissionId)`: owner check (404); validate `description` non-empty, every `deliverables` entry covered by ≥1 evidence id (400 `EVIDENCE_REQUIRED`), and `consentConfirmed=true` when any evidence is a video `type=link` or image `type=file` with `image/*` mime (400 `CONSENT_REQUIRED`); then `StatusTransitionService.assert('submission', id, 'draft', 'submitted', actor)`, update row to `submitted`, and after both succeed emit `DomainEvents.SubmissionSubmitted` with `{ submission: updated }` exactly once per design D4
- [x] 2.4 Evidence lookup helper: resolve each `mediaId` through `MediaOwnership.assertFor` once per call and expose the returned rows to the consent check (pdf-only evidence never triggers consent), reusing S8's purpose `'submission_evidence'`

## 3. Read routes and inbox

- [x] 3.1 Implement `listMine(account, limit, cursor, status?)` scoped `{ volunteerId: caller }` with S1 cursor pagination (default 20/max 50, newest-first) and `GET /submissions/me` in the controller
- [x] 3.2 Implement `getDetail(account, submissionId)`: access allowed when `volunteerId` matches caller or caller's owned organization equals row's `organizationId`; else 404; return submission with evidence media metadata; expose `GET /submissions/:submissionId`
- [x] 3.3 Implement `listForOrganization(account, limit, cursor, status?, opportunityId?)`: resolve org id from JWT (`organizations.userId`), query `{ organizationId }` + optional filters against the `(opportunityId, status)` index, cursor-paginated; volunteer caller → 403; expose `GET /organizations/me/submissions`
- [x] 3.4 Implement `startReview(account, submissionId)`: owning org → 404 for non-owners and any non-`submitted` status → 409 `INVALID_STATUS_TRANSITION`; `submitted → under_review` via `assert`; already-`under_review` treated as idempotent no-op for the implicit inbox-open path per design D8; expose `POST /submissions/:submissionId/start-review`

## 4. DTOs and controller wiring

- [x] 4.1 Create `backend/src/submissions/dto/submission.dto.ts`: `SubmitDto` (`consentConfirmed`), `UpdateSubmissionDto` (optional `description`, `evidence`, `consentConfirmed`), `ListQueryDto` (`limit`, `cursor`, `status?`, `opportunityId?`) — all class-validator whitelist + forbidNonWhitelisted
- [x] 4.2 Create `backend/src/submissions/submissions.controller.ts` with the eight `Auth` routes (volunteer role: POST create, PATCH, POST submit, GET me, GET detail; organization role: GET inbox, GET detail, POST start-review)
- [x] 4.3 Register `SubmissionsModule` additively in `backend/src/app.module.ts` (re-read the file first; append only, existing style preserved, no reordering)

## 5. Unit tests

- [x] 5.1 Unit: create — one-per-participant duplicate → 409; foreign participant → 404; `deliverables` snapshot from the position; denormalized ids set correctly
- [x] 5.2 Unit: edit — draft applies; rejected→draft writes history; submitted/under_review/approved → 409 `INVALID_STATUS_TRANSITION`; foreign evidence media rejected; no partial write on failed validation
- [x] 5.3 Unit: submit — missing/empty description → 400; unevidenced deliverable → 400 `EVIDENCE_REQUIRED`; image/video evidence without consent → 400 `CONSENT_REQUIRED`; pdf-only evidence passes without consent; success emits `submission.submitted` exactly once and writes a `status_histories` row
- [x] 5.4 Unit: whitelist — the five registered pairs accepted at bootstrap; unlisted pairs (`draft → approved`) rejected with `INVALID_STATUS_TRANSITION` and no history row

## 6. E2E tests

- [x] 6.1 Create `backend/test/submissions.e2e-spec.ts`: seed org + volunteer + participation + `submission_evidence` media; volunteer creates a draft via `POST /participations/:participationId/submissions` → 201 with `status=draft` and position-derived `deliverables`
- [x] 6.2 Full happy path: draft → submit (description + one evidence per deliverable + consent) → org inbox `GET /organizations/me/submissions?status=submitted` lists it → `POST /submissions/:id/start-review` → status `under_review`; assert exactly one org notification row exists after submit
- [x] 6.3 Constraint paths: second create for same participation → 409; foreign volunteer PATCH → 404 and unchanged; volunteer calling the inbox → 403; non-owning org start-review → 404; image evidence without consent → 400 `CONSENT_REQUIRED`
- [x] 6.4 Resubmission path: org first transitions the submission to `rejected` (via the whitelist `under_review → rejected` using `StatusTransitionService` directly, simulating Part B), volunteer PATCH → back to `draft` with a `status_histories` entry; volunteer can submit again
- [x] 6.5 Scoping: two orgs each with own submissions — `GET /organizations/me/submissions` never leaks the other org's rows across pagination depth; `GET /submissions/me` only returns the caller's rows

## 7. Verification and wrap-up

- [x] 7.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green; investigate and record any pre-existing sibling failure like S8/S9 noted
- [x] 7.2 From the repo root: `openspec validate submissions-verification-experiences` and `openspec status --change submissions-verification-experiences` (shared change; reports Part A artifacts valid)
- [x] 7.3 `git add` selectively (backend/src/submissions/**, backend/test/submissions.e2e-spec.ts, backend/src/app.module.ts, openspec change artifacts **only** under `openspec/changes/submissions-verification-experiences/**`); never `git add -A`; leave `openspec/changes/my-opportunities-page/` untouched; commit `feat(submissions): reporting flow, consent, inbox (part A)`

---

## 8. Part B schemas, indexes, modules

- [x] 8.1 Create `backend/src/verifications/schemas/verification.schema.ts`: `VerificationsCollection = 'verifications'`, `VERIFICATION_STATUSES = ['verified','rejected']` (terminal only per F12/D12), fields `submissionId` (ObjectId ref `submissions`, required, unique), `organizationId`, `volunteerId` (required), `status` (enum), `notes?`, `reason?`, `decidedAt` (Date, default now), `decidedBy` (ObjectId, required); `createSchema` base options; indexes unique `submissionId`, `(organizationId, status)` per design D12
- [x] 8.2 Create `backend/src/verifications/schemas/volunteer-experience.schema.ts`: `VolunteerExperiencesCollection = 'volunteer_experiences'`, fields `submissionId` (unique), `volunteerId`, `organizationId`, `opportunityId`, `positionId`, `title`, `description?`, `skills` (ObjectId[]), `duration` (Number, default `0` — D13 gap), `evidenceIds` (ObjectId[]), `verificationCode` (unique, trimmed uppercase), `publicVisibility` (`public|private`, default `public`); indexes unique `submissionId`, unique `verificationCode`, `(volunteerId, publicVisibility)` per design D13/D14
- [x] 8.3 Create `backend/src/verifications/verification-code.util.ts`: A12 generator — 8 uppercase base32 chars excluding `0/O/1/I` via built-in `crypto`, `isDuplicateKeyError`-based E11000 retry loop (bounded, fresh random code per attempt) per design D14
- [x] 8.4 Create `backend/src/reviews/review.schema.ts`: `ReviewsCollection = 'reviews'`, `Review` model fields `submissionId` (unique), `organizationId`, `volunteerId`, `rating` (Number), `comment?`; indexes unique `submissionId`, `organizationId`, `volunteerId` per F16/D15 — NO controllers in this change
- [x] 8.5 Create `backend/src/reviews/reviews.module.ts`: `MongooseModule.forFeature([{ name: ReviewsCollection, schema: ReviewSchema }])`, exports the MongooseModule; no controllers (F16/D15)
- [x] 8.6 Create `backend/src/verifications/verifications.module.ts`: `MongooseModule.forFeature` for `VerificationsCollection` + `VolunteerExperiencesCollection` + re-registered `SubmissionsCollection`/`TaskParticipantsCollection`/`VolunteerProfilesCollection`/`ReviewsCollection` (foreign model reads per notifications precedent), providers `VerificationsService`/`ExperiencesService`, controllers `VerificationsController` + `PublicVerificationController` + `ExperiencesController`; additively import `ReviewsModule`
- [x] 8.7 Create `backend/src/experiences/experiences.module.ts` (or fold into 8.6): registers the experiences collection/model + controller; export the MongooseModule for cross-module reads
- [x] 8.8 Register `VerificationsModule`, `ExperiencesModule`, `ReviewsModule` additively in `backend/src/app.module.ts` (re-read first; append only, no reordering)

## 9. Verify transaction service

- [x] 9.1 Implement `VerificationsService.verify(account, submissionId, dto)` per design D9: org-owner resolution (404 on mismatch/absent), precondition `submitted|under_review` else `409 INVALID_STATUS_TRANSITION`; `@InjectConnection().startSession()` + `session.withTransaction`
- [x] 9.2 In-txn step: re-read submission + its participant with `session`; when `submitted`, assert `submitted → under_review` then `under_review → approved` (both with `session`); when already `under_review`, single `under_review → approved`; update submission row to `approved`
- [x] 9.3 In-txn step: assert participant `accepted|active → completed` per the `task_participant` whitelist with `session`
- [x] 9.4 In-txn step: insert `verifications` (`verified`, notes, decidedAt, decidedBy) with `session`
- [x] 9.5 In-txn step: resolve the opportunity's embedded position by `opp_opportunityId + positionId`, insert `volunteer_experiences` (snapshot title/description/skills/duration, `evidenceIds` from submission evidence, generated `verificationCode` via the A12 util with E11000 retry) with `session`
- [x] 9.6 In-txn step: if `dto.review` provided, insert `reviews` (rating, optional comment) with `session`; E11000 → `409 REVIEW_ALREADY_EXISTS`
- [x] 9.7 In-txn step: `$inc` `volunteer_profiles.stats` `{ completedTasks: 1, verifiedExperiences: 1, volunteerHours: duration }` scoped by `{ userId: submission.volunteerId }` with `session`
- [x] 9.8 In-txn step: write the volunteer notification via `NotificationsService.createInSession` (recipient `volunteerId`, type `submission.verified`, payload `{ submissionId }`) so the post-commit handler is dedupe-swallowed (F4)
- [x] 9.9 After commit: end `session`, reload the submission, emit `DomainEvents.SubmissionVerified` with `{ submission: updated }` exactly once; concurrency/idempotency — a second verify on the now-`approved` row hits the 409 precondition
- [x] 9.10 Expose `POST /submissions/:submissionId/verify` in `VerificationsController` (org role guard) with a DTO `{ notes?, review?: { rating, comment? } }` (whitelist + forbidNonWhitelisted)

## 10. Reject flow

- [x] 10.1 Implement `VerificationsService.reject(account, submissionId, reason)` per design D11: org-owner resolution (404); precondition `submitted|under_review` else `409 INVALID_STATUS_TRANSITION`; assert `submitted → under_review` first when needed then `under_review → rejected`; update submission row to `rejected` (non-transactional, same posture as submit)
- [x] 10.2 Insert `verifications` (`rejected`, with `reason`) carrying the rejection reason (D11 deviation — reason lives here, not in `status_histories`)
- [x] 10.3 Emit `DomainEvents.SubmissionRejected` with `{ submission: updated, reason }` exactly once
- [x] 10.4 Expose `POST /submissions/:submissionId/reject` in `VerificationsController` (org role guard) with a DTO requiring `{ reason }` (400 when absent)

## 11. Read routes and public proof

- [x] 11.1 Implement `GET /verifications/:verificationId` — access when `volunteerId` matches caller or caller's own org equals `organizationId`; else 404; returns status, notes/reason, decidedAt, decidedBy
- [x] 11.2 Implement public `GET /verify/:verificationCode` (guest) — resolve `volunteer_experiences` by unique code; unknown → 404; return A6 summary (title/description/skills/duration, volunteer handle) with evidence media metadata filtered to `visibility: public` only; `publicVisibility` does NOT gate (A6/D16)
- [x] 11.3 Implement `GET /experiences/me` — volunteer-only, cursor-paginated (default 20 / max 50), own rows only, newest-first
- [x] 11.4 Implement `GET /experiences/:experienceId` — volunteer owner only (404 otherwise); returns snapshot + evidence media metadata + the review for that submissionId
- [x] 11.5 Implement `PATCH /experiences/:experienceId/visibility` — owner only (404 otherwise); accepts `{ publicVisibility }` (`public|private`) and updates only that field (D16)

## 12. Unit tests

- [x] 12.1 Unit: verification code — 8 chars, uppercase, alphabet excludes `0/O/1/I`; E11000 collision retried with a fresh code; bounded attempts throw/roll back
- [x] 12.2 Unit: verify — owner/org 404; precondition 409 on `draft`/`approved`/`rejected`; `submitted` traverses two history rows vs `under_review` one; participant → completed; experience snapshot copies title/description/skills/duration + evidenceIds; review inserted only when provided
- [x] 12.3 Unit: verify stats — `$inc` applies `(completedTasks, verifiedExperiences, volunteerHours)` on the correct profile (userId = volunteerId); no stats change on rollback
- [x] 12.4 Unit: reject — reason required (400); precondition 409; verifications row carries reason; submission row `rejected`; `submission.rejected` emitted exactly once
- [x] 12.5 Unit: transaction rollback — a stubbed mid-txn failure (e.g. code collision exhaustion, reviews E11000, stats failure) leaves no `verifications`, no experience, no review, submission still `submitted|under_review`, no event emitted

## 13. E2E tests (`backend/test/verifications.e2e-spec.ts`)

- [x] 13.1 Seed: org + volunteer + opportunity + participation + submission `submitted`/`under_review` with evidence; run the full happy path: verify → submission `approved`, participant `completed`, 1 `verified` verification, 1 experience with a code, stats incremented exactly once
- [x] 13.2 Verify with `review` — one `reviews` row; assert a second review for the same submission fails the unique `submissionId` (409); assert `GET /verifications/:verificationId` returns the decision
- [x] 13.3 Constraint paths: verify on already-`approved` → 409; foreign org/volunteer → 404; reject without reason → 400; reject on `approved` → 409
- [x] 13.4 Reject → volunteer edits (rejected→draft, Part A rule) → resubmits → re-verifies → experience, review and verified row for that `submissionId` are each the single row (D11 deviation: the `verifications` row is one-per-submission, so only the latest decision's reason is retained — intermediate rejections' reasons are not kept)
- [x] 13.5 `GET /verify/:code` — public, correct summary, only `public` media (private excluded), unknown code 404, works for a `private`-visibility experience (possession, A6)
- [x] 13.6 Experiences routes — `GET /experiences/me` own-only scoping; `GET /experiences/:id` owner 404 for others, includes review; `PATCH .../visibility` toggles field and does not break `/verify/:code`
- [x] 13.7 **Rollback and idempotency** — mid-transaction failure rollback is enforced at unit level (12.5: stubbed in-session notification failure / review E11000 / code-collision exhaustion → no `verifications`, no experience, no review, submission unchanged, no event emitted), and the E2E asserts the double-verify + reject-on-approved 409 write nothing further (the A12 util is a non-injectable module import, so a true failure-injection E2E is not feasible without changing the service seam)

## 14. Part B verification and wrap-up

- [x] 14.1 From `/backend`: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` — all green; record any pre-existing sibling failure
- [x] 14.2 From the repo root: `openspec validate submissions-verification-experiences` and `openspec status --change submissions-verification-experiences` (shared change — all Part A + Part B artifacts valid; 4/4 artifacts, tasks tracked)
- [ ] 14.3 `git add` selectively (Part B backend modules, new E2E, extended openspec artifacts **only** under `openspec/changes/submissions-verification-experiences/**`); never `git add -A`; leave `openspec/changes/my-opportunities-page/` untouched; commit `feat(verifications): transactional verify/reject and public experience proof (part B)`
- [x] 14.4 Confirm Part A tasks (sections 1–7) are still marked complete/accurate in the working change before the final archive step (archive itself happens in a later phase per the roadmap runner)