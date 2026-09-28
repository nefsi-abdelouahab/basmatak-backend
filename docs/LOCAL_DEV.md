# Local development — both apps against the real Atlas backend

> Prereqs: Node ≥ 20 (verified on Node v22 + npm 10). Two terminals.
> Port map: backend **:5000**, frontend **:3000**. The backend talks to the
> real Atlas cluster; nothing here touches in-memory or local Mongo.

## 1. Backend (`/backend`)

```powershell
Set-Location backend
npm install
npm run start:dev     # watch mode on http://localhost:5000
# or: npm run build; npm run start:prod
```

> Start from `backend/` — `ConfigModule` loads `./.env` relative to the
> working directory. Starting from the repo root silently skips `backend/.env`
> (different `MONGO_URI`, JWT, and CORS values than you expect).

### Required `.env` (all names exact — note the key is `MONGO_URI`, not `MONGODB_URI`)

| Var | Value / notes |
|---|---|
| `PORT` | `5000` (code default is `3000` if unset) |
| `MONGO_URI` | `mongodb+srv://<user>:<password>@cluster0.qnw4183.mongodb.net/basmatak?...` — the real Atlas cluster. **Never commit real credentials** (`.env` is gitignored; keep the example file placeholder-only). Unset falls back to local `mongodb://127.0.0.1:27017/basmatak` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Must be set — the API fails fast at boot otherwise |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | e.g. `15m` / `30d` |
| `CORS_ORIGIN` | Explicit allowlist, comma-separated, **no wildcard** (bare `*` is dropped at boot, fail-closed). Local: `http://localhost:3000`. Entries are trimmed + trailing slashes stripped; the effective list is logged at startup (`CORS allowlist: ...`). Unset/empty = deny cross-origin |
| `NODE_ENV` | `development` locally — Swagger UI (`/api/docs`) only serves when `SWAGGER_ENABLED=true` **and** `NODE_ENV !== 'production'` |
| `SWAGGER_ENABLED` | `true` for local API exploration |
| `JOBS_KEY` | Secret for `POST /api/v1/internal/jobs/run` (`X-Jobs-Key` header) |
| `STORAGE_PROVIDER` | `local` (writes `./storage/`, gitignored) for dev; `supabase` needs `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_BUCKET` |
| `MAIL_HOST` (+`MAIL_PORT/MAIL_SECURE/MAIL_USER/MAIL_PASS/MAIL_FROM`) | Leave `MAIL_HOST` empty → no-op `LogMailService` (mail rendered to logs, dev only). Real SMTP (Brevo/Gmail app password) only when needed |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Consumed by `npm run seed:admin` (upsert; existing password preserved unless `SEED_ADMIN_RESET=true`) |
| `EMAIL_VERIFICATION_REQUIRED` | Gate for publish/apply/submit flows |
| `PUBLISH_GATE_ENABLED` | Publish-gate enforcement flag |

### Seed (reference data only — never demo entities on the pilot DB)

```powershell
npm run seed:locations            # 58 wilayas + 1541 municipalities (upsert by code)
npm run seed:skills               # 7 categories + 22 skills (upsert by slug) + prune of stale slugs
npm run seed:admin                # upsert admin from ADMIN_EMAIL/ADMIN_PASSWORD
npm run seed:backfill-registry-ids # no-op zeros on fresh DB; only for pre-existing rows
# DO NOT run seed:demo / seed:all here — demo volunteers/orgs/opportunities
# are created manually during real testing, not synthesized.
```

All four are idempotent: re-running reports identical counts, admin shows
`preserved`, backfill reports `0`s.

### Smoke check

- `GET http://localhost:5000/api/v1/health` → status JSON.
- Swagger (dev only): `http://localhost:5000/api/docs`.
- Admin login: `POST /api/v1/auth/login` with the seeded admin email.

## 2. Frontend (`/frontend`)

```powershell
Set-Location frontend
npm install
```

Create `frontend/.env.local` (untracked) pointing at the local backend:

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
```

(Without it the app falls back to `http://localhost:3000/api/v1`, which is
wrong when the backend runs on `:5000`.)

```powershell
npm run dev    # http://localhost:3000/en (or /ar for Arabic + RTL)
```

Log in with the seeded admin account for the admin workspace; volunteer/org
accounts are created through the real registration screens.

## 3. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Frontend shows network errors everywhere | `NEXT_PUBLIC_API_BASE_URL` missing/wrong, or backend not on `:5000` |
| Backend boot fails immediately | `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` unset |
| Backend talks to empty local DB | `MONGO_URI` unset → silent fallback to `127.0.0.1:27017`; check the boot log |
| No Swagger at `/api/docs` | Needs `SWAGGER_ENABLED=true` **and** `NODE_ENV=development` |
| No emails arrive | Expected with `MAIL_HOST` empty (log fallback); check backend logs |
| Uploads vanish after restart | `STORAGE_PROVIDER=local` writes to gitignored `./storage/` — by design for dev |
